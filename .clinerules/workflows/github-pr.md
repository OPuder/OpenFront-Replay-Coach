# Workflow: /github-pr

Use for branch publication and pull request lifecycle.

- Confirm branch and working-tree state; protect unrelated local changes.
- Fetch/rebase or merge current main only using a safe, explicit strategy. Never force-push.
- Review diff and ensure meaningful commits.
- Push the feature branch and open a PR targeting main. Use Draft when validation/review is incomplete.
- PR description: purpose, scope, acceptance criteria, test commands/results, CI status, risks and relevant issue links.
- Resolve conflicts carefully and preserve both intended changes. Re-run affected validation after conflict resolution.
- Do not merge unless required checks pass on the exact final PR head and review is complete.
- After merge, verify main contains the intended commit and inspect post-merge checks.
- Delete a branch only if merged and no longer needed; never delete unmerged work.
