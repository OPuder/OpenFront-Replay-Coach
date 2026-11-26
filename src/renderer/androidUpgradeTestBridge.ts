import { loadImportedMatch } from "./matchStore";

const DATABASE_NAME = "openfront-replay-coach";

type StoreSnapshot = {
  name: string;
  count: number;
  records: Array<{ key: string; summarySha256: string; fields: string[]; metadata?: Record<string, unknown> }>;
};

type StoreSummary = {
  key: string;
  playerId?: string | null;
  gameId?: string | null;
  hasResult?: boolean;
  metadata?: Record<string, unknown>;
};

function stableValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stableValue);
  if (value instanceof Date) return { $date: value.toISOString() };
  if (value instanceof ArrayBuffer) return { $arrayBuffer: Array.from(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) return { $typedArray: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  if (value instanceof Blob) return { $blob: { size: value.size, type: value.type } };
  const source = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(source).sort().map(key => [key, stableValue(source[key])]));
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(stableValue(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the application IndexedDB."));
    request.onblocked = () => reject(new Error("Application IndexedDB open was blocked."));
  });
}

function keyText(key: IDBValidKey): string {
  return JSON.stringify(stableValue(key));
}

/**
 * Read stores with cursors and hash only the semantic metadata summary.
 * The Android test separately hashes every physical LevelDB file before/after
 * the upgrade, so re-serializing all replay payloads here is redundant and
 * caused CDP Runtime.evaluate to exceed its 60-second timeout on large imports.
 */
async function readStoreSummary(db: IDBDatabase, name: string): Promise<{ records: StoreSnapshot["records"]; values: StoreSummary[] }> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, "readonly");
    const request = tx.objectStore(name).openCursor();
    const records: Array<{ key: string; fields: string[]; metadata?: Record<string, unknown> }> = [];
    const values: StoreSummary[] = [];

    request.onerror = () => reject(tx.error ?? request.error ?? new Error(`Could not read IndexedDB store ${name}.`));
    tx.onabort = () => reject(tx.error ?? new Error(`IndexedDB cursor aborted for ${name}.`));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        // Hash small summaries only; exact persistence is checked against the
        // physical IndexedDB and Local Storage LevelDB file manifests.
        Promise.all(records.map(async record => ({
          ...record,
          summarySha256: await sha256({ store: name, key: record.key, metadata: record.metadata ?? null }),
        }))).then(summaries => resolve({ records: summaries, values })).catch(reject);
        return;
      }

      const item = cursor.value as Record<string, any>;
      const key = keyText(cursor.primaryKey);
      let metadata: Record<string, unknown> | undefined;
      let fields: string[];
      const summary: StoreSummary = { key };

      if (name === "matches") {
        metadata = {
          playerId: item.playerId ?? null,
          gameId: item.game?.gameId ?? null,
          status: item.status ?? null,
          analysisStatus: item.analysisStatus ?? null,
          simulationStatus: item.simulation?.status ?? null,
          sampleCount: Array.isArray(item.simulation?.samples) ? item.simulation.samples.length : 0,
          actionReviewCount: Array.isArray(item.simulation?.actionReviews) ? item.simulation.actionReviews.length : 0,
          replayCommit: item.result?.engineCompatibility?.replayCommit ?? null,
        };
        fields = ["playerId", "game.gameId", "status", "analysisStatus", "simulation.status", "simulation.samples[]", "simulation.actionReviews[]", "result.engineCompatibility.replayCommit"];
        summary.playerId = item.playerId ?? null;
        summary.gameId = item.game?.gameId ?? null;
        summary.hasResult = Boolean(item.result);
      } else if (name === "profiles") {
        metadata = {
          playerId: item.playerId ?? null,
          username: item.profile?.username ?? item.profile?.displayName ?? null,
          gameCount: Array.isArray(item.games) ? item.games.length : 0,
        };
        fields = ["playerId", "profile.username", "profile.displayName", "games[]"];
        summary.playerId = item.playerId ?? null;
      } else if (name === "analysis-results") {
        const simulation = item.simulation as Record<string, any> | undefined;
        metadata = {
          playerId: item.playerId ?? null,
          gameId: item.gameId ?? null,
          analysisStatus: item.analysisStatus ?? null,
          simulationStatus: simulation?.status ?? null,
          sampleCount: Array.isArray(simulation?.samples) ? simulation.samples.length : 0,
          actionReviewCount: Array.isArray(simulation?.actionReviews) ? simulation.actionReviews.length : 0,
          analysisError: item.analysisError ?? null,
        };
        fields = ["playerId", "gameId", "analysisStatus", "simulation.status", "simulation.samples[]", "simulation.actionReviews[]", "analysisError"];
        summary.playerId = item.playerId ?? null;
        summary.gameId = item.gameId ?? null;
        summary.hasResult = Boolean(simulation);
      } else if (name === "replay-records") {
        const record = item.record as Record<string, any> | undefined;
        metadata = {
          playerId: item.playerId ?? null,
          gameId: item.gameId ?? null,
          recordGameId: record?.info?.gameID ?? record?.game?.info?.gameID ?? null,
          engineCommit: record?.gitCommit ?? null,
          turnCount: Array.isArray(record?.turns) ? record.turns.length : 0,
        };
        fields = ["playerId", "gameId", "record.info.gameID", "record.gitCommit", "record.turns[]"];
        summary.playerId = item.playerId ?? null;
        summary.gameId = item.gameId ?? null;
      } else {
        fields = Object.keys(item ?? {}).sort().slice(0, 30);
      }

      values.push({ ...summary, ...(metadata ? { metadata } : {}) });
      records.push({ key, fields, ...(metadata ? { metadata } : {}) });
      cursor.continue();
    };
  });
}

