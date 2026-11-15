# Replay library processing: current behavior

This note documents the resumability and progress behavior introduced in the current replay-library work. It is intentionally explicit about what is and is not complete.

## Import selection

- A replay must have a non-empty, trimmed `gameId` before it can be queued.
- A stored row without its completed imported result is treated as partial and eligible for retry after restart.
- A complete, non-failed row wins over partial duplicates for the same replay ID.
- A failed row can be retried once in the current app session; the in-memory attempted-ID set prevents repeated loops.

## Batch analysis identity and progress

- Each work item needs a stable ID. Anonymous items are skipped because they cannot be safely deduplicated or persisted.
- Duplicate IDs in one batch are collapsed before workers start.
- Worker concurrency remains bounded by the platform-aware caller.
- The displayed active-work percentage is the average of active workers' percentages.
- ETA uses fractional completed work: completed items plus the sum of each active worker's percentage divided by 100. This makes ETA available before the first long replay finishes.

## Reliability boundaries

This work is one increment toward issue #84 and the performance goals in #85. It does not yet provide:
- content-hash/revision-aware duplicate detection,
- full fault isolation for malformed records across the complete queue,
- shared all-player reconstruction and per-player report persistence,
- 100-replay cold/warm benchmarks or measured platform memory budgets.

Those remain explicit follow-up work; do not mark #84 or #85 complete based on import retry and ETA alone.
