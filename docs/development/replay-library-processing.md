# Replay library processing

## Import identity and resumability

- A match is identified by a non-empty game ID within the selected player profile.
- An index row without a completed import result is partial and must be retried after restart.
- Duplicate rows do not create duplicate active jobs; prefer a complete, non-failed result.
- Failed imports/analyses may be retried once per app session and can be resumed on the next launch.

## Batch progress

- Import concurrency and analysis concurrency are separate, bounded decisions.
- Progress is aggregated across active workers; ETA is based on completed fractional work and elapsed time, including before the first match finishes.
- Persist completed work incrementally so a process interruption does not discard an entire batch.

## Memory policy

- IndexedDB remains the source of truth for full replay records, decoded actions and complete engine simulation results.
- Dashboard/library React state stores only lightweight match metadata and coaching summaries.
- Strip raw replay JSON, decoded action arrays, sampled state timelines and per-action reviews from long-lived list state.
- Hydrate the selected match from IndexedDB when the user opens it; release the active heavy payload when navigating back to the library/dashboard.
- Do not hold every match's sampled timeline in React state after a long-term analysis batch completes.

## Remaining work

This policy bounds retained UI state but does not yet eliminate the temporary peak from loading all simulation rows out of IndexedDB. A dedicated simulation object store and lazy summary query may be needed for very large libraries. Benchmark with sanitized fixtures and the private 131-replay corpus without committing user replay data.
