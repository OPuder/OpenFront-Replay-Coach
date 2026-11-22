# Repository Consolidation

**Status:** Active consolidation; coaching engine and replay visualization selectively imported; 10 duplicate/stale PRs closed after preserving or redirecting their useful work; source branches are preserved.
**Consolidation branch:** `integration/repository-consolidation`
**Base branch:** `main`
**Base SHA at creation:** `5e6e8ef4f041febd18b9d9750d61ba52814330c2`
**Created from:** current `main` snapshot observed on 2026-11-22.

## Purpose

This branch is a controlled staging area for reviewing and consolidating useful work from existing feature, fix, QA, release, documentation, and integration branches. It is not a replacement for `main`, and it is not yet a release candidate.

## Non-negotiable safety rules

1. Do not commit directly to `main`.
2. Do not delete source branches. Close a PR only after reviewing its unique changes and documenting the superseding destination; retain its source branch until replacement work is validated.
3. Review each source branch/PR at file and behavior level before importing anything.
4. Do not import a whole PR merely because it is mergeable or has green checks.
5. Preserve useful changes selectively; document rejected, duplicate, superseded, or blocked changes and why.
6. Run relevant tests on the consolidated result. A check on an older source SHA does not validate a newer consolidated SHA.
7. Keep a source-to-destination ledger: source branch/PR/SHA, selected files or commits, resulting commit(s), validation evidence, and disposition.
8. Branch deletion candidates are only recommendations until the user explicitly approves deletion.

## Review workflow

For each source:
- Capture branch tip SHA and PR relationship.
- Compare against the current consolidation branch and `main`.
- Inspect commits and file-level diffs, including workflow and release-policy changes.
- Identify overlaps, dependencies, regressions, and changes already present in `main`.
- Import only the useful, non-duplicated parts.
- Record the decision and exact source SHA in the ledger.
- Run targeted tests after import; run full integration gates before proposing any `main` merge.

## Historical open pull requests — snapshot before cleanup (2026-11-22)

This table records the pre-cleanup state only. It is superseded by the live cleanup update at the end of this document; do not use it as the current PR list.

