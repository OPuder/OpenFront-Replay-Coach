# Deterministic replay engine integration

## Pinned engine revision

The first integration target is OpenFrontIO commit
`bc3e3334c573c4959ec6a6745df6826d07233b4d`.

This is the engine revision recorded by the supplied Levant replay
(`dLNCLHCvMK`). It is a deliberate pin, not a claim that every replay uses
this revision. OpenFront's replay processor documents that simulation is
deterministic only within the build that produced the record.

## Required processing pipeline

The implementation must follow the upstream replay pipeline rather than
reimplementing game rules from the action log:

1. Validate the imported object against the upstream `GameRecordSchema`.
2. Require `record.info` with the full game-start configuration.
3. Decompress turns using upstream `decompressGameRecord`.
4. Build the wire game-start data using `WireGameStartInfoSchema` and
   `toWireGameStartInfo`.
5. Load the exact map assets through `FetchGameMapLoader` and the pinned
   asset manifest/CDN resolver.
6. Start the actual `packages/engine/src/worker/Worker.worker.ts` worker.
7. Run turns through upstream `processGameRecord` and
   `WorkerReplayEngine`.
8. Decode the generated replay chunks using upstream `ReplayReader`.
9. Expose player, unit, tile, terrain, and event snapshots to the coach.
10. Treat the first recorded-hash mismatch as a hard verification boundary.
    Never coach from frames beyond that boundary as if they were the played
    game.

Relevant upstream files at the pinned revision:

- `src/client/replay/LocalProcessing.ts`
- `src/client/replay/ReplayProcessor.worker.ts`
- `src/client/replay/ProcessorMessages.ts`
- `src/client/replay/processor/ReplayProcessor.ts`
- `src/client/replay/processor/WorkerReplayEngine.ts`
- `src/client/replay/codec/decode/ReplayReader.ts`
- `src/client/replay/ReplayRecord.ts`
- `src/client/WorkerClient.ts`
- `packages/engine/src/worker/Worker.worker.ts`
- `packages/shared/src/FetchGameMapLoader.ts`

## Build and packaging constraints

The upstream repository is a private npm-workspace monorepo. The engine,
engine-api, engine-lib, shared, and zbin packages are local workspaces at
version `0.0.0`; they are not independently installable public packages.
The upstream root currently declares Node `>=24.15.0 <25`, npm
`>=12.1.0 <13`, Vite 8, and TypeScript 7. The coach currently uses Node 22
in CI, Vite 6, and TypeScript 5.7. Do not merge the upstream root package
configuration into the Electron app. Build the pinned engine as a separate
workspace/build input and bundle only the required workers and runtime
dependencies into the desktop application.

The packaged app must include all engine code and required licenses. The
friend's machine must not need Node.js, npm, Git, or a source checkout.

## Compatibility and safety rules

- Exact `gitCommit` match is required before claiming deterministic replay.
- Missing recorded hashes means the run may be simulated, but it is not
  hash-verified; the UI must label it accordingly.
- A different `gitCommit` is not a small warning: it can change game
  outcomes. Stop or use a matching engine build; never silently continue as
  verified.
- Map data and asset URLs must be pinned/resolved for the engine revision,
  not guessed from map names.
- Preserve upstream license notices and meet the AGPL-3.0 source
  distribution obligations before shipping a bundled engine.

## Acceptance tests before calling the integration complete

1. The supplied Levant replay parses with the pinned upstream schema.
2. The supplied replay's `gitCommit` equals the pinned engine revision.
3. Replay simulation starts and loads the correct map assets offline/online
   as designed.
4. Every recorded hash is checked; the first mismatch is reported with turn,
   expected hash, and computed hash.
5. Frames before the verification boundary decode into stable snapshots.
6. Player selection maps to the correct engine player ID.
7. At least one known action sequence is cross-checked against the original
   replay and resulting unit/tile state.
8. Windows installer and portable ZIP both contain the workers/assets and
   launch on a clean Windows machine without Node/npm installed.
