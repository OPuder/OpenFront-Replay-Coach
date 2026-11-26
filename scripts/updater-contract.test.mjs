import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const updater = read("src/main/updater.ts");
const android = read("android-updater-template/ApkUpdaterPlugin.java");
const installer = read("scripts/install-android-updater-plugin.mjs");
const renderer = read("src/renderer/UpdateCenter.tsx");
const versionScript = read("scripts/set-release-version.mjs");
const releaseWorkflow = read(".github/workflows/release-on-main.yml");
const branchCleanupWorkflow = read(".github/workflows/cleanup-merged-branches.yml");
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
assert.match(installer, /ApplicationInfo\.FLAG_DEBUGGABLE/);
assert.match(installer, /WebView\.setWebContentsDebuggingEnabled\(true\)/);
assert.match(installer, /if \(\(getApplicationInfo\(\)\.flags & android\.content\.pm\.ApplicationInfo\.FLAG_DEBUGGABLE\) != 0\)/,
  "WebView storage inspection must be enabled only for debuggable Android test builds.");
assert.match(renderer, /installDesktopUpdate/);
assert.match(renderer, /installAndroidUpdate/);
assert.doesNotMatch(renderer, /androidAutoUpdateAttempted/);
assert.match(renderer, /registerPlugin<ApkUpdaterPlugin>/);
assert.match(renderer, /version: latestVersion/);
assert.match(renderer, /keine Android-APK veröffentlicht/);
assert.doesNotMatch(renderer, /Web\/PWA|serviceWorker|isBrowserPwa/);
assert.doesNotMatch(releaseWorkflow, /assembleDebug/);
assert.match(releaseWorkflow, /push:\s*branches: \[main\]/);
assert.match(releaseWorkflow, /paths-ignore:[\s\S]*scripts\/prepare-engines\.mjs[\s\S]*scripts\/install-android-updater-plugin\.mjs[\s\S]*scripts\/updater-contract\.test\.mjs/,
  "Tooling-only integration commits must not publish an application release.");

assert.match(releaseWorkflow, /permanent Android release signing key is required/);
assert.ok(releaseWorkflow.includes("grep -Eo '[[:xdigit:]]{64}'"), "Release workflow must extract SHA-256 certificate fingerprints robustly.");
assert.match(releaseWorkflow, /Android signing certificate changed/);
assert.match(releaseWorkflow, /needs\.build-android\.outputs\.signing_mode == 'permanent release key'/);
assert.match(releaseWorkflow, /^permissions:\s*\n\s+contents: read/m,
  "Release preparation must be read-only; only the publishing job may write release assets.");
assert.doesNotMatch(releaseWorkflow, /git push origin HEAD:main|git push origin main/,
  "Release automation must never push commits directly to main.");
assert.doesNotMatch(releaseWorkflow, /git commit -m "chore\(release\): prepare/,
  "Release automation must not create unreviewed version commits.");
assert.match(releaseWorkflow, /package-lock\.json version/,
  "The release gate must verify package.json and package-lock.json versions match.");
assert.match(releaseWorkflow, /A version bump must be reviewed and merged through a pull request/,
  "A new release must require a reviewed version bump.");
assert.match(releaseWorkflow, /Package version .* is older than the latest release/,
  "A package version older than the latest tag must fail closed.");
assert.match(releaseWorkflow, /No repository files are modified or pushed/,
  "Release selection must not mutate repository files.");

assert.match(branchCleanupWorkflow, /types: \[closed\]/);
assert.match(branchCleanupWorkflow, /pr\.merged/);
assert.match(branchCleanupWorkflow, /error\.status === 404 \|\| \(error\.status === 422 && error\.message\?\.includes\("Reference does not exist"\)\)/,
  "Branch cleanup must tolerate only the explicit missing-ref 404/422 responses, not other API failures.");
assert.match(branchCleanupWorkflow, /if \(pr\.merged && allowlisted\.has\(pr\.head\.ref\)\)/,
  "Branch deletion must require a merged PR; closing PR #165 unmerged must not delete its source branch.");
assert.match(branchCleanupWorkflow, /pr\.number === 166/);
assert.doesNotMatch(branchCleanupWorkflow, /pr\.number === 165/,
  "An unmerged modernization branch must be preserved until its remaining changes are reviewed and transferred.");
