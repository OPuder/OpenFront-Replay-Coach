#!/usr/bin/env bash
set -Eeuo pipefail

package_id="de.openfront.replaycoach"
apk="android/app/build/outputs/apk/debug/app-debug.apk"
before_apk="$RUNNER_TEMP/openfront-coach-before-update.apk"
update_apk="${OPENFRONT_UPDATE_APK:-$RUNNER_TEMP/openfront-coach-update.apk}"

log() { echo "::notice::[Android update regression] $*"; }
fail() { echo "::error::[Android update regression] $*"; exit 1; }

test -s "$apk" || fail "Initial APK is missing."
cp "$apk" "$before_apk"
restore_apk() {
  if [[ -s "$before_apk" ]]; then cp "$before_apk" "$apk"; fi
}
trap restore_apk EXIT

log "Checking and starting the Android Debug Bridge server."
timeout 30s adb start-server || fail "Android Debug Bridge server could not be started."
timeout 30s adb devices -l || fail "Android Debug Bridge server did not respond to device enumeration."
log "Waiting for emulator connection."
timeout 90s adb -s emulator-5554 wait-for-device || fail "Android emulator did not connect to ADB within 90 seconds."
online=false
for attempt in $(seq 1 45); do
  device_state="$(adb devices | awk '$1 == "emulator-5554" { print $2 }')"
  if [[ "$device_state" == "device" ]]; then online=true; break; fi
  sleep 2
done
[[ "$online" == true ]] || fail "Android emulator never reached the online ADB state."
booted=false
for attempt in $(seq 1 60); do
  state="$(timeout 15s adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  if [[ "$state" == "1" ]]; then booted=true; break; fi
  sleep 3
done
[[ "$booted" == true ]] || fail "Android emulator did not finish booting within 3 minutes."
wait_for_package_service() {
  for attempt in $(seq 1 30); do
    local output=""
    if output="$(timeout 20s adb -s emulator-5554 shell cmd package list packages 2>&1)" &&
       grep -q "^package:" <<< "$output"; then
      log "Android Package Manager service is ready."
      return 0
    fi
    log "Package Manager is not ready (attempt $attempt/30): ${output:-no response}"
    sleep 5
  done
  fail "Android Package Manager did not become ready after emulator boot."
}

install_apk_with_retry() {
  local apk="$1"
  local replace="$2"
  local output=""
  for attempt in 1 2 3 4; do
    wait_for_package_service
    if [[ "$replace" == "true" ]]; then
      if output="$(timeout 180s adb -s emulator-5554 install -r "$apk" 2>&1)"; then
        log "$output"
        return 0
      fi
    else
      if output="$(timeout 180s adb -s emulator-5554 install "$apk" 2>&1)"; then
        log "$output"
        return 0
      fi
    fi
    log "APK install attempt $attempt/4 failed: $output"
    sleep 10
  done
  fail "Android Package Manager could not install $apk after retries: $output"
}

log "Emulator booted; waiting for Android Package Manager."
install_apk_with_retry "$before_apk" false
timeout 30s adb -s emulator-5554 shell "run-as $package_id sh -c 'mkdir -p files/update-regression && printf keep-this-data > files/update-regression/sentinel.txt'" || fail "Could not create app-data sentinel."

current_version="$(node -p "require('./package.json').version")"
IFS='.' read -r major minor patch <<< "$current_version"
next_version="$major.$minor.$((patch + 1))"
test -s "$update_apk" || fail "Prebuilt higher-version APK is missing."
log "Installing the prebuilt update APK for version $next_version."
install_apk_with_retry "$update_apk" true
saved="$(timeout 30s adb -s emulator-5554 shell "run-as $package_id cat files/update-regression/sentinel.txt" | tr -d '\r')" || fail "Could not read the preserved app-data sentinel."
[[ "$saved" == "keep-this-data" ]] || fail "App data was not preserved after adb -s emulator-5554 install -r."

expected_version_code="$((major * 1000000 + minor * 1000 + patch + 1))"
installed_package="$(timeout 30s adb -s emulator-5554 shell dumpsys package "$package_id")" || fail "Could not inspect installed package metadata."
grep -F "versionCode=$expected_version_code" <<< "$installed_package" >/dev/null || fail "Installed package does not have expected versionCode $expected_version_code."
log "Resolving the upgraded application's launcher activity."
launcher_activity="$(timeout 30s adb -s emulator-5554 shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER "$package_id" | tr -d '\r' | tail -n 1)"
[[ "$launcher_activity" == */* ]] || fail "Could not resolve a launcher activity for $package_id."
log "Launching upgraded application through $launcher_activity."
launch_output="$(timeout 90s adb -s emulator-5554 shell am start -W -n "$launcher_activity" 2>&1)" || fail "Upgraded application launch command failed: $launch_output"
grep -F "Status: ok" <<< "$launch_output" >/dev/null || fail "Android did not report a successful activity launch: $launch_output"
app_started=false
for attempt in $(seq 1 30); do
  if timeout 10s adb -s emulator-5554 shell pidof "$package_id" >/dev/null 2>&1; then app_started=true; break; fi
  sleep 2
done
[[ "$app_started" == true ]] || fail "The upgraded application process did not start after its launcher activity was opened."
log "PASS: $current_version -> $next_version; package identity, signature, versionCode and app data preserved."
