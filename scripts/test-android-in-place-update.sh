#!/usr/bin/env bash
set -Eeuo pipefail

package_id="de.openfront.replaycoach"
apk="android/app/build/outputs/apk/debug/app-debug.apk"
before_apk="$RUNNER_TEMP/openfront-coach-before-update.apk"
update_apk="${OPENFRONT_UPDATE_APK:-$RUNNER_TEMP/openfront-coach-update.apk}"

log() { echo "::notice::[Android update regression] $*"; }
fail() { echo "::error::[Android update regression] $*"; exit 1; }
adb_cmd() { timeout 60s adb -s emulator-5554 "$@"; }

test -s "$apk" || fail "Initial APK is missing."
test -s "$update_apk" || fail "Prebuilt higher-version APK is missing."
cp "$apk" "$before_apk"
restore_apk() {
  if [[ -s "$before_apk" ]]; then cp "$before_apk" "$apk"; fi
}
trap restore_apk EXIT

log "Starting ADB and checking emulator visibility."
timeout 20s adb start-server || fail "ADB server could not start."
timeout 20s adb devices -l || fail "ADB device enumeration failed."
timeout 90s adb -s emulator-5554 wait-for-device || fail "Android emulator did not connect within 90 seconds."

log "Waiting up to 150 seconds for Android boot completion."
booted=false
for attempt in $(seq 1 30); do
  state="$(timeout 5s adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  if [[ "$state" == "1" ]]; then booted=true; break; fi
  sleep 2
done
[[ "$booted" == true ]] || {
  timeout 10s adb devices -l || true
  timeout 10s adb -s emulator-5554 shell getprop sys.boot_completed || true
  fail "Android emulator did not report sys.boot_completed=1 within 150 seconds."
}

log "Waiting up to 90 seconds for Package Manager."
package_manager_ready=false
for attempt in $(seq 1 9); do
  package_list="$(timeout 8s adb -s emulator-5554 shell cmd package list packages 2>&1 || true)"
  if grep -q '^package:' <<< "$package_list"; then package_manager_ready=true; break; fi
  log "Package Manager not ready (attempt $attempt/9): ${package_list:-no response}"
  sleep 2
done
[[ "$package_manager_ready" == true ]] || fail "Android Package Manager did not become ready within 90 seconds."

install_apk() {
  local mode="$1"
  local file="$2"
  local output=""
  for attempt in 1 2 3; do
    if [[ "$mode" == "replace" ]]; then
      output="$(timeout 90s adb -s emulator-5554 install -r "$file" 2>&1)" && { log "$output"; return 0; }
    else
      output="$(timeout 90s adb -s emulator-5554 install "$file" 2>&1)" && { log "$output"; return 0; }
    fi
    log "APK install failed (attempt $attempt/3): $output"
    [[ "$attempt" -lt 3 ]] && sleep 5
  done
  fail "Android could not install $file after three bounded attempts: $output"
}

log "Installing baseline APK."
install_apk "fresh" "$before_apk"
adb_cmd shell "run-as $package_id sh -c 'mkdir -p files/update-regression && printf keep-this-data > files/update-regression/sentinel.txt'" ||
  fail "Could not create app-data sentinel."

current_version="$(node -p "require('./package.json').version")"
IFS='.' read -r major minor patch <<< "$current_version"
next_version="$major.$minor.$((patch + 1))"
log "Installing higher-version APK $next_version."
install_apk "replace" "$update_apk"

saved="$(adb_cmd shell "run-as $package_id cat files/update-regression/sentinel.txt" | tr -d '\r')" ||
  fail "Could not read app-data sentinel after update."
[[ "$saved" == "keep-this-data" ]] || fail "App data was not preserved after in-place update."

expected_version_code="$((major * 1000000 + minor * 1000 + patch + 1))"
installed_package="$(adb_cmd shell dumpsys package "$package_id")" ||
  fail "Could not inspect installed package metadata."
grep -F "versionCode=$expected_version_code" <<< "$installed_package" >/dev/null ||
  fail "Installed package does not have expected versionCode $expected_version_code."

log "Resolving upgraded application's launcher activity."
launcher_activity="$(adb_cmd shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER "$package_id" | tr -d '\r' | tail -n 1)" ||
  fail "Could not resolve upgraded application's launcher activity."
[[ "$launcher_activity" == */* ]] || fail "No launcher activity found for $package_id."
launch_output="$(adb_cmd shell am start -W -n "$launcher_activity" 2>&1)" ||
  fail "Upgraded application launch command failed: $launch_output"
grep -F "Status: ok" <<< "$launch_output" >/dev/null ||
  fail "Android did not confirm successful activity launch: $launch_output"

started=false
for attempt in $(seq 1 30); do
  if adb_cmd shell pidof "$package_id" >/dev/null 2>&1; then started=true; break; fi
  sleep 2
done
if [[ "$started" != true ]]; then
  log "Application launch diagnostics:"
  adb_cmd shell dumpsys activity activities 2>&1 | tail -n 80 || true
  adb_cmd logcat -d -t 500 2>&1 | grep -E "FATAL EXCEPTION|AndroidRuntime|de.openfront.replaycoach|ActivityTaskManager" | tail -n 120 || true
  fail "Upgraded application process did not start within 60 seconds."
fi
log "PASS: $current_version -> $next_version; package ID, versionCode, app data and launcher startup verified."
