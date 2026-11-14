# Quality assurance and release gates

This repository treats the pull-request checks and release checks as product requirements, not optional diagnostics.

## Pull-request gates

Every pull request targeting `main` runs the relevant application, replay and update checks:

- **Windows build and package validation:** pinned OpenFront engine revisions, coach dependencies, TypeScript/Electron/Vite build, installer and portable ZIP creation, package-content checks, and a real packaged Electron renderer startup smoke test.
- **Android build validation:** native configuration contract, Capacitor renderer build, APK assembly, APK signature parsing, application ID and version metadata checks.
- **Replay compatibility:** exact pinned current and historical engine revisions, engine worker build, real public Europe and Levant replay fixtures, coaching regression tests, mixed-engine batch processing, replay hashes, cancellation and IndexedDB persistence.
- **Update validation:** Windows/Android updater contract tests and full coaching/replay regression suite, plus Windows package smoke validation.

The update validation workflow runs on every pull request so changes outside the updater files cannot silently bypass its integration checks.

## Release gates

A GitHub Release must not be published unless the exact release commit passes:

1. Exact upstream engine revision checks and both engine typechecks.
2. The complete replay/coaching regression suite against real replay fixtures.
3. Windows build, installer/portable packaging and packaged-renderer startup smoke test.
4. Android native build, APK signature and metadata validation.
5. All release assets exist and are uploaded as the three supported deliverables: Windows installer, Windows portable ZIP and Android APK.

A successful compile is not evidence that an installation or update flow works. CI smoke tests are reported separately from physical-device validation.

## Platform update acceptance

- **Windows installer:** install an older build, apply the downloaded update, verify the installed app archive changes, and launch the updated app.
- **Windows portable:** update an existing portable directory, verify the app archive changes, and launch it. A failed update must retain/restore the previous working files.
- **Android:** install a previous APK, install the newer APK over it with Android's package installer, verify package identity, strictly increasing version code and stable signing identity, then launch the updated app. Android's final confirmation is user-controlled.

The CI package and contract tests do not prove that a particular user's physical Windows installation or Android device completed an update. That final hardware-specific check must remain explicitly labelled until it is automated on representative devices.

## Merge and release policy

- Do not merge while any required check is pending, failing, cancelled or skipped unexpectedly.
- Do not publish a release when any package is missing or malformed.
- Do not describe static source assertions as runtime tests.
- Report exactly which checks ran, which passed, and which platform checks remain manual.
- Keep the release target limited to Windows installer, Windows portable and Android APK; PWA is not a release target.