| PR | Title | Source branch | Snapshot state | Initial note |
|---:|---|---|---|---|
| #156 | Build-fix: stabilise main | `feature/build-fix` | Open, Draft, mergeable | Four reported PR workflows passed on its head, but diff removes three workflows: build-windows.yml, update-capacitor-lock.yml, validate-android.yml. Do not import as-is. |
| #153 | Repository cleanup – inventory & merge plan | `branch-inventory-report` | Open, Draft, mergeable | Inventory/docs contribution; base is stale and needs refresh before any adoption. |
| #151 | WIP: integrate Replay Coach features and update system | `integration/replay-coach-mainline` | Open, Draft, mergeable | Large 85-file integration candidate; inspect selectively. Contains overlapping feature work and release/workflow risk. |
| #147 | Coaching: improve evidence ranking and longitudinal stability | `feature/coaching-engine` | Open, Draft, not mergeable | Coaching engine contribution; inspect against #151 and current main. |
| #146 | Release: enforce reviewed versioning and publish integrity manifests | `feature/release-update-system` | Open, Ready, not mergeable | Significant update/release work; acceptance notes show runtime rollback and same-head validation requirements still open. |
| #145 | UX: Add tactical replay visualization and phase timeline | `feature/ux-replay-visualization` | Open, Ready, not mergeable | Tactical replay UI; inspect feature and test coverage; relative 30/40/30 phase heuristic is documented limitation. |
| #143 | Android: keep release-upgrade emulator awake and capture process exit reasons | `fix/android-release-idle-soak-diagnostics` | Open, Ready, not mergeable | Android diagnostics; compare with later Android test work. |
| #141 | Android: harden emulator upgrade regression and cold-start checks | `test/android-emulator-upgrade-resilience` | Open, Ready, not mergeable | Android upgrade QA; compare with #143/#156. |
| #140 | Windows: retry unchanged installer updates with elevation | `fix/windows-updater-elevation-fallback` | Open, Ready, not mergeable | Windows updater fix; validate against current updater implementation. |
| #139 | Performance: avoid argument overflow on large replays | `perf/large-replay-safety-main-current` | Open, Ready, not mergeable | Large replay safety; compare with other replay-safety branches. |
| #138 | Coaching: correct full-match phases and median match scores | `fix/full-replay-phase-timeline-main-current` | Open, Ready, not mergeable | Coaching phase/median logic; compare with #147/#151. |
| #136 | Android: expose APK container and engine dependency diagnostics | `fix/android-apk-diagnostics-main-current` | Open, Ready, not mergeable | Android diagnostics; compare with #135/#126. |
| #135 | Android: diagnose APK parser failures with verified container details | `fix/android-apk-parser-diagnostics-mainline-v3` | Open, Ready, not mergeable | APK parser diagnostics; compare with #136/#126. |
| #134 | Coaching: use exact engine spawn coordinates in match and long-term review | `coach/exact-spawn-metrics-mainline-v3` | Open, Ready, not mergeable | Exact spawn evidence; compare with #127 and main. |
| #132 | Performance: guard large replay inputs and bound Android update tests | `perf/replay-safety-mainline-v4` | Open, Ready, not mergeable | Replay safety and Android test bounds; compare with #139 and main. |
| #127 | Coaching: use exact engine spawn coordinates in opening review | `coach/exact-spawn-metrics-current-main` | Open, Ready, not mergeable | Likely overlap with #134; inspect before selecting canonical implementation. |
| #126 | Android: diagnose unreadable APK containers | `fix/android-apk-parser-diagnostics-mainline-v2` | Open, Ready, mergeable | Android diagnostics; four recent checks included two update-validation failures. Do not treat as fully validated. |
| #122 | Docs: establish free AI-assisted development workflow | `chore/free-agent-workflow-foundation` | Open, Ready, not mergeable | Workflow/documentation contribution; inspect for continuing relevance. |
| #97 | CI: retain replay validation logs for actionable failures | `ci/retain-replay-validation-reports` | Open, Ready, mergeable | Replay diagnostic artifact contribution; recent update-validation run failed. |
| #79 | Add selectable cohorts to longitudinal player coaching | `feat/longitudinal-cohort-selector` | Open, Ready, not mergeable | Longitudinal coaching feature; inspect for uniqueness and compatibility. |

## Other known PR history

- PR #152 was closed as a duplicate of #151 because both had the same head SHA and same 85-file change set. Its branch `work/alternative-development` was not deleted.
- No PR in this inventory has been merged by this consolidation task.
- No source branch has been deleted by this consolidation task.

## Source branch inventory — snapshot 2026-11-22

The following 73 branch names were returned by the repository branch listing. This is an inventory only, not a deletion list.

