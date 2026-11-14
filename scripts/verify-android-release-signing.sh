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

build_tools="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
apksigner="$build_tools/apksigner"
"$apksigner" verify --verbose "$previous_apk"
previous_cert="$("$apksigner" verify --print-certs "$previous_apk" | awk -F': ' '/Signer #1 certificate SHA-256 digest:/ {print tolower($2); exit}')"
current_cert="$(keytool -exportcert -keystore "$keystore" -storepass "$ANDROID_KEYSTORE_PASSWORD" -alias "$ANDROID_KEY_ALIAS" | sha256sum | awk '{print tolower($1)}')"

if [[ -z "$previous_cert" || -z "$current_cert" || "$current_cert" != "$previous_cert" ]]; then
  echo "::error::Android signing certificate does not match $previous_tag. Existing installations could not update in place; release is blocked."
  exit 1
fi

echo "Android signing readiness passed: permanent key matches published APK from $previous_tag."
