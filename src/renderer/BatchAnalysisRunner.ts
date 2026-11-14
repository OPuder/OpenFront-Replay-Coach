export type BatchAnalysisStatus =
  | "queued"
  | "running"
  | "verified"
  | "unverified"
  | "unsupported"
  | "failed";

export interface BatchAnalysisProgress {
  done: number;
  total: number;
  gameId: string;
  /** Sum of the current progress percentages of all active simulations. */
  percent: number;
  phase: string;
  active: number;
}

export interface BatchAnalysisSummary {
  total: number;
  completed: number;
  verified: number;
  unverified: number;
  unsupported: number;
  failed: number;
  cancelled: boolean;
}

export interface ConcurrentBatchAnalysisOptions<TItem, TResult extends { status: "verified" | "unverified" }> {
  signal: AbortSignal;
  /** Defaults to one worker; callers opt into bounded parallelism explicitly. */
  concurrency?: number;
  getId(item: TItem): string;
  isCompatible(item: TItem): boolean;
  analyze(
    item: TItem,
    onProgress: (percent: number, phase: string) => void,
    signal: AbortSignal,
  ): Promise<TResult>;
  onStatus(
    item: TItem,
    status: BatchAnalysisStatus,
    result?: TResult,
    error?: string,
  ): void | Promise<void>;
  onProgress(progress: BatchAnalysisProgress): void;
}

/**
 * Runs independent original-engine simulations in a bounded worker pool.
 * Each replay remains isolated and deterministic; concurrency only overlaps
 * separate matches and is deliberately selected by the caller per platform.
 */
export async function runConcurrentBatchAnalysis<
  TItem,
  TResult extends { status: "verified" | "unverified" },
>(
  items: readonly TItem[],
  options: ConcurrentBatchAnalysisOptions<TItem, TResult>,
): Promise<BatchAnalysisSummary> {
  const { signal, getId, isCompatible, analyze, onStatus, onProgress } = options;
  const uniqueItems: TItem[] = [];
  const seenIds = new Set<string>();
  for (const item of items) {
    const id = getId(item).trim();
    if (!id || !seenIds.has(id)) {
      uniqueItems.push(item);
      if (id) seenIds.add(id);
    }
  }

  const summary: BatchAnalysisSummary = {
    total: uniqueItems.length,
    completed: 0,
    verified: 0,
    unverified: 0,
    unsupported: 0,
    failed: 0,
    cancelled: false,
  };
  const activeProgress = new Map<string, { percent: number; phase: string }>();
  let nextIndex = 0;
  const concurrency = Math.max(1, Math.min(uniqueItems.length || 1, Math.floor(options.concurrency ?? 1)));

  const publishProgress = (gameId = "") => {
    const active = [...activeProgress.entries()];
    onProgress({
      done: summary.completed,
      total: summary.total,
      gameId: gameId || active.map(([id]) => id).join(", "),
      percent: active.reduce((sum, [, value]) => sum + value.percent, 0),
      phase: active.length
        ? active.map(([id, value]) => `${id}: ${value.phase}`).join(" · ")
        : summary.cancelled ? "Analyse abgebrochen" : "Partie abgeschlossen",
      active: active.length,
    });
  };

  for (const item of uniqueItems) {
    if (signal.aborted) {
      summary.cancelled = true;
      break;
    }
    await onStatus(item, "queued");
  }

  const worker = async () => {
    while (!signal.aborted) {
      const index = nextIndex++;
      if (index >= uniqueItems.length) return;
      const item = uniqueItems[index];
      const gameId = getId(item);
      if (!isCompatible(item)) {
        await onStatus(item, "unsupported", undefined, "Für dieses Replay ist keine exakte Original-Engine verfügbar.");
        summary.unsupported++;
        summary.completed++;
        publishProgress(gameId);
        continue;
      }

      activeProgress.set(gameId, { percent: 0, phase: "Original-Engine startet" });
      await onStatus(item, "running");
      publishProgress(gameId);
      try {
        const result = await analyze(
          item,
          (percent, phase) => {
            if (signal.aborted) return;
            activeProgress.set(gameId, {
              percent: Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0)),
              phase,
            });
            publishProgress(gameId);
          },
          signal,
        );
        if (signal.aborted) {
          summary.cancelled = true;
          return;
        }
        await onStatus(item, result.status, result);
        if (result.status === "verified") summary.verified++;
        else summary.unverified++;
      } catch (error) {
        if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
          summary.cancelled = true;
          return;
        }
        await onStatus(item, "failed", undefined, error instanceof Error ? error.message : String(error));
        summary.failed++;
      } finally {
        activeProgress.delete(gameId);
      }
      if (!signal.aborted) {
        summary.completed++;
        publishProgress(gameId);
      } else {
        summary.cancelled = true;
        publishProgress(gameId);
        return;
      }
    }
    if (signal.aborted) summary.cancelled = true;
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (signal.aborted) summary.cancelled = true;
  return summary;
}

/** Backwards-compatible sequential entry point for tests and low-resource callers. */
export function runSequentialBatchAnalysis<
  TItem,
  TResult extends { status: "verified" | "unverified" },
>(
  items: readonly TItem[],
  options: Omit<ConcurrentBatchAnalysisOptions<TItem, TResult>, "concurrency">,
): Promise<BatchAnalysisSummary> {
  return runConcurrentBatchAnalysis(items, { ...options, concurrency: 1 });
}