```text
auto-release-on-main-2.2.5
automation/openfront-engine-latest
branch-inventory-report
chore/focus-releases-windows-android
chore/free-agent-workflow-foundation
chore/verify-permanent-android-signing
ci/cache-npm-engine-dependencies
ci/retain-replay-validation-reports
coach/exact-spawn-metrics-current-main
coach/exact-spawn-metrics-mainline
coach/exact-spawn-metrics-mainline-v2
coach/exact-spawn-metrics-mainline-v3
coach/median-match-score-mainline
coach/true-median-match-score-main-current
coach-phase-survival-fix-2.2.9
coach-training-loop-redesign
feat/automatic-library-coaching-strategy
feat/evidence-backed-strengths
feat/longitudinal-cohort-selector
feat/multi-match-session-persistence
feat/replay-engine-coverage-audit
feat/resumable-library-analysis-main
feat/spawn-map-coaching
feature/build-fix
feature/cline-fixes
feature/coaching-engine
feature/qa-replay-compatibility
feature/queue-safe
feature/queue-safe-clean
feature/release-update-system
feature/ux-replay-visualization
fix/android-apk-diagnostics-main-current
fix/android-apk-parser-diagnostics
fix/android-apk-parser-diagnostics-mainline-v2
fix/android-apk-parser-diagnostics-mainline-v3
fix/android-release-idle-soak-diagnostics
fix/android-release-test-contract-path
fix/android-update-smoke-main
fix/coach-phase-timeline-alignment
fix/coach-phase-timeline-main
fix/full-replay-phase-timeline-main-current
fix/kvm-contract-step-boundaries
fix/release-cache-version-idempotent
fix/release-upgrade-gate-hardening
fix/resume-partial-replay-imports
fix/signed-android-release-upgrade-mainline
fix/spawn-coaching-uses-exact-replay-metrics
fix/stabilize-android-emulator-ci
fix/startup-responsiveness-and-replay-export
fix/true-median-match-score
fix/windows-smoke-test-cdp-startup
fix/windows-updater-elevation-fallback
integration/replay-coach-mainline
longitudinal-player-history-2.2.9
main
perf/avoid-large-replay-frame-spread
perf/concurrency-aware-analysis-eta
perf/import-resume-eta-mainline
perf/import-resume-eta-mainline-v2
perf/index-match-store-by-player
perf/large-replay-safety-main
perf/large-replay-safety-main-current
perf/replay-safety-main-current
perf/replay-safety-mainline-v2
perf/replay-safety-mainline-v3
perf/replay-safety-mainline-v4
phase-skill-profile-2.2.8
release/branch-cleanup
release/cleanup-v2
test/android-emulator-upgrade-resilience
test/android-release-apk-upgrade
ux-simplification-visual-analytics
work/alternative-development
```

## Review findings — live recheck 2026-11-22

### PR #147 — coaching engine

**Decision: selectively imported to the consolidation branch.**

- Source: `feature/coaching-engine`, exact source HEAD `7b7df44128c2b9fcb099c9714a65b9ec8015379f`.
- Imported six files only: `CoachInsightSelection.ts`, `EngineCoachInsights.ts`, `LongitudinalCoach.ts`, `ProCoachAlgorithm.ts`, `longitudinal-coach.test.mjs`, and `pro-coach-algorithm.test.mjs`.
- The current `main` changes since the PR base (`237780c017adeb4151f838a4dcaeefe586bdb169`) were compared. None of those six paths changed on main in that interval, so copying these exact branch blobs does not overwrite later main edits in those paths.
- Source-head Actions: Windows Build, Replay Compatibility, Update System Validation, and Android APK all completed successfully on this source SHA. This is source evidence only; it does **not** validate the consolidated commit.
- Import commit: `df6baf5c6f7de24368b0298cf389688d633308a1`.
- Not imported: the PR's workflow-only KVM chmod change or replay browser harness files, because the latter overlap with newer main changes and need a separate patch-level integration.
- Remaining: run targeted coaching tests and the full integration gates on the consolidated SHA.

### PR #156 — build-fix

**Decision: do not import as-is; retain as a review candidate.**

- Exact head: `b65e2a83b167b1482115736c2800958c976deffa`, 166 commits ahead of main.
- It deletes `.github/workflows/build-windows.yml`, `.github/workflows/update-capacitor-lock.yml`, and `.github/workflows/validate-android.yml`.
- Its successful PR checks do not compensate for removing existing build/release validation entry points. The remaining workflow and TypeScript changes also need separate review; no files imported.

### PR #151 — broad integration candidate

**Decision: do not import wholesale.**

- Exact head: `d54b84d617c733c5f463029ac33e7c3d3ec3e27a`; 528 commits ahead and 15 behind the current main base used in its PR.
- It bundles #145, #147 and #146 and changes 85 files, including generated engine bundles and workflow/release behavior.
- Actions on this exact head: Android APK, Integration E2E, Replay Compatibility, and Pinned Engine succeeded; Update System Validation and Windows Build failed. This contradicts any interpretation that the full required CI set passed.
- The PR body also documents that signed Android upgrade, Windows install/update/rollback and real replay fixture validation were not all complete at that checkpoint.
- Its product work is being reviewed by source area rather than importing the entire branch.

### PR #145 — replay visualization

**Decision: selectively integrated into the consolidation branch; validation pending.**

