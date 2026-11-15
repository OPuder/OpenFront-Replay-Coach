#!/usr/bin/env bash
set -Eeuo pipefail

package_id="de.openfront.replaycoach"
version="${RELEASE_VERSION:-$(node -p "require('./package.json').version")}"
current_apk="${OPENFRONT_CURRENT_APK:-release/OpenFront-Replay-Coach-${version}-Android.apk}"
previous_apk="${PREVIOUS_APK:?PREVIOUS_APK is required}"

log() { echo "::notice::[Android release upgrade] $*"; }
fail() { echo "::error::[Android release upgrade] $*"; exit 1; }
adb_cmd() { timeout 60s adb -s emulator-5554 "$@"; }

test -s "$previous_apk" || fail "Previous published Android APK is missing."
test -s "$current_apk" || fail "Current signed release APK is missing."
build_tools="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
apksigner="$build_tools/apksigner"
aapt="$build_tools/aapt"

"$apksigner" verify --verbose "$previous_apk" >/dev/null || fail "Previous published APK signature is invalid."
"$apksigner" verify --verbose "$current_apk" >/dev/null || fail "Current release APK signature is invalid."
previous_badging="$("$aapt" dump badging "$previous_apk" | sed -n '1p')"
current_badging="$("$aapt" dump badging "$current_apk" | sed -n '1p')"
previous_package="$(sed -E "s/.*package: name='([^']+)'.*/\1/" <<< "$previous_badging")"
current_package="$(sed -E "s/.*package: name='([^']+)'.*/\1/" <<< "$current_badging")"
previous_version_code="$(sed -E "s/.*versionCode='([0-9]+)'.*/\1/" <<< "$previous_badging")"
current_version_code="$(sed -E "s/.*versionCode='([0-9]+)'.*/\1/" <<< "$current_badging")"
[[ "$previous_package" == "$package_id" && "$current_package" == "$package_id" ]] || fail "Published APK package identity does not match $package_id."
[[ "$previous_version_code" =~ ^[0-9]+$ && "$current_version_code" =~ ^[0-9]+$ ]] || fail "Could not read APK versionCode metadata."
(( current_version_code > previous_version_code )) || fail "Release versionCode $current_version_code is not newer than published versionCode $previous_version_code."

log "Starting ADB and waiting for the release emulator."
timeout 30s adb start-server || fail "Android Debug Bridge server could not be started."
timeout 30s adb devices -l || fail "Android Debug Bridge server did not respond."
timeout 90s adb -s emulator-5554 wait-for-device || fail "Android emulator did not connect to ADB."
booted=false
for attempt in $(seq 1 30); do
  state="$(timeout 5s adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  if [[ "$state" == "1" ]]; then booted=true; break; fi
  sleep 2
done
[[ "$booted" == true ]] || fail "Android emulator did not finish booting within 150 seconds."

package_manager_ready=false
for attempt in $(seq 1 9); do
  package_list="$(timeout 8s adb -s emulator-5554 shell cmd package list packages 2>&1 || true)"
  if grep -q '^package:' <<< "$package_list"; then package_manager_ready=true; break; fi
  log "Package Manager not ready (attempt $attempt/9): ${package_list:-no response}"
  sleep 2
done
[[ "$package_manager_ready" == true ]] || fail "Android Package Manager did not become ready within 90 seconds."

install_apk() {
  local apk="$1"
  local replace="$2"
  local output=""
  for attempt in 1 2 3; do
    local install_status=0
    if [[ "$replace" == "true" ]]; then
      output="$(timeout --signal=INT --kill-after=15s 240s adb -s emulator-5554 install --no-streaming -r "$apk" 2>&1)" || install_status=$?
    else
      output="$(timeout --signal=INT --kill-after=15s 240s adb -s emulator-5554 install --no-streaming "$apk" 2>&1)" || install_status=$?
    fi
    if [[ "$install_status" -eq 0 ]]; then log "$output"; return 0; fi
    log "APK install failed (attempt $attempt/3; exit $install_status): ${output:-no output from adb install}"
    if [[ "$attempt" -eq 3 ]]; then
      log "Collecting emulator diagnostics after APK installation failure."
      timeout 20s adb -s emulator-5554 get-state 2>&1 || true
      timeout 20s adb -s emulator-5554 shell df -h /data 2>&1 || true
      timeout 20s adb -s emulator-5554 shell cmd package list packages 2>&1 | tail -n 40 || true
      timeout 20s adb -s emulator-5554 logcat -d -t 400 2>&1 | grep -E "PackageManager|installd|vold|INSTALL_|FATAL EXCEPTION|AndroidRuntime" | tail -n 100 || true
    fi
    [[ "$attempt" -lt 3 ]] && sleep 5
  done
  fail "Android could not install $apk after retries: $output"
}

log "Installing previous published APK (versionCode $previous_version_code)."
install_apk "$previous_apk" false
log "Creating a realistic baseline through the published application's actual UI."
bash scripts/seed-android-baseline-ui.sh
bash scripts/snapshot-android-web-storage.sh before
log "Upgrading in place from the exact published $previous_version_code APK to the permanent-key test candidate (versionCode $current_version_code)."
install_apk "$current_apk" true

# Keep the upgrade offline after the baseline was seeded. This prevents background
# profile refresh from introducing unrelated records while storage integrity is checked.
adb_cmd shell svc wifi disable >/dev/null 2>&1 || true
adb_cmd shell svc data disable >/dev/null 2>&1 || true

