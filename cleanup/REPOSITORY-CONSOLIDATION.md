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
| #146 | `feature/release-update-system` | Release/update implementation; now includes Windows elevation retry and more resilient Android upgrade checks. Exact-head CI rerun required. |
| #138 | `fix/full-replay-phase-timeline-main-current` | Full-match phase and median-score coaching. |
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
| #135 | APK diagnostics retained in #136/#156; release validation changes retained in #146/#156; its removal of Windows portable-upgrade validation was rejected. |
| #136 | APK-container and engine-install diagnostics ported into #146/#156; emulator resources superseded by KVM-preflight validation in #156. |
| #140 | Windows elevation retry ported to #146; emulator resource policy handled by #156. |
| #143 | Emulator wake-lock, five-minute idle soak and process-exit diagnostics ported to #146 and #156. |
| #145 | Replay visualization files and tests verified in #157; integration source PR closed to leave one review target. |
| #147 | Coaching engine files and core tests verified in #157; integration source PR closed to leave one review target. |
| #141 | Package Manager readiness, bounded non-streaming installs and upgrade persistence checks ported to #146. |
| #139 | Large-replay safety covered by #132; emulator resources superseded by #156. |
| #97 | Replay diagnostic artifact retention ported into the redesigned replay workflow in #156. |
| #127 | Spawn evidence logic and documentation consolidated into #134; non-spawn release checks remain in #146/#156. |

### Exact current integration heads and validation

- PR #157: current branch head (this ledger revision is committed to the same branch) — replay/engine/Windows/Android/integration workflows must pass on the final exact SHA. Earlier heads failed the UI seed because the published non-debuggable WebView exposed no EditText; OCR is now installed explicitly and matching accepts multiple profile-field labels. The previous head also exposed an outdated contract assertion and duplicate `release_candidate` step IDs; both were corrected.
- PR #156: `fb977d8793f8f455f9f2d45fa363a237b6924ff8` — redesigned CI workflows are running. The Android validation file had an accidentally duplicated 19-step pipeline; the second copy was removed. OCR tooling, emulator idle-soak safeguards, real Windows update/rollback tests and APK diagnostics are included.
- PR #146: `3e6944d72331bd551ac4035f129de794bcea880a` — release/update implementation now includes Windows elevation retry, Android idle-soak safeguards, bounded Package Manager readiness, and APK-container diagnostics. Exact-head checks are queued/running.
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

The repository has fewer active PR review targets (8 instead of 21 in the previous inventory). The remaining 11 PRs are retained because each represents a distinct workstream or is a necessary source PR for the current integration. The repository is **not yet fully clean**: branch retirement remains pending, and the current CI heads must finish successfully before any merge or final branch deletion.


---

## Live recheck — 2026-11-22, weiterer Aufräumschritt

### Live PR-Stand
Die erneute GitHub-Suche liefert aktuell fünf offene PRs:
- #157 — `integration/repository-consolidation` (zentraler Draft-Integrations-PR)
- #156 — `feature/build-fix` (Draft; Workflow-Konsolidierung, nicht pauschal übernehmen)
- #146 — `feature/release-update-system` (Release-/Updater-QA offen)
- #134 — `coach/exact-spawn-metrics-mainline-v3` (Spawn-Coach-Verbindung und Kartenarbeit noch separat)
- #122 — `chore/free-agent-workflow-foundation` (Dokumentations-/Agentenarbeit)

Die früheren Tabellen mit acht offenen PRs sind historische Snapshots und nicht mehr der Live-Stand. #79, #132 und #138 sind geschlossen; ihre übernommenen Inhalte werden in #157 nachverfolgt. Das sind keine Merges nach `main`.

