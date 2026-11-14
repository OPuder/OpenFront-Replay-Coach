# Android App – direct APK download

The Android edition is built from the same React interface and replay-analysis code as the Windows desktop edition. Capacitor packages it in a native Android application.

## No Cloudflare or Play Store account required

Every successful GitHub Release includes an Android APK alongside the Windows installer and portable ZIP.

1. Open the repository's [Releases page](https://github.com/OPuder/OpenFront-Replay-Coach/releases) on the phone.
2. Download the asset named `OpenFront-Replay-Coach-<version>-Android.apk`.
3. Open the downloaded APK. Android may ask you to allow this browser or file manager to install apps.
4. Confirm the installation and launch OpenFront Replay Coach.

There is no Cloudflare account, no external hosting setup, no Node.js or Git installation on the phone, and no Play Store listing.

## Why the APK can read OpenFront directly

Normal browser JavaScript is subject to cross-origin (CORS) restrictions. The Android package runs in Capacitor's native WebView and enables CapacitorHttp, which routes fetch/XMLHttpRequest through Android's native HTTP stack. This allows the app to call OpenFront's public game/player API and load its public engine assets without a hosted proxy.

Only public GET data is requested. The app does not proxy private endpoints, account sessions, login tokens or game-write operations. Local replay JSON files are processed on the device.

## Supported devices

The APK is built with Capacitor 8. Its documented Android support starts at Android 7 (API 24), subject to a working Android System WebView / Chrome WebView on the device. Actual memory and performance still depend on the phone; use the Windows edition for very large replays.

## Updating the APK

The app checks for a newer release when it starts. If one is available, use the update button to download and verify the APK; Android then displays its own installation confirmation. Before opening that dialog, the updater checks the package ID, version code and signing certificate against the installed app and explains any mismatch.

Every release is signed with the configured permanent GitHub Actions key. If an older installation was signed with a different key, Android cannot update it in place; that installation must be removed once and the latest APK installed manually. The permanent key must remain unchanged for all future releases.

## Optional browser/PWA source

The repository continues to build and test a browser/PWA edition. Its public OpenFront data calls require the included same-origin Pages Functions. It is not automatically hosted by this repository. The APK is the ready-to-use mobile download and does not depend on that optional hosting path.
