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
const ciWorkflow = read(".github/workflows/ci.yml");
assert.ok(ciWorkflow.includes("github.event_name == 'push'") && ciWorkflow.includes("needs.detect-replay-changes.outputs.replay_changed == 'true'"), "Replay-sensitive commits pushed to main must trigger the live replay regression job.");
const liveReplayJob = ciWorkflow.slice(ciWorkflow.indexOf("  live-replay:"));
assert.ok(liveReplayJob.includes("needs: [detect-replay-changes, validate]") && liveReplayJob.includes("needs.validate.result == 'success'"),
  "Live replay CI must reuse the successful core engine preparation cache instead of building historical engines in parallel a second time.");
assert.match(ciWorkflow, /github\.event_name == 'schedule'/,
  "Scheduled live replay validation must still run when core validation is intentionally skipped.");
assert.ok(ciWorkflow.includes("engine-build/") && ciWorkflow.includes(".gitmodules") && ciWorkflow.includes("vendor/") && ciWorkflow.includes("scripts/(build-engines|prepare-engines|validate-engine-pin"), "Engine source, catalog and pin changes must trigger the real replay regression job.");
const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.scripts["test:opencode-config"], "node --test scripts/opencode-config.test.mjs",
  "The OpenCode specialist configuration test script must remain available.");
assert.match(ciWorkflow, /npm run test:opencode-config/,
  "CI must keep running the OpenCode specialist configuration contract, including when suites execute concurrently.");
assert.match(ciWorkflow, /xvfb-run -a npm run test:ux-ui/,
  "The responsive UI regression suite must remain in CI, including when suites execute concurrently.");
assert.match(releaseWorkflow, /paths:\s*[\s\S]*package\.json[\s\S]*package-lock\.json[\s\S]*release-on-main\.yml[\s\S]*workflow_dispatch:/,
  "Releases must be triggered by reviewed package-version changes, workflow corrections for an unpublished version, or explicit manual retries.");

assert.match(releaseWorkflow, /node --import \.\/node_modules\/tsx\/dist\/loader\.mjs/,
  "Release replay metadata validation must use root TSX, not a cache-omitted vendor dependency.");
assert.doesNotMatch(releaseWorkflow, /vendor\/OpenFrontIO\/node_modules\/tsx/,
  "Cached historical engine dependencies must not supply the release test loader.");
assert.match(releaseWorkflow, /Package version \$base_version is already released/,
  "Manual retry must skip already-published versions.");
assert.doesNotMatch(releaseWorkflow, /paths-ignore:/,
  "Release triggers must use an explicit allowlist, not a broad paths-ignore list.");

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
assert.match(branchCleanupWorkflow, /pr\.merged_at/);
assert.match(branchCleanupWorkflow, /pr\.head\.repo\?\.full_name === \x60\$\{owner\}\/\$\{repo\}\x60/,
  "Only pull requests originating in this repository may authorize branch deletion.");
assert.match(branchCleanupWorkflow, /allowlisted\.has\(pr\.head\.ref\)/,
  "Only explicitly reviewed branch names may be considered for deletion.");
assert.match(branchCleanupWorkflow, /current\.data\.commit\.sha !== mergedSha/,
  "A branch whose head moved after merge must be preserved.");
assert.match(branchCleanupWorkflow, /error\.status === 404 \|\|\s*\(error\.status === 422 && error\.message\?\.includes\("Reference does not exist"\)\)/,
  "Branch cleanup must tolerate only the explicit missing-ref 404/422 responses, not other API failures.");
assert.match(branchCleanupWorkflow, /ref: \x60heads\/\$\{branch\}\x60/);
assert.doesNotMatch(branchCleanupWorkflow, /archive\/branch-history-consolidation/,
  "The preserved branch-history archive must never be deleted by automatic cleanup.");
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
assert.match(androidStorageInspector, /\}, 90_000\);/,
  "The storage snapshot command must have a bounded longer timeout.");
assert.match(androidStorageInspector, /const bridgeReadyDeadline = Date\.now\(\) \+ 30_000;/,
  "The inspector must allow a bounded startup window for the asynchronous test bridge.");
assert.match(androidStorageInspector, /for \(let attempt = 1; attempt <= 30; attempt\+\+\)/,
  "Bridge readiness polling must be bounded by a fixed retry count.");
