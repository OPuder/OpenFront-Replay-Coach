import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const updater = read("src/main/updater.ts");
const android = read("android-updater-template/ApkUpdaterPlugin.java");
const installer = read("scripts/install-android-updater-plugin.mjs");
const renderer = read("src/renderer/UpdateCenter.tsx");
const versionScript = read("scripts/set-release-version.mjs");
const releaseWorkflow = read(".github/workflows/release-on-main.yml");
assert.match(updater, /releases\/latest/);
assert.match(updater, /createHash\('sha256'\)/);
assert.match(updater, /autoUpdateOnStartup/);
assert.match(updater, /auto-update-attempt\.json/);
assert.match(updater, /previousAttempt\?\.targetVersion === version/);
assert.match(updater, /repeated restart|Wiederholter Neustart wird verhindert/);
assert.match(updater, /clearAutoUpdateAttempt\(\)/);
assert.match(updater, /Wait-Process/);
assert.match(updater, /Expand-Archive/);
assert.match(updater, /UpdateStarted/);
assert.match(updater, /Die Sicherung der Portable-Version konnte nicht verifiziert werden/);
assert.match(updater, /Die wiederhergestellte Portable-Version stimmt nicht mit der Sicherung überein/);
assert.match(updater, /ArgumentList '\/S'/);
assert.match(updater, /updates:install/);
assert.match(android, /ACTION_MANAGE_UNKNOWN_APP_SOURCES/);
assert.match(android, /FileProvider\.getUriForFile/);
assert.match(android, /MessageDigest\.getInstance\("SHA-256"\)/);
assert.match(android, /releases\/download/);
assert.match(installer, /registerPlugin\(ApkUpdaterPlugin\.class\)/);
assert.match(installer, /updater-fileprovider/);
assert.match(renderer, /installDesktopUpdate/);
assert.match(renderer, /installAndroidUpdate/);
assert.doesNotMatch(renderer, /androidAutoUpdateAttempted/);
assert.match(renderer, /registerPlugin<ApkUpdaterPlugin>/);
assert.match(renderer, /version: latestVersion/);
assert.match(renderer, /keine Android-APK veröffentlicht/);
assert.doesNotMatch(renderer, /Web\/PWA|serviceWorker|isBrowserPwa/);
assert.doesNotMatch(releaseWorkflow, /assembleDebug/);
assert.match(releaseWorkflow, /push:\s*branches: \[main\]/);
assert.match(releaseWorkflow, /permanent Android release signing key is required/);
assert.ok(releaseWorkflow.includes("grep -Eo '[[:xdigit:]]{64}'"), "Release workflow must extract SHA-256 certificate fingerprints robustly.");
assert.match(releaseWorkflow, /Android signing certificate changed/);
assert.match(releaseWorkflow, /needs\.build-android\.outputs\.signing_mode == 'permanent release key'/);
assert.match(updater, /child\.once\('spawn', resolve\)/);
assert.match(updater, /child\.once\('error', reject\)/);
assert.match(updater, /Add-Content -LiteralPath \$Log/);
assert.match(updater, /The ZIP edition has no NSIS uninstaller/);
assert.match(android, /getPackageArchiveInfo/);
assert.match(android, /GET_SIGNING_CERTIFICATES/);
assert.match(android, /currentSigners/);
assert.match(android, /expectedVersion\.equals\(incoming\.versionName\)/);
assert.match(android, /incomingVersion <= installedVersion/);
assert.match(android, /Arrays\.equals\(incomingSignatures, installedSignatures\)/);
assert.match(android, /Android kann die heruntergeladene APK nicht als gültiges Installationspaket lesen/);
assert.match(updater, /-Verb RunAs/);
assert.match(updater, /ofrc-installer-backup/);
assert.match(updater, /BackupVerified/);
assert.match(updater, /Die Sicherung der installierten Version konnte nicht verifiziert werden/);
assert.match(updater, /Die wiederhergestellte Version stimmt nicht mit der Sicherung überein/);
assert.match(updater, /update-install\.log/);
assert.ok(updater.includes("Get-FileHash -LiteralPath $AppArchive"));
assert.match(updater, /Programmdateien wurden nicht ersetzt/);
assert.match(updater, /Portable-Dateien wurden nicht aktualisiert/);
const main = read("src/main/main.ts");
assert.match(main, /createWindow\(\);\s*void autoUpdateOnStartup\(\);/);
assert.doesNotMatch(main, /const updateScheduled = await autoUpdateOnStartup\(\)/);
console.log("Updater contract tests passed: Windows installer/portable, Android verified APK handoff and Android APK handoff.");

