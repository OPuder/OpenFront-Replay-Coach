---
description: Run scoped quality checks and independent review for current changes
---

Read the repository quality-gate documentation and inspect current Git status/diff. Identify the affected modules.

Run relevant commands from `docs/development/quality-gates.md` and current `package.json`, choosing targeted checks first and broader gates when required:
- `npm run test:coach` for replay/coaching changes
- `npm run build` for application changes
- `npm run build:web` for web/platform changes when applicable
- `npm run validate:engine-pin` for engine pin/integrity changes

Inspect failures and logs; diagnose and fix root causes when within scope. Never bypass checks or alter tests merely to make them pass.

Ask the `qa-release` subagent for a read-only independent review of the exact current diff. Address critical/high findings and rerun relevant checks.

Report each check as PASS, FAIL, BLOCKED, or NOT RUN, including actual output summary and exact tested commit/working-tree state.