assert.match(branchCleanupWorkflow, /fix\/current-workflow-contracts/);
assert.match(branchCleanupWorkflow, /fix\/engine-preparation-workflow-timeouts/);
assert.match(branchCleanupWorkflow, /integration\/replay-coaching-ux/);
assert.match(branchCleanupWorkflow, /integration\/engine-modernization/);
assert.doesNotMatch(branchCleanupWorkflow, /archive\/branch-history-consolidation/,
  "The preserved branch-history archive must never be deleted by automatic cleanup.");

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
assert.match(updater, /Portable-Dateien wurden nicht aktualisiert/);
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

assert.match(androidStorageInspector, /AbortSignal\.timeout\(15_000\)/,
  "The WebView inspector must bound its DevTools discovery request.");
assert.match(androidStorageInspector, /function send\(method, params = \{\}, timeoutMs = 30_000\)/,
  "The WebView inspector must bound every DevTools command.");
assert.match(androidStorageInspector, /\}, 60_000\);/,
  "The storage snapshot command must have a bounded longer timeout.");
const androidReplayMetadataGuard = androidStorageInspector.match(/const malformedReplayRecords[\s\S]*?if \(malformedReplayRecords\.length\)/)?.[0] ?? "";
assert.match(androidReplayMetadataGuard, /!metadata\.gameId[\s\S]*?recordGameId[\s\S]*?engineCommit[\s\S]*?Number\.isInteger\(turnCount\)/,
  "Every stored replay record must retain valid identity, engine metadata and a nonnegative integer turn count.");
assert.doesNotMatch(androidReplayMetadataGuard, /turnCount < 1/,
  "Empty imported records must not be confused with failed persistence of selected full replays.");
assert.match(androidStorageInspector, /fullReplayRecords\.length < 2/,
  "The upgrade inspector must still require at least two complete replay records.");
assert.match(androidStorageInspector, /emptyReplayRecordCount: emptyReplayRecords\.length/,
  "The inspector must report empty imported records separately for diagnosis.");
const androidStorageSnapshot = read("scripts/snapshot-android-web-storage.sh");
const androidUnsignedNegative = read("scripts/create-android-unsigned-negative-apk.py");

assert.match(updateValidationWorkflow, /Download and verify exact public v2\.2\.51 Android baseline/);
assert.match(updateValidationWorkflow, /Build higher-version candidate with the permanent release key/);
assert.match(updateValidationWorkflow, /Test genuine published-APK in-place upgrade on Android emulator[\s\S]*?bash scripts\/test-android-release-upgrade\.sh/);
assert.match(updateValidationWorkflow, /Build separate non-debuggable production APK without test inspector/);
assert.match(updateValidationWorkflow, /Download uploaded APK for byte-for-byte verification/);
assert.match(updateValidationWorkflow, /Verify uploaded production APK hash and signature/);
assert.match(updateValidationWorkflow, /Verify permanent Android release signing key and continuity[\s\S]*?if: always\(\) && steps\.release_candidate\.outcome == 'success' && \(github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository\)/,
  "Signing continuity must run only after a candidate APK has been built successfully.");