### Konsolidierungsbranch
- `integration/repository-consolidation` liegt im Vergleich zu `main` 44 Commits voraus, ohne Rückstand; der Vergleich zeigt 32 geänderte Dateien.
- Die Branch-Familien `integration/replay-coach-mainline` und `work/alternative-development` sind exakt identisch (0 ahead / 0 behind). Die zweite Referenz ist redundant; die PR-/Historienreferenz #151 bleibt jedoch als Nachweis erhalten.
- Die Vergleiche zu `feature/build-fix`, `feature/release-update-system`, `feature/ux-replay-visualization`, `feature/coaching-engine` und `feature/qa-replay-compatibility` zeigen eigenständige bzw. divergierende Änderungen. Keine davon wird als Ganzes übernommen oder gelöscht.
- `coach/exact-spawn-metrics-mainline-v3` und `perf/replay-safety-mainline-v4` bleiben gesonderte Quellen für gezielte Diff-Prüfung; ihre vollständige Deltas überschneiden sich mit der Konsolidierung und sind nicht als reine Löschkandidaten einzustufen.

### Exakte QA-Diagnose für PR #157
Auf dem in PR #157 dokumentierten Commit `2715fabe4d34bba87d3708e374903adb56b683b3` wurden sechs PR-Workflows gefunden:
- Pinned OpenFront Engine: success
- Windows Build: success
- Android APK: success (Build-/Signaturvorbereitung; der Update-Validierungsjob ist davon getrennt)
- Integration E2E contracts: in progress beim Abruf
- Replay Compatibility: cancelled
- Update System Validation: failure

Die Update-System-Validierung scheiterte im Android-Emulatorjob während des UI-Seeding der veröffentlichten v2.2.51-Baseline. Die echte Baseline startete mit `Status: ok`, das Profil lud 143 Replays, und die permanente Android-Signaturprüfung bestand. Der Abbruch erfolgte erst beim zweiten Bibliothekssuchlauf: `adb shell input text` ließ die Match-ID `cRVdxGEG5j` nicht im Suchfeld erscheinen. Das Diagnose-Screenshot zeigt das fokussierte, aber leere Suchfeld und die geöffnete Tastatur. Der eigentliche In-Place-Upgrade-/Datenpersistenztest wurde deshalb nicht erreicht. Das ist ein reproduzierbarer UI-Eingabe-/Harness-Blocker, kein Nachweis eines APK-Signaturfehlers oder Datenverlusts.
- Der Windows-Teil desselben Update-Workflows war erfolgreich: Updater-Verträge, Coaching-/Replay-Regressionen, Build, Installer-/Portable-Paketprüfung und Renderer-Start bestanden.
- Keine Merge-Freigabe: Android-Suchfeld-Eingabe beheben und alle erforderlichen Gates auf einem identischen finalen HEAD erneut bestehen lassen.

### Branch-Retirement-Kandidaten (noch nicht gelöscht)
Die folgenden Branches sind gegenüber `main` ohne einzigartige Commits bzw. vollständig von `main` überholt:
- `feature/queue-safe` — 7 Commits hinter `main`
- `feature/queue-safe-clean` — 6 Commits hinter `main`
- `fix/kvm-contract-step-boundaries` — 10 Commits hinter `main`
- `release/branch-cleanup` — 15 Commits hinter `main`, kein offener PR-Head gefunden
- `work/alternative-development` — exakt identischer Tip wie `integration/replay-coach-mainline`; redundante Referenz, aber vor Retirement PR-/Historienbezug nochmals kontrollieren

Diese Liste ist eine geprüfte Kandidatenliste, keine ausgeführte Löschung. Die verfügbaren GitHub-Aktionen bieten in dieser Verbindung keine Branch-Delete-Operation. Es wird ausdrücklich kein Force-Update oder Datei-Delete als Ersatz missbraucht. Die Löschung muss später über eine Branch-delete-fähige GitHub-Oberfläche bzw. GitHub CLI erfolgen, nachdem PR-Referenzen und Retention final geprüft wurden.

