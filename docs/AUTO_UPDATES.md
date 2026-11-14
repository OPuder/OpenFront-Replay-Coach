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

The app checks releases at startup. If a newer version exists, its native Capacitor plugin downloads the APK to the app cache, checks the exact release size and SHA-256 digest, then hands the APK to Android through a private FileProvider. Android controls the final install confirmation and may ask once for permission to install apps from this source.

Android does not permit ordinary apps to silently replace themselves. In-place updates also require every APK to be signed with the same permanent private signing key. Configure the four GitHub Actions signing secrets described in [ANDROID_SIGNING.md](ANDROID_SIGNING.md); never commit the keystore or passwords.

## Web / PWA

A deployed PWA checks its service-worker script when the browser starts or revisits the app. A newly deployed service worker activates and the page reloads onto the new app shell. The in-app update check can request an immediate service-worker refresh. A GitHub Release does not itself publish files to a website: the configured web host must deploy the new PWA build first. The downloadable Web/PWA ZIP remains a self-hosted package.

## Data safety

Updates replace application binaries and static assets only. They do not clear browser storage, Electron user data, imported match history or user preferences. Replay JSON and player-library data are not included in update archives.
