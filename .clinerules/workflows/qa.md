# Workflow: /qa

Perform an independent, evidence-based QA review. Do not assume implementation is correct.

1. Confirm repository root, branch, working tree, PR and exact HEAD SHA.
2. Read acceptance criteria and inspect the full diff.
3. Review risks: data integrity, replay/engine version matching, malformed/partial input, persistence/migrations, concurrency/resume, security, updater/signing, accessibility and regression.
4. Select and run focused tests plus relevant project gates. Use `npm run test:coach` for coaching/replay changes and `npm run build` for app changes; inspect package scripts before selecting additional commands.
5. Review CI runs and logs on the exact final PR head. Pending, skipped unexpectedly or stale-head checks are not passing.
6. Report findings by severity with file/line, reproducible evidence, and recommended fix. State tests run and not run accurately.
7. If defects are found, fix only when assigned/authorized, then rerun affected checks and review the new diff.
8. Do not approve or merge while unresolved blocking findings or required checks remain.