export async function installAndroidUpgradeTestBridge(): Promise<void> {
  const snapshot = async () => {
    const localStorageEntries = Object.keys(localStorage).sort().map(key => ({ key, value: localStorage.getItem(key) ?? "" }));
    const localStorageHashes = await Promise.all(localStorageEntries.map(async entry => ({
      key: entry.key,
      sha256: await sha256(entry.value),
    })));
    const db = await openDatabase();
    try {
      const stores: StoreSnapshot[] = [];
      const summaries = new Map<string, StoreSummary[]>();
      for (const name of Array.from(db.objectStoreNames).sort()) {
        const { records, values } = await readStoreSummary(db, name);
        summaries.set(name, values);
        stores.push({ name, count: values.length, records });
      }

      const profiles = summaries.get("profiles") ?? [];
      const matches = summaries.get("matches") ?? [];
      const replays = summaries.get("replay-records") ?? [];
      const analyses = summaries.get("analysis-results") ?? [];
      const matchMetadata = matches.map(record => record.metadata ?? {});
      const replayMetadata = replays.map(record => record.metadata ?? {});
      const analysisMetadata = analyses.map(record => record.metadata ?? {});
      const playerId = localStorageEntries.find(entry => entry.key === "ofrc:last-player-id")?.value;
      const matchIds = new Set(matchMetadata.map(item => String(item.gameId ?? "")));
      // IndexedDB v4 deliberately keeps simulation payloads out of the
      // lightweight matches index. Validate the dedicated analysis-results
      // store and require the selected profile + persisted match relationship.
      const verifiedAnalyses = analysisMetadata.filter(item => item.playerId === playerId
        && matchIds.has(String(item.gameId ?? "")) && item.analysisStatus === "verified"
        && item.simulationStatus === "verified" && Number(item.sampleCount) > 0
        && Number(item.actionReviewCount) > 0);
      const trainingGoalEntry = localStorageEntries.find(entry => entry.key === "openfront-coach-training-goal")?.value;
      const trainingGoal = trainingGoalEntry ? JSON.parse(trainingGoalEntry) : null;

      if (playerId !== "5SVg4WbI") throw new Error("The actual UI-seeded player profile key is missing or does not match the archived profile.");
      if (!profiles.some(profile => String(profile.playerId ?? "") === playerId)
        || !matches.some(match => String(match.playerId ?? "") === playerId)) {
        throw new Error("The actual UI profile ID is not consistently linked across LocalStorage and IndexedDB.");
      }
      if (profiles.length < 1 || matches.length < 2 || replays.length < 2) {
        throw new Error(`Expected a real profile and at least two persisted replay records; found profiles=${profiles.length}, matches=${matches.length}, replayRecords=${replays.length}.`);
      }
      if (!verifiedAnalyses.length) throw new Error("No verified replay analysis result survived in the analysis-results store for the selected profile and persisted matches.");

      // Rehydrate the two exact UI-seeded replays rather than whichever records
      // happen to appear first in IndexedDB's key order.
      const requiredGameIds = ["cRVdxGEG5j", "c4CW3VJWQ9"];
      const reusableMatches = await Promise.all(requiredGameIds.map(async gameId => {
        const loaded = playerId ? await loadImportedMatch(playerId, gameId) : null;
        const record = loaded?.result?.record as Record<string, any> | undefined;
        return {
          playerId: playerId ?? "",
          gameId,
          loaded: Boolean(loaded),
          replayRestored: Boolean(record),
          recordGameId: record?.info?.gameID ?? record?.game?.info?.gameID ?? null,
          engineCommit: record?.gitCommit ?? null,
          turnCount: Array.isArray(record?.turns) ? record.turns.length : 0,
          analysisStatus: loaded?.analysisStatus ?? null,
        };
      }));

      const replayKeys = new Set(replays.map(value => `${String(value.playerId ?? "")}:${String(value.gameId ?? "")}`));
      const matchKeys = matches.filter(value => value.hasResult).map(value => `${String(value.playerId ?? "")}:${String(value.gameId ?? "")}`);
      const missingReplayRecords = matchKeys.filter(key => !replayKeys.has(key));
      const orphanReplayRecords = [...replayKeys].filter(key => !matchKeys.includes(key));
      const profileIds = profiles.map(value => String(value.playerId ?? "")).sort();
      const profileRelations = [...new Set(matches.map(value => String(value.playerId ?? "")))].sort();

      return {
        schema: "ofrc-android-upgrade-snapshot-v1",
        appVersion: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown",
        capturedAt: new Date().toISOString(),
        localStorage: { count: localStorageEntries.length, entries: localStorageEntries, hashes: localStorageHashes },
        rehydration: {
          attempted: reusableMatches.length,
          loaded: reusableMatches.filter(item => item.loaded).length,
          replayRestored: reusableMatches.filter(item => item.replayRestored
            && item.recordGameId === item.gameId && Boolean(item.engineCommit) && item.turnCount > 0).length,
          matches: reusableMatches,
        },
        indexedDb: {
          name: db.name,
          version: db.version,
          stores,
          relationships: {
            profileIds,
            matchProfileIds: profileRelations,
            matchCount: matches.length,
            replayRecordCount: replays.length,
            missingReplayRecords,
            orphanReplayRecords,
          },
        },
      };
    } finally {
      db.close();
    }
  };

  Object.defineProperty(window, "__OFRC_ANDROID_UPGRADE_TEST__", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ snapshot }),
  });
}
