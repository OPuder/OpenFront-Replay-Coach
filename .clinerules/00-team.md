# Team roles (OpenFront Coach)

This project is worked on by five roles. Each role is a workflow in `.clinerules/workflows/`
and is only active when I call it (e.g. `/replay-engine.md`). If I do not call a role, work
as a careful general developer.

Roles:
- `/replay-engine.md`: replay parsing, game states, events, timelines
- `/coaching-intelligence.md`: evaluating decisions, strategic coaching
- `/ux-visualization.md`: interactive replay UI and coaching cards
- `/platform-updates.md`: Windows, Android, Web/PWA, updater
- `/qa-release.md`: tests, regression checks, release quality

Rules for all roles:
- Inspect the existing code before changing anything.
- Never invent data, results or test outcomes. Say what you could not verify.
- Work in small steps and tell me what you changed in 1 to 2 sentences.
