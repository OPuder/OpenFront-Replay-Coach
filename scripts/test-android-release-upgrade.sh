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

source scripts/android-emulator-diagnostics.sh
on_android_upgrade_exit() {
  local status=$?
  trap - EXIT
  if [[ "$status" -ne 0 ]]; then
    android_capture_diagnostics "release-upgrade-failure" || true
  fi
  exit "$status"
}
trap on_android_upgrade_exit EXIT

log "Starting bounded ADB-server, emulator-transport and Android-boot checks."
android_prepare_emulator || fail "Android emulator preparation failed; inspect the stage-specific ADB/boot diagnostics artifact."

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
log "Launching the upgraded app with separate ADB, ActivityManager and process-crash classification."
android_launch_package "$package_id" "the upgraded release APK" || fail "Upgraded app did not launch successfully; diagnostics classify ADB, activity-start and app-crash outcomes separately."
log "Inspecting every LocalStorage/ and IndexedDB record through the test-build-only WebView bridge."
node scripts/inspect-android-upgrade-data.mjs "$RUNNER_TEMP/after-valid-upgrade-storage.json"
log "Stopping the upgraded app before the post-upgrade WebView storage snapshot."
adb_cmd shell am force-stop "$package_id" >/dev/null 2>&1 || true
bash scripts/snapshot-android-web-storage.sh after
node scripts/compare-android-web-storage.mjs

log "Creating an unsigned negative APK without generating or using any signing key."
negative_apk="$RUNNER_TEMP/openfront-coach-unsigned-negative.apk"
rm -f "$negative_apk"
python3 scripts/create-android-unsigned-negative-apk.py "$current_apk" "$negative_apk"
test -s "$negative_apk"

signature_status=0
signature_output="$("$apksigner" verify --verbose "$negative_apk" 2>&1)" || signature_status=$?
[[ "$signature_status" -ne 0 ]] || fail "The unsigned negative APK unexpectedly passed apksigner verification."
log "apksigner rejected the unsigned negative APK as expected (exit $signature_status)."
printf '%s\n' "$signature_output"

negative_status=0
negative_output="$(timeout --signal=INT --kill-after=15s 240s adb -s emulator-5554 install --no-streaming -r "$negative_apk" 2>&1)" || negative_status=$?
log "Package Manager unsigned-APK response (exit $negative_status)."
printf '%s\n' "$negative_output"
[[ "$negative_status" -ne 0 ]] || fail "Android Package Manager unexpectedly accepted the unsigned negative APK."
if ! grep -E "INSTALL_PARSE_FAILED_NO_CERTIFICATES|INSTALL_FAILED_INVALID_APK" <<<"$negative_output" >/dev/null; then
  adb_cmd logcat -d -t 700 2>&1 | grep -E "PackageManager|PackageInstaller|signature|certificate|INSTALL_" | tail -n 120 || true
  fail "Android rejected the unsigned APK, but the Package Manager did not report a certificate/signature validation failure."
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

log "Creating an isolated CI-only signing identity for the valid signer-mismatch negative test."
test_keystore="$RUNNER_TEMP/ofrc-android-negative-test.p12"
test_signed_apk="$RUNNER_TEMP/openfront-coach-valid-wrong-signer.apk"
test_alias="ofrc-negative-test"
test_password="$(openssl rand -hex 24)"
rm -f "$test_keystore" "$test_signed_apk"
keytool -genkeypair -noprompt -storetype PKCS12 -keystore "$test_keystore" \
  -storepass "$test_password" -keypass "$test_password" -alias "$test_alias" \
  -keyalg RSA -keysize 2048 -validity 2 \
  -dname "CN=OFRC Android Update Negative Test, OU=CI Tests, O=OpenFront Replay Coach, L=CI, ST=CI, C=DE" \
  >/dev/null 2>&1 || fail "Could not generate the isolated CI-only negative-test certificate."
