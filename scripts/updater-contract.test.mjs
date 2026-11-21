import assert from "node:assert/strict";
import test from "node:test";
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


assert.match(releaseWorkflow, /Verify published release contains exactly three usable artifacts/);
assert.match(releaseWorkflow, /names\.length === 3/);
assert.match(releaseWorkflow, /-Android\.apk/);

const updateValidationWorkflow = read(".github/workflows/update-validation.yml");
const androidSigningConfigurator = read("scripts/configure-android-signing.mjs");
const androidReleaseUpgrade = read("scripts/test-android-release-upgrade.sh");
const androidBaselineDownload = read("scripts/download-android-release-baseline.sh");
const androidStorageInspector = read("scripts/inspect-android-upgrade-data.mjs");
const androidStorageSnapshot = read("scripts/snapshot-android-web-storage.sh");
const androidUnsignedNegative = read("scripts/create-android-unsigned-negative-apk.py");

assert.match(updateValidationWorkflow, /Download and verify exact public v2\.2\.51 Android baseline/);
assert.match(updateValidationWorkflow, /Identify Android upgrade-sensitive changes[\s\S]*?dorny\/paths-filter@v3/);
assert.match(updateValidationWorkflow, /android_upgrade:[\s\S]*?src\/renderer\/matchStore\.ts/);
assert.match(updateValidationWorkflow, /if: success\(\) && \(github\.event_name != 'pull_request' \|\| needs\.change-scope\.outputs\.android_upgrade == 'true'\)/);
assert.match(updateValidationWorkflow, /pull_request:[\s\S]*?paths:[\s\S]*?src\/\*\*/);
assert.match(updateValidationWorkflow, /id: source-checkout[\s\S]*?steps\.source-checkout\.outcome == 'success'/);
assert.match(updateValidationWorkflow, /steps\.release_candidate\.outcome == 'success'/);
assert.match(updateValidationWorkflow, /Build higher-version candidate with the permanent release key/);
assert.match(updateValidationWorkflow, /Test genuine published-APK in-place upgrade on Android emulator[\s\S]*?bash scripts\/test-android-release-upgrade\.sh/);
assert.match(updateValidationWorkflow, /Preserve non-debuggable release-signed upgrade-test APK/);
const baselineUiSeed = read("scripts/seed-android-baseline-ui.sh");
assert.match(baselineUiSeed, /ocr_find_bounds/);
assert.ok(baselineUiSeed.indexOf("log() {") < baselineUiSeed.indexOf('log "Published baseline is non-debuggable'),
  "The Android baseline seed logger must be defined before its first invocation.");
assert.match(baselineUiSeed, /tesseract/);
assert.match(baselineUiSeed, /OpenFront-Profillink/);
assert.match(updateValidationWorkflow, /app-release\.apk/);
assert.doesNotMatch(updateValidationWorkflow, /app-debug\.apk/);
assert.match(updateValidationWorkflow, /Build separate non-debuggable production APK without test inspector/);
assert.match(updateValidationWorkflow, /Download uploaded APK for byte-for-byte verification/);
assert.match(updateValidationWorkflow, /Verify uploaded production APK hash and signature/);
assert.match(updateValidationWorkflow, /Verify permanent Android release signing key and continuity[\s\S]*?if: always\(\) && \(github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository\)/);
assert.match(androidSigningConfigurator, /ANDROID_UPGRADE_TEST_BUILD/);
assert.match(updateValidationWorkflow, /ANDROID_UPGRADE_TEST_BUILD: "1"/);
assert.doesNotMatch(androidSigningGate, /assembleDebug/,
  "The published-APK upgrade test must not substitute a Debug APK.");