assert.match(androidSigningGate, /ANDROID_UPGRADE_TEST_BUILD/);
assert.match(androidSigningGate, /assembleDebug/);
assert.match(androidSigningGate, /assembleRelease/);
assert.match(androidSigningGate, /ANDROID_SIGNING_VERIFY_ONLY/);
assert.match(androidSigningConfigurator, /signingConfig signingConfigs\.release/);
assert.match(androidSigningConfigurator, /debuggable: "true"/);
assert.match(androidSigningConfigurator, /debuggable: "false"/);
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
assert.match(androidBaselineUiSeed, /ocr_find_bounds/);
assert.ok(androidBaselineUiSeed.includes('tesseract "$screen_path" stdout -l deu+eng'));
assert.match(androidBaselineUiSeed, /OpenFront-Profillink/);
assert.match(androidBaselineUiSeed, /OCR text:/);
assert.match(androidBaselineUiSeed, /search_query=.*tr '\[:upper:\]' '\[:lower:\]'/);
assert.match(androidBaselineUiSeed, /wait_for_search_ime\(\)\s*\{\s*local ime_state="" attempt/,
  "IME polling must keep its counter local.");
assert.match(androidBaselineUiSeed, /send_search_query_by_keyevents\(\)\s*\{\s*local query="\$1" char ascii keycode index/,
  "Key-event fallback must keep its character index local.");
assert.match(androidBaselineUiSeed, /dump_ui\(\)\s*\{\s*local dump_output="" pull_output="" attempt/,
  "UI dump retries must keep their counter local so outer viewport scans can advance.");
assert.match(androidBaselineUiSeed, /wait_for_search_ime\(\)/,
  "Android search typing must wait for the IME/focus transition before injecting text.");
assert.match(androidBaselineUiSeed, /dismiss_search_ime\(\)\s*\{\s*local ime_state="" ime_state_lc="" attempt visibility_flags="" hidden_streak=0/,
  "The Android fallback must have a bounded helper to dismiss the keyboard and log its state.");
const androidImeDismissHelper = androidBaselineUiSeed.match(/dismiss_search_ime\(\)\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
assert.match(androidImeDismissHelper, /visible_pattern='minputshown=true'/,
  "Only the authoritative mInputShown=true flag may trigger Back.");
assert.match(androidImeDismissHelper, /hidden_pattern='minputshown=false'/,
  "The authoritative hidden IME flag must be checked before coordinate taps.");
assert.match(androidImeDismissHelper, /mInputShown=false[\s\S]*?secondary IME view flags as diagnostic only[\s\S]*?never sending Back/,
  "Secondary IME view flags must not override a stable hidden primary input-window flag.");
assert.match(androidImeDismissHelper, /hidden_streak >= 2[\s\S]*?require_baseline_app_window[\s\S]*?return 0/,
  "The hidden primary IME state must remain stable for two checks while the baseline app is foregrounded before tapping.");
assert.match(androidImeDismissHelper, /(?:minputviewshown=true|isinputviewshown=true)[\s\S]*?stale/,
  "Secondary view flags may be stale and must be logged rather than trigger Back.");
assert.match(androidImeDismissHelper, /require_baseline_app_window[\s\S]*?input keyevent 4/,
  "Back must be guarded by a verified foreground baseline app.");
assert.match(androidImeDismissHelper, /mInputShown=false[\s\S]*?never sending Back/,
  "A hidden keyboard must never trigger Back and close the app.");
assert.doesNotMatch(androidImeDismissHelper, /mShowRequested=true/,
  "A stale IME show request must not trigger Android Back after the keyboard is already hidden.");
assert.match(androidBaselineUiSeed, /baseline_app_window_is_focused\(\)\s*\{[\s\S]*?mCurrentFocus=[\s\S]*?NotificationShade/,
  "The baseline seed must distinguish the app window from notification shade or launcher focus.");
assert.match(androidBaselineUiSeed, /require_baseline_app_window[\s\S]*?input swipe 500 700 500 1250/,
  "Scroll gestures must be guarded by app focus and start away from the status-bar gesture region.");
assert.doesNotMatch(androidBaselineUiSeed, /input swipe 500 350 500 1500/,
  "The old down-swipe starting near the system shade must not return.");
assert.match(androidBaselineUiSeed, /tap_edit_field\(\)\s*\{[\s\S]*?dismiss_search_ime[\s\S]*?for attempt in \$\(seq 1 8\)/,
  "The search field must be located after the IME is dismissed, so clipped coordinates are not reused.");
assert.match(androidBaselineUiSeed, /Text input did not appear in the focused search field[\s\S]*?dismiss_search_ime[\s\S]*?tap_edit_field/,
  "The key-event fallback must dismiss the keyboard before re-focusing the search field.");
assert.match(androidBaselineUiSeed, /tap_edit_field 1 "\$current_search_query"[\s\S]*?wait_for_search_ime[\s\S]*?if \[\[ "\$clear_search" == "true" \]\]/,
  "Clear/select commands must run only after the input method is ready.");
assert.match(androidBaselineUiSeed, /send_search_query_by_keyevents/,
  "Search IDs must have a key-event fallback when adb shell input text is dropped.");
assert.match(androidBaselineUiSeed, /for keycode in "\$\{keycodes\[@\]\}"; do/,
  "Key-event fallback must send the keycodes sequentially rather than pass an unsupported multi-key command.");
assert.match(androidBaselineUiSeed, /shell input keyevent "\$keycode"/,
  "The key-event fallback must inject each mapped Android keycode individually.");
assert.match(androidBaselineUiSeed, /keycode=\$\(\(ascii - 68\)\)/,
  "The fallback must map lowercase letters to Android KEYCODE_A-Z.");
assert.match(androidBaselineUiSeed, /keycode=\$\(\(ascii - 41\)\)/,
  "The fallback must map digits to Android keycodes.");
assert.match(androidBaselineUiSeed, /Android text input and key-event fallback both failed/,
  "The test must fail closed when neither input method produces a verified query.");

assert.match(androidBaselineUiSeed, /navigate_to_library/);
assert.match(androidBaselineUiSeed, /Using verified bottom-navigation fallback/);
assert.match(androidBaselineUiSeed, /wait_for_library_page\(\)\s*\{/,
  "Library page verification helper must be declared before it is called.");
assert.match(androidBaselineUiSeed, /Retrying the visible Partien navigation label/);
assert.match(androidBaselineUiSeed, /wait_for_library_page 12/);
assert.match(androidBaselineUiSeed, /screenshot OCR/);

assert.match(androidBaselineUiSeed, /grep -Fi "\$game_id" "\$ui_xml"/);
assert.doesNotMatch(androidBaselineUiSeed, /create_verified_training_goal/,
  "The published v2.2.51 baseline must not be forced to expose a training CTA when its verified replay has no actionable finding.");
assert.match(androidStorageInspector, /if \(trainingGoal && !matchIds\.has/,
  "A baseline training goal is optional, but any existing goal must reference a persisted match.");
assert.match(androidStorageInspector, /trainingGoalPresent: Boolean\(trainingGoal\)/,
  "Storage validation must report whether a goal was preserved without requiring one to exist.");
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

assert.match(androidStorageSnapshot, /Local Storage/);
const androidStorageComparison = read("scripts/compare-android-web-storage.mjs");
assert.match(androidStorageComparison, /const localStorageDataFiles = manifest => manifest\.files\.filter/);
assert.match(androidStorageComparison, /(?:^|\\/)\\d+\\.log\$/i,
  "The Android storage comparison must recognize numbered LevelDB write-ahead logs as persistent Local Storage data.");
assert.match(androidStorageComparison, /Persistent Local Storage data changed across the APK upgrade/,
  "Local Storage WALs and immutable tables must be hash-compared across the in-place update.");
assert.doesNotMatch(androidStorageComparison, /if \(!beforeIndexedTables\.length \|\| !beforeLocalStorageTables\.length\)/,
  "Local Storage persistence must not require compaction into an immutable table when the baseline contains a data-bearing WAL.");
test("Android storage comparison preserves Local Storage WAL-only data", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "ofrc-android-storage-contract-"));
  const beforeDir = join(fixtureRoot, "ofrc-android-storage-before");
  const afterDir = join(fixtureRoot, "ofrc-android-storage-after");
  mkdirSync(beforeDir, { recursive: true });
  mkdirSync(afterDir, { recursive: true });
  const indexedDbTable = { path: "IndexedDB/https_localhost_0.indexeddb.leveldb/000005.ldb", sha256: "idb-table-hash" };
  const localStorageWal = { path: "Local Storage/leveldb/000003.log", sha256: "local-storage-wal-hash" };
  const manifest = { files: [indexedDbTable, localStorageWal], immutableTables: [indexedDbTable] };
  const writeManifest = (dir, value) => writeFileSync(join(dir, "manifest.json"), JSON.stringify(value), "utf8");
  writeManifest(beforeDir, manifest);
  writeManifest(afterDir, manifest);
  const compareScript = fileURLToPath(new URL("../scripts/compare-android-web-storage.mjs", import.meta.url));
  const runCompare = () => {
    try {
      return execFileSync(process.execPath, [compareScript], {
        env: { ...process.env, RUNNER_TEMP: fixtureRoot },
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (error) {
      throw new Error(`${error.stdout ?? ""}${error.stderr ?? ""}`);
    }
  };
  try {
    assert.match(runCompare(), /"result": "PASS"/,
      "A Local Storage WAL-only baseline must pass when the numbered log is preserved byte-for-byte.");
    writeManifest(afterDir, { ...manifest, files: [indexedDbTable, { ...localStorageWal, sha256: "changed-wal-hash" }] });
    assert.throws(runCompare, /modified data files/,
      "Changing the Local Storage WAL must still fail the upgrade persistence comparison.");
    writeManifest(afterDir, { ...manifest, files: [indexedDbTable] });
    assert.throws(runCompare, /missing data files/,
      "Removing the Local Storage WAL must still fail the upgrade persistence comparison.");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
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


// Validate the engine-object cache in the workflows that actually exist on main.
// The CI workflow deliberately shares one cache between its core and live-replay jobs;
// release and update validation may scope caches by job. Do not hard-code retired
// workflow filenames or require one cache-key strategy for every workflow.
// Every engine-preparation workflow shares the same exact-object cache key.
// This avoids repeated historical submodule fetches across jobs and workflows.
const engineCacheWorkflows = [
  read(".github/workflows/ci.yml"),
  read(".github/workflows/discover-openfront-engine.yml"),
  read(".github/workflows/update-validation.yml"),
  read(".github/workflows/release-on-main.yml"),
];
for (const workflow of engineCacheWorkflows) {
  assert.match(workflow, /actions\/cache@v4[\s\S]*?path: \.git\/modules[\s\S]*?key: openfront-engine-git-\$\{\{ runner\.os \}\}-\$\{\{ hashFiles\('\.gitmodules', 'engine-build\/engines\.json'\) \}\}/,
    "Engine cache must be keyed by runner OS, .gitmodules and the exact engine catalog.");
  assert.doesNotMatch(workflow, /openfront-engine-git-\$\{\{ runner\.os \}\}-\$\{\{ github\.job \}\}/,
    "Engine Git objects must be shared across jobs.");
}

const engineDiscoveryWorkflow = read(".github/workflows/discover-openfront-engine.yml");
assert.match(engineDiscoveryWorkflow, /git diff --cached --check -- \. ':!src\/renderer\/engine\/replay-engine-\*\.js'/,
  "Engine discovery must check repository-owned staged changes without failing on upstream-generated bundle whitespace.");
assert.doesNotMatch(engineDiscoveryWorkflow, /git diff --cached --check\s*$/m,
  "Engine discovery must not run the unrestricted whitespace check over generated upstream bundles.");
const enginePreparation = read("scripts/prepare-engines.mjs");
assert.match(enginePreparation, /http\.lowSpeedLimit=0/);
assert.match(enginePreparation, /http\.lowSpeedTime=0/);
assert.match(enginePreparation, /http\.version=HTTP\/1\.1/);
assert.match(enginePreparation, /attempt <= 4/);
assert.match(enginePreparation, /12 \* 60_000/);
assert.match(enginePreparation, /Wait before submodule retry", 60_000\)/,
  "The retry wait timeout must exceed the longest bounded retry delay.");
assert.match(enginePreparation, /Initialize exact OpenFront engine submodules/);
assert.match(androidValidationWorkflow, /-gpu software/,
  "Android emulator validation must use stable software rendering instead of flaky GPU color buffers.");
const androidBaselineSeed = read("scripts/seed-android-baseline-ui.sh");
assert.match(androidBaselineSeed, /seed_verified_match "cRVdxGEG5j"/,
  "The baseline fixture must seed its first real replay through the published app UI.");
assert.match(androidBaselineSeed, /seed_verified_match "c4CW3VJWQ9"/,
  "The baseline fixture must seed its second real replay through the published app UI.");
assert.doesNotMatch(androidBaselineSeed, /create_verified_training_goal/,
  "Baseline seeding must not require a training-goal CTA that may not exist in the published app.");
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
  assert.match(emulator, /cores: 2/);
  assert.match(emulator, /-memory 3072/);
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
assert.match(androidBaselineUiSeed, /^navigate_to_library$/m, "The baseline UI seed must invoke the library navigation helper.");
assert.match(androidBaselineUiSeed, /timeout 20s adb -s emulator-5554 shell uiautomator dump/);
assert.ok(!androidBaselineUiSeed.includes("dump_ui || true"));
assert.match(androidReleaseUpgrade, /install_apk "\$current_apk" true[\s\S]*?am force-stop "\$package_id"[\s\S]*?android_launch_package/);
assert.ok(androidReleaseUpgrade.includes('android_launch_package "$package_id" "the valid signed app after unsigned-APK rejection"'));
assert.ok(androidReleaseUpgrade.includes('android_launch_package "$package_id" "the original signed app after wrong-signer rejection"'));
assert.match(androidReleaseUpgrade, /pre-update app process remained alive/);

console.log("Android emulator diagnostics contract tests passed: bounded ADB restart/reconnect, separate boot/transport checks, early-failure log/screenshot capture, and classified launch outcomes.");