assert.match(updater, /await writeAutoUpdateAttempt\(version\);[\s\S]*?await scheduleWindowsInstall\(downloadPath, portable\)/);
assert.match(updater, /getWindowsUpdateStatus/);
assert.match(updater, /konnte nicht abgeschlossen werden/);
assert.match(read("src/main/preload.ts"), /getUpdateStatus/);
assert.match(read("src/renderer/env.d.ts"), /getUpdateStatus/);
assert.match(read("src/renderer/UpdateCenter.tsx"), /getUpdateStatus\(\)/);
const androidSigningGate = read("scripts/verify-android-release-signing.sh");
assert.match(androidSigningGate, /assembleRelease/);
assert.match(androidSigningGate, /ANDROID_KEYSTORE_PATH/);
assert.match(androidSigningGate, /Android signing certificate does not match/);
assert.match(androidSigningGate, /apksigner.*verify/);
const androidUpdateRegression = read("scripts/test-android-in-place-update.sh");
assert.ok(androidUpdateRegression.includes('adb -s emulator-5554 shell "run-as $package_id sh -c'), "Android test must quote the remote run-as shell command as one argument.");
assert.ok(androidUpdateRegression.includes('adb -s emulator-5554 shell "run-as $package_id cat files/update-regression/sentinel.txt"'), "Android test must read the app-data sentinel through run-as.");
assert.match(androidUpdateRegression, /adb -s emulator-5554 install -r/);
assert.match(androidUpdateRegression, /keep-this-data/);
assert.match(androidUpdateRegression, /versionCode=\$expected_version_code/);
assert.match(androidUpdateRegression, /adb -s emulator-5554 shell monkey/);


assert.match(releaseWorkflow, /Verify published release contains exactly three usable artifacts/);
assert.match(releaseWorkflow, /names\.length === 3/);
assert.match(releaseWorkflow, /-Android\.apk/);

const updateValidationWorkflow = read(".github/workflows/update-validation.yml");
assert.match(updateValidationWorkflow, /Test in-place Android update and preserve app data[\s\S]*?if: always\(\) && steps\.parse_apk\.outcome == 'success'/);

assert.ok(
  updateValidationWorkflow.indexOf("Test in-place Android update and preserve app data") <
    updateValidationWorkflow.indexOf("Verify permanent Android release signing key and continuity"),
  "The debug emulator update test must run before the signing gate modifies generated Gradle configuration."
);

assert.ok(releaseWorkflow.includes("names.some(name => /(?:\\.Setup\\.| Setup )[0-9.]+\\.exe$/i.test(name))"), "Release verification must match both legacy dotted and actual spaced NSIS installer filenames.");
assert.ok(updater.includes(String.raw`/(?:\.Setup\.| Setup )[\d.]+\.exe$/i`), "The main-process updater must recognize the current and legacy installer names.");
assert.ok(renderer.includes(String.raw`/(?:\.Setup\.| Setup )[\d.]+\.exe$/i`), "The Update Center must recognize the current and legacy installer names.");
const installerAssetMatcher = /(?:\.Setup\.| Setup )[\d.]+\.exe$/i;
assert.match("OpenFront Replay Coach Setup 2.2.45.exe", installerAssetMatcher, "The current electron-builder NSIS filename must be detected.");
assert.match("OpenFront.Replay.Coach.Setup.2.2.44.exe", installerAssetMatcher, "Legacy published installer filenames must remain supported.");
assert.ok(releaseWorkflow.includes("names.some(name => /-win\\.zip$/i.test(name))"), "Release verification must match the actual Windows portable ZIP filename.");
assert.ok(releaseWorkflow.includes("names.some(name => /-Android\\.apk$/i.test(name))"), "Release verification must match the actual Android APK filename.");
