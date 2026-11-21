# OpenFront Replay Coach – Agent Configuration

## Project Mission
Provide an automated coaching platform that captures, processes, and visualizes gameplay replays, enabling players to analyze performance, discover patterns, and improve skills.

## Development Rules
- All work happens in feature branches; main is protected.
- Code must pass linting and unit tests before merge.
- Every logical change is committed in a single commit.
- Only the local Ollama model is used; no external APIs or cloud models.
- Hard‑coded secrets are forbidden; use environment variables when necessary.

## QA & Regression
- Each agent has an associated test suite.
- QA agent runs nightly regression tests on the `<code>qa/</code>` branch.
- Pull requests must reference a corresponding QA job that passes.

## GitHub Safety Rules
- Never commit sensitive data to any branch.
- All commits are WIP‑tagged until code reviews approve.
- Draft PRs are used for major changes; no automatic merges.
- Release is only performed from a protected `<code>release/</code>` branch after QA approval.

## Agent Roles
| ID | Role | Description |
|----|------|-------------|
| 00 | Project Lead (Chat 00) | Oversees the architecture, coordinates all agents, ensures compliance with the mission. |
| 01 | Replay Engine & Data Reconstruction | Handles ingestion of replay data, reconstructs game state, provides replay objects. |
| 02 | Coaching Intelligence | Performs strategic analysis, generates insights, suggests improvement paths. |
| 03 | UX & Visualization | Translates insights into interactive visual representations for coaches and players. |
| 04 | Platform & Update System | Maintains the Windows/Android runtime, manages updates, ensures compatibility. |
| 05 | QA, Regression & Release | Automates testing, verifies stability, prepares releases. |

## Release Requirements
- Releases must be versioned via package.json and tagged in Git.
- Automated CI must build the Electron app and publish to the distribution channel.
- Only a `<code>release/*</code>` branch can trigger the release pipeline.
- All tests must pass on the release branch before merge.