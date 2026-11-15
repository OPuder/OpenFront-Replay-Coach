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
const DB_VERSION = 2;
const MATCH_STORE = "matches";
const PROFILE_STORE = "profiles";
const REPLAY_STORE = "replay-records";

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

      // Move large raw replay payloads out of the eagerly loaded match index.
      // Keep existing users' data intact during the v1 -> v2 upgrade.
      if (event.oldVersion < 2 && transaction) {
        const matches = transaction.objectStore(MATCH_STORE);
        const replays = transaction.objectStore(REPLAY_STORE);
        const cursorRequest = matches.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const stored = cursor.value as StoredMatch;
          const record = stored.result?.record;
          if (record && stored.result) {
            replays.put({ playerId: stored.playerId, gameId: stored.game.gameId, record });
            const { record: _record, ...summary } = stored.result;
            stored.result = summary as StoredMatch["result"];
            cursor.update(stored);
          }
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
  const profiles = await readAll<PlayerPage & { savedAt?: number }>(PROFILE_STORE);
  return profiles.find(profile => profile.playerId === playerId) ?? null;
}

export async function saveImportedMatch(playerId: string, item: StoredMatchEntry): Promise<void> {
  const db = await openStore();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([MATCH_STORE, REPLAY_STORE], "readwrite");
    const result = item.result;
    const record = result?.record;
    const summary = result ? (() => {
      const { record: _record, ...value } = result;
      return value;
    })() : undefined;
    const stored: StoredMatch = { ...item, result: summary as StoredMatch["result"], playerId, updatedAt: Date.now() };
    tx.objectStore(MATCH_STORE).put(stored);
    if (record) tx.objectStore(REPLAY_STORE).put({ playerId, gameId: item.game.gameId, record });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Lokaler Replay-Speicherfehler."));
    tx.onabort = () => reject(tx.error ?? new Error("Lokales Speichern wurde abgebrochen."));
  });
  db.close();
}

export async function loadImportedMatches(playerId: string): Promise<StoredMatchEntry[]> {
  const matches = await readAll<StoredMatch>(MATCH_STORE);
  return matches.filter(item => item.playerId === playerId)
    .sort((a,b) => b.updatedAt - a.updatedAt)
    .map(({game,result,status,error,simulation,analysisStatus,analysisError}) => ({game,result,status,error,simulation,analysisStatus,analysisError}));
}

/** Hydrate only the one large replay payload currently being analyzed or opened. */
export async function loadImportedMatch(playerId: string, gameId: string): Promise<StoredMatchEntry | null> {
  const db = await openStore();
  const value = await new Promise<{ match: StoredMatch | undefined; record: unknown }>((resolve, reject) => {
    const tx = db.transaction([MATCH_STORE, REPLAY_STORE], "readonly");
    const matchRequest = tx.objectStore(MATCH_STORE).get([playerId, gameId]);
    const replayRequest = tx.objectStore(REPLAY_STORE).get([playerId, gameId]);
    let matchReady = false, replayReady = false;
    let match: StoredMatch | undefined, record: unknown;
    const finish = () => { if (matchReady && replayReady) resolve({ match, record }); };
    matchRequest.onsuccess = () => { match = matchRequest.result as StoredMatch | undefined; matchReady = true; finish(); };
    replayRequest.onsuccess = () => { record = replayRequest.result?.record; replayReady = true; finish(); };
    matchRequest.onerror = replayRequest.onerror = () => reject(tx.error ?? new Error("Gespeicherte Partie konnte nicht geladen werden."));
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