assert.match(androidStorageInspector, /typeof window\.__OFRC_ANDROID_UPGRADE_TEST__\?\.snapshot === 'function'/,
  "The inspector must verify that the bridge snapshot function exists before invoking it.");
assert.match(androidStorageInspector, /Android upgrade-test storage bridge did not initialize within 30 seconds/,
  "A missing bridge must remain a hard failure after bounded readiness polling.");
const androidReplayMetadataGuard = androidStorageInspector.match(/const malformedReplayRecords[\s\S]*?if \(malformedReplayRecords\.length\)/)?.[0] ?? "";
assert.match(androidReplayMetadataGuard, /!metadata\.gameId[\s\S]*?recordGameId[\s\S]*?engineCommit[\s\S]*?Number\.isInteger\(turnCount\)/,
  "Every stored replay record must retain valid identity, engine metadata and a nonnegative integer turn count.");
assert.doesNotMatch(androidReplayMetadataGuard, /turnCount < 1/,
  "Empty imported records must not be confused with failed persistence of selected full replays.");
assert.match(androidStorageInspector, /const expectedReplayIds = \["cRVdxGEG5j", "c4CW3VJWQ9"\]/,
  "The post-upgrade inspector must require rehydration of both replay IDs seeded through the published baseline UI.");
assert.match(androidStorageInspector, /selectedFullReplayRecords\.length !== expectedReplayIds\.length/,
  "Both exact UI-seeded replay records must remain complete after the upgrade.");

assert.match(androidStorageInspector, /fullReplayRecords\.length < 2/,
  "The upgrade inspector must still require at least two complete replay records.");
assert.match(androidStorageInspector, /emptyReplayRecordCount: emptyReplayRecords\.length/,
  "The inspector must report empty imported records separately for diagnosis.");
const androidStorageSnapshot = read("scripts/snapshot-android-web-storage.sh");
const androidStorageComparison = read("scripts/compare-android-web-storage.mjs");
assert.match(androidStorageComparison, /comparison: "logical-indexeddb-plus-hash-verified-localstorage-files"/,
  "Upgrade persistence must validate IndexedDB logically and hash-check Local Storage data files.");
assert.match(androidStorageComparison, /localStorageDataFileHashesCompared: true/);
assert.ok(androidStorageComparison.includes("current.sha256 !== file.sha256 || current.size !== file.size"),
  "The upgrade must fail if any persisted Local Storage data file changes.");
assert.match(androidStorageComparison, /indexedDbPhysicalTableHashesCompared: false/);
assert.match(androidStorageComparison, /if \(exact\)[\s\S]*?exact-persistent-files/,
  "Exact physical storage comparison remains required after rejected APK installs when the app is stopped.");
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
assert.match(androidReleaseUpgrade, /snapshot-android-web-storage\.sh after-unsigned-rejection/);
assert.match(androidReleaseUpgrade, /after-unsigned-rejection[\s\S]*?--exact/);
assert.match(androidReleaseUpgrade, /snapshot-android-web-storage\.sh after-signer-rejection/);
assert.match(androidReleaseUpgrade, /after-signer-rejection[\s\S]*?--exact/);
assert.ok(androidReleaseUpgrade.includes('node scripts/compare-android-web-storage.mjs "$RUNNER_TEMP/ofrc-android-storage-after/manifest.json" "$RUNNER_TEMP/ofrc-android-storage-after-signer-rejection/manifest.json" --exact'),
  "Wrong-signer rejection must compare against the pre-rejection snapshot captured after restart.");
assert.ok(!androidReleaseUpgrade.includes('ofrc-android-storage-after-negative-test/manifest.json'),
  "The exact comparison must not reference the JSON inspector output as a directory manifest.");
assert.doesNotMatch(androidReleaseUpgrade, /compare-android-upgrade-snapshots\.mjs/,
  "Negative-install data integrity must be checked before app relaunch, not against mutable analysis metadata after startup.");

