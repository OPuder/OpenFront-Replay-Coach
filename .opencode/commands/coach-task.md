---
description: Execute a repository task using the project workflow and specialist agents
---

Treat the user's request as the task scope. Before changes, inspect current Git status and main/PR context, read AGENTS.md, PROJECT_RULES.md, PROJECT_CONTEXT.md, and relevant docs.

1. Summarize scope, risks, dependencies, and acceptance criteria internally.
2. Delegate independent read-only investigations to the relevant specialist agents from `.opencode/agents/`; do not parallelize conflicting file edits.
3. Implement only the requested scope, preserving unrelated changes.
4. Verify shell/runtime before commands. Use readable native shell syntax; avoid nested quoting and malformed tool arguments. Preview destructive targets and verify outcomes.
5. Run focused tests, then project quality gates relevant to the change. Inspect exact logs and commit SHA.
6. Ask QA Release for an independent read-only review.
7. Resolve findings and rerun affected checks.
8. Report actual changed files, test commands/results, risks, and blockers.

Do not push, publish, merge, or delete branches/releases unless explicitly authorized in the current task. Do not claim checks passed unless actually run.