assert.match(androidSigningGate, /assembleRelease/);
assert.match(androidSigningGate, /app-release\.apk/);
assert.match(androidSigningGate, /ANDROID_SIGNING_VERIFY_ONLY/);
assert.match(androidSigningConfigurator, /signingConfig signingConfigs\.release/);
assert.match(androidSigningConfigurator, /debuggable: "false"/);
assert.match(androidSigningConfigurator, /OFRC_ANDROID_UPGRADE_TEST/);
assert.match(read("scripts/install-android-updater-plugin.mjs"), /WebView\.setWebContentsDebuggingEnabled\(true\)/);
assert.match(read("scripts/install-android-updater-plugin.mjs"), /BuildConfig\.OFRC_ANDROID_UPGRADE_TEST/);
assert.match(androidBaselineDownload, /v2\.2\.51/);
assert.match(androidBaselineDownload, /8b2da877f5e4788c29e13f7788aaca34d07e969e1f03a0f1aff8e0cdc6c030fd/);
assert.match(androidBaselineDownload, /apksigner/);
assert.match(androidBaselineDownload, /versionCode='2002051'/);
assert.match(androidReleaseUpgrade, /adb -s emulator-5554 install --no-streaming -r/);
assert.match(androidReleaseUpgrade, /seed-android-baseline-ui\.sh/);
assert.match(androidReleaseUpgrade, /snapshot-android-web-storage\.sh before/);
assert.match(androidReleaseUpgrade, /inspect-android-upgrade-data\.mjs/);
assert.match(androidReleaseUpgrade, /compare-android-web-storage\.mjs/);
assert.match(androidReleaseUpgrade, /create-android-unsigned-negative-apk\.py/);
assert.match(androidReleaseUpgrade, /unsigned negative APK/);
assert.match(androidReleaseUpgrade, /apksigner" verify --verbose/);
assert.match(androidReleaseUpgrade, /INSTALL_PARSE_FAILED_NO_CERTIFICATES\|INSTALL_FAILED_INVALID_APK/);
assert.match(androidReleaseUpgrade, /keytool -genkeypair/);
assert.match(androidReleaseUpgrade, /ofrc-android-negative-test\.p12/);
assert.match(androidReleaseUpgrade, /openssl rand -hex 24/);
assert.match(androidReleaseUpgrade, /apksigner" sign --ks/);
assert.match(androidReleaseUpgrade, /INSTALL_FAILED_UPDATE_INCOMPATIBLE/);
assert.match(androidReleaseUpgrade, /after-signature-mismatch-storage\.json/);
assert.match(androidReleaseUpgrade, /compare-android-upgrade-snapshots\.mjs.*after-negative-test-storage\.json.*after-signature-mismatch-storage\.json/);
assert.match(androidReleaseUpgrade, /rm -f "\$test_keystore" "\$test_signed_apk"/);
assert.doesNotMatch(androidReleaseUpgrade, /echo "\$test_password"|cat "\$test_keystore"|upload-artifact.*test_keystore/);
const androidBaselineUiSeed = read("scripts/seed-android-baseline-ui.sh");
assert.match(androidBaselineUiSeed, /uiautomator dump --compressed/);
assert.match(androidBaselineUiSeed, /UI hierarchy dump attempt/);
assert.match(androidBaselineUiSeed, /dumpsys window/);
assert.match(androidBaselineUiSeed, /UI hierarchy dump attempt \$attempt\/2 failed/);
assert.match(androidBaselineUiSeed, /UIAutomator hierarchy unavailable; continuing with screenshot OCR/);
assert.match(androidBaselineUiSeed, /ocr_find_bounds\("\$needle" "\$occurrence" \|\| true\)/);
assert.match(androidReleaseUpgrade, /snapshot-android-web-storage\.sh after/);
assert.match(androidReleaseUpgrade, /after-negative-test-storage\.json/);
assert.match(androidReleaseUpgrade, /compare-android-upgrade-snapshots\.mjs/);
assert.match(androidStorageInspector, /ofrc-android-upgrade-snapshot-v1/);
assert.match(androidStorageInspector, /missingReplayRecords/);
assert.match(androidStorageInspector, /orphanReplayRecords/);
assert.match(androidStorageSnapshot, /adb root/);
assert.match(androidStorageSnapshot, /IndexedDB/);
assert.match(androidStorageSnapshot, /Local Storage/);
assert.match(androidStorageSnapshot, /immutableTables/);
assert.match(androidUnsignedNegative, /META-INF/);
assert.match(androidUnsignedNegative, /No signing key was generated or used/);
assert.match(androidUpdateRegression, /OPENFRONT_UPDATE_APK/);
assert.doesNotMatch(androidUpdateRegression, /gradlew|assembleDebug/);

assert.ok(
  updateValidationWorkflow.indexOf("Test genuine published-APK in-place upgrade on Android emulator") <
    updateValidationWorkflow.indexOf("Verify permanent Android release signing key and continuity"),
  "The permanent signing continuity gate must run after the published-APK emulator upgrade test."
);

assert.ok(releaseWorkflow.includes(String.raw`names.some(name => /-win\.zip$/i.test(name))`), "Release verification must match the actual Windows portable ZIP filename.");
const portableAssetMatcher = /^OpenFront\.Replay\.Coach-[0-9]+\.[0-9]+\.[0-9]+-win\.zip$/i;
assert.match("OpenFront.Replay.Coach-2.2.51-win.zip", portableAssetMatcher, "The actual electron-builder Windows portable ZIP filename must be detected.");
assert.doesNotMatch("OpenFront.Replay.Coach-2.2.51-win.7z", portableAssetMatcher, "A different archive format must not satisfy the portable ZIP contract.");
assert.ok(releaseWorkflow.includes(String.raw`names.some(name => /-Android\.apk$/i.test(name))`), "Release verification must match the actual Android APK filename.");
const androidAssetMatcher = /^OpenFront-Replay-Coach-[0-9]+\.[0-9]+\.[0-9]+-Android\.apk$/i;
assert.match("OpenFront-Replay-Coach-2.2.52-Android.apk", androidAssetMatcher, "The actual electron-builder Android APK filename must be detected.");
assert.doesNotMatch("OpenFront-Replay-Coach-2.2.52-Android.zip", androidAssetMatcher, "A non-APK extension must not satisfy the Android release contract.");
assert.doesNotMatch("OpenFront-Replay-Coach-2.2.52-Windows.apk", androidAssetMatcher, "An APK with the wrong platform suffix must not satisfy the Android release contract.");
assert.ok(releaseWorkflow.includes(String.raw`names.some(name => /(?:\.Setup\.| Setup )[0-9.]+\.exe$/i.test(name))`), "Release verification must match both legacy dotted and current spaced NSIS installer filenames.");
assert.ok(updater.includes(String.raw`/(?:\.Setup\.| Setup )[\d.]+\.exe$/i`), "The main-process updater must recognize current and legacy installer names.");
assert.ok(renderer.includes(String.raw`/(?:\.Setup\.| Setup )[\d.]+\.exe$/i`), "The Update Center must recognize current and legacy installer names.");
const installerAssetMatcher = /(?:\.Setup\.| Setup )[\d.]+\.exe$/i;
assert.match("OpenFront Replay Coach Setup 2.2.45.exe", installerAssetMatcher, "The current electron-builder NSIS filename must be detected.");
assert.match("OpenFront.Replay.Coach.Setup.2.2.44.exe", installerAssetMatcher, "Legacy published installer filenames must remain supported.");


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
assert.ok(releaseUpgradeScript.includes("versionCode"));
assert.ok(releaseUpgradeScript.includes("pidof"));
assert.ok(releaseUpgradeScript.includes("timeout 60s adb -s emulator-5554"));
const androidValidationWorkflow = read(".github/workflows/update-validation.yml");
assert.ok(androidValidationWorkflow.includes("bash -n scripts/test-android-release-upgrade.sh"));
assert.ok(androidValidationWorkflow.includes("bash -n scripts/android-emulator-diagnostics.sh"));


const engineBundleCacheWorkflows = [
  read(".github/workflows/build-windows.yml"),
  read(".github/workflows/replay-compatibility.yml"),
  read(".github/workflows/integration-e2e.yml"),
  read(".github/workflows/validate-android.yml"),
  read(".github/workflows/update-validation.yml"),
];
for (const workflow of engineBundleCacheWorkflows) {
  assert.match(workflow, /Restore reusable historical engine bundles[\s\S]*?actions\/cache@v6[\s\S]*?path: src\/renderer\/engine/);
  assert.match(workflow, /cache-hit != 'true'[\s\S]*?npm run build:engine/);
}
for (const workflow of engineBundleCacheWorkflows) {
  assert.doesNotMatch(workflow, /path: \.git\/modules/,
    "Build/test workflows must not restore the multi-gigabyte Git submodule cache.");
}
const releaseEngineBundleWorkflow = read(".github/workflows/release-on-main.yml");
assert.match(releaseEngineBundleWorkflow, /build-engine-bundles:[\s\S]*?npm run prepare:engines[\s\S]*?npm run build:engine[\s\S]*?npm run verify:engine-bundles[\s\S]*?actions\/upload-artifact@v7[\s\S]*?name: openfront-engine-bundles/);
assert.equal((releaseEngineBundleWorkflow.match(/run: npm run build:engine/g) || []).length, 1,
  "The release workflow must build historical replay engines exactly once.");
for (const job of ["validate-replay", "build-windows", "build-android"]) {
  assert.match(releaseEngineBundleWorkflow, new RegExp(job + ":[\\s\\S]*?needs: \\[prepare-release, build-engine-bundles\\][\\s\\S]*?actions/download-artifact@v8[\\s\\S]*?name: openfront-engine-bundles[\\s\\S]*?npm run verify:engine-bundles"));
}
assert.doesNotMatch(releaseEngineBundleWorkflow, /Restore reusable historical engine bundles/,
  "Release downstream jobs must consume the one validated engine artifact, not build independently.");
const enginePinWorkflow = read(".github/workflows/validate-engine.yml");
assert.match(enginePinWorkflow, /Restore exact historical engine Git objects[\s\S]*?actions\/cache@v6[\s\S]*?path: \.git\/modules[\s\S]*?github\.job/);
assert.match(enginePinWorkflow, /OPENFRONT_SKIP_ENGINE_DEPENDENCIES: "1"/);

const androidEmulatorDiagnostics = read("scripts/android-emulator-diagnostics.sh");
assert.match(androidEmulatorDiagnostics, /adb kill-server/);
assert.match(androidEmulatorDiagnostics, /adb start-server/);
assert.match(androidEmulatorDiagnostics, /adb reconnect offline/);
assert.match(androidEmulatorDiagnostics, /sys\.boot_completed/);
assert.match(androidEmulatorDiagnostics, /seq 1 30/);
assert.match(androidEmulatorDiagnostics, /seq 1 20/);
assert.match(androidEmulatorDiagnostics, /timeout 60s adb -s emulator-5554 wait-for-device/);
assert.match(androidEmulatorDiagnostics, /timeout 4s adb -s emulator-5554/);
assert.match(androidEmulatorDiagnostics, /cmd package list packages/);
assert.match(androidEmulatorDiagnostics, /QEMU emulator identity/);
assert.match(androidEmulatorDiagnostics, /android_capture_diagnostics/);
assert.match(androidEmulatorDiagnostics, /CLASSIFICATION=ADB_CONNECTION_FAILURE/);
assert.match(androidEmulatorDiagnostics, /CLASSIFICATION=ACTIVITY_START_FAILURE/);
assert.match(androidEmulatorDiagnostics, /CLASSIFICATION=APP_CRASH/);
assert.match(androidEmulatorDiagnostics, /CLASSIFICATION=SYSTEM_ANR/);
assert.match(androidEmulatorDiagnostics, /FATAL EXCEPTION/);
assert.match(androidEmulatorDiagnostics, /screencap -p/);
assert.match(androidEmulatorDiagnostics, /host_resource_snapshot/);
assert.match(androidEmulatorDiagnostics, /guest_resource_snapshot/);
assert.match(androidEmulatorDiagnostics, /dumpsys activity lastanr/);
assert.match(androidEmulatorDiagnostics, /adb -s emulator-5554 pull \/data\/anr/);
assert.match(androidEmulatorDiagnostics, /uiautomator dump \/sdcard\/window.xml/);
assert.match(updateValidationWorkflow, /runs-on: ubuntu-24\.04/);
function validateAndroidKvmWorkflow(workflow) {
  assert.match(workflow, /android-apk-validation:[\s\S]*?runs-on: ubuntu-24\.04/,
    "Android emulator job must use a Linux runner.");
  const preflightStart = workflow.indexOf('diag="$RUNNER_TEMP/ofrc-android-diagnostics"');
  const emulatorStart = workflow.indexOf("uses: reactivecircus/android-emulator-runner@v2");
  assert.ok(preflightStart >= 0, "KVM preflight diagnostic block is required.");
  assert.ok(emulatorStart >= 0, "Android emulator runner is required.");
  assert.ok(preflightStart < emulatorStart, "KVM preflight must run before emulator startup.");
  const preflight = workflow.slice(preflightStart, emulatorStart);
  for (const [pattern, message] of [
    [/sudo modprobe kvm/, "KVM kernel module must be enabled."],
    [/GenuineIntel[\s\S]*?sudo modprobe kvm_intel[\s\S]*?AuthenticAMD[\s\S]*?sudo modprobe kvm_amd/, "CPU-specific KVM module must be selected."],
    [/\[\[ ! -e \/dev\/kvm \]\][\s\S]*?exit 1/, "/dev/kvm absence must abort the job."],
    [/sudo chmod 666 \/dev\/kvm[\s\S]*?! -r \/dev\/kvm \|\| ! -w \/dev\/kvm[\s\S]*?exit 1/, "/dev/kvm permissions must be applied and verified."],
    [/KVM_PREFLIGHT=PASS/, "Preflight must emit an explicit success marker."]
  ]) assert.match(preflight, pattern, message);
  const emulator = workflow.slice(emulatorStart);
  assert.match(emulator, /arch: x86_64/, "Emulator architecture must be x86_64.");
  assert.match(emulator, /cores: 4/);
  assert.match(emulator, /-memory 4096/);
  assert.match(emulator, /disable-linux-hw-accel: false/,
    "Hardware acceleration must be mandatory; software fallback is forbidden.");
}
validateAndroidKvmWorkflow(updateValidationWorkflow);
test("Android KVM contract accepts the current semantic preflight", () => {
  assert.doesNotThrow(() => validateAndroidKvmWorkflow(updateValidationWorkflow));
});
test("Android KVM contract rejects a missing /dev/kvm guard", () => {
  const broken = updateValidationWorkflow.replace(/if \[\[ ! -e \/dev\/kvm \]\]; then[\s\S]*?fi/, "");
  assert.throws(() => validateAndroidKvmWorkflow(broken), /\/dev\/kvm absence/);
});
test("Android KVM contract rejects preflight placed after emulator startup", () => {
  const preflightMarker = '      - name: Enable, diagnose and verify Linux KVM before emulator startup';
  const emulatorMarker = "      - name: Test genuine published-APK in-place upgrade";
  const diagnosticsMarker = "      - name: Capture host and ADB diagnostics after emulator action";
  const preflightStart = updateValidationWorkflow.indexOf(preflightMarker);
  const emulatorStart = updateValidationWorkflow.indexOf(emulatorMarker);
  const diagnosticsStart = updateValidationWorkflow.indexOf(diagnosticsMarker);
  assert.ok(preflightStart >= 0 && emulatorStart > preflightStart && diagnosticsStart > emulatorStart,
    "The workflow must contain the preflight, emulator runner and post-emulator diagnostics in order.");

  const nextStepPattern = /^      - (?:name|uses):/gm;
  nextStepPattern.lastIndex = preflightStart + preflightMarker.length;
  const preflightEnd = nextStepPattern.exec(updateValidationWorkflow)?.index ?? -1;
  assert.ok(preflightEnd > preflightStart && preflightEnd === emulatorStart,
    "The preflight must be a standalone workflow step immediately before the emulator runner.");
  const preflightStep = updateValidationWorkflow.slice(preflightStart, preflightEnd);
  nextStepPattern.lastIndex = emulatorStart + emulatorMarker.length;
  const emulatorEnd = nextStepPattern.exec(updateValidationWorkflow)?.index ?? -1;
  assert.equal(emulatorEnd, diagnosticsStart,
    "The diagnostics step must immediately follow the complete emulator step.");
  const emulatorStep = updateValidationWorkflow.slice(emulatorStart, emulatorEnd);
  nextStepPattern.lastIndex = diagnosticsStart + diagnosticsMarker.length;
  const diagnosticsEnd = nextStepPattern.exec(updateValidationWorkflow)?.index ?? updateValidationWorkflow.length;
  const diagnosticsStep = updateValidationWorkflow.slice(diagnosticsStart, diagnosticsEnd);
  assert.match(emulatorStep, /uses: reactivecircus\/android-emulator-runner@v2/);
  assert.match(diagnosticsStep, /android_capture_diagnostics "post-emulator-action"/);

  // Move the complete preflight step after the unchanged emulator step. The
  // emulator runner itself remains at its original workflow position.
  const moved = updateValidationWorkflow.slice(0, preflightStart) +
    updateValidationWorkflow.slice(preflightEnd, emulatorStart) +
    emulatorStep +
    preflightStep +
    updateValidationWorkflow.slice(diagnosticsStart);

  assert.equal((moved.match(/uses: reactivecircus\/android-emulator-runner@v2/g) || []).length, 1,
    "The negative fixture must retain exactly one emulator runner.");
  assert.equal(moved.slice(moved.indexOf(emulatorMarker), moved.indexOf(preflightMarker)),
    emulatorStep,
    "The emulator runner step must remain unchanged in the negative fixture.");
  assert.ok(moved.indexOf(diagnosticsMarker) > moved.indexOf(preflightMarker),
    "The diagnostics step must remain after the moved preflight step.");
  assert.throws(() => validateAndroidKvmWorkflow(moved), /KVM preflight must run before emulator startup/);
});
assert.match(updateValidationWorkflow, /Capture host and ADB diagnostics after emulator action/);
assert.match(updateValidationWorkflow, /android_capture_diagnostics "post-emulator-action"/);
assert.match(androidEmulatorDiagnostics, /am start -W -n/);
const androidUpgradeBridge = read("src/renderer/androidUpgradeTestBridge.ts");
assert.match(androidUpgradeBridge, /import \{ loadImportedMatch \} from "\.\/matchStore"/);
assert.match(androidUpgradeBridge, /loadImportedMatch\(playerId, gameId\)/);
assert.match(androidUpgradeBridge, /slice\(0, 2\)/);
assert.match(androidUpgradeBridge, /replayRestored/);
assert.match(androidUpgradeBridge, /recordGameId/);
assert.match(androidUpgradeBridge, /engineCommit/);
assert.match(androidStorageInspector, /Production matchStore rehydration failed after update/);
assert.match(androidStorageInspector, /productionStoreRehydration/);
assert.match(androidEmulatorDiagnostics, /mResumedActivity|topResumedActivity/);
assert.match(updateValidationWorkflow, /ofrc-android-diagnostics/);
assert.match(updateValidationWorkflow, /bash -n scripts\/android-emulator-diagnostics\.sh/);
assert.match(androidReleaseUpgrade, /android_prepare_emulator/);
assert.match(androidReleaseUpgrade, /android_launch_package/);
assert.doesNotMatch(androidReleaseUpgrade, /sleep 300/);
assert.match(androidBaselineUiSeed, /android_launch_package/);
assert.match(androidBaselineUiSeed, /timeout 20s adb -s emulator-5554 shell uiautomator dump/);
assert.ok(!androidBaselineUiSeed.includes("dump_ui || true"));
assert.match(androidReleaseUpgrade, /install_apk "\$current_apk" true[\s\S]*?am force-stop "\$package_id"[\s\S]*?android_launch_package/);
assert.ok(androidReleaseUpgrade.includes('android_launch_package "$package_id" "the valid signed app after unsigned-APK rejection"'));
assert.ok(androidReleaseUpgrade.includes('android_launch_package "$package_id" "the original signed app after wrong-signer rejection"'));
assert.match(androidReleaseUpgrade, /pre-update app process remained alive/);

console.log("Android emulator diagnostics contract tests passed: bounded ADB restart/reconnect, separate boot/transport checks, early-failure log/screenshot capture, and classified launch outcomes.");
