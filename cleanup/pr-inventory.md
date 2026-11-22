# Pull Request Inventory

**Snapshot:** 2026-11-22  
**Repository:** `OPuder/OpenFront-Replay-Coach`  
**Default branch:** `main` at `5e6e8ef4f041febd18b9d9750d61ba52814330c2`

This inventory was collected directly from GitHub's pull-request and commit-comparison APIs. It replaces the previous placeholder, which incorrectly stated that GitHub API access was unavailable.

## Open pull requests

| PR | Title | Head branch | State | Commits ahead of current main | Behind current main | Notes |
|---:|---|---|---|---:|---:|---|
| #156 | Build-fix: stabilise main | `feature/build-fix` | Draft | 166 | 0 | All 4 PR workflows passed; Android 2.2.51 → 2.2.52 in-place upgrade and cold start passed. Not merged. |
| #153 | Repository cleanup – inventory & merge plan | `branch-inventory-report` | Draft | 1 | 15 | This inventory/plan PR; based on an older main commit and must be refreshed before merge. |
| #151 | WIP: integrate Replay Coach features and update system | `integration/replay-coach-mainline` | Draft | 528 | 15 | Very large integration candidate: 85 files, +381,621 / -427 lines. Requires careful diff review; do not merge as-is. |
| #147 | Coaching: improve evidence ranking and longitudinal stability | `feature/coaching-engine` | Draft | 64 | 18 | Older, diverged feature branch; evaluate against #151 and current main before retaining. |
| #146 | Release: enforce reviewed versioning and publish integrity manifests | `feature/release-update-system` | Ready for review | 215 | 18 | Older, diverged release branch; compare its unique value with #156 and #151. |
| #145 | UX: Add tactical replay visualization and phase timeline | `feature/ux-replay-visualization` | Ready for review | 244 | 17 | Older, diverged UX branch; compare its unique value with #151. |
| #143 | Android: keep release-upgrade emulator awake and capture process exit reasons | `fix/android-release-idle-soak-diagnostics` | Ready for review | 2 | 18 | Small but based on old main; review whether still needed after #156. |
| #141 | Android: harden emulator upgrade regression and cold-start checks | `test/android-emulator-upgrade-resilience` | Ready for review | 4 | 19 | Older Android test work; overlap likely with #156 and #143. |
| #140 | Windows: retry unchanged installer updates with elevation | `fix/windows-updater-elevation-fallback` | Ready for review | 5 | 25 | Older updater fix; revalidate against current updater implementation. |
| #139 | Performance: avoid argument overflow on large replays | `perf/large-replay-safety-main-current` | Ready for review | 7 | 25 | Older performance fix; retain only if not already included in newer work. |
| #138 | Coaching: correct full-match phases and median match scores | `fix/full-replay-phase-timeline-main-current` | Ready for review | 7 | 28 | Older coaching fix; check overlap with #147/#151. |
| #136 | Android: expose APK container and engine dependency diagnostics | `fix/android-apk-diagnostics-main-current` | Ready for review | 6 | 28 | Older diagnostics fix; compare with current Android validation. |
| #135 | Android: diagnose APK parser failures with verified container details | `fix/android-apk-parser-diagnostics-mainline-v3` | Ready for review | 11 | 33 | Older parser diagnostics; check whether superseded by #136/#156. |
| #134 | Coaching: use exact engine spawn coordinates in match and long-term review | `coach/exact-spawn-metrics-mainline-v3` | Ready for review | 21 | 33 | Older spawn coaching work; compare with current engine/coaching implementation. |
| #132 | Performance: guard large replay inputs and bound Android update tests | `perf/replay-safety-mainline-v4` | Ready for review | 28 | 33 | Older performance/Android test work; review overlap with #139/#156. |
| #127 | Coaching: use exact engine spawn coordinates in opening review | `coach/exact-spawn-metrics-current-main` | Ready for review | 7 | 35 | Overlaps #134; consolidate rather than merge both independently. |
| #126 | Android: diagnose unreadable APK containers | `fix/android-apk-parser-diagnostics-mainline-v2` | Ready for review | 7 | 35 | Older parser diagnostics; likely superseded by #135. |
| #122 | Docs: establish free AI-assisted development workflow | `chore/free-agent-workflow-foundation` | Ready for review | 4 | 37 | Older documentation change; review whether still relevant. |
| #97 | CI: retain replay validation logs for actionable failures | `ci/retain-replay-validation-reports` | Ready for review | 1 | 43 | Single-commit CI change on old base; verify whether already present in current main. |
| #79 | Add selectable cohorts to longitudinal player coaching | `feat/longitudinal-cohort-selector` | Ready for review | 8 | 43 | Older longitudinal feature; compare with #147/#151 before deciding. |

## Closed duplicate

| PR | Head branch | State | Reason |
|---:|---|---|---|
| #152 | `work/alternative-development` | Closed, not merged | Exact duplicate of #151: same head commit `d54b84d617c733c5f463029ac33e7c3d3ec3e27a` and same 85-file change set. #151 remains the single integration discussion. No branch or commit was deleted. |

## Interpretation and cautions

- The ahead/behind values compare each PR head commit to the current `main` SHA above. A large ahead count is a history comparison, not a count of independent useful features.
- Several PRs are substantially behind or diverged from current main. Their PRs being open does not mean their changes are still missing from main.
- Do not merge old PRs solely because they are open or marked ready for review. First compare their actual diffs with current main and the integration candidate.
- #156 is green in its current CI run, but remains a Draft PR and has not been merged.
- Branch deletion is intentionally not represented as complete: it requires a separate verified cleanup operation after PR disposition is decided.

---