- Exact source head: `1fa70d3d88dc2f80746641054fa78ba957e656b3`.
- Imported the new components `ReplayCoachIntegration.ts`, `ReplayTerritory.ts`, `ReplayVisualization.tsx`, `ReplayVisualization.css`, their focused tests and two data-contract documents.
- Integrated the component into the current main-based `main.tsx` rather than copying the stale full renderer file. Updated `ReplaySimulation.ts` to capture exact tile-owner snapshots and explicit unit target tiles; action turn numbers are mapped to zero-based ReplayReader frames. Updated engine declarations and the `test:coach` script.
- Replay harness files from the PR were not copied wholesale because they overlap with newer main changes. They still need targeted real-fixture integration tests.
- Source-head Actions included failures in Replay Compatibility, Android APK, Update System Validation and Windows Build; Pinned Engine succeeded.
- The documented 30/40/30 Early/Mid/Late split remains a coarse relative-time heuristic, not actual strategic phase detection.
- Consolidated implementation commits: `dc407ca80f246dbae4298defa133815e0dd4e5d4`, `e5bfc3b45c419aac8c151a528530c7a121164876`, `1a34b9e1dfe4616084390d0d774383c4125fe2a4`, `1d125fda1b926c5a02f9b84210298e23286868a8`, `52880d3ec2d73106321534e3843aee11019cf165`.

### PR #146 — release/update system

**Decision: hold; no import yet.**

- Exact head: `ac36c1844d85b33715534033ee11ce0104ca8671`.
- No PR-triggered workflow runs were returned for this exact head.
- The scope is broad and includes release workflow, updater runtime, Android signing and Windows/Android upgrade contracts. Runtime rollback and same-head validation must be established before adoption.

## Consolidation ledger

| Source | Source SHA | Decision | Imported paths/commits | Result SHA | Tests/evidence | Notes |
|---|---|---|---|---|---|---|
| PR #147 / `feature/coaching-engine` | `7b7df44128c2b9fcb099c9714a65b9ec8015379f` | Selectively imported | 4 coaching implementation files + 2 coaching test files; commit `df6baf5c6f7de24368b0298cf389688d633308a1` | `df6baf5c6f7de24368b0298cf389688d633308a1` | Source SHA: Windows, Replay Compatibility, Update Validation, Android all success; consolidated SHA tests pending | No overlapping main edits in the six imported paths since PR base |
| PR #156 / `feature/build-fix` | `b65e2a83b167b1482115736c2800958c976deffa` | Hold / reject wholesale | None | — | Four reported PR workflows successful; workflow deletions are a blocker | Review selected non-workflow changes separately |
| PR #151 / `integration/replay-coach-mainline` | `d54b84d617c733c5f463029ac33e7c3d3ec3e27a` | Hold / selective review | None from this PR as a whole | — | Android, Integration E2E, Replay Compatibility, Pinned Engine success; Windows Build and Update Validation failed | Large, stale, overlapping integration |
| PR #145 / `feature/ux-replay-visualization` | `1fa70d3d88dc2f80746641054fa78ba957e656b3` | Selectively integrated | New components, tests, docs, current-main adapters; commits listed above | Current consolidation head | PR #157 CI pending | Replay harness was not copied wholesale |
| PR #146 / `feature/release-update-system` | `ac36c1844d85b33715534033ee11ce0104ca8671` | Hold pending exact-head validation | None | — | No PR-triggered workflow runs returned for this SHA | Runtime rollback and signed upgrade evidence still required |


## Branch-family triage — current main comparison

The live comparison pass covered the inventoried source branches. These are review dispositions, not deletion approvals:

