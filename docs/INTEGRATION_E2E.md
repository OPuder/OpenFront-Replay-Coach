# Integration / E2E contract gate

This gate is deliberately additive: it exercises existing production modules and
checks cross-module contracts without introducing replacement parsing, simulation,
coaching, persistence, visualization, or update implementations.

## Stable pipeline contracts

- Replay identity and exact engine compatibility come from `GameRecordShape`,
  `ReplayCompatibility`, `ReplayEngineCatalog`, and `ReplaySimulation`.
- Batch isolation, cancellation, and resumable pending work use
  `BatchAnalysisRunner` and `AutoLibrarySync`.
- Match data and raw replay payloads are stored by `matchStore` in IndexedDB;
  the renderer must hydrate the raw record only when reopening/analyzing a match.
- Coaching findings are produced by the existing coach modules and timeline
  projection is performed by `CoachTimeline`; visual selection uses
  `CoachInsightSelection`.
- Update orchestration remains in Electron `updater.ts`, Android's existing
  Capacitor plugin, and the renderer `UpdateCenter`.

## Current integration boundary (main)

At the time this gate was introduced, PRs #145 and #147 were open and based on
main commit `237780c017adeb4151f838a4dcaeefe586bdb169`. The tactical tile-owner
map/time-selection and the revised evidence-ranked longitudinal contracts are
therefore integration candidates, not main-branch behavior. The tests must not
pretend those paths already execute on main. Re-run the gate against the merged
integration candidate once those PRs are integrated.

## Implemented integration coverage on this branch

The integration workflow now runs real production-module calls and an Electron
browser scenario. The browser scenario downloads the public Europe and Levant
records, selects the player named OligenOle, runs both exact historical engines,
compares every recorded hash, derives coaching reports from reconstructed engine
samples and intents, builds the replay timeline, reruns the same replay to check
deterministic coach output, and verifies the match/profile IndexedDB records after
a renderer reload.

Action timestamps are checked against the source replay turns and the selected
player's actual recorded intents. The longitudinal report is built from the two
verified simulation results; unverified matches are excluded by the production
longitudinal module.

## Explicit longitudinal integration boundary

The current base snapshot's `LongitudinalCoach` excludes unverified matches and
selects a comparable mode/type cohort, but it still includes duplicate game IDs
in `matchProgress` and its metric observations. The match-ID deduplication and
chronology/window guarantees described by PR #147 are not present on this branch.
The integration unit test records this current behavior explicitly; it does not
claim the stronger deduplication contract has passed. Re-run the duplicate-ID,
consecutive-window, ambiguous-time, and evidence-ranked trend cases when PR #147
is available in a shared integration base. PR #147 and its branch remain untouched.

## Explicit map integration boundary

The territory owner-grid / selected-time map implementation and responsive map
UI belong to PR #145 and are not part of this branch's source tree. This gate
therefore does not claim to validate territory snapshots, tile-owner deltas,
map-to-timeline selection, or missing-map-snapshot behavior. It validates only
the timeline events and engine-backed coaching markers available on this branch.
Once PR #145 is integrated into a common branch, extend the same real replay
browser harness to assert the exact ReplayReader tileState snapshots and
time-selection behavior; do not infer territory from aggregate tile counts.

## Update-data boundary

This integration job validates the renderer store interfaces and profile/replay
round-trip on IndexedDB. It does not simulate Windows installer replacement or
Android package replacement. Those destructive-in-practice platform transitions
remain covered by the separate Windows packaging/smoke and Android in-place APK
upgrade workflows, which must pass independently before platform data retention
can be declared.

## Real replay regression fixtures

- Europe: `c2R2JHZgUi`, engine
  `8b5d071eed95f07c701b32e4c64e95b03f8577c1`.
- Levant: `dLNCLHCvMK`, engine
  `bc3e3334c573c4959ec6a6745df6826d07233b4d`.

Fixtures remain public regression inputs, not committed payloads. The existing
replay compatibility workflow owns downloading and exact-engine/hash validation.
This gate checks that the same fixture identities and engine revisions are used
when integration tests are extended.

## Platform boundaries

- Windows persists match/replay records in IndexedDB (Chromium) while Electron
  update handoff and package replacement live in the main process.
- Android persists the same renderer stores inside the Capacitor WebView;
  Android package replacement is delegated to the existing native updater plugin.
- An update must not clear or recreate the app-data database. Upgrade validation
  therefore checks the pre-existing data sentinel after package replacement.

Do not mark a platform end-to-end pass based only on a source-contract test:
the platform workflows must also pass their packaged installer/portable and
emulator upgrade launches.


## Nested upstream submodule decision

The Coach consumes the historical OpenFront engine as a client-side simulation
source. The replay engine build uses the pinned engine workspaces and their
client/engine packages; it does not start the OpenFront server or import
`src/server/Gatekeeper.ts`. The nested `src/server/gatekeeper` gitlink is
therefore outside the runtime/build dependency graph used by Replay Coach.

The root checkout must not recursively initialize upstream submodules. The
`prepare:engines` script explicitly initializes the ten top-level engine
sources listed in `engine-build/engines.json` (including the exact Levant and
Europe revisions), without recursion, verifies each checked-out commit, and
installs dependencies from each pinned engine lockfile. This retains all
required engine files and exact commit identities while avoiding the unrelated,
unavailable server-only gatekeeper repository. Do not change engine pins or
replace the explicit engine preparation step with a blanket submodule disable.
