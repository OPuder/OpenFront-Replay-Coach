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
log "Emulator booted; installing baseline APK."
timeout 120s adb -s emulator-5554 install "$before_apk" || fail "Could not install baseline APK."
timeout 30s adb -s emulator-5554 shell "run-as $package_id sh -c 'mkdir -p files/update-regression && printf keep-this-data > files/update-regression/sentinel.txt'" || fail "Could not create app-data sentinel."

current_version="$(node -p "require('./package.json').version")"
IFS='.' read -r major minor patch <<< "$current_version"
next_version="$major.$minor.$((patch + 1))"
test -s "$update_apk" || fail "Prebuilt higher-version APK is missing."
log "Installing the prebuilt update APK for version $next_version."
timeout 120s adb -s emulator-5554 install -r "$update_apk" || fail "Android rejected the in-place APK update."
saved="$(timeout 30s adb -s emulator-5554 shell "run-as $package_id cat files/update-regression/sentinel.txt" | tr -d '\r')" || fail "Could not read the preserved app-data sentinel."
[[ "$saved" == "keep-this-data" ]] || fail "App data was not preserved after adb -s emulator-5554 install -r."

expected_version_code="$((major * 1000000 + minor * 1000 + patch + 1))"
installed_package="$(timeout 30s adb -s emulator-5554 shell dumpsys package "$package_id")" || fail "Could not inspect installed package metadata."
grep -F "versionCode=$expected_version_code" <<< "$installed_package" >/dev/null || fail "Installed package does not have expected versionCode $expected_version_code."
log "Launching upgraded application."
timeout 30s adb -s emulator-5554 shell monkey -p "$package_id" 1 >/dev/null || fail "Upgraded application could not be launched."
log "PASS: $current_version -> $next_version; package identity, signature, versionCode and app data preserved."
