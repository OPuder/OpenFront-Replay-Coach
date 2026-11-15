# Replay library processing: current behavior

## Import selection

- A replay needs a non-empty, trimmed `gameId` before it can be queued.
- A stored row without a completed imported result is partial and eligible for retry after restart.
- A complete, non-failed row takes precedence over partial duplicates for the same replay ID.
- Failed rows may be retried once in the current app session; the attempted-ID set prevents retry loops.

## Batch analysis identity and progress

- Each work item needs a stable ID. Anonymous items are skipped because they cannot be safely deduplicated or persisted.
- Duplicate IDs in one batch are collapsed before workers start.
- Worker concurrency remains bounded by the platform-aware caller.
- The displayed active-work percentage is the average of active workers' percentages.
- ETA uses fractional completed work: completed items plus the sum of each active worker's percentage divided by 100. This makes ETA available before the first long replay finishes.

## Reliability boundaries

This is one increment toward issue #84 and the performance goals in #85. It does not yet provide content-hash/revision-aware duplicate detection, full queue fault isolation, shared all-player reconstruction, per-player report persistence, 100-replay benchmarks or measured platform memory budgets. Those remain follow-up work.
