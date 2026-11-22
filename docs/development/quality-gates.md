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

The current `main` branch still contains the legacy workflow set. PR #156 is the candidate replacement architecture and is not yet merged. Its intended workflow set is:

- `discover-openfront-engine.yml` — pinned engine discovery/preparation.
- `validate-engine.yml` — engine pin and bundle integrity.
- `replay-compatibility.yml` — replay compatibility and regression gates.
- `integration-e2e.yml` — replay → simulation → coaching → timeline → persistence integration.
- `update-validation.yml` — change-scoped Windows and Android updater/package validation.
- `release-on-main.yml` — signed Windows/Android release packaging and install/upgrade verification.

The standalone Windows-build, Android-validation and Capacitor-lock workflows are consolidated or retired in that candidate. Treat the new set as the target only after PR #156 is reviewed, merged and verified on `main`; until then, use the actual workflow files present on the checked-out branch.

For changes affecting a platform or shared application behavior, inspect the corresponding workflow results on the exact PR head SHA. Replay/coaching changes require replay compatibility and coach regression coverage; updater changes require updater validation and platform update checks; release changes require actual artifact and install/upgrade verification.

## Failure handling

- Read the failing job steps and logs.
- Classify the failure as product regression, test defect, environment/setup issue or external dependency failure.
- Fix the underlying cause where possible.
- Rerun the relevant workflow on the updated commit.
- Do not mark a check as passed based on a prior SHA, cancelled run or a different PR.
- Do not merge around a failing required check.

## Release verification

Before publishing, verify artifact names, non-zero sizes, expected package identity/version/signature, and install/launch behavior where supported. Required user-facing deliverables are the Windows installer, Windows portable package and Android APK. The web build remains available for browser access. Release deliverables remain the Windows installer, Windows portable ZIP and permanently signed Android APK; do not reintroduce a PWA service worker into native release packages.