"$apksigner" sign --ks "$test_keystore" --ks-type PKCS12 --ks-key-alias "$test_alias" \
  --ks-pass "pass:$test_password" --key-pass "pass:$test_password" \
  --out "$test_signed_apk" "$current_apk" || fail "Could not sign the valid signer-mismatch APK with the isolated test key."
"$apksigner" verify --verbose "$test_signed_apk" >/dev/null || fail "The signer-mismatch APK is not a cryptographically valid APK."
installed_signer="$( "$apksigner" verify --print-certs "$current_apk" | sed -n 's/.*certificate SHA-256 digest: //p' | head -n 1 )"
negative_signer="$( "$apksigner" verify --print-certs "$test_signed_apk" | sed -n 's/.*certificate SHA-256 digest: //p' | head -n 1 )"
[[ -n "$installed_signer" && -n "$negative_signer" && "$installed_signer" != "$negative_signer" ]] || fail "The valid negative APK does not have a distinct signing certificate."
log "Verified that both APKs are validly signed and their SHA-256 signer fingerprints differ; test keystore remains private to this CI job."

mismatch_status=0
mismatch_output="$(timeout --signal=INT --kill-after=15s 240s adb -s emulator-5554 install --no-streaming -r "$test_signed_apk" 2>&1)" || mismatch_status=$?
log "Package Manager valid-but-incompatible-signature response (exit $mismatch_status)."
printf '%s\n' "$mismatch_output"
[[ "$mismatch_status" -ne 0 ]] || fail "Android Package Manager unexpectedly accepted an APK signed by a different valid certificate."
grep -F "INSTALL_FAILED_UPDATE_INCOMPATIBLE" <<<"$mismatch_output" >/dev/null || {
  adb_cmd logcat -d -t 700 2>&1 | grep -E "PackageManager|PackageInstaller|signature|certificate|INSTALL_" | tail -n 120 || true
  fail "Package Manager did not reject the valid wrong-signer APK with INSTALL_FAILED_UPDATE_INCOMPATIBLE."
}

installed_after_mismatch="$(adb_cmd shell dumpsys package "$package_id")" || fail "Could not inspect the installed app after signer-mismatch rejection."
grep -F "versionCode=$current_version_code" <<<"$installed_after_mismatch" >/dev/null || fail "The failed signer-mismatch update replaced or damaged the installed app."
adb_cmd shell am force-stop "$package_id" >/dev/null 2>&1 || true
adb_cmd shell monkey -p "$package_id" 1 >/dev/null || fail "The original signed app could not be launched after signer-mismatch rejection."
sleep 5
adb_cmd shell pidof "$package_id" >/dev/null || fail "The original signed app did not remain running after signer-mismatch rejection."
node scripts/inspect-android-upgrade-data.mjs "$RUNNER_TEMP/after-signature-mismatch-storage.json"
node scripts/compare-android-upgrade-snapshots.mjs "$RUNNER_TEMP/after-negative-test-storage.json" "$RUNNER_TEMP/after-signature-mismatch-storage.json"
adb_cmd shell am force-stop "$package_id" >/dev/null 2>&1 || true
rm -f "$test_keystore" "$test_signed_apk"
unset test_password

log "Running a five-minute foreground idle soak on the upgraded signed test build."
sleep 300
if ! adb_cmd shell pidof "$package_id" >/dev/null 2>&1; then
  log "Release app exited during the five-minute idle soak; collecting diagnostics."
  adb_cmd shell dumpsys activity activities 2>&1 | tail -n 80 || true
  adb_cmd logcat -d -t 500 2>&1 | grep -E "FATAL EXCEPTION|AndroidRuntime|de.openfront.replaycoach|ActivityTaskManager" | tail -n 120 || true
  fail "Upgraded signed release app exited during the five-minute idle soak."
fi
log "PASS: published APK $previous_version_code upgraded in place to the permanent-key test build $version ($current_version_code); complete UI-seeded IndexedDB/LocalStorage survived, Package Manager rejected both an unsigned APK and a cryptographically valid APK signed by a distinct ephemeral CI-only certificate, the original installation remained intact and startable after both rejections, and the app survived five minutes idle."
