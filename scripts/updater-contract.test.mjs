import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const updater = read("src/main/updater.ts");
const windowsRollback = read("scripts/windows-update-rollback.ps1");
const windowsLockDiagnostics = read("scripts/windows-process-lock-diagnostics.ps1");
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
assert.match(windowsRollback, /Wait-Process/);
assert.match(windowsRollback, /Get-LockOwners/);
assert.match(windowsRollback, /INSTALL_LOCK_OWNER/);
assert.match(windowsRollback, /INSTALL_TREE_LOCKS_CLEARED/);
assert.doesNotMatch(windowsRollback, /Start-Sleep -Milliseconds 750/);
assert.match(windowsLockDiagnostics, /RmRegisterResources/);
assert.match(windowsLockDiagnostics, /RmGetList/);
assert.match(windowsLockDiagnostics, /ExactSpelling=true/);
assert.match(windowsLockDiagnostics, /StringBuilder\(33\)/);
assert.match(windowsLockDiagnostics, /electron-renderer/);
assert.match(windowsRollback, /STOPPING_OLD_APP_BEFORE_UPDATE/);
assert.match(windowsRollback, /Start-Process -FilePath \$PackagePath -ArgumentList/);
assert.ok(windowsRollback.indexOf("STOPPING_OLD_APP_BEFORE_UPDATE") < windowsRollback.indexOf("Start-Process -FilePath $PackagePath"),
  "The old app must be stopped before the installer or portable files are replaced.");
assert.match(windowsRollback, /Expand-Archive/);
assert.match(windowsRollback, /\$started/);
assert.match(windowsRollback, /Backup verification failed/);
assert.match(windowsRollback, /Rollback backup verification failed before restore/);
assert.ok(windowsRollback.indexOf("Rollback backup verification failed before restore") < windowsRollback.indexOf("Log 'ROLLBACK_BEGIN removing complete target tree'"),
  "A backup must be revalidated before the updater deletes any part of the existing installation.");
assert.match(windowsRollback, /ROLLBACK_VERIFIED/);
assert.match(windowsRollback, /REGISTRY_BASELINE_NONE/);
assert.match(windowsRollback, /REGISTRY_ROLLBACK_VERIFIED baseline=none/);
assert.match(windowsRollback, /Find-UninstallEntries/);
assert.match(windowsRollback, /Start-Process -FilePath \$PackagePath -ArgumentList/);
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
assert.match(updater, /confirmWindowsAppReady/);
assert.match(updater, /startupReadyPath/);
assert.match(updater, /-StartupReadyPath/);
assert.match(updater, /-ExpectedVersion/);
assert.match(updater, /openfront-replay-coach-update-helper-/);
assert.match(updater, /fs\.copyFile\(packagedHelperPath, helperPath\)/);
assert.match(updater, /packagedLockDiagnosticPath/);
assert.match(read("scripts/test-windows-update-rollback.ps1"), /helper-runtime/);
assert.doesNotMatch(updater, /setTimeout\(resolve, 800\)/);
assert.match(windowsRollback, /APP_RESTART_CONFIRMED/);
assert.match(windowsRollback, /ROLLBACK_COLD_START_CONFIRMED/);
assert.match(read("src/main/main.ts"), /did-finish-load[\s\S]*confirmWindowsAppReady/);
assert.match(read("scripts/test-windows-update-rollback.ps1"), /Assert-SuccessfulUpdate/);
assert.match(read("scripts/test-windows-update-rollback.ps1"), /APP_RESTART_CONFIRMED/);
assert.match(read("scripts/test-windows-update-rollback.ps1"), /Stop-ReadyProcess/);
assert.match(read("scripts/windows-profile-storage.mjs"), /indexedDB\.databases\(\)/);
assert.match(read("scripts/windows-profile-storage.mjs"), /exactSnapshotMatch/);
assert.match(read("scripts/windows-profile-storage.mjs"), /baseline\.json/);
assert.match(updater, /child\.once\('error', reject\)/);
assert.match(windowsRollback, /Add-Content -LiteralPath \$LogPath/);
assert.match(updater, /The ZIP edition has no NSIS uninstaller/);
assert.match(android, /getPackageArchiveInfo/);
assert.match(android, /GET_SIGNING_CERTIFICATES/);
assert.match(android, /currentSigners/);
assert.match(android, /expectedVersion\.equals\(incoming\.versionName\)/);
assert.match(android, /incomingVersion <= installedVersion/);
assert.match(android, /Arrays\.equals\(incomingSignatures, installedSignatures\)/);
assert.match(android, /Android kann die heruntergeladene APK nicht als gültiges Installationspaket lesen/);
assert.match(windowsRollback, /Start-Process -FilePath \$PackagePath -ArgumentList/);
assert.match(windowsRollback, /ofrc-rollback-/);
assert.match(windowsRollback, /BACKUP_VERIFIED/);
assert.match(windowsRollback, /Backup verification failed/);
assert.match(windowsRollback, /Restored tree verification failed/);
assert.match(updater, /update-install\.log/);
assert.match(windowsRollback, /Get-FileHash -LiteralPath \$_\.FullName -Algorithm SHA256/);
assert.match(windowsRollback, /Assert-Manifest/);
assert.match(windowsRollback, /robocopy.exe/);
assert.match(updater, /windows-update-rollback\.ps1/);
assert.match(updater, /-Mode/);
assert.match(windowsRollback, /Remove-Item -LiteralPath \$Target -Recurse -Force/);
assert.match(windowsRollback, /Mirror \$backup \$Target/);
assert.match(windowsRollback, /Compare-Object/);
assert.match(windowsRollback, /FAILURE_INJECTED_AFTER_MUTATION/);
assert.match(windowsRollback, /ROLLBACK_FATAL/);
assert.match(read("scripts/test-windows-update-rollback.ps1"), /WINDOWS_INSTALLER_ROLLBACK_OK/);
assert.match(read("scripts/test-windows-update-rollback.ps1"), /WINDOWS_PORTABLE_ROLLBACK_OK/);
assert.match(read("scripts/test-android-signature-mismatch.sh"), /INSTALL_FAILED_UPDATE_INCOMPATIBLE/);
assert.match(read("scripts/test-android-signature-mismatch.sh"), /versionName=\x27?2\.2\.51/);
const main = read("src/main/main.ts");
assert.match(main, /createWindow\(\);\s*void autoUpdateOnStartup\(\);/);
assert.doesNotMatch(main, /const updateScheduled = await autoUpdateOnStartup\(\)/);
console.log("Updater contract tests passed: Windows installer/portable, Android verified APK handoff and Android APK handoff.");

assert.match(updater, /await writeAutoUpdateAttempt\(version\);[\s\S]*?await scheduleWindowsInstall\(downloadPath, portable, version\)/);
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