### Nächste Arbeitsreihenfolge
1. Den Android-UI-Seed-Eingabefehler auf #157 isoliert beheben und durch einen echten Emulatorlauf verifizieren; keine Erfolgserwartung ohne sichtbaren Feldinhalt.
2. Integration E2E und Replay Compatibility auf demselben neuen HEAD abschließen.
3. #134 gegen die bereits integrierten Spawn-Metriken abgleichen und nur den einzigartigen End-to-End-/Map-Anteil übernehmen.
4. #122 als Dokumentationsänderung gegen aktuelle Projektregeln prüfen.
5. #156 Workflow-Änderungen selektiv mit #157 integrieren; bestehende Windows-/Android-/Replay-/Engine-Gates erhalten.
6. #146 erst nach echtem Windows- und Android-Upgrade-/Rollbacknachweis übernehmen.
7. Erst nach erfolgreicher Integration PRs schließen und anschließend Branch-Retirement ausführen.

**Status:** Inventur und erste Diffs sind erweitert; die eigentliche Restbereinigung läuft weiter. Keine Branches gelöscht, kein PR gemergt, `main` nicht verändert.


---

## Follow-up execution — 2026-11-22

### PR #122 documentation work selectively integrated
- Imported `.github/pull_request_template.md`, `docs/development/agent-coordination.md` and `docs/development/quality-gates.md` into `integration/repository-consolidation`.
- Updated the existing `AGENTS.md` rather than overwriting it: obsolete claims about a mandatory nightly `qa/` branch, release-only branch triggers, and WIP-only commits were replaced with current project, exact-head QA, protected-main and role guidance. The Chat 00–05 coordination roles and local Ollama preference remain represented.
- Verified the documented npm scripts against the integration branch `package.json` and all six referenced consolidated workflow files exist on that branch.
- PR #122 was closed as **not merged** after the files were committed to the integration branch. Its source branch is retained.

### PR #134 spawn work
- Imported the evidence-boundary document `docs/development/early-game-spawn-evidence.md`.
- Added `projectSpawnMapPoint()`, which projects tile centers and rejects invalid/out-of-bounds map coordinates.
- Added focused regression coverage for first/last tile centers and invalid map dimensions.
- The complete SpawnPositionMap UI, actual player spawn markers, theoretical alternatives and current-view integration are still outstanding. PR #134 remains open and its source branch is retained.

### Updated repository state
- Open PR search now returns four: #157, #156, #146 and #134. PR #122 is closed, not merged.
- `integration/repository-consolidation` now compares to `main` as 52 commits ahead, 0 behind, with 39 changed files.
- Latest documentation/spawn helper commits are recorded on the integration branch; no workflow runs were returned for the final docs commit at the time of this check. Do not treat the earlier SHA's workflow results as validation of this new head.
- No PR was merged and `main` remains unchanged.

### Remaining work
1. Diagnose why Android `adb shell input text` does not populate the second WebView search field despite a visible caret; use the captured screenshot/XML and add a robust, verified input method rather than relaxing the assertion.
2. Finish the full SpawnPositionMap UI integration from #134 using the current #157 renderer as the base; do not copy its stale full `main.tsx`.
3. Complete #157's replay/integration/Android update gates on the same final SHA.
4. Review #156 workflow changes file-by-file and integrate only after proving no required validation is lost.
5. Complete #146 real Windows and Android upgrade/rollback acceptance.
6. Recheck all branch families and retire confirmed redundant branches when a branch-delete-capable interface is available.

**Current disposition:** ongoing. Branches preserved; no direct changes to `main`; no merge or release.


---

## Live recheck — 2026-11-22, Workflow-Abgrenzung und Branch-Retirement

### Maßgebliche Workflow-Neuordnung: PR #156

Der Hinweis aus dem heutigen Arbeitsstand wurde zugeordnet: **PR #156 — `CI/Release: consolidate workflows and update validation`**, Branch `feature/build-fix`.

