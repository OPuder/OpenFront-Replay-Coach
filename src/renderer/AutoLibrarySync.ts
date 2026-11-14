export interface AutoSyncGame { gameId: string }
export interface AutoSyncEntry { game: AutoSyncGame; result?: unknown; status?: string; analysisStatus?: string }

/** Import unseen matches and retry previous failures once per app session. */
export function selectGamesToImport<TGame extends AutoSyncGame, TEntry extends AutoSyncEntry>(games: readonly TGame[], entries: readonly TEntry[], attemptedIds: ReadonlySet<string> = new Set()): TGame[] {
  const byId = new Map(entries.map(entry => [entry.game.gameId, entry]));
  return games.filter(game => {
    const entry = byId.get(game.gameId);
    return !entry || (entry.status === "failed" && !attemptedIds.has(game.gameId));
  });
}

/** Analyze pending matches and retry previous analysis failures once per app session. */
export function selectGamesToAnalyze<TEntry extends AutoSyncEntry>(entries: readonly TEntry[], attemptedIds: ReadonlySet<string> = new Set()): TEntry[] {
  return entries.filter(entry => Boolean(entry.result) && (entry.analysisStatus === undefined || entry.analysisStatus === "pending" || (entry.analysisStatus === "failed" && !attemptedIds.has(entry.game.gameId))));
}
