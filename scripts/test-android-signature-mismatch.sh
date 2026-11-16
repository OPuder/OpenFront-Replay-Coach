#!/usr/bin/env bash
set -Eeuo pipefail
package_id=de.openfront.replaycoach
baseline_apk="$BASELINE_APK"
candidate_apk="$CANDIDATE_APK"
adb_cmd(){ timeout 45s adb -s emulator-5554 "$@"; }
fail(){ echo "::error::[Android signature rollback] $*"; exit 1; }
test -s "$baseline_apk" || fail "Published v2.2.51 baseline APK missing"
test -s "$candidate_apk" || fail "Higher-version candidate APK missing"
bt="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
tmp="$RUNNER_TEMP/android-signature-mismatch"; mkdir -p "$tmp"; exec > >(tee "$tmp/signature-mismatch.log") 2>&1; key="$tmp/incompatible-test-key.jks"; candidate="$tmp/incompatible-signature-update.apk"
keytool -genkeypair -noprompt -keystore "$key" -storepass test-only-password -keypass test-only-password -alias incompatible -keyalg RSA -keysize 2048 -validity 2 -dname "CN=OpenFront CI Incompatible Test,O=OpenFront CI,C=DE"
cp "$candidate_apk" "$candidate"
"$bt/apksigner" sign --ks "$key" --ks-pass pass:test-only-password --key-pass pass:test-only-password --ks-key-alias incompatible "$candidate"
"$bt/apksigner" verify --verbose "$baseline_apk" >/dev/null; "$bt/apksigner" verify --verbose "$candidate" >/dev/null
base_cert="$( "$bt/apksigner" verify --print-certs "$baseline_apk" | sed -n 's/.*certificate SHA-256 digest: //p' | head -n 1 | tr '[:upper:]' '[:lower:]')"
candidate_cert="$( "$bt/apksigner" verify --print-certs "$candidate" | sed -n 's/.*certificate SHA-256 digest: //p' | head -n 1 | tr '[:upper:]' '[:lower:]')"
[[ -n "$base_cert" && -n "$candidate_cert" && "$base_cert" != "$candidate_cert" ]] || fail "Test APK does not have a distinct verified signing certificate"
echo "BASELINE_CERT_SHA256=$base_cert"
echo "INCOMPATIBLE_CERT_SHA256=$candidate_cert"
base_meta="$("$bt/aapt" dump badging "$baseline_apk"|sed -n '1p')"; cand_meta="$("$bt/aapt" dump badging "$candidate"|sed -n '1p')"
grep -F "package: name='$package_id'" <<<"$base_meta" >/dev/null || fail "Baseline package identity mismatch"
grep -F "package: name='$package_id'" <<<"$cand_meta" >/dev/null || fail "Candidate package identity mismatch"
base_code="$(sed -E "s/.*versionCode='([0-9]+)'.*/\1/" <<<"$base_meta")"; cand_code="$(sed -E "s/.*versionCode='([0-9]+)'.*/\1/" <<<"$cand_meta")"
grep -F "versionName='2.2.51'" <<<"$base_meta" >/dev/null || fail "Baseline APK is not versionName 2.2.51"
((cand_code>base_code)) || fail "Candidate versionCode is not newer"
adb start-server; adb -s emulator-5554 wait-for-device
for i in $(seq 1 60); do [[ "$(adb_cmd shell getprop sys.boot_completed|tr -d '\r')" == 1 ]] && break; sleep 2; done
adb_cmd shell am force-stop "$package_id" >/dev/null 2>&1 || true
if adb_cmd shell pm path "$package_id" >/dev/null 2>&1; then
  uninstall_output="$(adb_cmd uninstall "$package_id" 2>&1)" || fail "Could not remove previous emulator package before installing the published baseline: $uninstall_output"
  echo "$uninstall_output"
  grep -F 'Success' <<<"$uninstall_output" >/dev/null || fail "Previous emulator package uninstall was not confirmed"
fi
install_output="$(adb_cmd install "$baseline_apk" 2>&1)" || { echo "$install_output"; fail "Could not install published v2.2.51 baseline APK"; }
echo "$install_output"
grep -F 'Success' <<<"$install_output" >/dev/null || fail "Published v2.2.51 baseline installation was not confirmed"
adb -s emulator-5554 root >/dev/null
adb -s emulator-5554 wait-for-device
uid="$(adb_cmd shell dumpsys package "$package_id" | sed -n 's/.*userId=\([0-9]*\).*/\1/p' | head -n 1 | tr -d '\r')"
[[ "$uid" =~ ^[0-9]+$ ]] || fail "Could not resolve installed app UID for private-data validation"
data_dir="/data/user/0/$package_id/files/rollback-test"
adb_cmd shell "mkdir -p '$data_dir'; printf %s android-data-preserved > '$data_dir/sentinel.txt'; chown -R $uid:$uid '/data/user/0/$package_id/files/rollback-test'; restorecon -RF '/data/user/0/$package_id/files/rollback-test'"
before="$(adb_cmd shell "cat '$data_dir/sentinel.txt'" | tr -d '\r')"; [[ "$before" == android-data-preserved ]] || fail "Could not create private app-data sentinel"
set +e; output="$(timeout 180s adb -s emulator-5554 install -r "$candidate" 2>&1)"; status=$?; set -e; echo "$output"
[[ $status -ne 0 ]] || fail "Android accepted mismatched signature"
grep -E 'INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match|signatures are inconsistent' <<<"$output" >/dev/null || fail "Install failed for reason other than signature mismatch"
installed="$(adb_cmd shell dumpsys package "$package_id")" || fail "Existing app disappeared"
grep -F "versionCode=$base_code" <<<"$installed" >/dev/null || fail "Existing v2.2.51 package was not retained"
after="$(adb_cmd shell "cat '$data_dir/sentinel.txt'" | tr -d '\r')"; [[ "$after" == "$before" ]] || fail "App data changed after signature rejection"
launcher="$(adb_cmd shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER "$package_id"|tr -d '\r'|tail -n1)"
[[ "$launcher" == */* ]] || fail "Could not resolve retained launcher"
adb_cmd shell am start -W -n "$launcher"
pid=""; for i in $(seq 1 30); do pid="$(adb_cmd shell pidof "$package_id" 2>/dev/null|tr -d '\r'||true)"; [[ -n "$pid" ]]&&break; sleep 1; done
[[ -n "$pid" ]] || fail "Old app did not start after signature rejection"
echo "ANDROID_SIGNATURE_MISMATCH_ROLLBACK_OK package=$package_id versionCode=$base_code candidateVersionCode=$cand_code dataSentinel=$after"
