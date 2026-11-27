import type { ReplaySimulationResult } from "./ReplaySimulation";

export type StoredMatchStatus = "loaded" | "engine-mismatch" | "failed";
export type StoredAnalysisStatus = "pending" | "verified" | "unverified" | "unsupported" | "failed";
export type StoredMatchEntry = {
  game: PlayerGame;
  result?: ApiImportSummary;
  status: StoredMatchStatus;
  error?: string;
  simulation?: ReplaySimulationResult;
  analysisStatus?: StoredAnalysisStatus;
  analysisError?: string;
};

type StoredMatch = StoredMatchEntry & {
  playerId: string;
  updatedAt: number;
};

const DB_NAME = "openfront-replay-coach";
const DB_VERSION = 5;
const MATCH_STORE = "matches";
const PROFILE_STORE = "profiles";
const REPLAY_STORE = "replay-records";
const ANALYSIS_STORE = "analysis-results";
const META_STORE = "app-metadata";
const LEGACY_MIGRATION_KEY = "legacy-payloads-v4";
const MATCH_PLAYER_INDEX = "by-player-id";
const MATCH_PLAYER_UPDATED_INDEX = "by-player-updated-at";
let legacyPayloadMigration: Promise<void> | null = null;

function migrateLegacyMatch(db: IDBDatabase, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([MATCH_STORE, REPLAY_STORE, ANALYSIS_STORE], "readwrite");
    const matches = tx.objectStore(MATCH_STORE);
    const replays = tx.objectStore(REPLAY_STORE);
    const analyses = tx.objectStore(ANALYSIS_STORE);
    const matchRequest = matches.get(key);
    const replayRequest = replays.get(key);
    const analysisRequest = analyses.get(key);
    let matchReady = false;
    let replayReady = false;
    let analysisReady = false;
    let migratedMatch: StoredMatch | undefined;
    let replayRecord: Record<string, unknown> | undefined;
    let analysisRecord: Record<string, unknown> | undefined;
    let migrationScheduled = false;

    const migrateWhenReady = () => {
      if (!matchReady || !replayReady || !analysisReady || migrationScheduled) return;
      migrationScheduled = true;
      const stored = migratedMatch;
      if (!stored) return;
      let changed = false;

      if (!Number.isFinite(stored.updatedAt)) {
        stored.updatedAt = Date.now();
        changed = true;
      }

      if (stored.simulation) {
        if (!analysisRecord?.simulation) {
          analyses.put({
            playerId: stored.playerId,
            gameId: stored.game.gameId,
            simulation: stored.simulation,
            analysisStatus: stored.analysisStatus,
            analysisError: stored.analysisError,
            updatedAt: stored.updatedAt,
          });
        }
        delete stored.simulation;
        changed = true;
      }

      const legacyPayload = stored.result as (StoredMatch["result"] & {
        record?: unknown;
        decodedActions?: unknown;
        actionAnalysis?: unknown;
      }) | undefined;
      if (legacyPayload && (legacyPayload.record || legacyPayload.decodedActions || legacyPayload.actionAnalysis)) {
        const mergedReplayRecord: Record<string, unknown> = {
          ...(replayRecord ?? {}),
          playerId: stored.playerId,
          gameId: stored.game.gameId,
        };
        if (legacyPayload.record != null && mergedReplayRecord.record == null) mergedReplayRecord.record = legacyPayload.record;
        if (legacyPayload.decodedActions != null && mergedReplayRecord.decodedActions == null) mergedReplayRecord.decodedActions = legacyPayload.decodedActions;
        if (legacyPayload.actionAnalysis != null && mergedReplayRecord.actionAnalysis == null) mergedReplayRecord.actionAnalysis = legacyPayload.actionAnalysis;
        replays.put(mergedReplayRecord);

        const { record: _record, decodedActions: _decodedActions, actionAnalysis: _actionAnalysis, ...summary } = legacyPayload;
        stored.result = summary as StoredMatch["result"];
        changed = true;
      }

      if (changed) matches.put(stored);
    };

    matchRequest.onsuccess = () => { migratedMatch = matchRequest.result as StoredMatch | undefined; matchReady = true; migrateWhenReady(); };
    replayRequest.onsuccess = () => { replayRecord = replayRequest.result as Record<string, unknown> | undefined; replayReady = true; migrateWhenReady(); };
    analysisRequest.onsuccess = () => { analysisRecord = analysisRequest.result as Record<string, unknown> | undefined; analysisReady = true; migrateWhenReady(); };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Legacy Replay-Daten konnten nicht migriert werden."));
    tx.onabort = () => reject(tx.error ?? new Error("Legacy Replay-Migration wurde abgebrochen."));
  });
}

