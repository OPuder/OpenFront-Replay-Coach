# Visual Studio Code agent workflow

The repository provides shared VS Code custom agents under `.github/agents/` and project-wide Copilot instructions in `.github/copilot-instructions.md`.

## Getting started

1. Open the repository root in VS Code.
2. Open the Chat/Agents view and select a workspace agent from the agent picker.
3. Use **OpenFront Coordinator** for multi-area tasks. Use a specialist directly for a bounded task.
4. Use the Agents window when independent investigations or file-disjoint tasks can run in parallel.
5. Review each agent's proposed changes and tool activity. Integrate work only after checking ownership, tests, and the final diff.

## Workspace agents

| Agent | Responsibility |
|---|---|
| OpenFront Coordinator | Planning, delegation, integration and delivery |
| Replay Engine Specialist | Replay parsing, historical engines, deterministic simulation |
| Coaching Intelligence Specialist | Decision analysis, evidence and long-term training |
| UX and Replay Visualization Specialist | Dashboard, map, timeline, accessibility and UI performance |
| Platform and Updates Specialist | Windows, Android, browser, persistence and updates |
| QA and Release Reviewer | Independent review, regression and release checks |

## Models and local Ollama

Agent files intentionally do not pin a model. They inherit the model selected in the VS Code session. Choose a locally configured Ollama model in the model picker when available. Model IDs and provider availability are runtime-specific; the repository does not assume that a model is installed or authenticated.

## Safe parallel work

- Delegate independent investigations and separate file sets.
- Assign one owner per shared file or interface.
- Do not run multiple agents that edit the same workflow, simulation module, or package manifest concurrently.
- Have the coordinator reconcile contracts and run the relevant checks.
- QA and Release Reviewer is read-only and must report missing checks rather than inventing results.

See the [VS Code custom agent documentation](https://code.visualstudio.com/docs/agent-customization/custom-agents) and [custom agent file reference](https://code.visualstudio.com/docs/agents/reference/custom-agent-file-reference) for current harness behavior.
