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

log "PASS: debug APK update preserved private app data and advanced the installed version."

# Verify production update with the exact APK downloaded from the latest
# published GitHub Release and the candidate APK signed with the permanent key.
previous_release_apk="${PREVIOUS_PUBLISHED_APK:-$RUNNER_TEMP/openfront-previous-published-android.apk}"
current_release_apk="${CURRENT_RELEASE_APK:-$GITHUB_WORKSPACE/android/app/build/outputs/apk/release/app-release.apk}"
release_version="${RELEASE_VERSION:-$current_version}"
[[ -s "$previous_release_apk" ]] || fail "Previous published, permanently signed APK is missing."
[[ -s "$current_release_apk" ]] || fail "Current permanently signed release APK is missing."

build_tools="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
apksigner="$build_tools/apksigner"
aapt="$build_tools/aapt"
"$apksigner" verify --verbose "$previous_release_apk" >/dev/null || fail "Previous published APK signature is invalid."
"$apksigner" verify --verbose "$current_release_apk" >/dev/null || fail "Current release APK signature is invalid."
previous_cert_output="$("$apksigner" verify --print-certs "$previous_release_apk" 2>&1)" || fail "Could not read the published APK certificate."
current_cert_output="$("$apksigner" verify --print-certs "$current_release_apk" 2>&1)" || fail "Could not read the current APK certificate."
certificate_sha256() { grep -Eo '[[:xdigit:]]{64}' <<< "$1" | tail -n 1 || true; }
previous_cert="$(certificate_sha256 "$previous_cert_output")"
current_cert="$(certificate_sha256 "$current_cert_output")"
[[ -n "$previous_cert" && "$previous_cert" == "$current_cert" ]] || fail "Published APK and current release APK do not have the same signing certificate."

previous_badging="$("$aapt" dump badging "$previous_release_apk" | sed -n '1p')"
current_badging="$("$aapt" dump badging "$current_release_apk" | sed -n '1p')"
previous_release_tag="${PREVIOUS_RELEASE_TAG:-}"
[[ "$previous_release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Previous published release tag is missing or malformed."
expected_previous_version="${previous_release_tag#v}"
previous_release_name="$(sed -E "s/.*versionName='([^']+)'.*/\1/" <<< "$previous_badging")"
[[ "$previous_release_name" == "$expected_previous_version" ]] || fail "Downloaded previous APK versionName $previous_release_name does not match published release $previous_release_tag."
previous_package="$(sed -E "s/.*package: name='([^']+)'.*/\1/" <<< "$previous_badging")"
current_package="$(sed -E "s/.*package: name='([^']+)'.*/\1/" <<< "$current_badging")"
current_release_code="$(sed -E "s/.*versionCode='([0-9]+)'.*/\1/" <<< "$current_badging")"
current_release_name="$(sed -E "s/.*versionName='([^']+)'.*/\1/" <<< "$current_badging")"
[[ "$previous_package" == "$package_id" && "$current_package" == "$package_id" ]] || fail "Published/current release package ID mismatch."
[[ "$current_release_name" == "$release_version" ]] || fail "Current release versionName $current_release_name does not match $release_version."
[[ "$current_release_code" =~ ^[0-9]+$ ]] || fail "Current release versionCode is invalid."

log "Removing the debug test installation before production-key verification."
timeout 60s adb -s emulator-5554 uninstall "$package_id" || fail "Could not remove the debug test installation."
timeout 240s adb -s emulator-5554 install --no-streaming "$previous_release_apk" || fail "Could not install the actual previous published APK."
previous_installed="$(timeout 30s adb -s emulator-5554 shell dumpsys package "$package_id")" || fail "Could not inspect the previous published installation."
previous_installed_code="$(sed -nE 's/.*versionCode=([0-9]+).*/\1/p' <<< "$previous_installed" | head -n 1)"
[[ "$previous_installed_code" =~ ^[0-9]+$ ]] || fail "Could not read the previous published versionCode."
(( current_release_code > previous_installed_code )) || fail "Current release versionCode is not newer than the actual published installation."

log "Updating the actual published installation with the current permanently signed APK."
timeout --signal=INT --kill-after=15s 240s adb -s emulator-5554 install --no-streaming -r "$current_release_apk" || fail "Android rejected the current APK as an in-place update of the published installation."
current_installed="$(timeout 30s adb -s emulator-5554 shell dumpsys package "$package_id")" || fail "Could not inspect the updated production installation."
grep -F "versionCode=$current_release_code" <<< "$current_installed" >/dev/null || fail "Installed production package did not advance to versionCode $current_release_code."
log "Launching the upgraded production APK."
timeout 30s adb -s emulator-5554 shell monkey -p "$package_id" 1 >/dev/null || fail "Upgraded production APK could not be launched."
production_pid=""
for attempt in $(seq 1 30); do
  production_pid="$(timeout 10s adb -s emulator-5554 shell pidof "$package_id" 2>/dev/null | tr -d '\r' || true)"
  [[ -n "$production_pid" ]] && break
  sleep 2
done
[[ -n "$production_pid" ]] || fail "Upgraded production APK did not remain running after launch."
log "PASS: actual published APK versionCode $previous_installed_code updated in place to $current_release_code with matching certificate; debug upgrade preserved private app data."

