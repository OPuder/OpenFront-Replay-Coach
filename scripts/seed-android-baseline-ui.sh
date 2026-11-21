#!/usr/bin/env bash
set -Eeuo pipefail

package_id="de.openfront.replaycoach"
player_id="5SVg4WbI"

log() { echo "::notice::[Android baseline UI seed] $*"; }
fail() { echo "::error::[Android baseline UI seed] $*"; exit 1; }

log "Published baseline is non-debuggable; use OCR when UIAutomator exposes only the WebView container."
ui_xml="$RUNNER_TEMP/ofrc-android-ui.xml"
source scripts/android-emulator-diagnostics.sh
on_android_seed_exit() {
  local status=$?
  trap - EXIT
  if [[ "$status" -ne 0 ]]; then android_capture_diagnostics "baseline-ui-seed-failure" || true; fi
  exit "$status"
}
trap on_android_seed_exit EXIT


dump_ui() {
  local dump_output="" pull_output=""
  for attempt in 1 2; do
    rm -f "$ui_xml"
    timeout 20s adb -s emulator-5554 shell uiautomator dump --compressed /sdcard/ofrc-window.xml >"$RUNNER_TEMP/ofrc-uiautomator-dump.log" 2>&1 || {
      dump_output="$(cat "$RUNNER_TEMP/ofrc-uiautomator-dump.log" 2>/dev/null || true)"
      log "UI hierarchy dump attempt $attempt/2 failed: ${dump_output:-no diagnostic output}"
    }
    if [[ -s "$RUNNER_TEMP/ofrc-uiautomator-dump.log" ]] && grep -qi "dumped to" "$RUNNER_TEMP/ofrc-uiautomator-dump.log"; then
      pull_output="$(timeout 30s adb -s emulator-5554 pull /sdcard/ofrc-window.xml "$ui_xml" 2>&1 || true)"
      if [[ -s "$ui_xml" ]] && grep -q "<hierarchy" "$ui_xml"; then return 0; fi
      log "UI hierarchy pull attempt $attempt/2 did not produce valid XML: ${pull_output:-empty file}"
    fi
    if (( attempt == 1 )); then sleep 5; fi
  done
  log "Focused window: $(timeout 15s adb -s emulator-5554 shell dumpsys window 2>&1 | grep -E 'mCurrentFocus|mFocusedApp' | tail -n 4 || true)"
  log "Recent UIAutomator diagnostics: $(timeout 15s adb -s emulator-5554 logcat -d -t 180 2>&1 | grep -Ei 'uiautomator|Accessibility|WindowManager|FATAL EXCEPTION' | tail -n 30 || true)"
  local screen_path="$RUNNER_TEMP/ofrc-baseline-screen.png"
  if timeout 30s adb -s emulator-5554 exec-out screencap -p >"$screen_path" 2>"$RUNNER_TEMP/ofrc-screencap.log" && [[ -s "$screen_path" ]]; then
    log "Captured baseline UI diagnostic screenshot: $(file "$screen_path"); SHA-256 $(sha256sum "$screen_path" | awk '{print $1}')"
  else
    log "Could not capture baseline UI screenshot: $(cat "$RUNNER_TEMP/ofrc-screencap.log" 2>/dev/null || true)"
  fi
  return 1
}

screen_path="$RUNNER_TEMP/ofrc-baseline-screen.png"
ocr_tsv="$RUNNER_TEMP/ofrc-baseline-screen.tsv"

capture_screen() {
  timeout 30s adb -s emulator-5554 exec-out screencap -p >"$screen_path" 2>"$RUNNER_TEMP/ofrc-screencap.log"
  [[ -s "$screen_path" ]] || fail "Could not capture the Android WebView screen for OCR."
}

ocr_text() {
  capture_screen
  tesseract "$screen_path" stdout -l deu+eng --psm 6 2>/dev/null
}

