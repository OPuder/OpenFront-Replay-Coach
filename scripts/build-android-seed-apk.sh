#!/usr/bin/env bash
set -Eeuo pipefail
output="$1"
baseline="$2"
build_file="android/app/build.gradle"
apk="android/app/build/outputs/apk/debug/app-debug.apk"
test -s "$baseline" && test -s "$apk"
backup="$(mktemp)"
cp "$build_file" "$backup"
restore() { cp "$backup" "$build_file"; cp "$baseline" "$apk"; rm -f "$backup"; }
trap restore EXIT
node --input-type=module - "$build_file" <<'NODE'
import fs from "node:fs";
const file = process.argv[2];
const source = fs.readFileSync(file, "utf8");
const pattern = /(applicationId\s+)(["'])de\.openfront\.replaycoach\2/;
if (!pattern.test(source)) throw new Error("Could not locate generated Android applicationId.");
fs.writeFileSync(file, source.replace(pattern, '$1$2de.openfront.replaycoach.seed$2'));
NODE
mkdir -p "$(dirname "$output")"
(cd android && timeout 600s ./gradlew --no-daemon assembleDebug)
test -s "$apk"
cp "$apk" "$output"
test -s "$output"
echo "ANDROID_WEBVIEW_SEED_APK=$output"