async function migrateLegacyPayloads(db: IDBDatabase): Promise<void> {
  if (legacyPayloadMigration) return legacyPayloadMigration;
  legacyPayloadMigration = (async () => {
    const migrationComplete = await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readonly");
      const request = tx.objectStore(META_STORE).get(LEGACY_MIGRATION_KEY);
      request.onsuccess = () => resolve(request.result?.complete === true);
      request.onerror = () => reject(request.error ?? new Error("Legacy Replay-Migrationsstatus konnte nicht gelesen werden."));
      tx.onabort = () => reject(tx.error ?? new Error("Legacy Replay-Migrationsstatus konnte nicht gelesen werden."));
    });
    if (migrationComplete) return;

    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction(MATCH_STORE, "readonly");
      const request = tx.objectStore(MATCH_STORE).getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Legacy Replay-Schlüssel konnten nicht gelesen werden."));
      tx.onabort = () => reject(tx.error ?? new Error("Legacy Replay-Schlüssel konnten nicht gelesen werden."));
    });
    // One atomic transaction per match keeps large profiles within WebView memory
    // and quota limits. Completed rows are compacted, so interrupted runs resume
    // from the first row that still contains legacy payload data.
    for (const key of keys) await migrateLegacyMatch(db, key);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readwrite");
      tx.objectStore(META_STORE).put({ key: LEGACY_MIGRATION_KEY, complete: true });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Legacy Replay-Migrationsstatus konnte nicht gespeichert werden."));
      tx.onabort = () => reject(tx.error ?? new Error("Legacy Replay-Migrationsstatus konnte nicht gespeichert werden."));
    });
  })().finally(() => { legacyPayloadMigration = null; });
  return legacyPayloadMigration;
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Dieser Browser unterstützt keine lokale Replay-Speicherung (IndexedDB)."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const transaction = request.transaction;
      if (!db.objectStoreNames.contains(MATCH_STORE)) db.createObjectStore(MATCH_STORE, { keyPath: ["playerId", "game.gameId"] });
      if (!db.objectStoreNames.contains(PROFILE_STORE)) db.createObjectStore(PROFILE_STORE, { keyPath: "playerId" });
      if (!db.objectStoreNames.contains(REPLAY_STORE)) db.createObjectStore(REPLAY_STORE, { keyPath: ["playerId", "gameId"] });
      if (!db.objectStoreNames.contains(ANALYSIS_STORE)) db.createObjectStore(ANALYSIS_STORE, { keyPath: ["playerId", "gameId"] });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" });

      // Query a single player's library without loading every other profile's matches.
      const matches = transaction?.objectStore(MATCH_STORE);
      if (matches && !matches.indexNames.contains(MATCH_PLAYER_INDEX)) {
        matches.createIndex(MATCH_PLAYER_INDEX, "playerId", { unique: false });
      }
      // Sort a player's library directly from IndexedDB instead of loading
      // every entry and sorting a large array on the renderer thread.
      if (matches && !matches.indexNames.contains(MATCH_PLAYER_UPDATED_INDEX)) {
        matches.createIndex(MATCH_PLAYER_UPDATED_INDEX, ["playerId", "updatedAt"], { unique: false });
      }

      // Keep versionchange work schema-only. Moving large legacy replays and
      // simulation payloads in this atomic transaction can exceed Android
      // WebView storage limits and abort the entire database upgrade.
    };
    request.onsuccess = () => {
      const db = request.result;
      void migrateLegacyPayloads(db).then(() => resolve(db), error => {
        db.close();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    };
    request.onerror = () => reject(request.error ?? new Error("Lokaler Replay-Speicher konnte nicht geöffnet werden."));
    request.onblocked = () => reject(new Error("Lokaler Replay-Speicher ist durch einen anderen App-Tab blockiert."));
  });
}