- PR #156 ist aktuell offen und Draft, mit 202 Commits und 33 geänderten Dateien; aktueller PR-Head laut GitHub: `ce538384cb65086c5f13f5f6d0b3f310f51d67e6`.
- Die PR-Beschreibung legt fest, dass alte Einzel-Workflows nicht separat weitergepflegt werden sollen. Windows-Build und Android-Validierung werden in gezielte Update-/Release-Prüfungen überführt; Engine-Bundles werden zentral vorbereitet und wiederverwendet; Replay-Kompatibilität, Engine-Pins und Integration-E2E bleiben zentrale Gates; die Replay-Diagnoseartefakte werden 14 Tage aufbewahrt; der Capacitor-Lockfile-Automationsworkflow entfällt.
- Die PR enthält gekoppelte Änderungen an npm-Skripten, Engine-Verifikation, Android-Signing, Upgrade-Harness und Agent-/TypeScript-Exports. Deshalb darf sie nicht durch isoliertes Kopieren einzelner YAML-Dateien integriert werden.
- PR #156 ist gegenüber `main` 202 Commits voraus und gegenüber `integration/repository-consolidation` 53 Commits zurück. Sie ist ein eigener, umfangreicher Integrationsstrang und bleibt erhalten. Keine Workflow-Reparatur an den alten Dateien wird im Rahmen dieser Branch-Aufräumrunde begonnen.
- Die PR bleibt Draft. Die vorhandene Beschreibung nennt noch ausstehende gemeinsame Integration und den vollständigen Windows-Upgrade-/Rollback-Nachweis. Der aktuelle Stand wird daher nicht als Merge-Freigabe interpretiert.

### Aktueller Branchvergleich

Die aktuelle GitHub-Abfrage liefert 74 Remote-Branches einschließlich `main`. Der Konsolidierungsbranch `integration/repository-consolidation` liegt 53 Commits vor `main`, ohne Rückstand. Vier Branches haben gegenüber `main` null eigene Commits und sind vollständig überholt:

| Branch | Vergleich zu `main` | Disposition |
|---|---:|---|
| `feature/queue-safe` | 0 ahead / 7 behind | **Löschkandidat** — keine eigenen Commits oder Dateidifferenzen mehr |
| `feature/queue-safe-clean` | 0 ahead / 6 behind | **Löschkandidat** — keine eigenen Commits oder Dateidifferenzen mehr |
| `fix/kvm-contract-step-boundaries` | 0 ahead / 10 behind | **Löschkandidat** — keine eigenen Commits oder Dateidifferenzen mehr |
| `release/branch-cleanup` | 0 ahead / 15 behind | **Löschkandidat** — keine eigenen Commits oder Dateidifferenzen mehr; kein offener PR-Head gefunden |

Ein weiterer redundanter Branch ist:

| Branch | Vergleich | Disposition |
|---|---|---|
| `work/alternative-development` | exakt gleicher Tip wie `integration/replay-coach-mainline` (0/0) | **Löschkandidat als doppelte Referenz** — `integration/replay-coach-mainline` bleibt als historischer PR-#151-Branch erhalten; der gemeinsame Commit bleibt dadurch weiterhin referenziert |

Die fünf genannten Branches sind die aktuell belastbarsten Löschkandidaten. Sie wurden nicht gelöscht. Vor dem lokalen Löschen soll die Liste mit `git branch -r --merged origin/main` bzw. den exakten Remote-Refs abgeglichen werden; für die vier behind-only Branches ist der GitHub-Vergleich bereits eindeutig.

### Zweite Welle — erst nach Integration von PR #156

Diese Branches haben noch eigene Commits, deren Änderungen aber auf alte Workflow-Dateien beschränkt sind oder deren Nutzen in PR #156 neu umgesetzt wird. Sie sind **noch keine sofortigen Löschkandidaten**, weil PR #156 noch nicht integriert ist:

- `auto-release-on-main-2.2.5` — nur ein eigener Commit auf `.github/workflows/build-windows.yml`; alter Workflow-Stand.
- `ci/retain-replay-validation-reports` — nur ein eigener Commit auf `.github/workflows/replay-compatibility.yml`; Log-Aufbewahrung ist laut PR #156 in die neue Replay-Workflow-Struktur übernommen.
- `chore/verify-permanent-android-signing` — vier eigene Commits, ausschließlich `.github/workflows/validate-android.yml`; alter separater Android-Workflow.

