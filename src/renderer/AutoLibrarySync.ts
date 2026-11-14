export interface AutoSyncGame { gameId: string }
export interface AutoSyncEntry { game: AutoSyncGame; result?: unknown; analysisStatus?: string }

/** Games not present in the local library are imported on first scan and on later syncs. */
export function selectGamesToImport<TGame extends AutoSyncGame, TEntry extends AutoSyncEntry>(games: readonly TGame[], entries: readonly TEntry[]): TGame[] {
  const known = new Set(entries.map(entry => entry.game.gameId));
  return games.filter(game => !known.has(game.gameId));
}

/** Only imported games without a terminal analysis result enter the automatic queue. */
export function selectGamesToAnalyze<TEntry extends AutoSyncEntry>(entries: readonly TEntry[]): TEntry[] {
  return entries.filter(entry => Boolean(entry.result) && (entry.analysisStatus === undefined || entry.analysisStatus === "pending"));
}