- **Coaching evidence:** #147 is the selected current implementation imported above. Older/parallel branches `coach/exact-spawn-metrics-*`, `coach/median-match-score-mainline`, `coach/true-median-match-score-main-current`, `fix/true-median-match-score`, `fix/coach-phase-timeline-*`, `fix/spawn-coaching-uses-exact-replay-metrics`, and `feat/evidence-backed-strengths` overlap in `ProCoachAlgorithm.ts`, `LongitudinalCoach.ts`, and coaching tests. Do not import them wholesale; compare any unique spawn/phase behavior against the selected #147 baseline and current main.
- **Replay safety/performance:** `perf/large-replay-safety-*`, `perf/replay-safety-mainline-v*`, `perf/replay-safety-main-current`, and `perf/avoid-large-replay-frame-spread` overlap in `DetailedAnalysis.ts`, `ReplaySimulation.ts`, and terrain/coaching tests. Keep one canonical implementation only after exact behavior and large-input regression comparison.
- **Android updater diagnostics:** #126/#135/#136 and branches `fix/android-apk-parser-diagnostics*` / `fix/android-apk-diagnostics-main-current` share the same Java APK-container and `prepare-engines.mjs` diagnostics. Treat as one lineage, not separate imports. Their test/workflow state must be revalidated on a single selected head.
- **Android upgrade reliability:** #141/#143, `fix/android-update-smoke-main`, `fix/stabilize-android-emulator-ci`, `fix/signed-android-release-upgrade-mainline`, and `test/android-release-apk-upgrade` overlap in emulator setup, in-place upgrade scripts, and updater contracts. Preserve the most complete exact-head upgrade test, not several competing script variants.
- **Library resume/performance:** `feat/resumable-library-analysis-main`, `perf/import-resume-eta-mainline*`, `perf/concurrency-aware-analysis-eta`, `fix/resume-partial-replay-imports`, and `feat/multi-match-session-persistence` overlap in `AutoLibrarySync`, `BatchAnalysisRunner`, `main.tsx`, and `matchStore`. These require one integrated design review; no files imported.
- **Old UI redesigns:** `longitudinal-player-history-2.2.9`, `phase-skill-profile-2.2.8`, `coach-phase-survival-fix-2.2.9`, `coach-training-loop-redesign`, and `ux-simplification-visual-analytics` are substantially behind main (roughly 142–161 commits) and touch the current large renderer files. Treat as historical reference only unless a unique UX behavior is identified.
- **Release policy:** `chore/focus-releases-windows-android` removes web/PWA assets and changes release behavior; review against the current explicit Windows installer, Windows portable ZIP and signed Android APK release contract before adopting.
- **Engine catalog:** `automation/openfront-engine-latest` and `feat/spawn-map-coaching` add/change engine pins, vendored engines and generated bundles. Never copy generated bundles or pins without exact upstream commit/hash verification.
- **Agent workflow/docs:** `chore/free-agent-workflow-foundation` adds `AGENTS.md`, PR template and agent coordination docs. Candidate for a documentation-only import after checking it against the current project instructions.
- **CI diagnostics:** `ci/retain-replay-validation-reports` is a focused workflow-only change; review its artifact retention and exact current workflow context before import.
- **No net file delta vs main in compare:** `feature/queue-safe`, `feature/queue-safe-clean`, `fix/kvm-contract-step-boundaries`, and `release/branch-cleanup` currently compare as behind-only with no changed paths. This makes them low-priority cleanup candidates, not yet safe-to-delete proof; inspect their commit ancestry/content and PR references before recommending removal.

## Draft integration PR

- PR #157: https://github.com/OPuder/OpenFront-Replay-Coach/pull/157
- Draft only; base `main`, head `integration/repository-consolidation`.
- Head at creation: `52880d3ec2d73106321534e3843aee11019cf165`.
- Six PR workflows were observed starting on this exact head: Replay Compatibility, Integration E2E, Android APK, Windows Build, Pinned Engine, Update System Validation.
- PR #157 is not a merge recommendation. Recheck workflow completion against the latest head after any further commits.

## Branch deletion candidates — approval required

A live compare against current `main` returned `ahead_by=0` and `behind_by>0` for all four branches, with no changed paths. The PR relationship check corrected the earlier incomplete inventory:

- `feature/queue-safe` — behind 7; PR #154 is closed and merged.
- `feature/queue-safe-clean` — behind 6; PR #155 is closed and merged.
- `fix/kvm-contract-step-boundaries` — behind 10; PR #150 is closed and merged.
- `release/branch-cleanup` — behind 15; no PR head reference found.

