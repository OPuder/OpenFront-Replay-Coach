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
assert.ok(androidUpdateRegression.includes('timeout 30s adb -s emulator-5554 shell monkey -p "$package_id" 1'));
// This smoke script launches with monkey; process survival is covered by the newer bounded emulator regression.


assert.match(releaseWorkflow, /Download published release and verify every byte/);
assert.match(releaseWorkflow, /verify-release-artifacts\.mjs verify/);

const updateValidationWorkflow = read(".github/workflows/update-validation.yml");
assert.match(updateValidationWorkflow, /Build higher-version APK before emulator startup[\s\S]*?assembleDebug[\s\S]*?Test debug data preservation and real published-APK update/);
assert.match(updateValidationWorkflow, /rm -f android\/app\/build\.gradle[\s\S]*?npx cap sync android[\s\S]*?node scripts\/install-android-updater-plugin\.mjs[\s\S]*?assembleDebug/, "The debug upgrade APK must be rebuilt from a clean generated Gradle project, not the release-signed project without its keystore environment.");
assert.match(androidUpdateRegression, /OPENFRONT_UPDATE_APK/);
assert.doesNotMatch(androidUpdateRegression, /gradlew|assembleDebug/);
assert.match(updateValidationWorkflow, /Test debug data preservation and real published-APK update[\s\S]*?if: steps\.parse_apk\.outcome == 'success'/);

assert.ok(
  updateValidationWorkflow.indexOf("Verify permanent Android release signing key and continuity") <
    updateValidationWorkflow.indexOf("Test debug data preservation and real published-APK update"),
  "The permanent release APK and previous published APK must be prepared before the combined emulator test."
);

assert.match(read("scripts/verify-release-artifacts.mjs"), /OpenFront Replay Coach Setup/);
assert.ok(updater.includes(String.raw`/(?:\.Setup\.| Setup )[\d.]+\.exe$/i`), "The main-process updater must recognize the current and legacy installer names.");
assert.ok(renderer.includes(String.raw`/(?:\.Setup\.| Setup )[\d.]+\.exe$/i`), "The Update Center must recognize the current and legacy installer names.");
const installerAssetMatcher = /(?:\.Setup\.| Setup )[\d.]+\.exe$/i;
assert.match("OpenFront Replay Coach Setup 2.2.45.exe", installerAssetMatcher, "The current electron-builder NSIS filename must be detected.");
assert.match("OpenFront.Replay.Coach.Setup.2.2.44.exe", installerAssetMatcher, "Legacy published installer filenames must remain supported.");
assert.match(read("scripts/verify-release-artifacts.mjs"), /OpenFront Replay Coach-.*-win\.zip/);
assert.match(read("scripts/verify-release-artifacts.mjs"), /OpenFront-Replay-Coach-.*-Android\.apk/);


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
assert.match(androidValidationWorkflow, /bash -n scripts\/test-android-release-upgrade\.sh[\s\S]*?bash -n scripts\/test-android-in-place-update\.sh[\s\S]*?bash -n scripts\/verify-android-release-signing\.sh/);


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


const releaseSource = read(".github/workflows/release-on-main.yml");
assert.match(releaseSource, /persist-credentials: false/);
assert.doesNotMatch(releaseSource, /git push origin HEAD:main/, "The release workflow must not push generated version commits directly to main.");
assert.ok(releaseSource.includes("Release version drift detected") && releaseSource.includes("reviewed pull request"));
assert.ok(releaseSource.includes("SHA256SUMS.txt"));
assert.ok(releaseSource.includes("release-manifest.json"));
assert.ok(releaseSource.includes("verify-release-artifacts.mjs generate"));
assert.ok(releaseSource.includes("verify-release-artifacts.mjs verify"));
assert.match(read("scripts/verify-release-artifacts.mjs"), /SHA256SUMS\.txt/);
assert.match(read("scripts/verify-release-artifacts.mjs"), /release-manifest\.json/);