Nach erfolgreicher Integration der neuen CI-/Release-Architektur muss für jeden dieser drei Branches nochmals geprüft werden, ob die Änderung vollständig in PR #156 enthalten ist. Erst dann in die endgültige Löschliste übernehmen.

### Weiterhin behalten — nicht pauschal löschen

- Offene PR-Branches: #157 `integration/repository-consolidation`, #156 `feature/build-fix`, #146 `feature/release-update-system`, #134 `coach/exact-spawn-metrics-mainline-v3`.
- `integration/replay-coach-mainline` bleibt als Referenz für den historischen PR #151 erhalten. Nur seine exakte Doppelreferenz `work/alternative-development` ist als Löschkandidat markiert.
- `branch-inventory-report` enthält eine eigenständige, inzwischen veraltete Inventur und bleibt zunächst erhalten; seine Dokumente wurden nicht in diesen Bericht kopiert.
- Die übrigen Coaching-, Replay-, Performance-, Android- und Library-Branches haben weiterhin eigene Commits oder divergierende Dateistände. Sie sind nicht durch einen bloßen Ahead/Behind-Vergleich als sicher löschbar belegt.

### Live PR-Stand und Sicherheitsstatus

Offene PRs: #157, #156, #146 und #134. PR #122 ist geschlossen, nicht gemergt. Kein PR wurde in diesem Schritt gemergt, kein Branch gelöscht und `main` wurde nicht verändert. Die Branch-Löschliste ist eine Empfehlung zur lokalen Ausführung durch den Nutzer.

**Nächster Schritt:** zuerst die fünf sofortigen Löschkandidaten lokal anhand der Remote-Refs prüfen und löschen; die drei Workflow-Branches erst nach Integration der neuen PR-#156-Architektur erneut bewerten.


### Additional exact-HEAD retirement verification

A further pass checked whether merged PR source branches had moved after their merge:

- `feature/qa-replay-compatibility`: PR #144 is merged, and the live branch tip is exactly the merged PR head `35b2882e4e12183e28d30b14025de747a3d32793` (0 ahead / 0 behind against that SHA). **Add to the immediate deletion list.**
- `fix/signed-android-release-upgrade-mainline`: PR #128 is merged, but the live branch has **five commits after** the merged PR head `e1978702c7f15c6e6234b717c8b5a09209875ad0`, changing `release-on-main.yml`, `update-validation.yml`, `test-windows-portable-upgrade.mjs` and `updater-contract.test.mjs`. **Do not delete.** Review those follow-up changes against PR #156/#146 first.

The immediate deletion list is therefore now six branches: the previous five plus `feature/qa-replay-compatibility`. The five-branch PowerShell command previously provided must be extended to include that branch. No branch was deleted by this review.


### Geplante zweite und dritte Retirement-Welle

Die geschlossenen Quell-PRs werden nicht pauschal gelöscht. Ihr Branch-Retirement hängt davon ab, dass die selektiv übernommenen Änderungen im jeweiligen Ziel-PR tatsächlich in `main` angekommen sind:

| Auslöser | Quell-Branches, die danach erneut geprüft werden | Grund |
|---|---|---|
| PR #157 in `main` integriert | `feature/coaching-engine`, `feature/ux-replay-visualization`, `chore/free-agent-workflow-foundation` | Coaching-/Replay-UI- und Agenten-Dokumentationsarbeit wurde selektiv in die Konsolidierung übernommen; Quellbranches bleiben bis zum Merge als Rückfallreferenz bestehen. |
| PR #146 und/oder #156 integriert | `fix/android-release-idle-soak-diagnostics`, `test/android-emulator-upgrade-resilience`, `fix/windows-updater-elevation-fallback`, `fix/android-apk-diagnostics-main-current`, `fix/android-apk-parser-diagnostics`, `fix/android-apk-parser-diagnostics-mainline-v2`, `fix/android-apk-parser-diagnostics-mainline-v3`, `fix/android-release-test-contract-path`, `fix/android-update-smoke-main`, `fix/stabilize-android-emulator-ci`, `fix/signed-android-release-upgrade-mainline`, `fix/release-upgrade-gate-hardening`, `ci/retain-replay-validation-reports`, `auto-release-on-main-2.2.5`, `chore/verify-permanent-android-signing` | Die geschlossenen Quell-PRs wurden laut Konsolidierungsledger in die Release-/Workflow-Neuordnung portiert oder dort ersetzt. Erst nach erfolgreichem Merge und Dateivergleich kann die jeweilige Quelle entfallen. |
| PR #134 integriert oder Spawn-Funktion bewusst verworfen | `coach/exact-spawn-metrics-current-main`, `coach/exact-spawn-metrics-mainline`, `coach/exact-spawn-metrics-mainline-v2`, `coach/median-match-score-mainline`, `coach/true-median-match-score-main-current`, `fix/coach-phase-timeline-alignment`, `fix/coach-phase-timeline-main`, `fix/full-replay-phase-timeline-main-current`, `fix/true-median-match-score`, `fix/spawn-coaching-uses-exact-replay-metrics` | Ältere, überlappende Spawn-/Phasen-/Median-Coaching-Linien. #134 ist aktuell die aktive Quelle für die noch fehlende Spawn-Map-/Coaching-Verbindung. |
| Eigenständige Funktionsprüfung abgeschlossen | `branch-inventory-report`, `feat/longitudinal-cohort-selector`, `feat/resumable-library-analysis-main`, `fix/resume-partial-replay-imports`, `perf/import-resume-eta-mainline`, `perf/import-resume-eta-mainline-v2`, `perf/concurrency-aware-analysis-eta`, `perf/index-match-store-by-player`, `perf/large-replay-safety-main`, `perf/large-replay-safety-main-current`, `perf/replay-safety-main-current`, `perf/replay-safety-mainline-v2`, `perf/replay-safety-mainline-v3`, `perf/replay-safety-mainline-v4`, `perf/avoid-large-replay-frame-spread`, `test/android-release-apk-upgrade`, `feat/spawn-map-coaching`, `chore/focus-releases-windows-android`, `automation/openfront-engine-latest` | Diese Branches haben weiterhin einzigartige oder divergierende Commits. Sie brauchen eine gezielte Funktions-/Dateiprüfung, bevor sie integriert, verworfen oder gelöscht werden. |

Diese Tabellen sind ein Arbeitsplan, keine vorweggenommene Löschfreigabe. Ein Branch wird erst dann in eine konkrete Löschliste aufgenommen, wenn seine aktuelle Spitze gegen den zugehörigen PR-Head und den endgültigen Zielstand geprüft wurde.


---

## Vollständige Branch-Inventur — 2026-11-22

### Umfang und Methode
- Live-Branchsuche: **74 Remote-Branches einschließlich `main`**.
- Alle übrigen Branches wurden gegen `main` verglichen (Ahead/Behind und Dateidifferenzen).
- Offene PRs live verifiziert: #157, #156, #146 und #134. Alle vier sind offen; #157 und #156 sind Draft. #157 hat HEAD `4b53d0cfb0782112b2f1a7fc680251c4da731b0a`, 56 Commits ahead und 39 geänderte Dateien. #156 hat HEAD `ce538384cb65086c5f13f5f6d0b3f310f51d67e6`, 202 Commits ahead und 33 geänderte Dateien. #146 hat 236 Commits / 45 Dateien; #134 hat 22 Commits / 14 Dateien.
- Die Branchliste ist vollständig erfasst; ein Ahead/Behind-Vergleich allein ist ausdrücklich kein Beweis für inhaltliche Gleichheit. Geschlossene, nicht gemergte PRs sind ebenfalls kein Löschgrund.

