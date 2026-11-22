# Repository Consolidation

**Status:** Inventory started; source branches are preserved.
**Consolidation branch:** `integration/repository-consolidation`
**Base branch:** `main`
**Base SHA at creation:** `5e6e8ef4f041febd18b9d9750d61ba52814330c2`
**Created from:** current `main` snapshot observed on 2026-11-22.

## Purpose

This branch is a controlled staging area for reviewing and consolidating useful work from existing feature, fix, QA, release, documentation, and integration branches. It is not a replacement for `main`, and it is not yet a release candidate.

## Non-negotiable safety rules

1. Do not commit directly to `main`.
2. Do not delete source branches or close PRs as part of this inventory pass.
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

## Open pull requests — snapshot 2026-11-22

All entries below remain **unreviewed for consolidation** unless an explicit note says otherwise. PR state and mergeability can change; recheck before action.

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

## Consolidation ledger

| Source | Source SHA | Decision | Imported paths/commits | Result SHA | Tests/evidence | Notes |
|---|---|---|---|---|---|---|
| — | — | Pending review | — | — | — | No source changes imported yet. |

## Completion criteria

The consolidation is ready for a proposal to `main` only when:
- every relevant branch and open PR has a documented disposition;
- all selected work is represented in this branch with source provenance;
- duplicate/conflicting implementations are resolved;
- required unit, integration, replay, lint/typecheck, production build, Windows and Android checks pass on the final consolidation SHA;
- unresolved limitations and unverified runtime behavior are explicit.

This document must be updated as reviews and imports happen. Do not infer that a source branch is safe to delete merely because its changes were inspected or its commits are ancestors of `main`.