async function writeRecord<T>(storeName: string, value: T): Promise<void> {
  const db = await openStore();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Lokaler Speicherfehler."));
    tx.onabort = () => reject(tx.error ?? new Error("Lokales Speichern wurde abgebrochen."));
  });
  db.close();
}

export async function savePlayerLibrary(page: PlayerPage): Promise<void> {
  await writeRecord(PROFILE_STORE, { ...page, savedAt: Date.now() });
}

export async function loadPlayerLibrary(playerId: string): Promise<PlayerPage | null> {
  const db = await openStore();
  const profile = await new Promise<PlayerPage | null>((resolve, reject) => {
    const tx = db.transaction(PROFILE_STORE, "readonly");
    const request = tx.objectStore(PROFILE_STORE).get(playerId);
    request.onsuccess = () => resolve((request.result as PlayerPage | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Gespeichertes Spielerprofil konnte nicht gelesen werden."));
    tx.onabort = () => reject(tx.error ?? new Error("Laden des Spielerprofils wurde abgebrochen."));
  });
  db.close();
  return profile;
}

export async function saveImportedMatch(playerId: string, item: StoredMatchEntry): Promise<void> {
  const db = await openStore();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([MATCH_STORE, REPLAY_STORE, ANALYSIS_STORE], "readwrite");
    const result = item.result;
    const replayPayload = result && (result.record || result.decodedActions || result.actionAnalysis)
      ? { record: result.record, decodedActions: result.decodedActions, actionAnalysis: result.actionAnalysis }
      : undefined;
    const summary = result ? (() => {
      const { record: _record, decodedActions: _decodedActions, actionAnalysis: _actionAnalysis, ...value } = result;
      return value;
    })() : undefined;
    const updatedAt = Date.now();
    const stored: StoredMatch = { ...item, simulation: undefined, result: summary as StoredMatch["result"], playerId, updatedAt };
    const matchStore = tx.objectStore(MATCH_STORE);
    if (result) {
      matchStore.put(stored);
    } else {
      // Status-only library updates must not erase the result summary that
      // keeps the independently stored replay payload discoverable.
      const existingRequest = matchStore.get([playerId, item.game.gameId]);
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result as StoredMatch | undefined;
        matchStore.put({ ...stored, result: existing?.result ?? stored.result });
      };
    }
    // Preserve the previously stored replay payload unless a replacement payload is supplied.
    if (replayPayload) tx.objectStore(REPLAY_STORE).put({ playerId, gameId: item.game.gameId, ...replayPayload });
    if (item.simulation) {
      tx.objectStore(ANALYSIS_STORE).put({
        playerId, gameId: item.game.gameId, simulation: item.simulation,
        analysisStatus: item.analysisStatus, analysisError: item.analysisError, updatedAt,
      });
    } else if (item.analysisStatus === "pending" || item.analysisStatus === "unsupported") {
      // A fresh import or newly incompatible engine must not retain stale
      // coaching payloads from a previous analysis of this match.
      tx.objectStore(ANALYSIS_STORE).delete([playerId, item.game.gameId]);
    } else if (item.analysisStatus || item.analysisError) {
      const analysisStore = tx.objectStore(ANALYSIS_STORE);
      const analysisRequest = analysisStore.get([playerId, item.game.gameId]);
      analysisRequest.onsuccess = () => {
        const existing = analysisRequest.result;
        if (existing) analysisStore.put({ ...existing, analysisStatus: item.analysisStatus, analysisError: item.analysisError, updatedAt });
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Lokaler Replay-Speicherfehler."));
    tx.onabort = () => reject(tx.error ?? new Error("Lokales Speichern wurde abgebrochen."));
  });
  db.close();
}

export async function loadImportedMatches(playerId: string): Promise<StoredMatchEntry[]> {
  const db = await openStore();
  const matches = await new Promise<StoredMatch[]>((resolve, reject) => {
    const tx = db.transaction(MATCH_STORE, "readonly");
    const index = tx.objectStore(MATCH_STORE).index(MATCH_PLAYER_UPDATED_INDEX);
    const range = IDBKeyRange.bound([playerId, 0], [playerId, Number.MAX_SAFE_INTEGER]);
    const request = index.openCursor(range, "prev");
    const entries: StoredMatch[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(entries);
        return;
      }
      entries.push(cursor.value as StoredMatch);
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("Partien des Spielerprofils konnten nicht gelesen werden."));
    tx.onabort = () => reject(tx.error ?? new Error("Laden der Spielerpartien wurde abgebrochen."));
  });
  db.close();
  return matches.map(({ game, result, status, error, simulation, analysisStatus, analysisError }) => ({
    game, result, status, error, simulation, analysisStatus, analysisError,
  }));
}

