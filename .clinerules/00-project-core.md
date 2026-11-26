# OpenFront Replay Coach — Core Cline Rules

These rules apply to every Cline task in this repository. Read `PROJECT_RULES.md`, `PROJECT_CONTEXT.md`, and `AGENTS.md` for the full project contract before substantive work.

## Mission
Build a dependable, evidence-based OpenFront gameplay coach. Explain actual decisions, context, observed consequences, plausible alternatives and actionable lessons—not just statistics. Prioritize the top 1–3 insights. Cover Early/Mid/Late game and longitudinal patterns only when supported by comparable, verified matches. Never invent replay facts, player intent, mechanics, causality or confidence.

## Task startup
1. Confirm repository root, current branch, working-tree status and current `origin/main`.
2. Read the project rules/context and relevant docs.
3. Inspect open PRs, issues, active work and CI relevant to the task; avoid duplicating or colliding with work.
4. Inspect the actual implementation, data flow and tests before deciding.
5. Distinguish facts, hypotheses and unknowns. Do not rely on old reports as current state.

## Implementation
- Preserve existing behavior and architecture; make the smallest complete, maintainable change.
- Keep replay parsing, exact engine reconstruction, evidence analysis, coaching, persistence and presentation responsibilities separated.
- Respect exact engine/replay compatibility. Never silently substitute an engine or use unverifiable data as fact.
- Treat malformed, partial, unsupported, duplicate and large replay inputs explicitly. Prefer deterministic, bounded, resumable, idempotent work.
- Keep UI responsive and accessible. Coaching is primary; map/timeline and visuals must be data-grounded.
- Do not weaken security, integrity, signatures, update checks, validation or tests to make a task pass.
- Never add paid services, API keys, secrets or new subscriptions without explicit approval. Do not commit secrets, credentials, private replay data, local databases or signing material.

## Git safety
- Never commit directly to `main`. Create a focused task branch from up-to-date main and use a PR.
- Never force-push, reset, rebase, overwrite or delete another person's/unmerged work without explicit authorization.
- Before destructive/bulk commands, preview targets and verify repository root and current changes.
- Do not merge while required checks are failing, pending, skipped unexpectedly, or not tied to the exact final PR head. Never bypass checks.
- Routine PR creation and merging may be completed autonomously only after review and all required gates pass. After merge, verify integrated main.

## Validation and reporting
- Add/update targeted regression tests.
- Run relevant tests, `npm run test:coach` for coaching/replay changes, and `npm run build` for app changes, plus relevant CI workflows.
- Review the complete diff and inspect test output. Report only checks actually run, with results and commit/PR references.
- If blocked, state the exact blocker and the work safely completed. Do not claim Done without integration and verification.

## Tool and shell discipline
- Use the actual tools and schemas available. Confirm shell/runtime; use PowerShell syntax in Windows PowerShell.
- Avoid long nested shell command strings; use readable scripts and literal paths.
- Verify consequential actions afterwards (files, diff, status, exit code, GitHub state). Diagnose failures before retrying; never repeat an unchanged failing command.
- Ask the user only for genuine product decisions, security-sensitive authorization, irreversible actions or blockers that cannot be resolved from project sources.
