#!/usr/bin/env bash
set -Eeuo pipefail

tag="v2.2.51"
asset="OpenFront-Replay-Coach-2.2.51-Android.apk"
expected_sha256="8b2da877f5e4788c29e13f7788aaca34d07e969e1f03a0f1aff8e0cdc6c030fd"
output_dir="${RUNNER_TEMP:-/tmp}/ofrc-android-baseline"
apk="$output_dir/$asset"

fail() { echo "::error::[Android release baseline] $*"; exit 1; }
log() { echo "::notice::[Android release baseline] $*"; }

mkdir -p "$output_dir"
rm -f "$apk"
gh release download "$tag" --repo "$GITHUB_REPOSITORY" --pattern "$asset" --dir "$output_dir" || fail "Could not download the public $tag Android APK."
test -s "$apk" || fail "Downloaded $tag Android APK is missing or empty."

actual_sha256="$(sha256sum "$apk" | awk '{print $1}')"
[[ "$actual_sha256" == "$expected_sha256" ]] || fail "SHA-256 mismatch for $asset: expected $expected_sha256, got $actual_sha256."

build_tools="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
apksigner="$build_tools/apksigner"
aapt="$build_tools/aapt"
"$apksigner" verify --verbose "$apk" >/dev/null || fail "Published $tag APK signature verification failed."
badging="$("$aapt" dump badging "$apk" | sed -n '1p')"
grep -F "package: name='de.openfront.replaycoach'" <<< "$badging" >/dev/null || fail "Published APK has an unexpected package ID."
grep -F "versionCode='2002051'" <<< "$badging" >/dev/null || fail "Published APK does not have versionCode 2002051."
grep -F "versionName='2.2.51'" <<< "$badging" >/dev/null || fail "Published APK does not have versionName 2.2.51."

cert_output="$("$apksigner" verify --print-certs "$apk" 2>&1)" || fail "Could not read the published APK signer certificate."
cert_sha256="$(grep -Eo '[[:xdigit:]]{64}' <<< "$cert_output" | tail -n 1 || true)"
[[ -n "$cert_sha256" ]] || fail "Published APK signer certificate SHA-256 is unavailable."

log "Verified exact public baseline $tag: package de.openfront.replaycoach, versionCode 2002051, SHA-256 $actual_sha256, signer certificate SHA-256 $cert_sha256."
echo "PREVIOUS_APK=$apk" >> "$GITHUB_ENV"
echo "ANDROID_BASELINE_TAG=$tag" >> "$GITHUB_ENV"