### Gruppe A — aktuell belastbar löschbar
Diese Branches haben keine eigenen Commits gegenüber `main` und keine Dateidifferenz:
- `feature/queue-safe` — PR #154 gemergt; 0 ahead / 7 behind.
- `feature/queue-safe-clean` — PR #155 gemergt; 0 ahead / 6 behind.
- `fix/kvm-contract-step-boundaries` — PR #150 gemergt; 0 ahead / 10 behind.
- `release/branch-cleanup` — 0 ahead / 15 behind; kein offener PR-Head.
Zusätzlich ist `work/alternative-development` exakt identisch mit `integration/replay-coach-mainline` (0/0). Nur die redundante Referenz kann entfallen; die historische Referenz bleibt erhalten.
**Wichtig:** `feature/qa-replay-compatibility` wird trotz gemergtem PR #144 NICHT in Gruppe A aufgenommen: Die Branchspitze zeigt 12 Commits ahead / 18 behind gegenüber `main`, während der Merge-Commit selbst 0 ahead / 17 behind ist. Das weist auf eine andere Merge-/Commit-Historie hin; vor Löschung ist ein inhaltlicher Tree-/Patch-Abgleich nötig.

### Gruppe B — erst nach Integration in main erneut freigeben
- Nach #157: `feature/coaching-engine`, `feature/ux-replay-visualization`, `chore/free-agent-workflow-foundation`, außerdem die überlappenden Quellen `feat/longitudinal-cohort-selector`, `perf/replay-safety-mainline-v4`, `fix/full-replay-phase-timeline-main-current` nur nach Abgleich der selektiv übernommenen Inhalte.
- Nach #134: `coach/exact-spawn-metrics-current-main`, `coach/exact-spawn-metrics-mainline`, `coach/exact-spawn-metrics-mainline-v2`, `coach/exact-spawn-metrics-mainline-v3`, `coach/median-match-score-mainline`, `coach/true-median-match-score-main-current`, `fix/coach-phase-timeline-alignment`, `fix/coach-phase-timeline-main`, `fix/full-replay-phase-timeline-main-current`, `fix/true-median-match-score`, `fix/spawn-coaching-uses-exact-replay-metrics`, `coach-phase-survival-fix-2.2.9`, `phase-skill-profile-2.2.8`, `longitudinal-player-history-2.2.9`, `ux-simplification-visual-analytics`, `coach-training-loop-redesign`. Nur löschen, wenn ihre einzigartigen Änderungen integriert oder ausdrücklich verworfen wurden.
- Nach #146/#156 und deren gemeinsamer Integration: `auto-release-on-main-2.2.5`, `ci/retain-replay-validation-reports`, `chore/verify-permanent-android-signing`, `fix/android-apk-diagnostics-main-current`, `fix/android-apk-parser-diagnostics`, `fix/android-apk-parser-diagnostics-mainline-v2`, `fix/android-apk-parser-diagnostics-mainline-v3`, `fix/android-release-idle-soak-diagnostics`, `fix/android-release-test-contract-path`, `fix/android-update-smoke-main`, `fix/release-upgrade-gate-hardening`, `fix/signed-android-release-upgrade-mainline`, `fix/stabilize-android-emulator-ci`, `fix/windows-updater-elevation-fallback`, `test/android-emulator-upgrade-resilience`, `test/android-release-apk-upgrade`, `fix/release-cache-version-idempotent`, `release/cleanup-v2`, `ci/cache-npm-engine-dependencies`, `fix/windows-smoke-test-cdp-startup`. Die alten Workflow-Dateien werden nicht einzeln repariert; geprüft wird nur, ob die neue Architektur die benötigten Funktionen tatsächlich ersetzt.
- Die Zweige `fix/signed-android-release-upgrade-mainline` und verwandte Android-Quellen bleiben ausdrücklich erhalten, bis die zusätzlichen Commits nach dem gemergten PR #128 gegen #146/#156 abgeglichen wurden.