The first three are merged-branch cleanup candidates, not branches with unreviewed PRs. `release/branch-cleanup` has no PR head reference in the search performed. All four tips are contained in `main`. **No branch was deleted.** Branch deletion is deferred because this connector session exposes no branch-delete action; do not substitute a force-update or other destructive operation.

## Validation status of this consolidation

The coaching engine and replay visualization imports are committed. **No test result is yet confirmed for the latest consolidated SHA**. The four successful Actions workflows recorded above belong to source SHA #147, not to this branch. No full build, lint/typecheck, replay fixture, Windows package, or Android signed-upgrade check is claimed as passed for the consolidation. A temporary or draft PR/CI run, or a local checkout with the repository and dependencies, is still required to validate the integrated branch.

## Completion criteria

The consolidation is ready for a proposal to `main` only when:
- every relevant branch and open PR has a documented disposition;
- all selected work is represented in this branch with source provenance;
- duplicate/conflicting implementations are resolved;
- required unit, integration, replay, lint/typecheck, production build, Windows and Android checks pass on the final consolidation SHA;
- unresolved limitations and unverified runtime behavior are explicit.

This document must be updated as reviews and imports happen. Do not infer that a source branch is safe to delete merely because its changes were inspected or its commits are ancestors of `main`.


## Latest CI repair update — 2026-11-22

- Current consolidation HEAD after the TypeScript repair: `0c7a75790d6f6e03916a7a98fc8d355407954766`.
- The failed Android build on the previous HEAD showed Vite succeeded, then TypeScript failed on duplicate `Agent` exports, an `unknown` exception property, and a misplaced renderer test importing unavailable modules and using unconfigured Node test globals.
- On the consolidation branch only, the `Agent` interface is now sourced once from `01-replay-engine.ts`; other agent modules import that type and the barrel explicitly exports each agent. Exception logging now narrows unknown errors safely. The misplaced `src/renderer/ReplayEngineCoverageRegression.test.ts` was removed because the maintained Node regression exists at `scripts/replay-engine-coverage.test.mjs`.
- The agent's npm invocation was corrected from `npm test:coach` to `npm run test:coach`.
- Six fresh workflows were observed starting on the repaired HEAD: Pinned Engine, Android APK, Integration E2E, Windows Build, Replay Compatibility, and Update System Validation. At the last check they were still running; no pass is claimed.
- PR #157 description updated with this repair and current validation requirements. PR remains Draft.


---

## Live cleanup update — 2026-11-22

This section supersedes the earlier PR-state and branch-triage snapshots above.

### Current open PRs

| PR | Branch | Current role |
|---:|---|---|
| #157 | `integration/repository-consolidation` | Draft integration of coaching engine and replay visualization; includes Android OCR seed fix and duplicate Android workflow removal. Exact-head CI is running. |
| #156 | `feature/build-fix` | Draft candidate for the redesigned CI/release architecture; retains replay diagnostics, OCR setup, emulator wake-lock and idle-soak safeguards. Exact-head CI is running. |
| #147 | `feature/coaching-engine` | Source PR for coaching engine; keep until #157 integration is validated. |
| #146 | `feature/release-update-system` | Release/update implementation; now includes Windows elevation retry and more resilient Android upgrade checks. Exact-head CI rerun required. |
| #145 | `feature/ux-replay-visualization` | Source PR for replay visualization; keep until #157 integration is validated. |
| #138 | `fix/full-replay-phase-timeline-main-current` | Full-match phase and median-score coaching. |
| #136 | `fix/android-apk-diagnostics-main-current` | APK-container and engine-dependency diagnostics. |
| #134 | `coach/exact-spawn-metrics-mainline-v3` | Exact spawn-position coaching and evidence limits; includes the documentation formerly in #127. |
| #132 | `perf/replay-safety-mainline-v4` | Large-replay safety and malformed-input regression coverage. |
| #122 | `chore/free-agent-workflow-foundation` | Agent/development workflow documentation. |
| #79 | `feat/longitudinal-cohort-selector` | Longitudinal player cohort selection. |

### Closed duplicate or superseded PRs

