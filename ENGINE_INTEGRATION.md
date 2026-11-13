# Deterministic replay engine integration

## Exact replay engine catalog

The Coach bundles each supported upstream revision independently. The replay's
full `gitCommit` selects exactly one worker bundle; there is no fallback to a
different build.

| Replay fixture | Exact OpenFrontIO commit | Bundle |
| --- | --- | --- |
| Levant (`dLNCLHCvMK`) | `bc3e3334c573c4959ec6a6745df6826d07233b4d` | `replay-engine-bc3e3334c573.js` |
| Europe (`c2R2JHZgUi`) | `8b5d071eed95f07c701b32e4c64e95b03f8577c1` | `replay-engine-8b5d071eed95.js` |

The two exact source revisions are tracked as separate public OpenFrontIO
submodules and declared in `engine-build/engines.json`. CI checks that each
submodule SHA, compatibility catalog entry, runtime loader and output bundle
name agree. The Europe fixture is fetched from the public replay API in the
compatibility workflow and its map, player count, turn count, commit and hash
checkpoint count are asserted.

OpenFront's replay processor documents that simulation is deterministic only
within the build that produced the record. Unknown commits remain blocked
until their exact upstream source revision is added and built.

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
The upstream revisions declare Node `>=24.15.0 <25`, npm
`>=12.1.0 <13`, Vite 8, and TypeScript 7. The coach keeps its own toolchain
separate and builds each worker with the Vite installation belonging to that
exact upstream submodule. Do not merge the upstream root package
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

1. Both Levant and Europe fixtures are accepted by their respective exact upstream engine builds.
2. Each fixture selects only its exact `gitCommit` worker bundle.
3. Unknown and malformed commits are rejected before simulation.
4. Replay simulation starts and loads the correct map assets online as designed.
5. Every recorded hash is checked; the first mismatch is reported with turn,
   expected hash, and computed hash.
6. Frames before the verification boundary decode into stable snapshots.
7. Player selection maps to the correct engine player ID.
8. At least one known action sequence per supported build is cross-checked
   against the original replay and resulting unit/tile state.
9. Windows installer and portable ZIP both contain all workers/assets and
   launch on a clean Windows machine without Node/npm installed.
