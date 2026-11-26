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
const DB_VERSION = 4;
const MATCH_STORE = "matches";
const PROFILE_STORE = "profiles";
const REPLAY_STORE = "replay-records";
const ANALYSIS_STORE = "analysis-results";
const MATCH_PLAYER_INDEX = "by-player-id";
const MATCH_PLAYER_UPDATED_INDEX = "by-player-updated-at";

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Dieser Browser unterstützt keine lokale Replay-Speicherung (IndexedDB)."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
      const db = request.result;
      const transaction = request.transaction;
      if (!db.objectStoreNames.contains(MATCH_STORE)) db.createObjectStore(MATCH_STORE, { keyPath: ["playerId", "game.gameId"] });
      if (!db.objectStoreNames.contains(PROFILE_STORE)) db.createObjectStore(PROFILE_STORE, { keyPath: "playerId" });
      if (!db.objectStoreNames.contains(REPLAY_STORE)) db.createObjectStore(REPLAY_STORE, { keyPath: ["playerId", "gameId"] });
      if (!db.objectStoreNames.contains(ANALYSIS_STORE)) db.createObjectStore(ANALYSIS_STORE, { keyPath: ["playerId", "gameId"] });

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

      // Upgrade older match entries in one cursor pass. Combining both moves
      // avoids concurrent cursor updates overwriting one another when a v1
      // record contains both raw replay data and a simulation snapshot.
      if (event.oldVersion < 4 && transaction) {
        const matches = transaction.objectStore(MATCH_STORE);
        const replays = transaction.objectStore(REPLAY_STORE);
        const analyses = transaction.objectStore(ANALYSIS_STORE);
        const cursorRequest = matches.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const stored = cursor.value as StoredMatch;
          let changed = false;

          if (event.oldVersion < 2) {
            const record = stored.result?.record;
            if (record && stored.result) {
              replays.put({ playerId: stored.playerId, gameId: stored.game.gameId, record });
              const { record: _record, ...summary } = stored.result;
              stored.result = summary as StoredMatch["result"];
              changed = true;
            }
          }

          if (stored.simulation) {
            analyses.put({
              playerId: stored.playerId,
              gameId: stored.game.gameId,
              simulation: stored.simulation,
              analysisStatus: stored.analysisStatus,
              analysisError: stored.analysisError,
              updatedAt: stored.updatedAt,
            });
            delete stored.simulation;
            changed = true;
          }
          if (changed) cursor.update(stored);
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
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

async function readAll<T>(storeName: string): Promise<T[]> {
  const db = await openStore();
  const values = await new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error("Lokale Daten konnten nicht gelesen werden."));
  });
  db.close();
  return values;
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
    const record = result?.record;
    const summary = result ? (() => {
      const { record: _record, ...value } = result;
      return value;
    })() : undefined;
    const updatedAt = Date.now();
    const stored: StoredMatch = { ...item, simulation: undefined, result: summary as StoredMatch["result"], playerId, updatedAt };
    tx.objectStore(MATCH_STORE).put(stored);
    if (record) tx.objectStore(REPLAY_STORE).put({ playerId, gameId: item.game.gameId, record });
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

/** Hydrate only the one large replay payload currently being analyzed or opened. */
export async function loadImportedMatch(playerId: string, gameId: string): Promise<StoredMatchEntry | null> {
  const db = await openStore();
  const value = await new Promise<{ match: StoredMatch | undefined; record: unknown; analysis: any }>((resolve, reject) => {
    const tx = db.transaction([MATCH_STORE, REPLAY_STORE, ANALYSIS_STORE], "readonly");
    const matchRequest = tx.objectStore(MATCH_STORE).get([playerId, gameId]);
    const replayRequest = tx.objectStore(REPLAY_STORE).get([playerId, gameId]);
    const analysisRequest = tx.objectStore(ANALYSIS_STORE).get([playerId, gameId]);
    let matchReady = false, replayReady = false, analysisReady = false;
    let match: StoredMatch | undefined, record: unknown, analysis: any;
    const finish = () => { if (matchReady && replayReady && analysisReady) resolve({ match, record, analysis }); };
    matchRequest.onsuccess = () => { match = matchRequest.result as StoredMatch | undefined; matchReady = true; finish(); };
    replayRequest.onsuccess = () => { record = replayRequest.result?.record; replayReady = true; finish(); };
    analysisRequest.onsuccess = () => { analysis = analysisRequest.result; analysisReady = true; finish(); };
    matchRequest.onerror = replayRequest.onerror = analysisRequest.onerror = () => reject(tx.error ?? new Error("Gespeicherte Partie konnte nicht geladen werden."));
    tx.onabort = () => reject(tx.error ?? new Error("Laden der gespeicherten Partie wurde abgebrochen."));
  });
  db.close();
  if (!value.match) return null;
  const result = value.match.result
    ? { ...value.match.result, ...(value.record ? { record: value.record } : {}) }
    : undefined;
  const { game, status, error, simulation, analysisStatus, analysisError } = value.match;
  return { game, result, status, error, simulation, analysisStatus, analysisError };
}