All closures below are **not merges**. Their source branches remain available for historical comparison.

| Closed PR | Superseding destination / reason |
|---:|---|
| #153 | Stale inventory snapshot; branch mapping and base SHA no longer reliable. |
| #151 | Broad 85-file integration candidate replaced by the split workstreams #157, #146 and #156. |
| #126 | Older APK diagnostics subset superseded by #136. |
| #135 | APK diagnostics retained in #136; release validation changes retained in #146/#156; its removal of Windows portable-upgrade validation was rejected. |
| #140 | Windows elevation retry ported to #146; emulator resource policy handled by #156. |
| #143 | Emulator wake-lock, five-minute idle soak and process-exit diagnostics ported to #146 and #156. |
| #141 | Package Manager readiness, bounded non-streaming installs and upgrade persistence checks ported to #146. |
| #139 | Large-replay safety covered by #132; emulator resources superseded by #156. |
| #97 | Replay diagnostic artifact retention ported into the redesigned replay workflow in #156. |
| #127 | Spawn evidence logic and documentation consolidated into #134; non-spawn release checks remain in #146/#156. |

### Exact current integration heads and validation

- PR #157: current branch head (this ledger revision is committed to the same branch) — replay/engine/Windows/Android/integration workflows must pass on the final exact SHA. Earlier heads failed the UI seed because the published non-debuggable WebView exposed no EditText; OCR is now installed explicitly and matching accepts multiple profile-field labels. The previous head also exposed an outdated contract assertion and duplicate `release_candidate` step IDs; both were corrected.
- PR #156: `77a7b970a32fbc49d0c2b733424311c011e83a50` — redesigned CI workflows are running. The Android validation file had an accidentally duplicated 19-step pipeline; the second copy was removed. OCR tooling and emulator idle-soak safeguards are included.
- PR #146: `3b259dd80a021f22d32a78bc02f9118e58dae9fc` — new exact-head checks were triggered after correcting the Windows updater contract assertion. Previous checks on the prior head failed only at that outdated assertion; the latest run must be checked independently.
- PR #134: `54e6d029d24c9567ca5db06ec44598aabbed36ec` — evidence-limit documentation from #127 was added; exact-head tests still need to be checked.

No merge is authorized by these updates. A green check on an older SHA does not validate a newer head.

### Branch inventory and deletion candidates

- Current branch listing: **74 branches**, including `main`.
- Two branch names have the exact same tip SHA: `integration/replay-coach-mainline` and `work/alternative-development`. They are duplicate references to the same 85-file integration snapshot. Keep the former as the historical PR #151 reference; `work/alternative-development` is a duplicate-branch cleanup candidate.
- Branches with no file delta against current `main`, and with all commits already behind/contained in main:
  - `feature/queue-safe` — PR #154 merged; 7 commits behind.
  - `feature/queue-safe-clean` — PR #155 merged; 6 commits behind.
  - `fix/kvm-contract-step-boundaries` — PR #150 merged; 10 commits behind.
  - `release/branch-cleanup` — 15 commits behind; no PR head reference found.
- Closed-PR source branches are **not** considered safe to delete until their replacement PRs are merged and the final integrated content is verified. This includes the branches for #97, #126, #127, #135, #139, #140, #141, #143, #151 and #153.
- Additional older branches were compared with main. Many still contain unique commits or divergent files (library resume, batch-analysis performance, engine catalog, spawn-map, UI and Android diagnostics); they are not blanket deletion candidates and remain for individual review.

### Tooling limitation

The connected GitHub tools expose branch listing, comparison and creation but no branch-delete operation. Therefore no branch has been deleted. Do not attempt to simulate deletion with a force update or unrelated destructive API call. The exact candidates above are recorded for a later authorized cleanup using a branch-delete-capable GitHub interface.

### Consolidation state

The repository has fewer active PR review targets (11 instead of 21 in the previous inventory). The remaining 11 PRs are retained because each represents a distinct workstream or is a necessary source PR for the current integration. The repository is **not yet fully clean**: branch retirement remains pending, and the current CI heads must finish successfully before any merge or final branch deletion.
