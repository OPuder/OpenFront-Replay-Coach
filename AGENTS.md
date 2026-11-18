# OpenFront Replay Coach — Agent Instructions

**Read first:** [PROJECT_RULES.md](PROJECT_RULES.md) and [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md). These are the authoritative project-wide rules and context. This file is the short operational entry point for Codex and every coding agent.

## Mandatory start
- Read the project rules and context before starting work.
- Inspect the current working tree, current `main`, relevant open PRs/issues, branch state and CI.
- Check for overlapping work before editing. Do not overwrite, reset, rebase or force-push another active branch.
- Read the relevant architecture and QA documents before changing a subsystem.
- Treat live GitHub and repository state as authoritative; old chat messages are not current status.

## Working behavior
- Chat 00 owns planning, agent coordination, implementation, review, QA, integration and release.
- Work autonomously on routine technical decisions; ask only for real product, safety, irreversible-action or unresolvable requirement decisions.
- Bundle related tasks and use parallel specialists when safe, but keep ownership and integration clear.
- Preserve working functionality and fix root causes. Avoid unnecessary rewrites and unrelated scope.
- Never weaken replay/hash, package/signature, updater, data-integrity or privacy safeguards to make checks pass.
- Never commit secrets, signing keys, tokens, private replay data or local user databases.
- Do not claim a test, CI check, merge or release succeeded unless it was actually verified.

## Product constraints
- The product is an evidence-based OpenFront gameplay coach, not just a replay viewer or statistics dashboard.
- Coaching findings should explain decision, context, observed consequence, plausible alternative and actionable lesson.
- Prioritize 1–3 high-impact findings and distinguish facts, heuristics and uncertainty.
- Cover Early, Mid and Late game plus recurring patterns across comparable verified matches.
- Never invent player intent, game mechanics, territory ownership, reachability, combat outcomes or causality.
- Use the exact recorded OpenFront engine revision. Unknown revisions and hash mismatches are verification boundaries.

## Required validation
- Add/update focused regression tests for behavior changes.
- Run the relevant targeted tests and project checks.
- Run `npm run test:coach` for replay/coaching changes when applicable.
- Run `npm run build` for application changes when applicable.
- Run relevant Windows, Android, replay compatibility, engine, integration and updater workflows.
- Required checks must pass on the exact final PR HEAD before merge.
- Review the complete diff and verify the integrated `main` after merge.
- Report actual commands, commit SHA, workflow results and any remaining manual/device checks.

## GitHub safety
- Use focused branches and reviewable pull requests.
- Never merge with required checks pending, failing, cancelled or unexpectedly skipped.
- Never delete unmerged work, releases, tags or user data without explicit authorization.
- Routine PR creation, review, merge and safe branch cleanup may be performed autonomously after all required checks pass.
