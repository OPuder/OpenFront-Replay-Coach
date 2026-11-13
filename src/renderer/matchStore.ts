import type { ReplaySimulationResult } from "./ReplaySimulation";

export type StoredMatchStatus = "loaded" | "engine-mismatch" | "failed";
export type StoredAnalysisStatus = "verified" | "unverified" | "unsupported" | "failed";
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
const DB_VERSION = 1;
const MATCH_STORE = "matches";
const PROFILE_STORE = "profiles";

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Dieser Browser unterstützt keine lokale Replay-Speicherung (IndexedDB)."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MATCH_STORE)) db.createObjectStore(MATCH_STORE, { keyPath: ["playerId", "game.gameId"] });
      if (!db.objectStoreNames.contains(PROFILE_STORE)) db.createObjectStore(PROFILE_STORE, { keyPath: "playerId" });
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
  await writeRecord<StoredMatch>(MATCH_STORE, { ...item, playerId, updatedAt: Date.now() });
}

export async function loadImportedMatches(playerId: string): Promise<StoredMatchEntry[]> {
  const matches = await readAll<StoredMatch>(MATCH_STORE);
  return matches.filter(item => item.playerId === playerId)
    .sort((a,b) => b.updatedAt - a.updatedAt)
    .map(({game,result,status,error,simulation,analysisStatus,analysisError}) => ({game,result,status,error,simulation,analysisStatus,analysisError}));
}
