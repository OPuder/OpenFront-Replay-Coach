#!/usr/bin/env bash
set -Eeuo pipefail

package_id="de.openfront.replaycoach"
apk="android/app/build/outputs/apk/debug/app-debug.apk"
before_apk="$RUNNER_TEMP/openfront-coach-before-update.apk"
test -s "$apk"
cp "$apk" "$before_apk"

adb wait-for-device
adb install "$before_apk"
adb shell run-as "$package_id" sh -c "mkdir -p files/update-regression && printf 'keep-this-data' > files/update-regression/sentinel.txt"

current_version="$(node -p "require('./package.json').version")"
IFS='.' read -r major minor patch <<< "$current_version"
next_version="$major.$minor.$((patch + 1))"
node scripts/set-android-version.mjs "$next_version"
(
  cd android
  ./gradlew --no-daemon assembleDebug
)

updated_apk="android/app/build/outputs/apk/debug/app-debug.apk"
test -s "$updated_apk"
adb install -r "$updated_apk"
saved="$(adb shell run-as "$package_id" cat files/update-regression/sentinel.txt | tr -d '\r')"
if [[ "$saved" != "keep-this-data" ]]; then
  echo "::error::App data was not preserved after adb install -r."
  exit 1
fi

expected_version_code="$((major * 1000000 + minor * 1000 + patch + 1))"
installed_package="$(adb shell dumpsys package "$package_id")"
grep -F "versionCode=$expected_version_code" <<< "$installed_package"
cp "$before_apk" "$apk"
echo "Android in-place update passed: $current_version -> $next_version; package identity, signature and app data preserved."
