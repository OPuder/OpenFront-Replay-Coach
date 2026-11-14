#!/usr/bin/env bash
set -Eeuo pipefail

for name in ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
  if [[ -z "${!name:-}" ]]; then
    echo "::error::Missing required Android signing secret: $name. Release updates cannot be guaranteed without the permanent key."
    exit 1
  fi
done

directory="$(mktemp -d "${RUNNER_TEMP:-/tmp}/ofrc-release-signing-XXXXXX")"
keystore="$directory/release.jks"
cleanup() { rm -rf "$directory"; }
trap cleanup EXIT

printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$keystore"
test -s "$keystore"
ANDROID_KEYSTORE_BASE64="$ANDROID_KEYSTORE_BASE64" node scripts/verify-android-keystore.mjs

previous_tag="$(gh release list --limit 1 --json tagName --jq '.[0].tagName // empty')"
if [[ -z "$previous_tag" ]]; then
  echo "::error::No previous published release is available to verify Android signing continuity."
  exit 1
fi

previous_dir="$directory/previous"
mkdir -p "$previous_dir"
gh release download "$previous_tag" --pattern '*-Android.apk' --dir "$previous_dir"
previous_apk="$(find "$previous_dir" -type f -name '*.apk' -print -quit)"
if [[ -z "$previous_apk" ]]; then
  echo "::error::The latest release $previous_tag has no Android APK; refusing an unverified signing transition."
  exit 1
fi

export ANDROID_KEYSTORE_PATH="$keystore"
node scripts/configure-android-signing.mjs
(
  cd android
  timeout 600s ./gradlew --no-daemon assembleRelease
) || { echo "::error::A release APK could not be built with the permanent signing key."; exit 1; }
current_apk="android/app/build/outputs/apk/release/app-release.apk"
test -s "$current_apk"
build_tools="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
apksigner="$build_tools/apksigner"
"$apksigner" verify --verbose "$previous_apk"
"$apksigner" verify --verbose "$current_apk"
previous_cert_output="$("$apksigner" verify --print-certs "$previous_apk" 2>&1)" || { printf '%s\n' "$previous_cert_output"; echo "::error::Could not read the published APK signing certificate."; exit 1; }
current_cert_output="$("$apksigner" verify --print-certs "$current_apk" 2>&1)" || { printf '%s\n' "$current_cert_output"; echo "::error::Could not read the configured APK signing certificate."; exit 1; }
extract_certificate_sha256() {
  grep -i 'Signer #1 certificate SHA-256 digest:' <<< "$1" |
    sed -E 's/.*digest:[[:space:]]*//I' |
    tr -d '[:space:]:' |
    tr '[:upper:]' '[:lower:]' |
    grep -E '^[0-9a-f]{64}

if [[ -z "$previous_cert" || -z "$current_cert" || "$current_cert" != "$previous_cert" ]]; then
  echo "::error::Android signing certificate does not match $previous_tag. Published APK certificate: $previous_cert; configured release certificate: $current_cert. Existing installations cannot update in place with this key; recover the original keystore or plan a one-time reinstall."
  exit 1
fi

echo "Android signing readiness passed: permanent key matches published APK from $previous_tag."
 |
    head -n 1 || true
}
previous_cert="$(extract_certificate_sha256 "$previous_cert_output")"
current_cert="$(extract_certificate_sha256 "$current_cert_output")"

if [[ -z "$previous_cert" || -z "$current_cert" || "$current_cert" != "$previous_cert" ]]; then
  echo "::error::Android signing certificate does not match $previous_tag. Published APK certificate: $previous_cert; configured release certificate: $current_cert. Existing installations cannot update in place with this key; recover the original keystore or plan a one-time reinstall."
  exit 1
fi

echo "Android signing readiness passed: permanent key matches published APK from $previous_tag."
