# Workflow: /coach-task

For a user-requested feature, bug fix, investigation or improvement:

1. **Orient:** Check root, branch, clean/dirty state, main HEAD, open PRs/issues and active workflows. Read `PROJECT_RULES.md`, `PROJECT_CONTEXT.md`, `AGENTS.md`, and relevant docs.
2. **Understand:** Trace current code/data flow, identify root cause or product value, constraints, dependencies and related work. Do not assume.
3. **Plan:** Define scope, acceptance criteria, touched areas and validation. Keep plan concise. Split independent work only if real subagent support is available; otherwise do not pretend parallel agents ran.
4. **Branch:** Start a focused branch from current main. Never work directly on main or disturb existing changes.
5. **Implement:** Make a minimal complete change; preserve architecture and user data. Add regression tests.
6. **Validate:** Run focused tests, relevant project tests, build, lint/type checks and applicable CI. Fix failures and rerun. Check exact replay/engine scenarios where relevant.
7. **Review:** Inspect complete diff, unintended changes, secrets, generated files, UX, compatibility and acceptance criteria. Perform QA role review.
8. **Publish:** Commit meaningful steps, push branch, create/update PR with clear summary, rationale, acceptance criteria, tests and risks. Draft PR while incomplete.
9. **Integrate:** Wait for required checks on final PR head; resolve conflicts without losing either side; merge only when all gates pass. Routine merge can be autonomous.
10. **Verify:** Confirm merged commit on main, run/check post-merge validation and clean up only safe merged branches.
11. **Report:** Briefly state outcome, branch/PR/commit, checks with real results, remaining risks and next priority.

Ask only when a necessary product decision, security approval, irreversible operation or genuine blocker cannot be resolved.