### Gruppe C — eigenständige Funktion / gezielte Einzelprüfung, nicht pauschal löschen
- Engine-Katalog und Bundles: `automation/openfront-engine-latest`, `feat/spawn-map-coaching`.
- Library-/Import-/Performance-Arbeit: `feat/automatic-library-coaching-strategy`, `feat/resumable-library-analysis-main`, `feat/multi-match-session-persistence`, `fix/resume-partial-replay-imports`, `perf/import-resume-eta-mainline`, `perf/import-resume-eta-mainline-v2`, `perf/concurrency-aware-analysis-eta`, `perf/index-match-store-by-player`, `perf/large-replay-safety-main`, `perf/large-replay-safety-main-current`, `perf/replay-safety-main-current`, `perf/replay-safety-mainline-v2`, `perf/replay-safety-mainline-v3`, `perf/avoid-large-replay-frame-spread`, `fix/startup-responsiveness-and-replay-export`.
- Coaching-/Insight-Arbeit: `feat/evidence-backed-strengths`.
- Andere eigenständige oder noch nicht eingeordnete Quellen: `branch-inventory-report`, `feature/cline-fixes`, `feature/qa-replay-compatibility`, `fix/true-median-match-score` (auch in Gruppe B nur nach #134-Abgleich), `integration/replay-coach-mainline`, `branch-inventory-report`.
Diese Branches haben gegenüber `main` eigene Commits und/oder divergierende Dateien. Vor einer Entscheidung müssen Commit-Patches und tatsächliche Zielinhalte verglichen werden.

### Aktive Hauptarbeitszweige — behalten
- `integration/repository-consolidation` — PR #157.
- `feature/build-fix` — PR #156; neue CI-/Release-Architektur, kein isoliertes YAML-Kopieren.
- `feature/release-update-system` — PR #146; echter Windows-/Android-Update- und Rollbacknachweis offen.
- `coach/exact-spawn-metrics-mainline-v3` — PR #134; Spawn-Coach-Verbindung und Karte noch offen.
- `main` bleibt geschützt und unangetastet.

### Noch ungeklärte Altquellen / separate Entscheidung
- `branch-inventory-report`: vier eigene Commits mit Inventur-/Cleanup-Dokumenten; Berichtsinhalte sind inzwischen überholt, aber vor Löschung ist zu prüfen, ob dort noch nicht übernommene Erkenntnisse enthalten sind.
- `feature/cline-fixes`: vier eigene Commits in Agent-/Engine-Coverage-Dateien; nicht als reine Dublette einstufen.
- `fix/startup-responsiveness-and-replay-export`: 19 eigene Commits, Replay-Kompatibilität/JSON-Export/Preload/Renderer; eigene Funktionsprüfung erforderlich.
- `feat/spawn-map-coaching`: großer divergierender Branch mit Engine-Katalog, Spawn-Map-Modell und Workflows; Überschneidungen mit #134/#156, aber nicht als Löschkandidat ohne Patchabgleich.
- `release/cleanup-v2`: zwei eigene Commits auf Release-Workflow und `.gitignore`; gegen #156 abgleichen.
- `integration/replay-coach-mainline`: als historische Referenz behalten; nur die exakte Doppelreferenz `work/alternative-development` ist entbehrlich.

### Konkrete Löschfreigabe — Stand jetzt
Freigegeben nach abschließender Sichtkontrolle der Remote-Refs: `feature/queue-safe`, `feature/queue-safe-clean`, `fix/kvm-contract-step-boundaries`, `release/branch-cleanup`, `work/alternative-development`.
Nicht freigegeben: alle anderen Branches, bis die oben genannten Integrations- oder Einzelprüfungen abgeschlossen sind. Insbesondere `feature/qa-replay-compatibility` bleibt vorerst erhalten, obwohl PR #144 gemergt ist, weil der Branchvergleich noch einen abweichenden Stand zeigt.

### Grenzen / Sicherheitsstatus
Die Branchsuche und Vergleiche sind erfolgt; es wurde kein Branch gelöscht, kein PR gemergt und `main` nicht verändert. Die GitHub-Verbindung stellt keine Branch-Delete-Aktion bereit. Diese Inventur ist die Grundlage für eine geordnete Löschliste nach Integration, keine pauschale Löschfreigabe für alle nicht aktiven Branches.
