# Automatic updates

## First update after installing an older version

Releases published before the updater was included cannot install it retroactively. The first move from an older Windows or Android build to the bootstrap release therefore still needs the existing manual download/install step once. After that bootstrap update, subsequent releases use the automatic flow described below.

## Windows installer and portable edition

The packaged Electron application checks the latest stable GitHub Release before opening its main window. Network errors, rate limits and malformed release metadata do not block startup: the existing version opens normally. When a newer release is available, the matching Windows asset is downloaded to a temporary directory and checked against the SHA-256 digest published by GitHub.

- NSIS installations use the official setup executable in silent mode. The helper waits for the Coach to exit, runs the installer, and launches the app again.
- ZIP/portable installations use the matching `-win.zip` asset. A helper waits for the app to exit, extracts to a staging directory, backs up the current program files, replaces the app files and restores the backup if replacement fails. User data remains in Electron's user-data directory.
- The Update button checks again and starts the same verified update flow, so a release published while the Coach is open can be installed without manually finding a download.

The updater refuses assets without a GitHub SHA-256 digest, assets with a mismatched byte count, and downloads above its configured size limit. The Windows update helper requires PowerShell.

## Android

The app checks releases at startup and shows an update action when a newer version exists. The APK is downloaded only after the user taps the update button. The native Capacitor plugin checks the exact release size and SHA-256 digest, then validates the Android package ID, exact release version, increasing version code and current signing certificate against the installed app before handing it to Android through a private FileProvider. Android controls the final install confirmation and may ask once for permission to install apps from this source.

Android does not permit ordinary apps to silently replace themselves. In-place updates also require every APK to be signed with the same permanent private signing key. Configure the four GitHub Actions signing secrets described in [ANDROID_SIGNING.md](ANDROID_SIGNING.md); never commit the keystore or passwords.

## Release targets

Only three distributables are published: Windows installer, Windows portable ZIP and Android APK. There is no PWA/Web ZIP in the release pipeline. The publishing job also attaches `SHA256SUMS.txt` and `release-manifest.json`; the manifest records each package's exact byte size and SHA-256 digest. These metadata files are not counted as distributables. The workflow verifies the three package classes, non-empty/expected file sizes and metadata assets before treating publication as complete.

## Data safety

Updates replace application binaries and static assets only. They do not clear browser storage, Electron user data, imported match history or user preferences. Replay JSON and player-library data are not included in update archives.


## Version and release governance

The release workflow reads the package version from the exact main-branch commit and compares it with the latest release tag. It does not create commits or push generated version changes to `main`. If the package version is behind or equal to a released version and therefore needs a bump, the workflow stops with an actionable error. Update `package.json` and the matching `package-lock.json` through a reviewed pull request, then rerun the release workflow. This keeps release version changes reviewable and prevents CI from bypassing branch protections.

The final published release contains three installable packages plus two integrity metadata files. A package is not considered valid solely because it has a matching filename: the build jobs must already have completed their platform-specific smoke tests, and the publish gate rechecks package sizes and required release metadata.


## Release validation gates

The pull-request validation pipeline exercises the same release package identities without publishing a release:

- **Android local-data preservation:** a debuggable baseline APK receives a private app-data sentinel. A higher-version APK is installed with adb install -r; the test verifies the sentinel remains, the installed versionCode advances and the app launches.
- **Published Android upgrade:** CI downloads the exact APK asset from the latest published GitHub Release, verifies its package ID, version metadata and APK signature, compares its SHA-256 signing-certificate fingerprint with the newly built permanent-key release APK, then installs the published APK and upgrades it in place to the candidate APK on an Android emulator. Android's package manager must accept the update without uninstalling the existing package. The updated app must launch.
- **Windows installer:** CI runs the actual NSIS setup executable silently into an isolated directory, verifies the installed executable and resources/app.asar, then launches that installed application and checks that its renderer remains responsive during a five-minute idle soak.
- **Windows portable:** CI extracts the separately built ZIP into a different isolated directory, verifies its own executable and resources/app.asar, then launches that portable executable and performs the same renderer/idle-soak test. A valid ZIP or shared build output alone does not satisfy this check.
- **Downloaded artifact integrity:** a downstream CI job downloads the Windows and Android workflow artifacts, requires exactly the three version-specific package filenames, generates SHA256SUMS.txt and release-manifest.json from those downloaded bytes, and immediately verifies every byte count and SHA-256 value. It rejects extra files, malformed names, duplicates, missing metadata and checksum/manifest drift.
- **Published release integrity:** after GitHub Release upload, the release workflow downloads all published assets again and runs the same verifier against the downloaded directory. It requires exactly three distributables and exactly two metadata files.

The audit is fail-closed: a failed or skipped mandatory check blocks the downstream audit/publication job. A pull-request validation run does not publish or create a GitHub Release.
