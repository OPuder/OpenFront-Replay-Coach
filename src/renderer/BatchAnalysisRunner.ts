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
  percent: number;
  phase: string;
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

export interface SequentialBatchAnalysisOptions<TItem, TResult extends { status: "verified" | "unverified" }> {
  signal: AbortSignal;
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

/** Sequential by design: one deterministic engine simulation at a time. */
export async function runSequentialBatchAnalysis<
  TItem,
  TResult extends { status: "verified" | "unverified" },
>(
  items: readonly TItem[],
  options: SequentialBatchAnalysisOptions<TItem, TResult>,
): Promise<BatchAnalysisSummary> {
  const summary: BatchAnalysisSummary = {
    total: items.length,
    completed: 0,
    verified: 0,
    unverified: 0,
    unsupported: 0,
    failed: 0,
    cancelled: false,
  };
  const { signal, getId, isCompatible, analyze, onStatus, onProgress } = options;

  for (const item of items) {
    if (signal.aborted) {
      summary.cancelled = true;
      break;
    }
    await onStatus(item, "queued");
  }

  for (const item of items) {
    if (signal.aborted) {
      summary.cancelled = true;
      break;
    }
    const gameId = getId(item);
    if (!isCompatible(item)) {
      await onStatus(item, "unsupported", undefined, "Für dieses Replay ist keine exakte Original-Engine verfügbar.");
      summary.unsupported++;
      summary.completed++;
      onProgress({ done: summary.completed, total: summary.total, gameId, percent: 100, phase: "Engine nicht verfügbar" });
      continue;
    }

    await onStatus(item, "running");
    onProgress({ done: summary.completed, total: summary.total, gameId, percent: 0, phase: "Original-Engine startet" });
    try {
      const result = await analyze(
        item,
        (percent, phase) => {
          if (!signal.aborted) onProgress({ done: summary.completed, total: summary.total, gameId, percent, phase });
        },
        signal,
      );
      if (signal.aborted) {
        summary.cancelled = true;
        break;
      }
      await onStatus(item, result.status, result);
      if (result.status === "verified") summary.verified++;
      else summary.unverified++;
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        summary.cancelled = true;
        break;
      }
      await onStatus(item, "failed", undefined, error instanceof Error ? error.message : String(error));
      summary.failed++;
    }
    summary.completed++;
    onProgress({ done: summary.completed, total: summary.total, gameId: "", percent: 100, phase: "Partie abgeschlossen" });
  }

  return summary;
}
