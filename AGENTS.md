# OpenFront Replay Coach — Agent Instructions

These instructions apply to every contributor and coding agent working in this repository.

## Product goal

Build a reliable, evidence-based OpenFront gameplay coach. The product must explain player decisions and outcomes, not merely display replay statistics.

Every major coaching insight should follow:

1. **Decision** — what the player actually did, grounded in replay evidence.
2. **Context** — game phase, available information, economy, troops, fronts, diplomacy and timing.
3. **Consequence** — observed outcome, with uncertainty stated where causality is not provable.
4. **Better alternative** — a mechanically plausible option supported by the replay and known game rules.
5. **Actionable lesson** — a concrete behavior the player can apply in future games.

Prioritize the 1–3 highest-impact insights. Cover Early, Mid and Late game, plus longitudinal patterns across matches. Never invent events, intentions, game mechanics or confidence.

## Architecture and change discipline

- Inspect the current implementation, tests, dependencies, replay format and relevant workflows before editing.
- Preserve working replay ingestion, engine integration, simulation, persistence and platform behavior.
- Keep parsing, reconstruction, analysis, coaching, persistence and presentation responsibilities separated.
- Prefer deterministic, bounded and testable algorithms.
- Handle malformed, incomplete, unsupported and very large replays explicitly.
- Avoid unnecessary rewrites, speculative abstractions and unrelated scope.
- Do not weaken integrity checks, APK signature/package validation, update security or replay compatibility to make a test pass.
- Do not commit signing keys, credentials, tokens, local databases, private replay data or generated secrets.

## Performance and reliability

- Avoid repeated full-library scans when an indexed or incremental query is available.
- Make imports and analysis resumable and idempotent.
- Bound retries, waits, memory use and background work.
- Prevent duplicate concurrent analysis of the same match.
- Persist progress safely so an interrupted run can resume.
- Do not block the UI thread with long-running replay work.
- Investigate idle shutdowns, crashes and updater failures with reproducible evidence; do not mask them with keep-alive loops or broad exception swallowing.

## UX requirements

- Coaching is primary; raw statistics are supporting evidence.
- Prefer a visual replay map, timeline, phase markers, fronts, engagements and prioritized coaching cards.
- Make uncertainty and missing evidence visible.
- Keep desktop and mobile behavior responsive and accessible.
- Avoid text walls, decorative metrics and CSV-first workflows.

## Required validation

Before a change is considered complete:

1. Add or update focused regression tests.
2. Run the relevant targeted tests.
3. Run `npm run test:coach` when replay/coaching behavior changes.
4. Run `npm run build` for application changes.
5. Run the relevant Windows, Android, update and replay-compatibility GitHub Actions.
6. Inspect the diff and check for regressions, unsafe fallbacks and accidental generated files.
7. Verify the final integrated `main` state after merge.

Only report checks that actually ran and passed. If a check is blocked, state exactly why. Never bypass failing required checks.

## GitHub workflow

- Use focused branches and pull requests for changes.
- Include the issue-closing keyword when a PR fixes an issue.
- Keep PRs small enough to review and test independently.
- Do not merge while required checks fail, are pending, or do not correspond to the exact PR head SHA.
- Do not delete branches that contain unmerged work.
- Do not delete releases, tags or user data.
- Prefer the existing GitHub Actions and repository tooling before adding new services or paid dependencies.

## Cost and external services

- Prefer the existing ChatGPT/GitHub capabilities, GitHub Actions, Node.js tooling and open-source dependencies.
- Do not introduce paid AI APIs, paid agent services or new subscriptions without an explicit product requirement and user approval.
- Repository instruction files describe how an agent should work; they do not themselves install, authorize or start an external GitHub/Copilot/Codex agent.
- Never claim an external agent is active unless its installation, permissions and execution are verified.