const artifactVerifier = read("scripts/verify-release-artifacts.mjs");
const artifactVerifierTests = read("scripts/verify-release-artifacts.test.mjs");
const windowsDistributionVerifier = read("scripts/verify-windows-distributions.mjs");
assert.match(artifactVerifier, /SHA256SUMS\.txt/);
assert.match(artifactVerifier, /release-manifest\.json/);
assert.match(artifactVerifier, /exactly the three correctly named distributables/);
assert.match(artifactVerifier, /Manifest SHA-256 mismatch/);
assert.match(artifactVerifier, /Manifest byte size mismatch/);
assert.match(artifactVerifier, /Release directory contains missing, unexpected or incorrectly named files/);
assert.match(artifactVerifierTests, /rejects unexpected additional files/);
assert.match(artifactVerifierTests, /rejects malformed package names/);
assert.match(artifactVerifierTests, /modified package after metadata generation/);
assert.match(windowsDistributionVerifier, /Installing the NSIS distribution/);
assert.match(windowsDistributionVerifier, /Extracting the independent portable ZIP/);
assert.match(windowsDistributionVerifier, /installed NSIS/);
assert.match(windowsDistributionVerifier, /portable ZIP/);
assert.match(windowsDistributionVerifier, /resources.*app\.asar/);

const androidReleaseUpgrade = read("scripts/test-android-in-place-update.sh");
assert.match(androidReleaseUpgrade, /keep-this-data/);
assert.match(androidReleaseUpgrade, /PREVIOUS_PUBLISHED_APK/);
assert.match(androidReleaseUpgrade, /CURRENT_RELEASE_APK/);
assert.match(androidReleaseUpgrade, /Published APK and current release APK do not have the same signing certificate/);
assert.match(androidReleaseUpgrade, /install --no-streaming -r "\$current_release_apk"/);
assert.match(androidReleaseUpgrade, /actual published APK versionCode/);
assert.match(androidReleaseUpgrade, /PREVIOUS_RELEASE_TAG/);
assert.match(androidReleaseUpgrade, /previous_release_name/);
const signingScript = read("scripts/verify-android-release-signing.sh");
assert.match(signingScript, /Expected exactly one Android APK in previous release/);
assert.match(signingScript, /PREVIOUS_PUBLISHED_APK=/);
assert.match(signingScript, /expected_previous_apk/);
assert.match(signingScript, /sha256sum "\$previous_apk"/);
assert.match(signingScript, /CURRENT_RELEASE_APK=/);

const validationWorkflow = read(".github/workflows/update-validation.yml");
assert.match(validationWorkflow, /release-artifact-download-audit/);
assert.match(validationWorkflow, /actions\/download-artifact@v4/);
assert.match(validationWorkflow, /verify-release-artifacts\.mjs generate/);
assert.match(validationWorkflow, /Download the audited bundle again/);
assert.match(validationWorkflow, /Re-verify downloaded manifest and checksums/);
assert.match(validationWorkflow, /verify-windows-distributions\.mjs/);
assert.match(validationWorkflow, /Test debug data preservation and real published-APK update/);
assert.match(validationWorkflow, /verify-android-release-signing\.sh/);
const windowsWorkflow = read(".github/workflows/build-windows.yml");
assert.match(windowsWorkflow, /verify-windows-distributions\.mjs/);
const releaseWorkflowUpdated = read(".github/workflows/release-on-main.yml");
assert.match(releaseWorkflowUpdated, /Download published release and verify every byte/);
assert.match(releaseWorkflowUpdated, /verify-release-artifacts\.mjs verify/);

const androidVersionScript = read("scripts/set-android-version.mjs");
const androidVersionTests = read("scripts/set-android-version.test.mjs");
assert.match(androidVersionScript, /Rewrite only the app version fields/);
assert.match(androidVersionScript, /versionCode/);
assert.match(androidVersionTests, /preserves compileSdk and permanent signing configuration/);
assert.match(androidVersionTests, /signingConfig signingConfigs\\.release/);
