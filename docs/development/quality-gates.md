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

The repository currently defines these workflows:

- `build-windows.yml`
- `discover-openfront-engine.yml`
- `release-on-main.yml`
- `replay-compatibility.yml`
- `update-capacitor-lock.yml`
- `update-validation.yml`
- `validate-android.yml`
- `validate-engine.yml`

For changes affecting a platform or shared application behavior, inspect the corresponding workflow results on the exact PR head SHA. Replay/coaching changes require replay compatibility and coach regression coverage; updater changes require updater validation and platform update checks; release changes require actual artifact and install/upgrade verification.

## Failure handling

- Read the failing job steps and logs.
- Classify the failure as product regression, test defect, environment/setup issue or external dependency failure.
- Fix the underlying cause where possible.
- Rerun the relevant workflow on the updated commit.
- Do not mark a check as passed based on a prior SHA, cancelled run or a different PR.
- Do not merge around a failing required check.

## Release verification

Before publishing, verify artifact names, non-zero sizes, expected package identity/version/signature, and install/launch behavior where supported. Required user-facing deliverables are the Windows installer, Windows portable package and Android APK. Web/PWA remains a supported mobile-compatible route where applicable, but must not be represented as a native install package.
