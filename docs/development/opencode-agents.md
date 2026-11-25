# OpenCode project setup

This repository contains native OpenCode V2 project configuration.

## Files

- `opencode.json`: project configuration, default primary agent, project instruction files, permission policy, and specialist-agent IDs.
- `.opencode/agents/*.md`: native Markdown V2 subagents. Their filename is their agent ID.
- `.opencode/commands/coach-task.md`: `/coach-task` task workflow.
- `.opencode/commands/qa.md`: `/qa` focused quality-gate and independent-review workflow.
- `AGENTS.md`: universal project/agent guidance, including shell/tool-call safety.
- `PROJECT_RULES.md` and `PROJECT_CONTEXT.md`: detailed project rules and architecture context.

The `.codex/agents/*.toml` files are separate Codex-specific configuration. They are not OpenCode agent files and should not be assumed to be discovered by OpenCode.

## Specialist agents

| Agent ID | Scope |
|---|---|
| `replay-engine` | Replay parsing, exact engine pinning, state reconstruction, data integrity |
| `coaching-intelligence` | Evidence-based strategic analysis and longitudinal coaching |
| `ux-visualization` | Dashboard, replay map/timeline, coaching UX, accessibility |
| `platform-updates` | Windows/Android/browser integration, lifecycle, persistence, updates |
| `qa-release` | Independent testing, regression, CI and release review |

All specialist agents are configured as subagents and read-only: they may investigate and return findings but cannot edit project files or launch further subagents. The primary `build` agent remains responsible for implementation and integration.

## Model

**Current configuration:** the five Markdown agent files do not pin a model. OpenCode subagents inherit the parent session's model unless a model is configured in the agent frontmatter. If local Ollama is intended, explicitly configure a verified model/provider and confirm it is available in the local OpenCode runtime; do not assume the agents are using `ollama/gpt-oss:20b`.

## Permissions

- Shell commands generally require approval; routine Git status/diff/log/branch/fetch inspection is allowlisted.
- `git push` is explicitly denied by project configuration.
- The primary agent is allowed to launch only the five project specialists.
- Specialists have file-edit and further-delegation permissions denied.
- Shell runs with the host user's permissions. Review commands carefully and never bypass a safety prompt.

## Use

Start OpenCode from the repository root so it discovers project configuration.

- `/coach-task` — structured task execution, delegation, implementation, validation and report.
- `/qa` — scoped tests and independent QA review.

## Verification

Static review confirms the project config references the five discovered Markdown agent IDs and each file declares `mode: subagent` with read-only restrictions. The merge commit's GitHub Actions checks were still running when reviewed. Runtime discovery, model/provider availability, and real invocation of each agent still require verification in the local OpenCode installation. Do not report agents as operational until OpenCode lists them and each specialist has been invoked successfully.
