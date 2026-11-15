export interface AutoSyncGame { gameId: string }
export interface AutoSyncEntry { game: AutoSyncGame; result?: unknown; status?: string; analysisStatus?: string }

/** Import unseen or incomplete matches and retry previous failures once per app session. */
export function selectGamesToImport<TGame extends AutoSyncGame, TEntry extends AutoSyncEntry>(games: readonly TGame[], entries: readonly TEntry[], attemptedIds: ReadonlySet<string> = new Set()): TGame[] {
  const entriesById = new Map<string, TEntry[]>();
  for (const entry of entries) {
    const id = String(entry.game?.gameId ?? "").trim();
    if (!id) continue;
    const group = entriesById.get(id) ?? [];
    group.push(entry);
    entriesById.set(id, group);
  }

  return games.filter(game => {
    const id = String(game.gameId ?? "").trim();
    if (!id || attemptedIds.has(id)) return false;
    const existing = entriesById.get(id) ?? [];
    // A library index row without its imported result is a partial import, not
    // a completed one. Re-fetch it after restart instead of silently skipping
    // it forever. Prefer any complete non-failed copy if duplicate rows exist.
    if (existing.some(entry => Boolean(entry.result) && entry.status !== "failed")) return false;
    return existing.length === 0 || existing.some(entry => entry.status === "failed") || existing.every(entry => !entry.result);
  });
}

/** Analyze pending matches and retry previous analysis failures once per app session. */
export function selectGamesToAnalyze<TEntry extends AutoSyncEntry>(entries: readonly TEntry[], attemptedIds: ReadonlySet<string> = new Set()): TEntry[] {
  return entries.filter(entry => Boolean(entry.result) && (entry.analysisStatus === undefined || entry.analysisStatus === "pending" || (entry.analysisStatus === "failed" && !attemptedIds.has(entry.game.gameId))));
}
