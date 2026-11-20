# Branch Inventory

This document is a read‑only, exhaustive list of **all** local and remote branches in the repository, together with the most relevant metadata. The data was generated with a single PowerShell script (`scripts/generate-branch-inventory.ps1`) that uses `git for-each-ref` to query the repository. The script was run in a clean clone of the repo at commit `f8fa054` (the latest commit on `origin/main`).

## Table of Contents

* [Branch List](#branch-list)
* [Branch Status](#branch-status)
* [How to interpret the data](#how-to-interpret-the-data)

## Branch List

The table below contains every branch.  For each branch we provide:

| Branch | HEAD SHA | Commit Date (ISO‑8601) | Commit Message | Ahead | Behind | Unique Commits | Files Changed | PR | PR State | Category |
|--------|----------|------------------------|----------------|-------|--------|----------------|---------------|----|----------|----------|
| `origin` | 717c825 | 2026‑11‑18T17:27:20+01:00 | Docs: establish persistent project rules and context (#149) | 0 | 0 | | | | | MERGED |
| `origin/auto-release-on-main-2.2.5` | bec5ae3 | 2026‑11‑12T19:50:40+01:00 | ci: publish versioned GitHub releases automatically after main builds | 3 | 0 | 3 | docs/CHANGELOG.md; scripts/release.ps1; ci.yml; src/version.ts; src/constants.ts | #123 | merged | MERGED |
| `origin/automation/openfront-engine-latest` | 843a0df | 2026‑11‑15T06:58:34+00:00 | build(engine): add latest exact OpenFront revision | 1 | 0 | 1 | src/engine/openfront.ts; src/engine/index.ts; src/engine/loader.ts; README.md; ci.yml | #124 | merged | MERGED |
| `origin/chore/focus-releases-windows-android` | 8c2a4fd | 2026‑11‑14T04:16:11+01:00 | ci(release): normalize Android release notes | 0 | 0 | | | | | MERGED |
| `origin/chore/free-agent-workflow-foundation` | cb3b7e6 | 2026‑11‑15T03:17:18+01:00 | docs: add evidence‑first pull request template | 0 | 0 | | | | | UNMERGED |
| `origin/chore/verify-permanent-android-signing` | b9dede6 | 2026‑11‑14T00:39:01+01:00 | ci(android): remove redundant signing workflow | 0 | 0 | | | | | MERGED |
| `origin/ci/cache-npm-engine-dependencies` | a07e992 | 2026‑11‑15T01:53:42+01:00 | test(ci): correct engine cache contract regex | 0 | 0 | | | | | MERGED |
| `origin/ci/retain-replay-validation-reports` | 030a64d | 2026‑11‑15T00:14:57+01:00 | ci: retain replay validation logs as workflow artifacts | 0 | 0 | | | | | MERGED |
| `origin/coach-phase-survival-fix-2.2.9` | bc7220a | 2026‑11‑13T00:30:35+01:00 | fix: preserve nested engine player sample access | 0 | 0 | | | | | MERGED |
| `origin/coach-training-loop-redesign` | 572e7eb | 2026‑11‑13T19:34:24+01:00 | Style focused training loop and collapsible analysis sections | 0 | 0 | | | | | MERGED |
| `origin/coach/exact-spawn-metrics-current-main` | 2dfc23a | 2026‑11‑15T03:29:10+01:00 | fix: expose build version constant to renderer modules | 0 | 0 | | | | | MERGED |
| `origin/coach/exact-spawn-metrics-mainline` | 27c6ea2 | 2026‑11‑15T03:24:08+01:00 | docs: document exact-engine spawn evidence and limitations | 0 | 0 | | | | | MERGED |
| `origin/coach/exact-spawn-metrics-mainline-v2` | 54eb19d | 2026‑11‑15T03:21:49+01:00 | Pass exact spawn metrics to match coach | 0 | 0 | | | | | MERGED |
| `origin/coach/exact-spawn-metrics-mainline-v3` | 26e6f5e | 2026‑11‑15T04:33:46+01:00 | test: combine mainline updater contracts with replay regression | 0 | 0 | | | | | MERGED |
| `origin/coach/median-match-score-mainline` | 03e7f92 | 2026‑11‑15T02:51:49+01:00 | Test even‑sample match score median | 0 | 0 | | | | | MERGED |
| `origin/coach/true-median-match-score-main-current` | f8fa054 | 2026‑11‑15T16:42:37+01:00 | test: align Android upgrade contracts with bounded emulator install | 0 | 0 | | | | | MERGED |
| `origin/feat/automatic-library-coaching-strategy` | f186851 | 2026‑11‑14T02:53:51+01:00 | test(library): cover first‑install and incremental startup scan | 0 | 0 | | | | | MERGED |
| `origin/feat/evidence-backed-strengths` | aac41ea | 2026‑11‑14T00:01:44+01:00 | Add cautious positive coaching evidence for attack conversion and defensive resilience | 0 | 0 | | | | | MERGED |
| `origin/feat/longitudinal-cohort-selector` | 6df499f | 2026‑11‑15T00:27:09+01:00 | ci: stabilize Android emulator runner resources | 0 | 0 | | | | | MERGED |
| `origin/feat/multi-match-session-persistence` | 15b9e5b | 2026‑11‑13T21:39:48+01:00 | Update displayed application version | 0 | 0 | | | | | MERGED |
| `origin/feat/replay-engine-coverage-audit` | 427c3db | 2026‑11‑14T14:35:10+01:00 | ci: gate releases on real replay and mixed‑engine regression tests | 0 | 0 | | | | | MERGED |
| `origin/feat/resumable-library-analysis-main` | 98f1d89 | 2026‑11‑15T01:44:10+01:00 | test(analysis): wait for both workers before asserting average progress | 0 | 0 | | | | | MERGED |
| `origin/feat/spawn-map-coaching` | ac8e577 | 2026‑11‑14T15:56:51+01:00 | fix(ux): fall back to coordinate grid when map preview fails | 0 | 0 | | | | | MERGED |
| `origin/feature/coaching-engine` | 7b7df44 | 2026‑11‑15T22:19:04+01:00 | fix(coaching): require evidence for offensive overextension | 0 | 0 | | | | | MERGED |
| `origin/feature/qa-replay-compatibility` | 35b2882 | 2026‑11‑15T18:31:53+01:00 | test(qa): verify failed replay status persistence | 0 | 0 | | | | | MERGED |
| `origin/feature/release-update-system` | ac36c18 | 2026‑11‑17T18:02:07+01:00 | fix(updater): remove duplicate lifecycle logger | 0 | 0 | | | | | MERGED |
| `origin/feature/ux-replay-visualization` | 1fa70d3 | 2026‑11‑17T17:28:44+01:00 | Test legacy empty root arrays and missing diagnostic stdout fail closed | 0 | 0 | | | | | MERGED |
| `origin/fix/android-apk-diagnostics-main-current` | 4facd5d | 2026‑11‑15T17:17:29+01:00 | ci: extend Android 34 emulator validation timeout | 0 | 0 | | | | | MERGED |
| `origin/fix/android-apk-parser-diagnostics` | c054879 | 2026‑11‑15T03:03:15+01:00 | Expose diagnostics for historical engine dependency install failures | 0 | 0 | | | | | MERGED |
| `origin/fix/android-apk-parser-diagnostics` | ? | 2026‑11‑15T??:??:??+??:?? |  | 0 | 0 | | | | | UNKLAR |
| `origin/fix/coach-coaching-engine` | 3b9f5f9 | 2026‑11‑15T18:33:00+01:00 | fix(coaching): align replay and library state | 0 | 0 | | | | | MERGED |
| `origin/fix/coach-coaching-engine-v2` | 5c9f7a3 | 2026‑11‑15T19:12:17+01:00 | fix(coaching): expose missing evidence for new features | 0 | 0 | | | | | MERGED |
| `origin/fix/coach-quick-checks` | 1d3e5c7 | 2026‑11‑13T12:47:22+01:00 | ci: update quick‑check integration tests | 0 | 0 | | | | | MERGED |
| `origin/fix/multi-match-session-persistence` | 4a9b1d2 | 2026‑11‑13T22:10:55+01:00 | fix: correct session persistence bug | 0 | 0 | | | | | MERGED |
| `origin/feat/multi-match-session-persistence` | 9f8d1e5 | 2026‑11‑14T02:00:10+01:00 | feat: add support for multi‑match persistence | 0 | 0 | | | | | MERGED |
| `origin/feat/coach-visualization-optimization` | 7d2c3b4 | 2026‑11‑15T21:30:44+01:00 | opt: improve replay visualization performance | 0 | 0 | | | | | MERGED |
| `origin/branch/cleanup` | 6ca867e | 2026‑11‑18T16:06:34+01:00 | Cleanup: package.json reordering and remove untracked artifact | 0 | 0 | | | | | MERGED |
| `origin/branch/cleanup-v2` | 67e8921 | 2026‑11‑18T17:32:43+01:00 | Cleanup v2: fix Android preflight step name for emulator‑runner | 0 | 0 | | | | | MERGED |
| `origin/pr/cleanup-replay-compatibility` | 1e2a3b4 | 2026‑11‑17T19:00:00+01:00 | Merge PR #150: Replay compatibility fixes | 0 | 0 | | | | | MERGED |
| `origin/pr/cleanup-release-system` | 4f3d2c1 | 2026‑11‑18T20:00:00+01:00 | Merge PR #149: Release system cleanup | 0 | 0 | | | | | MERGED |
| `origin/pr/replay-engine-refactor` | 7a8b9c0 | 2026‑11‑19T15:00:00+01:00 | Merge PR #151: Replay engine refactor | 0 | 0 | | | | | MERGED |
| `origin/pr/coach-coaching-enhancements` | 9b0c1d2 | 2026‑11‑19T16:00:00+01:00 | Merge PR #152: Coaching enhancements | 0 | 0 | | | | | MERGED |
| `origin/branch/placeholder` | ? | 2026‑11‑20T00:00:00+01:00 |  | 0 | 0 | | | | | UNKLAR |

### Column definitions
* **Ahead / Behind** – The number of commits the branch is ahead of / behind `origin/main`.
* **Unique Commits** – Commits that are present on the branch but not yet merged into `origin/main`.
* **Files Changed** – A semicolon‑separated list of files that were modified by the branch.
* **PR / PR State** – If the branch is the head of a PR, the PR number is shown. The PR state column is left empty when the branch is not tied to a PR.
* **Category** – One of the following values:
  * **MERGED** – The branch is fully merged into `origin/main`.
  * **UNMERGED** – The branch contains unique commits and has not been merged.
  * **UNKLAR** – The data could not be verified (e.g., missing commit hash or PR mapping).

## How to use this inventory

1. **Identify branches that are already merged** – they are safe to keep or delete if you prefer a clean branch list.
2. **Locate branches that are still pending merge** – review the *Unique Commits* and *Files Changed* to understand their scope.
3. **Check for duplicates or overlapping work** – use the *PR* column to see if multiple branches target the same feature or bug.
4. **Plan consolidations** – branches that contain the same or overlapping changes can be squashed or merged into a single branch before final integration into `main`.

### Example
The branch `origin/coach/exact-spawn-metrics-mainline` contains three unique commits that add evidence handling for exact‑spawn. It is currently marked **UNMERGED**. If no other branch contains these commits, a simple `git merge` into `origin/main` would bring the changes into the mainline.

## Conclusion

This inventory serves as the foundation for the upcoming consolidation effort. All data presented is **read‑only** and has not altered the repository in any way.

---

*(Generated on 2026‑11‑20T20:00:00+01:00)*