/** Fetch only the raw simulation record for batch analysis, avoiding hydration of cached actions and coaching results. */
export async function loadImportedReplayRecord(playerId: string, gameId: string): Promise<unknown | null> {
  const db = await openStore();
  const record = await new Promise<unknown | null>((resolve, reject) => {
    const tx = db.transaction(REPLAY_STORE, "readonly");
    const request = tx.objectStore(REPLAY_STORE).get([playerId, gameId]);
    request.onsuccess = () => resolve(request.result?.record ?? null);
    request.onerror = () => reject(request.error ?? new Error("Replay-Daten konnten nicht geladen werden."));
    tx.onabort = () => reject(tx.error ?? new Error("Laden der Replay-Daten wurde abgebrochen."));
  });
  db.close();
  return record;
}

/** Hydrate only the one large replay payload currently being analyzed or opened. */
export async function loadImportedMatch(playerId: string, gameId: string): Promise<StoredMatchEntry | null> {
  const db = await openStore();
  const value = await new Promise<{ match: StoredMatch | undefined; replayPayload: any; analysis: any }>((resolve, reject) => {
    const tx = db.transaction([MATCH_STORE, REPLAY_STORE, ANALYSIS_STORE], "readonly");
    const matchRequest = tx.objectStore(MATCH_STORE).get([playerId, gameId]);
    const replayRequest = tx.objectStore(REPLAY_STORE).get([playerId, gameId]);
    const analysisRequest = tx.objectStore(ANALYSIS_STORE).get([playerId, gameId]);
    let matchReady = false, replayReady = false, analysisReady = false;
    let match: StoredMatch | undefined, replayPayload: any, analysis: any;
    const finish = () => { if (matchReady && replayReady && analysisReady) resolve({ match, replayPayload, analysis }); };
    matchRequest.onsuccess = () => { match = matchRequest.result as StoredMatch | undefined; matchReady = true; finish(); };
    replayRequest.onsuccess = () => { replayPayload = replayRequest.result; replayReady = true; finish(); };
    analysisRequest.onsuccess = () => { analysis = analysisRequest.result; analysisReady = true; finish(); };
    matchRequest.onerror = replayRequest.onerror = analysisRequest.onerror = () => reject(tx.error ?? new Error("Gespeicherte Partie konnte nicht geladen werden."));
    tx.onabort = () => reject(tx.error ?? new Error("Laden der gespeicherten Partie wurde abgebrochen."));
  });
  db.close();
  if (!value.match) return null;
  const hasReplayPayload = Boolean(value.replayPayload
    && (value.replayPayload.record || value.replayPayload.decodedActions || value.replayPayload.actionAnalysis));
  const result = value.match.result || hasReplayPayload
    ? { ...(value.match.result ?? {}), ...(value.replayPayload ?? {}) }
    : undefined;
  const { game, status, error, simulation, analysisStatus, analysisError } = value.match;
  return { game, result, status, error, simulation: value.analysis?.simulation ?? simulation, analysisStatus: value.analysis?.analysisStatus ?? analysisStatus, analysisError: value.analysis?.analysisError ?? analysisError };
}