assert.match(androidReleaseUpgrade, /rm -f "\$test_keystore" "\$test_signed_apk"/);
assert.doesNotMatch(androidReleaseUpgrade, /echo "\$test_password"|cat "\$test_keystore"|upload-artifact.*test_keystore/);
const androidBaselineUiSeed = read("scripts/seed-android-baseline-ui.sh");
assert.match(androidBaselineUiSeed, /uiautomator dump/);
assert.match(androidBaselineUiSeed, /UI hierarchy dump attempt/);
assert.match(androidBaselineUiSeed, /dumpsys window/);
assert.match(androidBaselineUiSeed, /ocr_find_bounds/);
assert.ok(androidBaselineUiSeed.includes('tesseract "$screen_path" stdout -l deu+eng'));
assert.match(androidBaselineUiSeed, /OpenFront-Profillink/);
assert.match(androidBaselineUiSeed, /OCR text:/);
assert.match(androidBaselineUiSeed, /local required="\$\{4:-true\}"[\s\S]*?if \[\[ "\$required" == "false" \]\]; then max_ocr_attempts=1/);
assert.match(androidBaselineUiSeed, /dismiss_android_ime\(\)[\s\S]*?dumpsys input_method[\s\S]*?mInputShown=true[\s\S]*?hidden_streak >= 2/);
assert.match(androidBaselineUiSeed, /if tap_text "Konto laden" last exact false; then[\s\S]*?input keyevent 66[\s\S]*?wait_for_profile_loaded/);
assert.match(androidBaselineUiSeed, /wait_for_profile_loaded\(\)[\s\S]*?Konto geladen[\s\S]*?\$player_id/);
assert.doesNotMatch(androidBaselineUiSeed, /authenticated Dashboard with Partien navigation/);
assert.match(androidBaselineUiSeed, /Dashboard\/Partien navigation alone is never evidence that a profile loaded/);
assert.match(androidBaselineUiSeed, /search_query=.*tr '\[:upper:\]' '\[:lower:\]'/);
assert.match(androidBaselineUiSeed, /wait_for_search_ime\(\)\s*\{\s*local ime_state="" attempt/,
  "IME polling must keep its counter local.");
assert.match(androidBaselineUiSeed, /send_search_query_by_keyevents\(\)\s*\{\s*local query="\$1" char ascii keycode index/,
  "Key-event fallback must keep its character index local.");
assert.match(androidBaselineUiSeed, /dump_ui\(\)\s*\{\s*local dump_output="" pull_output="" attempt/,
  "UI dump retries must keep their counter local so outer viewport scans can advance.");
assert.match(androidBaselineUiSeed, /wait_for_search_ime\(\)/,
  "Android search typing must wait for the IME/focus transition before injecting text.");
assert.match(androidBaselineUiSeed, /dismiss_android_ime\(\)\s*\{\s*local ime_state="" ime_state_lc="" attempt visibility_flags="" hidden_streak=0/,
  "The Android fallback must share a bounded IME-dismiss helper between profile submission and replay search.");
const androidImeDismissHelper = androidBaselineUiSeed.match(/dismiss_android_ime\(\)\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
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
assert.match(androidBaselineUiSeed, /tap_edit_field\(\)\s*\{[\s\S]*?dismiss_android_ime[\s\S]*?for attempt in \$\(seq 1 8\)/,
  "The search field must be located after the IME is dismissed, so clipped coordinates are not reused.");
assert.match(androidBaselineUiSeed, /Text input did not appear in the focused search field[\s\S]*?dismiss_android_ime[\s\S]*?tap_edit_field/,
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
const androidBaselineTapText = androidBaselineUiSeed.match(/tap_text\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
assert.match(androidBaselineTapText, /local required="\$\{4:-true\}"/);
assert.match(androidBaselineTapText, /if \[\[ "\$required" == "false" \]\]; then[\s\S]*?return 1/);
const androidLibraryNavigation = androidBaselineUiSeed.match(/navigate_to_library\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
assert.match(androidLibraryNavigation, /tap_text "Partien" last exact false/);
assert.match(androidLibraryNavigation, /require_baseline_app_window/);
assert.match(androidLibraryNavigation, /Using verified bottom-navigation fallback/);
const guardedAppWindowHelperIndex = androidBaselineUiSeed.indexOf("require_baseline_app_window() {");
const baselineLibraryNavigationCallIndex = androidBaselineUiSeed.search(/^navigate_to_library\r?$/m);
assert.ok(
  guardedAppWindowHelperIndex >= 0
    && baselineLibraryNavigationCallIndex >= 0
    && guardedAppWindowHelperIndex < baselineLibraryNavigationCallIndex,
  "The guarded app-window helper must be defined before baseline library navigation runs."
);

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

assert.match(androidStorageInspector, /ofrc-android-upgrade-snapshot-v1/);
assert.match(androidStorageInspector, /missingReplayRecords/);
assert.match(androidStorageInspector, /orphanReplayRecords/);
assert.match(androidStorageSnapshot, /adb root/);
assert.match(androidStorageSnapshot, /IndexedDB/);
assert.match(androidStorageSnapshot, /Local Storage/);
assert.match(androidStorageSnapshot, /immutableTables/);

assert.match(androidStorageSnapshot, /Local Storage/);

assert.match(androidStorageComparison, /const localStorageDataFiles = manifest => manifest\.files\.filter/);
assert.ok(androidStorageComparison.includes(String.raw`/(?:^|\/)\d+\.log$/i`),
  "The Android storage comparison must recognize numbered LevelDB write-ahead logs as persistent Local Storage data.");
assert.match(androidStorageComparison, /modifiedLocalStorageFiles\.length/,
  "Local Storage data-file hashes must be compared across the in-place update.");
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
    assert.throws(runCompare, /Missing data files/i,
      "Removing the Local Storage WAL must still fail the upgrade persistence comparison.");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
test("Android negative-install check compares exact physical WebView files", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "ofrc-android-negative-install-contract-"));
  const beforePath = join(fixtureRoot, "before.json");
  const afterPath = join(fixtureRoot, "after.json");
  const indexedDbTable = { path: "IndexedDB/https_localhost_0.indexeddb.leveldb/000005.ldb", sha256: "idb-table-hash", size: 10 };
  const localStorageWal = { path: "Local Storage/leveldb/000003.log", sha256: "local-storage-wal-hash", size: 12 };
  const manifest = { files: [indexedDbTable, localStorageWal], immutableTables: [indexedDbTable] };
  const writeManifest = value => writeFileSync(afterPath, JSON.stringify(value), "utf8");
  writeFileSync(beforePath, JSON.stringify(manifest), "utf8");
  writeManifest(manifest);
  const compareScript = fileURLToPath(new URL("../scripts/compare-android-web-storage.mjs", import.meta.url));
  const runExact = () => {
    try {
      return execFileSync(process.execPath, [compareScript, beforePath, afterPath, "--exact"], { encoding: "utf8", stdio: "pipe" });
    } catch (error) {
      throw new Error(`${error.stdout ?? ""}${error.stderr ?? ""}`);
    }
  };
  try {
    assert.match(runExact(), /exact-persistent-files/,
      "Identical persistent IndexedDB and Local Storage files must pass the negative-install comparison.");
    writeManifest({ ...manifest, files: [indexedDbTable, { ...localStorageWal, sha256: "changed-wal-hash" }] });
    assert.throws(runExact, /modified/,
      "A changed persistent file must fail the negative-install comparison.");
    writeManifest({ ...manifest, files: [indexedDbTable, localStorageWal, { path: "IndexedDB/new-table.ldb", sha256: "new-table", size: 4 }] });
    assert.throws(runExact, /added/,
      "A newly added persistent file must fail the negative-install comparison.");
    writeManifest({ ...manifest, files: [indexedDbTable] });
    assert.throws(runExact, /Missing/,
      "A missing persistent file must fail the negative-install comparison.");
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
assert.match(androidStorageComparison, /const exact = process\.argv\[4\] === "--exact"/,
  "Negative-install integrity checks must compare physical persistent files before app relaunch.");
assert.match(androidStorageComparison, /Persistent WebView files changed after failed APK install/,
  "The exact negative-install mode must fail on missing, changed or added persistent files.");


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
assert.match(appRenderer, /spotlightFindingIds/);
assert.match(appRenderer, /additionalRecurringFindings/);
assert.match(appRenderer, /additionalRecurringStrengths/);
assert.match(appRenderer, /coach-focus-target/);
assert.doesNotMatch(appRenderer, /className="adaptive-training-goals"/,
  "The three featured training goals must not be duplicated in the old adaptive-goals section.");
assert.match(matchStore, /const DB_VERSION = 4/);
assert.match(matchStore, /const REPLAY_STORE = "replay-records"/);
assert.match(matchStore, /event\.oldVersion < 4[\s\S]*?const replayRequest = replays\.get\(\[stored\.playerId, stored\.game\.gameId\]\)[\s\S]*?replays\.put\(mergedReplayRecord\)/,
  "The v4 migration must merge the existing replay-store row inside the upgrade cursor transaction.");
assert.match(matchStore, /const replayRequest = replays\.get\(\[stored\.playerId, stored\.game\.gameId\]\)/,
  "The v4 migration must read an existing v3 replay record before writing compact match payloads.");
assert.match(matchStore, /if \(replayPayload\.record != null\) mergedReplayRecord\.record = replayPayload\.record/,
  "The v4 migration must not overwrite an existing raw replay with an undefined record.");
assert.match(matchStore, /existingReplayRecord[\s\S]*?playerId: stored\.playerId,[\s\S]*?gameId: stored\.game\.gameId/,
  "The v4 migration must merge decoded action/coaching caches into the existing replay-store row.");
assert.match(matchStore, /export async function loadImportedMatch\(/);
assert.match(matchStore, /const hasReplayPayload = Boolean\(value\.replayPayload/,
  "The v4 hydrator must restore replay payloads even when a compact status update left no result summary.");
assert.match(matchStore, /value\.match\.result \|\| hasReplayPayload/,
  "Replay hydration must not be gated solely on the lightweight match result summary.");
assert.match(matchStore, /const existingRequest = matchStore\.get\(\[playerId, item\.game\.gameId\]\)/,
  "Status-only match updates must inspect the previous match before writing a compact entry.");
assert.match(matchStore, /result: existing\?\.result \?\? stored\.result/,
  "Status-only updates must preserve an existing result summary instead of erasing replay metadata.");
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
for (const workflow of engineCacheWorkflows) {
  const bundleCacheKeys = workflow.split("\n").filter(line => line.trim().startsWith("key: openfront-engine-bundles-"));
  assert.ok(bundleCacheKeys.length > 0, "Each engine workflow must define a bundle-cache key.");
  for (const cacheKey of bundleCacheKeys) {
    assert.ok(cacheKey.includes("scripts/engine-bundle-cache.mjs"),
      "Every replay-engine bundle cache key must include the verifier/fingerprint implementation.");
  }
}
const engineDiscoveryWorkflow = read(".github/workflows/discover-openfront-engine.yml");
assert.match(engineDiscoveryWorkflow, /git diff --cached --check -- \. ':!src\/renderer\/engine\/replay-engine-\*\.js'/,
  "Engine discovery must check repository-owned staged changes without failing on upstream-generated bundle whitespace.");
assert.doesNotMatch(engineDiscoveryWorkflow, /git diff --cached --check\s*$/m,
  "Engine discovery must not run the unrestricted whitespace check over generated upstream bundles.");
const engineDiscoveryScript = read("scripts/discover-openfront-engine.mjs");
assert.match(engineDiscoveryScript, /src\/renderer\/replay-engine\.d\.ts/,
  "Engine discovery must update the renderer's ambient module declarations.");
assert.match(engineDiscoveryScript, /declarations\.match\(\/declare module/,
  "The discovery script must clone a typed worker-module declaration.");
assert.match(engineDiscoveryScript, /writeFileSync\(declarationPath, declarations\)/,
  "The discovery script must persist the declaration for the generated worker.");
const engineCatalog = read("src/main/decoder/ReplayEngineCatalog.ts");
const replayEngineDeclarations = read("src/renderer/replay-engine.d.ts");
for (const match of engineCatalog.matchAll(/bundleId:\s*"([0-9a-f]{12})"/g)) {
  assert.match(replayEngineDeclarations, new RegExp('declare module "\\*replay-engine-' + match[1] + '\\.js"'),
    "Engine bundle " + match[1] + " must have an ambient renderer module declaration.");
}

const enginePreparation = read("scripts/prepare-engines.mjs");
assert.match(enginePreparation, /http\.lowSpeedLimit=0/);
assert.match(enginePreparation, /http\.lowSpeedTime=0/);
assert.match(enginePreparation, /http\.version=HTTP\/1\.1/);
assert.match(enginePreparation, /verifyEngineBundleCache[\s\S]*?skipping historical submodule checkout/,
  "A verified engine-bundle cache hit must skip historical submodule checkout and dependency installation.");
assert.match(read("scripts/build-engines.mjs"), /verifyEngineBundleCache[\s\S]*?skipping source checkout validation and rebuild/,
  "Engine build must validate cached bundle hashes and fast-path without source checkout.");
assert.match(read("scripts/engine-bundle-cache.mjs"), /manifest\.schema !== 2[\s\S]*?entry\?\.sha256 === digest/,
  "Verified engine cache must reject stale schema, missing entries and modified bundle bytes.");
const enginePinValidation = read("scripts/validate-engine-pin.mjs");
assert.match(enginePinValidation, /const cachedBundlesVerified = verifyEngineBundleCache/,
  "Engine pin validation must verify cache provenance before relying on it.");
assert.ok(enginePinValidation.includes("if (!cachedBundlesVerified) {"),
  "Unverified cache entries must still require exact source checkout validation.");
assert.match(enginePinValidation, /using integrity-checked bundles/);
assert.match(enginePinValidation, /against source checkouts/);

assert.match(enginePreparation, /attempt <= 1/);
assert.match(enginePreparation, /Do not retry in this workspace/);
assert.match(enginePreparation, /25 \* 60_000/);
assert.match(androidValidationWorkflow, /-gpu swiftshader_indirect/,
  "Android emulator validation must use indirect SwiftShader rendering to avoid unstable GPU color buffers.");
assert.match(androidValidationWorkflow, /target: google_apis/);
assert.match(androidValidationWorkflow, /cores: 4/);
assert.match(androidValidationWorkflow, /-memory 4096/);
assert.match(androidValidationWorkflow, /emulator-boot-timeout: 1800/);
const androidBaselineSeed = read("scripts/seed-android-baseline-ui.sh");
const launcherAnrGuard = androidBaselineSeed.indexOf("dismiss_pixel_launcher_anr()");
const launcherAnrInvocation = androidBaselineSeed.search(/(?:^|\r?\n)[ \t]*dismiss_pixel_launcher_anr(?:\r?\n|$)/);
const profileKeyboardGuard = androidBaselineSeed.indexOf("dismiss_android_ime() {");
const profileKeyboardCall = androidBaselineSeed.search(/dismiss_pixel_launcher_anr\r?\ndismiss_android_ime\r?\nif tap_text "Konto laden"/);
const profileOcrLookup = androidBaselineSeed.indexOf('coords="$(ocr_find_bounds "OpenFront-Profillink" 1');
const profileEditSearch = androidBaselineSeed.indexOf('find_bounds "OpenFront-Profillink" edit 1');
const launcherAnrWait = androidBaselineSeed.indexOf("android:id/aerr_wait");
const launcherAppPid = androidBaselineSeed.indexOf('pidof "$package_id"', launcherAnrGuard);
const launcherResumedApp = androidBaselineSeed.indexOf('mResumedActivity|topResumedActivity', launcherAnrGuard);
const launcherNavigationMatch = /(?:^|\r?\n)navigate_to_library(?:\r?\n|$)/.exec(androidBaselineSeed);
const launcherNavigationCall = launcherNavigationMatch?.index ?? -1;
assert.ok(launcherAnrGuard >= 0 && launcherAnrWait > launcherAnrGuard,
  "Android baseline seeding must recognize only the explicit Pixel Launcher ANR dialog and its Wait control.");
assert.ok(launcherAnrInvocation > launcherAnrGuard,
  "The Pixel Launcher ANR recovery helper must be defined before its first top-level invocation.");
assert.ok(profileKeyboardGuard >= 0 && profileKeyboardCall > profileKeyboardGuard,
  "The profile keyboard guard must be defined before the published baseline UI uses it.");
assert.match(androidBaselineSeed, /minputshown=true/,
  "The baseline script must use Android's primary IME visibility flag before dismissing the profile keyboard.");
assert.match(androidBaselineSeed, /two consecutive checks/,
  "The baseline script must verify keyboard dismissal before tapping profile controls.");
assert.ok(profileOcrLookup >= 0 && profileEditSearch > profileOcrLookup,
  "The seeder must search the profile-specific placeholder first and retry that screen's editable field before any navigation.");
assert.doesNotMatch(androidBaselineSeed, /tap_text "Dashboard" last exact false/,
  "The seeder must not tap unrelated Dashboard navigation when the initial profile placeholder is absent.");
assert.match(androidBaselineSeed, /if needle\.casefold\(\) not in label\.casefold\(\):/,
  "Editable-field lookup must match the requested placeholder, not any arbitrary EditText.");
assert.match(androidBaselineSeed, /wait_for_profile_loaded\(\)/,
  "The baseline seeder must verify an explicit account-loaded result before accepting profile data.");
assert.match(androidBaselineSeed, /Dashboard\/Partien navigation alone is never evidence that a profile loaded/,
  "Dashboard navigation alone must never count as evidence that the archived profile was loaded.");
assert.match(androidBaselineSeed, /input keyevent 66/,
  "If the submit button is not exposed, the profile form may use its guarded Enter submit handler.");
assert.ok(launcherAppPid > launcherAnrWait && launcherResumedApp > launcherAppPid,
  "The launcher ANR Wait action must require the published app process and resumed activity to remain alive.");
assert.ok(launcherNavigationCall > androidBaselineSeed.indexOf("require_baseline_app_window() {"),
  "The foreground-window guard must be defined before top-level UI navigation invokes it.");
assert.match(androidBaselineSeed, /refusing coordinate fallback/,
  "Launcher ANR recovery must fail closed instead of guessing dialog coordinates.");
assert.match(androidBaselineSeed, /for attempt in \$\(seq 1 15\); do[\s\S]*?dismiss_pixel_launcher_anr[\s\S]*?if dump_ui/,
  "Profile-field polling must recover a verified launcher ANR overlay before reading the published UI.");
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
assert.match(androidUpgradeBridge, /name === "analysis-results"/,
  "The Android persistence inspector must inspect the v4 analysis payload store.");
assert.match(androidUpgradeBridge, /const analyses = summaries\.get\("analysis-results"\)/,
  "The Android upgrade bridge must read verified analyses from the v4 analysis-results store.");
assert.match(androidUpgradeBridge, /const analysisMetadata = analyses\.map\(record => record\.metadata \?\? \{\}\)/);
assert.match(androidUpgradeBridge, /const verifiedAnalyses = analysisMetadata\.filter\(item => item\.playerId === playerId[\s\S]*?matchIds\.has/,
  "The bridge must validate verified analyses against the selected player's match IDs, not the lightweight match index.");
assert.match(androidUpgradeBridge, /diagnostics:\s*\{/,
  "The Android bridge must return store/profile/analysis diagnostics before acceptance assertions.");
assert.match(androidUpgradeBridge, /analysisMetadata,\s*\},\s*appVersion:/,
  "The diagnostics block must be a complete object before the snapshot metadata.");
assert.doesNotMatch(androidUpgradeBridge, /if \(!verifiedAnalyses\.length\) throw/,
  "The bridge must return diagnostic snapshots when analysis results are missing; the inspector owns fail-closed acceptance.");
assert.match(androidStorageInspector, /if \(!verifiedAnalyses\.length\) throw/,
  "The external inspector must still fail closed when no verified persisted analysis survives.");
assert.doesNotMatch(androidUpgradeBridge, /const verifiedAnalyses = matchMetadata\.filter/,
  "The bridge must not look for v4 simulation payloads in the lightweight matches index.");
assert.match(androidUpgradeBridge, /simulationStatus:[\s\S]*?sampleCount:[\s\S]*?actionReviewCount:/,
  "The test bridge must expose analysis payload status and evidence counts without serializing payloads.");
assert.match(androidStorageInspector, /const analyses = stores\["analysis-results"\]/,
  "The post-upgrade inspector must validate persisted analysis records from their dedicated IndexedDB store.");
assert.match(androidStorageInspector, /analysisMetadata\.filter[\s\S]*?item\.playerId === playerId[\s\S]*?matchIds\.has/,
  "Verified analysis results must be linked to the UI-seeded player and existing match IDs.");
assert.match(androidUpgradeBridge, /loadImportedMatch\(playerId, gameId\)/);
assert.match(androidUpgradeBridge, /tx\.oncomplete = \(\) => \{[\s\S]*?transactionComplete = true[\s\S]*?finish\(\)/);
assert.match(androidUpgradeBridge, /transactionComplete && summariesComplete/,
  "The Android storage inspector must wait for read transactions to finish before closing its IndexedDB connection.");
assert.match(androidUpgradeBridge, /updatedAtType:[\s\S]*?resultKeys:[\s\S]*?hasSimulation:/,
  "Migration diagnostics must include legacy timestamps and inline payload presence to isolate versionchange failures.");
const diagnosticDbClose = androidUpgradeBridge.indexOf("db.close();");
const bridgeRehydrate = androidUpgradeBridge.indexOf("const rehydrate = async");
const productionHydration = androidUpgradeBridge.indexOf("loadImportedMatch(playerId, gameId)");
assert.ok(diagnosticDbClose >= 0 && diagnosticDbClose < bridgeRehydrate && bridgeRehydrate < productionHydration,
  "The diagnostic IndexedDB connection must close and the snapshot must be returned before production rehydration runs separately.");
assert.match(androidUpgradeBridge, /value: Object\.freeze\(\{ snapshot, rehydrate \}\)/,
  "The Android bridge must expose diagnostic snapshot and separate production rehydration methods.");
assert.match(androidUpgradeBridge, /rehydration: null/,
  "The raw storage snapshot must not depend on production rehydration completing.");
const initialSnapshotWrite = androidStorageInspector.indexOf("writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));");
const separateRehydration = androidStorageInspector.indexOf("window.__OFRC_ANDROID_UPGRADE_TEST__.rehydrate()");
assert.ok(initialSnapshotWrite >= 0 && separateRehydration > initialSnapshotWrite,
  "The inspector must persist raw storage evidence before production rehydration.");
assert.match(androidStorageInspector, /exceptionDetails: details/,
  "The inspector must retain the full CDP exception details when rehydration fails.");
const replayPersistenceHarness = read("scripts/replay-engine-test.ts");
assert.match(replayPersistenceHarness, /const saved = await loadImportedMatch\("ci-persistence-player", gameId\)/,
  "Refresh persistence tests must hydrate the full analysis payload from analysis-results, not the lightweight library index.");
assert.match(replayPersistenceHarness, /actionReviewCount: saved\?\.simulation\?\.actionReviews\?\.length \?\? 0/,
  "Refresh persistence tests must confirm the stored action-review evidence survives hydration.");
assert.match(androidUpgradeBridge, /const requiredGameIds = \["cRVdxGEG5j", "c4CW3VJWQ9"\]/);
assert.doesNotMatch(androidUpgradeBridge, /slice\(0, 2\)/,
  "The inspector must rehydrate the exact UI-seeded replay IDs, not arbitrary first records.");
assert.match(androidUpgradeBridge, /openCursor\(\)/,
  "Storage inspection must use bounded cursor summaries instead of materializing full replay payloads.");
assert.match(androidUpgradeBridge, /summarySha256/);
assert.doesNotMatch(androidUpgradeBridge, /sha256\(value\)/,
  "The semantic bridge must not hash every large replay payload; exact LevelDB file hashes cover storage integrity.");
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
const finalStorageComparison = androidReleaseUpgrade.lastIndexOf("node scripts/compare-android-web-storage.mjs");
const finalColdStart = androidReleaseUpgrade.lastIndexOf('android_launch_package "$package_id" "the original signed app after final persistent-file comparison"');
const finalRunningCheck = androidReleaseUpgrade.indexOf("if ! adb_cmd shell pidof", finalStorageComparison);
assert.ok(finalStorageComparison >= 0 && finalColdStart > finalStorageComparison && finalRunningCheck > finalColdStart,
  "The final app-running assertion must follow a cold-start after the final exact storage snapshot comparison.");
assert.doesNotMatch(androidReleaseUpgrade.slice(finalColdStart, finalRunningCheck), /am force-stop/,
  "The release-upgrade test must not force-stop the app after the final cold-start and before asserting it remains running.");

console.log("Android emulator diagnostics contract tests passed: bounded ADB restart/reconnect, separate boot/transport checks, early-failure log/screenshot capture, and classified launch outcomes.");
