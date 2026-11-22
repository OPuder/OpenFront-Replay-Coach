# Repository Cleanup Plan

**Updated:** 2026-11-22  
**Current main:** `5e6e8ef4f041febd18b9d9750d61ba52814330c2`  
**Working branch:** `branch-inventory-report`

## Completed in this cleanup pass

1. Queried the live GitHub repository, open pull requests, branch list, and current main SHA.
2. Compared open PR head commits against current main to identify stale/diverged work.
3. Closed duplicate PR #152 without merging or deleting its branch. PR #151 remains the single integration discussion because both PRs had the exact same head commit and 85-file change set.
4. Replaced the inaccurate PR inventory placeholder with a live snapshot in `cleanup/pr-inventory.md`.

## Safety rules

- `main` is the integration source of truth. No direct commits or force-pushes to main.
- Do not merge a PR only because it is open, old, or marked ready for review.
- Do not delete branches while an open PR still depends on them.
- Do not merge the 528-commit / 85-file integration candidate (#151) without reviewing its full diff and confirming its changes against current main.
- Preserve feature work that is not yet represented in main or another retained PR.
- Every consolidation must run the relevant CI checks; no failed check may be bypassed.

## Prioritized next steps

| Priority | Work | Target | Required verification |
|---|---|---|---|
| P0 | Finish review of #156 | `feature/build-fix` → #156 | Review all 25 changed files, verify the four green workflows and confirm no unrelated workflow was unintentionally removed. Keep as Draft until review is complete. |
| P1 | Audit the large integration candidate | #151 | Inspect the full 85-file diff, identify why it contains 528 commits and 381,621 additions, map its changes to smaller PRs, and establish which changes are actually missing from main. No blind merge. |
| P1 | Reconcile duplicate/overlapping feature PRs | #147, #145, #146 | Compare actual file-level changes with #151 and current main. Retain one canonical implementation per feature; close only PRs proven fully superseded. |
| P2 | Reconcile Android/Windows/performance fixes | #143, #141, #140, #139, #138, #136, #135, #134, #132, #127, #126 | Check whether each unique change is already in main or in a retained PR. Rebase or cherry-pick only verified missing changes onto dedicated branches and rerun targeted CI. |
| P2 | Review older documentation/CI/longitudinal PRs | #122, #97, #79 | Verify whether each change is still needed and absent from main; close superseded PRs only after confirming. |
| P3 | Prune remote branches | Branches whose PRs are merged/closed or whose commits are proven contained in main | Confirm no open PR, no unique commits, and no active work before deletion. Keep `main` and all retained active branches. |

## Important current findings

- #151 and #152 had identical head SHA `d54b84d617c733c5f463029ac33e7c3d3ec3e27a`; #152 is now closed as a duplicate.
- #151 is very large (85 files, +381,621 / -427 lines) and 15 commits behind current main. Its 528 commits ahead must not be interpreted as 528 independent feature changes.
- #153 itself is based on an older main commit and is a documentation-only inventory/plan PR. Refresh its branch against current main before considering merge.
- #156 currently has four successful PR workflows. The Android upgrade job installed published v2.2.51, updated the same package in place to v2.2.52, verified the installed version, and cold-started the updated app. #156 remains unmerged and Draft.
- The existing branch inventory document predates the current main and contains entries that cannot be trusted as live GitHub branch facts. Regenerate it from the live refs before using it to authorize branch deletion.

## Operational limitation

The connected GitHub actions currently expose branch search and ref updates but no supported branch-delete operation. Therefore, this pass has not deleted any Git branch. Branch deletion must be performed later through an authorized GitHub UI/CLI workflow after the safety checks above. Closing a duplicate PR does not delete its source branch.


## Additional integration review finding (2026-11-22)

The current PR #151 patch changes `.github/workflows/release-on-main.yml` so automatic releases are triggered by `release/**` rather than `main`, and adds a guard requiring the release branch to include current main. This is a material release-process change, not merely a mechanical conflict resolution. It must be explicitly reviewed against the intended release policy and the current release workflow before integration. Do not merge #151 until this is resolved and the full workflow behavior is tested.

The same PR also changes Windows build and replay-compatibility workflow triggers/concurrency. Review these together with the release workflow so no required mainline CI or release trigger is accidentally lost.

A direct commit comparison confirms #151 contains the complete #147 head history (the #151 head is ahead of #147 with no commits behind). This establishes commit ancestry, but it does not by itself justify closing #147: keep the focused PR open until #151 is either safely integrated or its coaching changes are independently accounted for in main.


---