ocr_find_bounds() {
  local needle="$1"
  local occurrence="${2:-1}"
  capture_screen
  tesseract "$screen_path" stdout -l deu+eng --psm 6 tsv >"$ocr_tsv" 2>/dev/null
  python3 - "$needle" "$occurrence" "$ocr_tsv" <<'PY'
import csv
import re
import sys
from collections import defaultdict

needle, occurrence, path = sys.argv[1:]
needle = re.sub(r"\s+", " ", needle).strip().casefold()
groups = defaultdict(list)
with open(path, newline="", encoding="utf-8") as stream:
    for row in csv.DictReader(stream, delimiter="\t"):
        if row.get("level") != "5":
            continue
        text = row.get("text", "").strip()
        if not text:
            continue
        key = (row["block_num"], row["par_num"], row["line_num"])
        groups[key].append(row)

matches = []
for rows in groups.values():
    rows.sort(key=lambda row: int(row["left"]))
    line = " ".join(row["text"].strip() for row in rows)
    if needle not in re.sub(r"\s+", " ", line).casefold():
        continue
    x1 = min(int(row["left"]) for row in rows)
    y1 = min(int(row["top"]) for row in rows)
    x2 = max(int(row["left"]) + int(row["width"]) for row in rows)
    y2 = max(int(row["top"]) + int(row["height"]) for row in rows)
    matches.append((y1, x1, (x1 + x2) // 2, (y1 + y2) // 2, line))

matches.sort(key=lambda item: (item[0], item[1]))
if not matches:
    raise SystemExit(1)
if occurrence == "last":
    match = matches[-1]
else:
    index = max(1, int(occurrence)) - 1
    match = matches[min(index, len(matches) - 1)]
print(f"{match[2]} {match[3]}")
PY
}

ocr_contains() {
  local needle="$1"
  local text
  text="$(ocr_text || true)"
  grep -qiF "$needle" <<<"$text"
}

find_bounds() {
  local needle="$1"
  local mode="$2"
  local occurrence="${3:-1}"
  python3 - "$ui_xml" "$needle" "$mode" "$occurrence" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET

path, needle, mode, occurrence = sys.argv[1:]
occurrence = max(1, int(occurrence))
try:
    root = ET.parse(path).getroot()
except (OSError, ET.ParseError) as error:
    print(f"UI hierarchy parse failed: {error}", file=sys.stderr)
    raise SystemExit(2)

matches = []
for node in root.iter("node"):
    attrs = node.attrib
    label = " ".join((attrs.get("text", ""), attrs.get("content-desc", ""), attrs.get("hint", "")))
    if mode == "edit":
        if attrs.get("class") not in ("android.widget.EditText", "android.widget.TextInputEditText"):
            continue
        if attrs.get("enabled") != "true" or attrs.get("clickable") != "true":
            continue
    elif mode == "exact":
        if attrs.get("text", "").strip().casefold() != needle.casefold():
            continue
    elif needle.casefold() not in label.casefold():
        continue

    coordinates = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", attrs.get("bounds", ""))
    if not coordinates:
        continue
    x1, y1, x2, y2 = map(int, coordinates.groups())
    if x2 <= x1 or y2 <= y1:
        continue
    # For the profile form, choose the uppermost editable field, not the
    # similarly sized quick-import field farther down the dashboard.
    matches.append((y1, x1, (x1 + x2) // 2, (y1 + y2) // 2, label))

if matches:
    matches.sort(key=lambda item: (item[0], item[1]))
    _, _, x, y, _ = matches[min(occurrence - 1, len(matches) - 1)]
    print(f"{x} {y}")
elif mode == "edit":
    print("No enabled editable fields found. Classes: " + ", ".join(
        sorted({node.attrib.get("class", "<missing>") for node in root.iter("node")})
    ), file=sys.stderr)
PY
}

tap_text() {
  local needle="$1"
  local occurrence="${2:-1}"
  local mode="${3:-text}"
  local coords=""
  for attempt in $(seq 1 20); do
    if ! dump_ui; then
      log "UIAutomator hierarchy unavailable; continuing with screenshot OCR for '$needle'."
    fi
    coords="$(find_bounds "$needle" "$mode" "$occurrence" 2>/dev/null || true)"
    if [[ -z "$coords" ]]; then
      coords="$(ocr_find_bounds "$needle" "$occurrence" || true)"
    fi
    if [[ -n "$coords" ]]; then
      read -r x y <<< "$coords"
      log "Tapping '$needle' at $x,$y (UI hierarchy or German/English WebView OCR)."
      adb -s emulator-5554 shell input tap "$x" "$y"
      return 0
    fi
    sleep 2
  done
  local ocr_dump
  ocr_dump="$(ocr_text 2>/dev/null | tr '\n' ' ' || true)"
  fail "Could not find the UI control '$needle' in UIAutomator or OCR. OCR text: ${ocr_dump:0:1200}. Captured UI: $(cat "$ui_xml" 2>/dev/null | head -c 4000)"
}

log "Rechecking ADB transport and boot state before launching the published baseline."
android_prepare_emulator || fail "Baseline emulator preparation failed; inspect stage-specific ADB/boot diagnostics."
log "Launching the genuine published v2.2.51 APK and classifying ADB, ActivityManager and crash failures."
android_launch_package "$package_id" "the published v2.2.51 baseline APK" || fail "Published baseline app launch failed; see classified emulator diagnostics."
sleep 20
if ! dump_ui; then
  log "Published baseline exposes no readable UIAutomator hierarchy; locating the profile field through OCR."
fi
coords="$(find_bounds "" edit 2>/dev/null || true)"
if [[ -z "$coords" ]]; then
  coords="$(ocr_find_bounds "OpenFront-Profillink" 1 || true)"
fi
if [[ -z "$coords" ]]; then
  ocr_dump="$(ocr_text 2>/dev/null | tr '\n' ' ' || true)"
  fail "Could not locate the profile input field in the WebView via UIAutomator or OCR. OCR text: ${ocr_dump:0:1200}"
fi
read -r input_x input_y <<< "$coords"
log "Entering the archived player ID through the real published app UI at $input_x,$input_y."
adb -s emulator-5554 shell input tap "$input_x" "$input_y"
adb -s emulator-5554 shell input text "$player_id"
adb -s emulator-5554 shell input keyevent 4
tap_text "Konto laden"

# The published baseline is a non-debuggable WebView app, so Android exposes
# only the WebView container to UIAutomator. OCR follows the visible UI, and
# the post-upgrade inspector verifies the imported records in real IndexedDB.
sleep 20
tap_text "Partien" last exact
read_metric() {
  local label="$1"
  capture_screen
  tesseract "$screen_path" stdout -l deu+eng --psm 6 tsv >"$ocr_tsv" 2>/dev/null
  python3 - "$ocr_tsv" "$label" <<'PY'
import csv
import re
import sys
from collections import defaultdict

path, label = sys.argv[1:]
label = re.sub(r"\s+", " ", label).strip().casefold()
groups = defaultdict(list)
with open(path, newline="", encoding="utf-8") as stream:
    for row in csv.DictReader(stream, delimiter="\t"):
        if row.get("level") == "5" and row.get("text", "").strip():
            groups[(row["block_num"], row["par_num"], row["line_num"])].append(row)
lines = []
for rows in groups.values():
    rows.sort(key=lambda row: int(row["left"]))
    text = " ".join(row["text"].strip() for row in rows)
    y = min(int(row["top"]) for row in rows)
    lines.append((y, text))
lines.sort()
for index, (_, text) in enumerate(lines):
    if label in re.sub(r"\s+", " ", text).casefold():
        for _, candidate in lines[index:index+8]:
            match = re.search(r"\b(\d{1,6})\b", candidate.replace(",", ""))
            if match:
                print(match.group(1))
                raise SystemExit
print(0)
PY
}

replay_count=0
for attempt in $(seq 1 240); do
  if ! dump_ui; then
    log "UIAutomator hierarchy unavailable while reading replay count; using OCR."
  fi
  replay_count="$(read_metric "REPLAYS GESPEICHERT")"
  if [[ "$replay_count" =~ ^[0-9]+$ ]] && (( replay_count >= 3 )); then break; fi
  sleep 2
done
[[ "$replay_count" =~ ^[0-9]+$ ]] && (( replay_count >= 3 )) || fail "The actual app UI did not show at least three saved replay records within 8 minutes; last observed count=$replay_count."
log "UI confirms $replay_count locally saved replays. Opening a not-yet-reviewed match from the real UI."

# Automatic background analysis handles one replay at a time. Open a later
# imported match so the UI performs a foreground, fully persisted engine review.
adb -s emulator-5554 shell input swipe 520 1550 520 600 450
sleep 1
adb -s emulator-5554 shell input swipe 520 1550 520 600 450
sleep 2
tap_text "Coach öffnen" 1 exact
training_goal=false
for attempt in $(seq 1 240); do
  if ! dump_ui; then
    log "UIAutomator hierarchy unavailable while checking Coach UI; using OCR."
  fi
  if ocr_contains "Als Trainingsziel übernehmen"; then
    training_goal=true
    break
  fi
  if (( attempt % 5 == 0 )); then adb -s emulator-5554 shell input swipe 520 1550 520 600 450 >/dev/null 2>&1 || true; fi
  sleep 2
done
if [[ "$training_goal" == true ]]; then
  tap_text "Als Trainingsziel übernehmen" 1 exact
  sleep 3
  log "A training goal was created through the actual Coach UI."
else
  fail "The real Coach UI did not expose an evidence-backed training goal after opening the verified replay."
fi

log "Stopping the published app before the baseline storage snapshot."
adb -s emulator-5554 shell am force-stop "$package_id"
sleep 2
