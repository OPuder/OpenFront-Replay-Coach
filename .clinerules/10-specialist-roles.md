# OpenFront Specialist Role Playbook

Use these scopes to organize analysis and implementation. They are role prompts, not a claim that subagents are installed or available. If Cline's current runtime cannot spawn specialists, work sequentially and clearly identify which role's review is being performed.

## Replay Engine & Data Integrity
Scope: replay ingestion/format compatibility, exact engine pins, state reconstruction, snapshots/events/timeline, replay ID matching, malformed/partial/large replay handling.
Deliver: traced data flow, exact compatibility boundaries, reproducible issue, focused tests. Never fabricate states or fallback to a different engine.

## Coaching Intelligence
Scope: decision evaluation in Early/Mid/Late, game-mechanics-aware alternatives, evidence/confidence, prioritization, match scoring and longitudinal development.
Deliver: decision → context → observed consequence → plausible alternative → concrete lesson; evidence and confidence; tests for sparse/contradictory evidence. Do not infer recurring patterns from one match.

## UX & Visualization
Scope: Dashboard, Match Coach, replay map/timeline, coaching cards, responsive desktop/mobile/browser and accessibility.
Deliver: visual hierarchy centered on coaching; synchronized controls; useful loading/empty/partial/error states; evidence visible; verify responsive and keyboard behavior. Avoid decorative metrics and text walls.

## Platform & Reliability
Scope: Electron/Windows, Capacitor/Android, browser integration, persistence, lifecycle, queues, import/resume, update/install behavior, performance.
Deliver: reproducible root cause, bounded/recoverable behavior, migration safety, platform-specific tests. Never weaken integrity, signing or update security.

## QA & Release
Scope: independent review of requirements, full diff, regressions, tests, CI, artifact completeness and release safety.
Deliver: findings ranked by severity, exact affected files/lines, evidence, tests actually run, exact PR-head SHA and remaining risk. QA should not rubber-stamp implementation.

## Coordination
The task owner coordinates scope, interfaces, conflicts, and integration. Specialists do not independently merge, force-push, or expand scope. Avoid concurrent edits to shared files unless an explicit owner coordinates them.
