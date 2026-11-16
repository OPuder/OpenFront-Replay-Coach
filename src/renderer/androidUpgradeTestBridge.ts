import { loadImportedMatch } from "./matchStore";

const DATABASE_NAME = "openfront-replay-coach";

type StoreSnapshot = {
  name: string;
  count: number;
  records: Array<{ key: string; sha256: string; fields: string[]; metadata?: Record<string, unknown> }>;
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

function fieldPaths(value: unknown, prefix = "", depth = 0): string[] {
  if (depth >= 6 || value === null || typeof value !== "object") return prefix ? [prefix] : [];
  if (Array.isArray(value)) {
    const first = value.length ? fieldPaths(value[0], prefix ? `${prefix}[]` : "[]", depth + 1) : [];
    return [...new Set([...(prefix ? [prefix] : []), ...first])];
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return [...new Set([
    ...(prefix ? [prefix] : []),
    ...entries.flatMap(([key, child]) => fieldPaths(child, prefix ? `${prefix}.${key}` : key, depth + 1)),
  ])].sort();
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

async function readStore(db: IDBDatabase, name: string): Promise<{ values: unknown[]; keys: IDBValidKey[] }> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, "readonly");
    const store = tx.objectStore(name);
    const valuesRequest = store.getAll();
    const keysRequest = store.getAllKeys();
    let values: unknown[] | undefined;
    let keys: IDBValidKey[] | undefined;
    const finish = () => { if (values && keys) resolve({ values, keys }); };
    valuesRequest.onsuccess = () => { values = valuesRequest.result as unknown[]; finish(); };
    keysRequest.onsuccess = () => { keys = keysRequest.result; finish(); };
    valuesRequest.onerror = keysRequest.onerror = () => reject(tx.error ?? new Error(`Could not read IndexedDB store ${name}.`));
    tx.onabort = () => reject(tx.error ?? new Error(`IndexedDB read aborted for ${name}.`));
  });
}

function keyText(key: IDBValidKey): string {
  return JSON.stringify(stableValue(key));
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
      const raw = new Map<string, unknown[]>();
      for (const name of Array.from(db.objectStoreNames).sort()) {
        const { values, keys } = await readStore(db, name);
        raw.set(name, values);
        const records = await Promise.all(values.map(async (value, index) => {
          const item = value as Record<string, any>;
          let metadata: Record<string, unknown> | undefined;
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
          } else if (name === "profiles") {
            metadata = {
              playerId: item.playerId ?? null,
              username: item.profile?.username ?? item.profile?.displayName ?? null,
              gameCount: Array.isArray(item.games) ? item.games.length : 0,
            };
          } else if (name === "replay-records") {
            const record = item.record as Record<string, any> | undefined;
            metadata = {
              playerId: item.playerId ?? null,
              gameId: item.gameId ?? null,
              recordGameId: record?.info?.gameID ?? record?.game?.info?.gameID ?? null,
              engineCommit: record?.gitCommit ?? null,
              turnCount: Array.isArray(record?.turns) ? record.turns.length : 0,
            };
          }
          return {
            key: keyText(keys[index]),
            sha256: await sha256(value),
            fields: fieldPaths(value),
            ...(metadata ? { metadata } : {}),
          };
        }));
        stores.push({ name, count: values.length, records });
      }

      const profiles = raw.get("profiles") ?? [];
      const matches = raw.get("matches") ?? [];
      const replays = raw.get("replay-records") ?? [];
      const replayKeys = new Set(replays.map(value => {
        const item = value as Record<string, unknown>;
        return `${String(item.playerId ?? "")}:${String(item.gameId ?? "")}`;
      }));
      const matchKeys = matches.filter(value => Boolean((value as Record<string, any>).result)).map(value => {
        const item = value as Record<string, any>;
        return `${String(item.playerId ?? "")}:${String(item.game?.gameId ?? "")}`;
      });
      const missingReplayRecords = matchKeys.filter(key => !replayKeys.has(key));
      const orphanReplayRecords = [...replayKeys].filter(key => !matchKeys.includes(key));
      const profileIds = profiles.map(value => String((value as Record<string, unknown>).playerId ?? "")).sort();
      const profileRelations = [...new Set(matches.map(value => String((value as Record<string, unknown>).playerId ?? "")))].sort();

      // Exercise the production matchStore hydration path, not only raw IndexedDB reads.
      // A match is reusable only when its saved replay payload is reattached by loadImportedMatch.
      const reusableMatches = await Promise.all(matches
        .filter(value => Boolean((value as Record<string, any>).result))
        .map(async value => {
          const item = value as Record<string, any>;
          const playerId = String(item.playerId ?? "");
          const gameId = String(item.game?.gameId ?? "");
          const loaded = playerId && gameId ? await loadImportedMatch(playerId, gameId) : null;
          const record = loaded?.result?.record as Record<string, any> | undefined;
          return {
            playerId,
            gameId,
            loaded: Boolean(loaded),
            replayRestored: Boolean(record),
            recordGameId: record?.info?.gameID ?? record?.game?.info?.gameID ?? null,
            engineCommit: record?.gitCommit ?? null,
            turnCount: Array.isArray(record?.turns) ? record.turns.length : 0,
            analysisStatus: loaded?.analysisStatus ?? null,
          };
        }));

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
