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
[[ "$previous_package" == "$package_id" && "$current_package" == "$package_id" ]] || fail "APK package identity does not match $package_id."
[[ "$previous_version_code" =~ ^[0-9]+$ && "$current_version_code" =~ ^[0-9]+$ ]] || fail "Could not read APK versionCode metadata."
(( current_version_code > previous_version_code )) || fail "Release versionCode $current_version_code is not newer than published versionCode $previous_version_code."

source scripts/android-emulator-diagnostics.sh
on_android_upgrade_exit() {
  local status=$?
  trap - EXIT
  if [[ "$status" -ne 0 ]]; then android_capture_diagnostics "release-upgrade-failure" || true; fi
  exit "$status"
}
trap on_android_upgrade_exit EXIT
log "Preparing Android emulator for a real package update."
android_prepare_emulator || fail "Android emulator preparation failed; inspect stage-specific ADB/boot diagnostics."

log "Keeping the Android emulator awake throughout the foreground idle-soak check."
adb_cmd shell svc power stayon true || fail "Could not keep the Android emulator awake."
adb_cmd shell settings put system screen_off_timeout 2147483647 || fail "Could not extend the Android screen timeout."
adb_cmd shell input keyevent 224 >/dev/null 2>&1 || true
adb_cmd shell wm dismiss-keyguard >/dev/null 2>&1 || true

install_apk() {
  local apk="$1" replace="$2" output="" status=0
  if [[ "$replace" == "true" ]]; then
    output="$(timeout --signal=INT --kill-after=15s 240s adb -s emulator-5554 install --no-streaming -r "$apk" 2>&1)" || status=$?
  else
    output="$(timeout --signal=INT --kill-after=15s 240s adb -s emulator-5554 install --no-streaming "$apk" 2>&1)" || status=$?
  fi
  log "adb install (replace=$replace, exit=$status): ${output:-<empty>}"
  [[ "$status" -eq 0 && "$output" == *"Success"* ]] || fail "Android Package Manager did not successfully install $apk: ${output:-exit $status}"
}
log "Installing the genuine published baseline APK (versionCode $previous_version_code)."
install_apk "$previous_apk" false
log "Applying the new permanent-key release APK over the existing installation (versionCode $current_version_code)."
install_apk "$current_apk" true
installed="$(adb_cmd shell dumpsys package "$package_id")" || fail "Could not inspect the installed Android package after update."
grep -F "versionCode=$current_version_code" <<< "$installed" >/dev/null || fail "Android still reports a version other than candidate versionCode $current_version_code."
grep -F "versionName=$version" <<< "$installed" >/dev/null || fail "Android does not report expected release versionName $version."
log "Force-stopping the package so the updated APK, not the previous process, is launched."
adb_cmd shell am force-stop "$package_id" >/dev/null 2>&1 || fail "Could not stop the app after update."
for attempt in 1 2 3 4 5; do
  pid="$(adb_cmd shell pidof "$package_id" 2>/dev/null | tr -d '\r' || true)"
  [[ -z "$pid" ]] && break
  sleep 2
done
[[ -z "${pid:-}" ]] || fail "The previous app process remained alive after force-stop."
log "Cold-starting the newly installed release."
android_launch_package "$package_id" "the updated release APK" || fail "The updated release APK could not be launched."
pid="$(adb_cmd shell pidof "$package_id" 2>/dev/null | tr -d '\r' || true)"
[[ -n "$pid" ]] || fail "The updated app did not remain running after cold start."
log "Running a five-minute foreground idle soak on the upgraded signed release."
sleep 300
if ! adb_cmd shell pidof "$package_id" >/dev/null 2>&1; then
  log "Release app exited during the five-minute idle soak; collecting diagnostics."
  adb_cmd shell dumpsys activity activities 2>&1 | tail -n 80 || true
  adb_cmd logcat -d -t 500 2>&1 | grep -E "FATAL EXCEPTION|AndroidRuntime|de.openfront.replaycoach|ActivityTaskManager" | tail -n 120 || true
  adb_cmd shell dumpsys activity exit-info "$package_id" 2>&1 | tail -n 80 || true
  fail "Upgraded signed release app exited during the five-minute idle soak."
fi
log "PASS: Android installed published versionCode $previous_version_code, updated the same package in place to $current_version_code, reports release version $version, cold-started and survived five minutes idle."
