# Development quality gates

The following commands are defined by the current root `package.json` and should be used according to the scope of a change.

## Local checks

| Scope | Command |
|---|---|
| Production build and TypeScript checks | `npm run build` |
| Full coach/replay regression suite | `npm run test:coach` |
| Phase survival focused test | `npm run test:phase-survival` |
| Engine pin validation | `npm run validate:engine-pin` |
| Web build | `npm run build:web` |

The full coach suite includes replay compatibility, engine coverage/corpus, longitudinal coaching, spawn-position analysis, batch analysis, updater contract and presentation tests.

## GitHub Actions gates

The workflow files currently present on `main` are the source of truth:

| Workflow | Responsibility | Expected cadence |
|---|---|---|
| `ci.yml` | Typecheck, production build, coach/replay regression, OpenCode/UX/integration tests; live replay regression for replay-sensitive changes | Every push/PR; full live replay weekly and on replay-sensitive changes |
| `update-validation.yml` | Updater contract, Windows installer/portable packaging and launch, Android signing and real upgrade validation | Relevant PR changes; manual and monthly full validation |
| `discover-openfront-engine.yml` | Discover upstream engine revisions, prepare exact pinned history, run regressions and publish a reviewable candidate branch | Every six hours and manual |
| `release-on-main.yml` | Build and verify user-facing Windows and Android release artifacts from main | Main/release trigger as defined in the workflow |
| `cleanup-merged-branches.yml` | Remove only allowlisted branches whose exact PR head is already merged | Scheduled/manual and relevant repository events |

Do not treat an old workflow proposal or historical PR description as the active workflow architecture. Before changing CI, inspect the current workflow files and recent run/job timings. Preserve the existing separation between fast core validation, replay-sensitive regression, platform update validation, engine discovery and release packaging.

For every change, inspect workflow results on the exact commit SHA. Replay/coaching/engine changes require the live replay regression job; updater changes require updater validation; release changes require actual artifact and install/upgrade verification. A skipped job is acceptable only when its documented path filter proves the change is outside that job's scope.

## Failure handling

- Read the failing job steps and logs.
- Classify the failure as product regression, test defect, environment/setup issue or external dependency failure.
- Fix the underlying cause where possible.
- Rerun the relevant workflow on the updated commit.
- Do not mark a check as passed based on a prior SHA, cancelled run or a different PR.
- Do not merge around a failing required check.

## Release verification

Before publishing, verify artifact names, non-zero sizes, expected package identity/version/signature, and install/launch behavior where supported. Required user-facing deliverables are the Windows installer, Windows portable package and Android APK. The web build remains available for browser access. Release deliverables remain the Windows installer, Windows portable ZIP and permanently signed Android APK; do not reintroduce a PWA service worker into native release packages.
