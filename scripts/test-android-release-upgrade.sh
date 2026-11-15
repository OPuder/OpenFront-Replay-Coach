#!/usr/bin/env bash
set -Eeuo pipefail

package_id="de.openfront.replaycoach"
version="${RELEASE_VERSION:?RELEASE_VERSION is required}"
current_apk="release/OpenFront-Replay-Coach-${version}-Android.apk"
previous_dir="$RUNNER_TEMP/previous-release"
previous_apk="$(find "$previous_dir" -type f -name '*-Android.apk' -print -quit)"

log() { echo "::notice::[Android release upgrade] $*"; }
fail() { echo "::error::[Android release upgrade] $*"; exit 1; }

test -s "$previous_apk" || fail "Previous published Android APK is missing."
test -s "$current_apk" || fail "Current signed release APK is missing."
build_tools="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
apksigner="$build_tools/apksigner"
aapt="$build_tools/aapt"
"$apksigner" verify --verbose "$previous_apk" >/dev/null || fail "Previous published APK signature is invalid."
"$apksigner" verify --verbose "$current_apk" >/dev/null || fail "Current release APK signature is invalid."
previous_badging_all="$("$aapt" dump badging "$previous_apk")"
current_badging_all="$("$aapt" dump badging "$current_apk")"
previous_badging="$(sed -n '1p' <<< "$previous_badging_all")"
current_badging="$(sed -n '1p' <<< "$current_badging_all")"
previous_package="$(sed -E "s/.*package: name='([^']+)'.*/\\1/" <<< "$previous_badging")"
current_package="$(sed -E "s/.*package: name='([^']+)'.*/\\1/" <<< "$current_badging")"
previous_version_code="$(sed -E "s/.*versionCode='([0-9]+)'.*/\\1/" <<< "$previous_badging")"
current_version_code="$(sed -E "s/.*versionCode='([0-9]+)'.*/\\1/" <<< "$current_badging")"
[[ "$previous_package" == "$package_id" && "$current_package" == "$package_id" ]] || fail "Published APK package identity does not match $package_id."
[[ "$previous_version_code" =~ ^[0-9]+$ && "$current_version_code" =~ ^[0-9]+$ ]] || fail "Could not read APK versionCode metadata."
(( current_version_code > previous_version_code )) || fail "Release versionCode $current_version_code is not newer than published versionCode $previous_version_code."

log "Starting ADB and waiting for the release emulator."
timeout 30s adb start-server || fail "Android Debug Bridge server could not be started."
timeout 30s adb devices -l || fail "Android Debug Bridge server did not respond."
timeout 90s adb -s emulator-5554 wait-for-device || fail "Android emulator did not connect to ADB."
booted=false
for attempt in $(seq 1 60); do
  state="$(timeout 15s adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  if [[ "$state" == "1" ]]; then booted=true; break; fi
  sleep 3
done
[[ "$booted" == true ]] || fail "Android emulator did not finish booting within 3 minutes."

wait_for_package_service() {
  for attempt in $(seq 1 9); do
    local output=""
    if output="$(timeout 8s adb -s emulator-5554 shell cmd package list packages 2>&1)" &&
       grep -q "^package:" <<< "$output"; then
      log "Android Package Manager service is ready."
      return 0
    fi
    log "Package Manager is not ready (attempt $attempt/9): ${output:-no response}"
    sleep 2
  done
  fail "Android Package Manager did not become ready after emulator boot."
}

install_apk_with_retry() {
  local apk="$1"
  local replace="$2"
  local output=""
  for attempt in 1 2 3; do
    wait_for_package_service
    if [[ "$replace" == "true" ]]; then
      if output="$(timeout 90s adb -s emulator-5554 install -r "$apk" 2>&1)"; then
        log "$output"
        return 0
      fi
    else
      if output="$(timeout 90s adb -s emulator-5554 install "$apk" 2>&1)"; then
        log "$output"
        return 0
      fi
    fi
    log "APK install attempt $attempt/3 failed: $output"
    sleep 5
  done
  fail "Android Package Manager could not install $apk after retries: $output"
}

log "Installing previous published APK (versionCode $previous_version_code)."
install_apk_with_retry "$previous_apk" false
log "Upgrading directly to current release APK (versionCode $current_version_code)."
install_apk_with_retry "$current_apk" true

installed="$(timeout 30s adb -s emulator-5554 shell dumpsys package "$package_id")" || fail "Could not inspect the upgraded Android package."
grep -F "versionCode=$current_version_code" <<< "$installed" >/dev/null || fail "Installed package does not report release versionCode $current_version_code."
launcher="$(timeout 30s adb -s emulator-5554 shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER "$package_id" | tr -d '\r' | tail -n 1)"
[[ "$launcher" == */* ]] || fail "Could not resolve the current release APK launcher activity."
launch_output="$(timeout 90s adb -s emulator-5554 shell am start -W -n "$launcher" 2>&1)" || fail "Upgraded release APK could not be launched: $launch_output"
grep -F "Status: ok" <<< "$launch_output" >/dev/null || fail "Android did not report a successful release-app launch: $launch_output"
started=false
for attempt in $(seq 1 30); do
  if timeout 10s adb -s emulator-5554 shell pidof "$package_id" >/dev/null 2>&1; then started=true; break; fi
  sleep 2
done
[[ "$started" == true ]] || fail "Current release app process did not start after the upgrade."
log "PASS: previous published APK versionCode $previous_version_code upgraded to release $version (versionCode $current_version_code) and launched."
