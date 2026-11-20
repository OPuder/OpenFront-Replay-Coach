# Release validation matrix

This document describes the checks required before a release can be considered ready. The current state of each run is recorded by the GitHub Actions checks attached to PR #146; this file describes acceptance criteria, not a substitute for a successful run.

| Gate | Evidence required | Failure behavior |
| --- | --- | --- |
| Android local data | Install debug baseline, write private app-data sentinel, update with adb install -r, read the same sentinel, verify higher versionCode and launch | Android validation job fails |
| Android published-key continuity | Download exact APK from latest published release; compare valid APK signing-certificate SHA-256 fingerprints with candidate permanent-key APK | Android validation job fails; signing protection is never bypassed |
| Android production in-place update | Install actual previous published APK, update it with current candidate APK without uninstall, verify higher versionCode and launch | Android validation job fails |
| Windows installer | Run NSIS installer in isolated path; inspect installed EXE and app.asar; launch renderer and verify five-minute idle stability | Windows validation job fails |
| Windows portable | Extract exact portable ZIP separately; inspect its EXE and app.asar; launch renderer and verify five-minute idle stability | Windows validation job fails |
| Downloaded artifact names and sizes | Require exact version-specific installer, portable ZIP and Android APK names; reject any additional file; enforce non-trivial sizes | Artifact audit job fails |
| Downloaded manifest/checksums | Generate manifest and SHA-256 list from downloaded artifacts, then recompute and compare each byte count and digest | Artifact audit job fails |
| Published release download | Download every uploaded release asset and rerun the same exact-file, manifest and checksum verification | Release workflow fails after upload; release is not treated as verified |
| Replay/engine compatibility | Existing replay compatibility and pinned-engine regression checks | Required CI gate fails |

## Artifact naming contract

For version X.Y.Z, the release contains exactly:

- OpenFront Replay Coach Setup X.Y.Z.exe
- OpenFront Replay Coach-X.Y.Z-win.zip
- OpenFront-Replay-Coach-X.Y.Z-Android.apk
- SHA256SUMS.txt
- release-manifest.json

The first three are distributables. The final two are integrity metadata. No PWA/Web ZIP, blockmap, debug APK, duplicate package or unrelated file is accepted in the final release directory.

## Reproducing the integrity check

After downloading the three package files into an otherwise empty release directory:

    RELEASE_DIR=release RELEASE_VERSION=X.Y.Z node scripts/verify-release-artifacts.mjs generate
    RELEASE_DIR=release RELEASE_VERSION=X.Y.Z node scripts/verify-release-artifacts.mjs verify

The generation command validates the package-name set and package sizes before writing metadata. The verification command independently checks the exact five-file directory, manifest schema/version, exact three manifest records, byte sizes, SHA-256 digests and exact checksum entries.
