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
assert.ok(androidUpdateRegression.includes('timeout 30s adb -s emulator-5554 shell "run-as $package_id sh -c'));
assert.ok(androidUpdateRegression.includes('timeout 30s adb -s emulator-5554 shell "run-as $package_id cat files/update-regression/sentinel.txt"'));
assert.match(androidUpdateRegression, /install_apk\(\)\s*\{|adb -s emulator-5554 install -r/);
assert.match(androidUpdateRegression, /keep-this-data/);
assert.match(androidUpdateRegression, /versionCode=\$expected_version_code/);
assert.match(androidUpdateRegression, /cmd package resolve-activity --brief/);
assert.match(androidUpdateRegression, /am start -n "\$activity"/);
assert.match(androidUpdateRegression, /pidof "\$package_id"/);
assert.doesNotMatch(androidUpdateRegression, /shell monkey -p/);


assert.match(releaseWorkflow, /Verify published release contains exactly three usable artifacts/);
assert.match(releaseWorkflow, /names\.length === 3/);
assert.match(releaseWorkflow, /-Android\.apk/);

const updateValidationWorkflow = read(".github/workflows/update-validation.yml");
assert.match(updateValidationWorkflow, /Build higher-version APK before emulator startup[\s\S]*?assembleDebug[\s\S]*?Test in-place Android update and preserve app data/);
assert.match(androidUpdateRegression, /OPENFRONT_UPDATE_APK/);
assert.doesNotMatch(androidUpdateRegression, /gradlew|assembleDebug/);
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


const matchStore = read("src/renderer/matchStore.ts");
const appRenderer = read("src/renderer/main.tsx");
assert.match(matchStore, /const DB_VERSION = 3/);
assert.match(matchStore, /const REPLAY_STORE = "replay-records"/);
assert.match(matchStore, /event\.oldVersion < 2[\s\S]*?replays\.put[\s\S]*?cursor\.update/);
assert.match(matchStore, /export async function loadImportedMatch\(/);
assert.doesNotMatch(read("src/main/main.ts"), /importedReplayJson/);
const startupUpdater = updater.slice(updater.indexOf("export async function autoUpdateOnStartup"));
assert.match(startupUpdater, /Installation wartet auf Bestätigung im Update Center/);
assert.doesNotMatch(startupUpdater, /scheduleWindowsInstall\(/);

const replaySimulation = read("src/renderer/ReplaySimulation.ts");
assert.doesNotMatch(replaySimulation, /\.\.\.turns\.map/);
assert.match(appRenderer, /engineReviewAbort\.current\?\.abort\(\)/);
assert.match(appRenderer, /controller\.signal/);
assert.match(appRenderer, /page !== 'analysis'[\s\S]*?setApiResult\(null\)[\s\S]*?setSimulationResult\(null\)/);

assert.match(appRenderer, /function navigateTo\([\s\S]*?engineReviewRunId\.current\+\+[\s\S]*?setSimulationProgress\(null\)/, "Navigation must clear stale progress after aborting an engine review.");

const releaseUpgradeWorkflow = read(".github/workflows/release-on-main.yml");
const releaseUpgradeScript = read("scripts/test-android-release-upgrade.sh");
assert.ok(releaseUpgradeWorkflow.includes('echo "previous_apk=$previous_apk" >> "$GITHUB_OUTPUT"'));
assert.ok(releaseUpgradeWorkflow.includes("PREVIOUS_APK: ${{ steps.apk.outputs.previous_apk }}"));
assert.ok(releaseUpgradeWorkflow.includes("Install previous published APK and upgrade to exact signed release APK"));
assert.ok(releaseUpgradeWorkflow.includes("script: bash scripts/test-android-release-upgrade.sh"));
assert.ok(releaseUpgradeWorkflow.includes("timeout-minutes: 60"));
assert.ok(releaseUpgradeWorkflow.includes("emulator-boot-timeout: 1800"));
assert.ok(!releaseUpgradeWorkflow.includes("disable-animations: true"));
assert.ok(releaseUpgradeScript.includes("PREVIOUS_APK"));
assert.ok(releaseUpgradeScript.includes("for attempt in 1 2 3"));
assert.ok(releaseUpgradeScript.includes("timeout --signal=INT --kill-after=15s 240s adb -s emulator-5554 install"));
assert.ok(releaseUpgradeScript.includes("seq 1 9"));
assert.ok(releaseUpgradeScript.includes("timeout 8s adb -s emulator-5554 shell cmd package list packages"));
assert.ok(releaseUpgradeScript.includes("versionCode"));
assert.ok(releaseUpgradeScript.includes("cmd package resolve-activity"));
assert.ok(releaseUpgradeScript.includes("am start -W -n"));
assert.ok(releaseUpgradeScript.includes("pidof"));
assert.ok(releaseUpgradeScript.includes('for attempt in $(seq 1 60)'));
assert.ok(releaseUpgradeScript.includes('launch_status=0'));
assert.ok(releaseUpgradeScript.includes('grep -E "mResumedActivity|topResumedActivity"'));
assert.ok(releaseUpgradeScript.includes("timeout 60s adb -s emulator-5554"));
assert.ok(releaseUpgradeScript.includes("dumpsys activity activities"));
assert.ok(releaseUpgradeScript.includes("FATAL EXCEPTION"));
assert.ok(releaseUpgradeScript.includes("sleep 300"));
assert.ok(releaseUpgradeScript.includes("five-minute idle soak"));
const androidValidationWorkflow = read(".github/workflows/update-validation.yml");
assert.ok(androidValidationWorkflow.includes("bash -n scripts/test-android-release-upgrade.sh"));


const engineCacheWorkflows = [
  read(".github/workflows/build-windows.yml"),
  read(".github/workflows/replay-compatibility.yml"),
  read(".github/workflows/validate-engine.yml"),
  read(".github/workflows/update-validation.yml"),
  read(".github/workflows/release-on-main.yml"),
];
for (const workflow of engineCacheWorkflows) {
  assert.match(workflow, /Restore exact historical engine Git objects[\s\S]*?actions\/cache@v4[\s\S]*?path: \.git\/modules[\s\S]*?github\.job/);
}
