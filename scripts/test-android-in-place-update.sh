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

# sys.boot_completed can become 1 before Package Manager is ready to accept
# installs on a cold emulator. Probe Package Manager explicitly before sending
# the APK so a slow first boot is not mistaken for an APK/signature failure.
package_manager_ready=false
for attempt in $(seq 1 30); do
  if timeout 10s adb -s emulator-5554 shell cmd package list packages >/dev/null 2>&1; then
    package_manager_ready=true
    break
  fi
  sleep 2
done
if [[ "$package_manager_ready" != true ]]; then
  adb -s emulator-5554 shell getprop sys.boot_completed || true
  adb -s emulator-5554 shell df -h /data || true
  adb devices -l || true
  fail "Android Package Manager did not become ready after emulator boot."
fi

install_apk() {
  local apk_path="$1"
  local install_args=("$@")
  local output
  local status
  log "Installing $(basename "$apk_path") using non-streaming ADB transfer."
  if output="$(timeout 300s adb -s emulator-5554 install --no-streaming -t "${install_args[@]:1}" "$apk_path" 2>&1)"; then
    printf '%s\n' "$output"
    return 0
  else
    status=$?
    printf '%s\n' "$output"
    log "APK install failed with exit code $status; collecting emulator diagnostics."
    adb -s emulator-5554 get-state || true
    adb -s emulator-5554 shell getprop sys.boot_completed || true
    adb -s emulator-5554 shell df -h /data || true
    adb -s emulator-5554 shell pm list packages | head -n 30 || true
    return "$status"
  fi
}

log "Emulator and Package Manager are ready; installing baseline APK."
install_apk "$before_apk" || fail "Could not install baseline APK after Package Manager readiness check."
timeout 30s adb -s emulator-5554 shell "run-as $package_id sh -c 'mkdir -p files/update-regression && printf keep-this-data > files/update-regression/sentinel.txt'" || fail "Could not create app-data sentinel."

current_version="$(node -p "require('./package.json').version")"
IFS='.' read -r major minor patch <<< "$current_version"
next_version="$major.$minor.$((patch + 1))"
test -s "$update_apk" || fail "Prebuilt higher-version APK is missing."
log "Installing the prebuilt update APK for version $next_version."
install_apk "$update_apk" -r || fail "Android rejected the in-place APK update."
saved="$(timeout 30s adb -s emulator-5554 shell "run-as $package_id cat files/update-regression/sentinel.txt" | tr -d '\r')" || fail "Could not read the preserved app-data sentinel."
[[ "$saved" == "keep-this-data" ]] || fail "App data was not preserved after adb -s emulator-5554 install -r."

expected_version_code="$((major * 1000000 + minor * 1000 + patch + 1))"
installed_package="$(timeout 30s adb -s emulator-5554 shell dumpsys package "$package_id")" || fail "Could not inspect installed package metadata."
grep -F "versionCode=$expected_version_code" <<< "$installed_package" >/dev/null || fail "Installed package does not have expected versionCode $expected_version_code."
log "Launching upgraded application."
timeout 30s adb -s emulator-5554 shell monkey -p "$package_id" 1 >/dev/null || fail "Upgraded application could not be launched."
log "PASS: $current_version -> $next_version; package identity, signature, versionCode and app data preserved."