installed="$(adb_cmd shell dumpsys package "$package_id")" || fail "Could not inspect the upgraded Android package."
grep -F "versionCode=$current_version_code" <<< "$installed" >/dev/null || fail "Installed package does not report release versionCode $current_version_code."
launcher="$(adb_cmd shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER "$package_id" | tr -d '\r' | tail -n 1)" || fail "Could not resolve release launcher activity."
[[ "$launcher" == */* ]] || fail "Could not resolve the current release APK launcher activity."
launch_status=0
launch_output="$(adb_cmd shell am start -W -n "$launcher" 2>&1)" || launch_status=$?
log "Release launcher response (exit $launch_status): ${launch_output:-no output}"
started=false
for attempt in $(seq 1 60); do
  process_id="$(adb_cmd shell pidof "$package_id" 2>/dev/null | tr -d '\r' || true)"
  if [[ -n "$process_id" ]]; then
    activity_state="$(adb_cmd shell dumpsys activity activities 2>&1 || true)"
    if grep -E "mResumedActivity|topResumedActivity" <<< "$activity_state" | grep -F "$launcher" >/dev/null; then
      started=true
      break
    fi
  fi
  sleep 2
done
if [[ "$started" != true ]]; then
  log "Release app launch diagnostics:"
  adb_cmd shell pidof "$package_id" 2>&1 || true
  adb_cmd shell dumpsys activity activities 2>&1 | tail -n 100 || true
  adb_cmd logcat -d -t 700 2>&1 | grep -E "FATAL EXCEPTION|AndroidRuntime|de.openfront.replaycoach|ActivityTaskManager|ActivityManager|chromium" | tail -n 160 || true
  fail "Current release app did not reach its resumed launcher activity within 120 seconds after the upgrade."
fi
log "Inspecting every LocalStorage and IndexedDB record through the test-build-only WebView bridge."
node scripts/inspect-android-upgrade-data.mjs "$RUNNER_TEMP/after-valid-upgrade-storage.json"
log "Stopping the upgraded app before the post-upgrade WebView storage snapshot."
adb_cmd shell am force-stop "$package_id" >/dev/null 2>&1 || true
bash scripts/snapshot-android-web-storage.sh after
node scripts/compare-android-web-storage.mjs

log "Creating an unsigned negative APK by removing APK signature metadata (no temporary signing key is used)."
negative_apk="$RUNNER_TEMP/openfront-coach-unsigned-negative.apk"
python3 scripts/create-android-unsigned-negative-apk.py "$current_apk" "$negative_apk"
if "$apksigner" verify --verbose "$negative_apk" >/dev/null 2>&1; then
  fail "The negative APK unexpectedly passed apksigner verification."
fi
negative_status=0
negative_output="$(timeout --signal=INT --kill-after=15s 240s adb -s emulator-5554 install --no-streaming -r "$negative_apk" 2>&1)" || negative_status=$?
log "Package Manager negative-test response (exit $negative_status): ${negative_output:-<empty>}"
[[ "$negative_status" -ne 0 ]] || fail "Android Package Manager unexpectedly accepted the unsigned update APK."
if ! grep -E "INSTALL_PARSE_FAILED_NO_CERTIFICATES|INSTALL_FAILED_INVALID_APK" <<< "$negative_output" >/dev/null; then
  adb_cmd logcat -d -t 700 2>&1 | grep -E "PackageManager|PackageInstaller|INSTALL_PARSE_FAILED|INSTALL_FAILED_INVALID_APK|certificate|signature" | tail -n 120 || true
  fail "Android rejected the negative APK, but the actual Package Manager response did not identify a signature/certificate or invalid-APK failure."
fi

installed_after_negative="$(adb_cmd shell dumpsys package "$package_id")" || fail "Could not inspect the valid package after the negative test."
grep -F "versionCode=$current_version_code" <<< "$installed_after_negative" >/dev/null || fail "The failed negative install replaced or damaged the valid package."
adb_cmd shell am force-stop "$package_id" >/dev/null 2>&1 || true
adb_cmd shell monkey -p "$package_id" 1 >/dev/null || fail "The valid signed app could not be launched after the Package Manager rejected the negative APK."
sleep 5
adb_cmd shell pidof "$package_id" >/dev/null || fail "The valid signed app did not remain running after the negative install."
node scripts/inspect-android-upgrade-data.mjs "$RUNNER_TEMP/after-negative-test-storage.json"
adb_cmd shell am force-stop "$package_id" >/dev/null 2>&1 || true
bash scripts/snapshot-android-web-storage.sh after
node scripts/compare-android-web-storage.mjs
node scripts/compare-android-upgrade-snapshots.mjs "$RUNNER_TEMP/after-valid-upgrade-storage.json" "$RUNNER_TEMP/after-negative-test-storage.json"

log "Running a five-minute foreground idle soak on the upgraded signed test build."
sleep 300
if ! adb_cmd shell pidof "$package_id" >/dev/null 2>&1; then
  log "Release app exited during the five-minute idle soak; collecting diagnostics."
  adb_cmd shell dumpsys activity activities 2>&1 | tail -n 80 || true
  adb_cmd logcat -d -t 500 2>&1 | grep -E "FATAL EXCEPTION|AndroidRuntime|de.openfront.replaycoach|ActivityTaskManager" | tail -n 120 || true
  fail "Upgraded signed release app exited during the five-minute idle soak."
fi
log "PASS: published APK $previous_version_code upgraded in place to the permanent-key test build $version ($current_version_code); UI-seeded IndexedDB/LocalStorage survived, Package Manager rejected the unsigned negative APK, the valid app remained startable, and the app survived five minutes idle."
