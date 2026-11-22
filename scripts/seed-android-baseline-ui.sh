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
  timeout 8s tesseract "$screen_path" stdout -l deu+eng --psm 6 2>/dev/null
}

ocr_find_bounds() {
  local needle="$1"
  local occurrence="${2:-1}"
  capture_screen
  timeout 8s tesseract "$screen_path" stdout -l deu+eng --psm 6 tsv >"$ocr_tsv" 2>/dev/null
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

path, needle, mode, occurrence_raw = sys.argv[1:]
occurrence_is_last = occurrence_raw.strip().casefold() == "last"
occurrence = 1 if occurrence_is_last else max(1, int(occurrence_raw))
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
    selected = matches[-1] if occurrence_is_last else matches[min(occurrence - 1, len(matches) - 1)]
    _, _, x, y, _ = selected
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
  # Try the native hierarchy once. The published APK is a WebView app, and
  # repeatedly launching UIAutomator can take minutes while exposing no DOM.
  if dump_ui; then
    coords="$(find_bounds "$needle" "$mode" "$occurrence" 2>/dev/null || true)"
  else
    log "UIAutomator hierarchy unavailable; switching to screenshot OCR for '$needle'."
  fi
  if [[ -n "$coords" ]]; then
    read -r x y <<< "$coords"
    log "Tapping '$needle' at $x,$y (UI hierarchy)."
    timeout 10s adb -s emulator-5554 shell input tap "$x" "$y" || fail "ADB tap failed for '$needle'."
    return 0
  fi
  # OCR retries are bounded independently and do not rerun UIAutomator.
  for attempt in $(seq 1 12); do
    coords="$(ocr_find_bounds "$needle" "$occurrence" || true)"
    if [[ -n "$coords" ]]; then
      read -r x y <<< "$coords"
      log "Tapping '$needle' at $x,$y (German/English screenshot OCR, attempt $attempt/12)."
      timeout 10s adb -s emulator-5554 shell input tap "$x" "$y" || fail "ADB tap failed for '$needle'."
      return 0
    fi
    if (( attempt % 3 == 0 )); then
      log "Waiting for visible UI control '$needle' (OCR attempt $attempt/12)."
    fi
    sleep 2
  done
  local ocr_dump
  ocr_dump="$(ocr_text 2>/dev/null | tr '\n' ' ' || true)"
  fail "Could not find the UI control '$needle' in UIAutomator or OCR after bounded retries. OCR text: ${ocr_dump:0:1200}. Captured UI: $(cat "$ui_xml" 2>/dev/null | head -c 4000)"
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
read_imported_match_count() {
  # Read the rendered app text from Android's actual WebView accessibility
  # hierarchy. The published app exposes the import total as e.g.
  # "143 von 143 geladenen Partien · 143 Replays importiert".
  if ! dump_ui; then
    log "Could not refresh UIAutomator hierarchy while reading the imported match count."
    printf 'missing\n'
    return 0
  fi
  python3 - "$ui_xml" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET

try:
    root = ET.parse(sys.argv[1]).getroot()
except (OSError, ET.ParseError):
    print("missing")
    raise SystemExit(0)

texts = []
for node in root.iter("node"):
    for key in ("text", "content-desc"):
        value = node.attrib.get(key, "").strip()
        if value:
            texts.append(value)

for value in texts:
    imported = re.search(r"\\b(\\d+)\\s+Replays?\\s+importiert\\b", value, re.IGNORECASE)
    if imported:
        print(imported.group(1))
        raise SystemExit(0)
    loaded = re.search(r"\\b(\\d+)\\s+von\\s+(\\d+)\\s+geladenen\\s+Partien\\b", value, re.IGNORECASE)
    if loaded:
        print(loaded.group(2))
        raise SystemExit(0)

print("missing")
PY
}

replay_count=0
poll_started=$SECONDS
attempt=0
while (( SECONDS - poll_started < 120 )); do
  attempt=$((attempt + 1))
  # The published APK exposes only a WebView container. Re-dumping the full
  # UIAutomator hierarchy on every poll can block for 20-50 seconds; bounded
  # OCR is the intended signal here.
  replay_count="$(read_imported_match_count)"
  if [[ "$replay_count" =~ ^[0-9]+$ ]] && (( replay_count >= 1 )); then break; fi
  if (( attempt % 5 == 0 )); then
    log "Still waiting for the profile import count to become visible (elapsed=$((SECONDS - poll_started))s; poll=$attempt; observed=${replay_count:-unknown})."
  fi
  sleep 2
done
if [[ ! "$replay_count" =~ ^[0-9]+$ ]]; then
  final_ocr="$(ocr_text 2>/dev/null | tr '\n' ' ' || true)"
  fail "Could not read the published app profile import total (expected text like 0 von N Partien) within 2 minutes. This is an OCR/label detection failure, not proof of zero imported records. Last OCR screen text: ${final_ocr:0:1600}"
fi
(( replay_count >= 1 )) || fail "The published app UI reported zero imported matches after 2 minutes; expected at least one."
log "The published profile reports $replay_count imported match(es). Opening the real match list in the app UI."

# Automatic background analysis handles one replay at a time. Open a later
# imported match so the UI performs a foreground, fully persisted engine review.
adb -s emulator-5554 shell input swipe 520 1550 520 600 450
sleep 1
adb -s emulator-5554 shell input swipe 520 1550 520 600 450
sleep 2
tap_text "Coach öffnen" 1 exact
training_goal=false
coach_poll_started=$SECONDS
coach_attempt=0
while (( SECONDS - coach_poll_started < 180 )); do
  coach_attempt=$((coach_attempt + 1))
  # OCR is sufficient to detect this visible WebView action. Bound each OCR
  # call and the complete wait so a stalled OCR process cannot extend CI.
  if ocr_contains "Als Trainingsziel übernehmen"; then
    training_goal=true
    break
  fi
  if (( coach_attempt % 5 == 0 )); then
    log "Still waiting for the evidence-backed Coach training action (elapsed=$((SECONDS - coach_poll_started))s; poll=$coach_attempt)."
  fi
  if (( coach_attempt % 5 == 0 )); then adb -s emulator-5554 shell input swipe 520 1550 520 600 450 >/dev/null 2>&1 || true; fi
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
