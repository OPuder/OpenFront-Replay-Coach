#!/usr/bin/env bash
set -Eeuo pipefail

package_id="de.openfront.replaycoach"
player_id="5SVg4WbI"
ui_xml="$RUNNER_TEMP/ofrc-android-ui.xml"

log() { echo "::notice::[Android baseline UI seed] $*"; }
fail() { echo "::error::[Android baseline UI seed] $*"; exit 1; }

dump_ui() {
  local dump_output="" pull_output=""
  for attempt in 1 2; do
    rm -f "$ui_xml"
    timeout 75s adb -s emulator-5554 shell uiautomator dump --compressed /sdcard/ofrc-window.xml >"$RUNNER_TEMP/ofrc-uiautomator-dump.log" 2>&1 || {
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
  return 1
}

find_bounds() {
  local needle="$1"
  local mode="$2"
  local occurrence="${3:-1}"
  python3 - "$ui_xml" "$needle" "$mode" "$occurrence" <<'PY'
import sys, xml.etree.ElementTree as ET
path, needle, mode, occurrence = sys.argv[1:]
occurrence = max(1, int(occurrence))
root = ET.parse(path).getroot()
matches = []
for node in root.iter("node"):
    attrs = node.attrib
    text = " ".join((attrs.get("text", ""), attrs.get("content-desc", ""), attrs.get("hint", "")))
    if mode == "edit":
        if attrs.get("class") != "android.widget.EditText":
            continue
    elif mode == "exact":
        if attrs.get("text", "").strip().lower() != needle.lower():
            continue
    elif needle.lower() not in text.lower():
        continue
    bounds = attrs.get("bounds", "")
    try:
        left_top, right_bottom = bounds.strip("[]").split("][")
        x1, y1 = map(int, left_top.split(","))
        x2, y2 = map(int, right_bottom.split(","))
    except Exception:
        continue
    area = (x2 - x1) * (y2 - y1)
    matches.append((area, len(matches), (x1+x2)//2, (y1+y2)//2, text))
if matches:
    matches.sort(key=lambda item: (item[0], item[1]))
    _, _, x, y, _ = matches[min(occurrence - 1, len(matches) - 1)]
    print(f"{x} {y}")
PY
}

tap_text() {
  local needle="$1"
  local occurrence="${2:-1}"
  local mode="${3:-text}"
  local coords=""
  for attempt in $(seq 1 20); do
    dump_ui || true
    coords="$(find_bounds "$needle" "$mode" "$occurrence" || true)"
    if [[ -n "$coords" ]]; then
      read -r x y <<< "$coords"
      adb -s emulator-5554 shell input tap "$x" "$y"
      return 0
    fi
    sleep 2
  done
  fail "Could not find the UI control '$needle'. Captured UI: $(cat "$ui_xml" 2>/dev/null | head -c 4000)"
}

log "Launching the genuine published v2.2.51 APK for UI-based profile and replay creation."
timeout 30s adb -s emulator-5554 shell monkey -p "$package_id" 1 >/dev/null || fail "Published app did not launch."
sleep 8
dump_ui || fail "Could not inspect the published app UI."
coords="$(find_bounds "" edit || true)"
[[ -n "$coords" ]] || fail "Could not locate the profile input field in the actual app UI."
read -r input_x input_y <<< "$coords"
adb -s emulator-5554 shell input tap "$input_x" "$input_y"
adb -s emulator-5554 shell input text "$player_id"
adb -s emulator-5554 shell input keyevent 4
tap_text "Konto laden"

profile_ready=false
for attempt in $(seq 1 90); do
  dump_ui || true
  if grep -qi "Konto geladen" "$ui_xml" || grep -qi "Spieler-ID:" "$ui_xml"; then
    profile_ready=true
    break
  fi
  sleep 2
done
[[ "$profile_ready" == true ]] || fail "The real UI did not finish loading the archived player's public profile."
log "The public profile loaded through the app UI. Waiting for automatic import of full replay records."

tap_text "Partien" 1 exact
read_metric() {
  local label="$1"
  python3 - "$ui_xml" "$label" <<'PY'
import sys, xml.etree.ElementTree as ET
try:
    nodes = list(ET.parse(sys.argv[1]).getroot().iter("node"))
except Exception:
    print(0); raise SystemExit
label = sys.argv[2].upper()
for index, node in enumerate(nodes):
    if label in node.attrib.get("text", "").upper():
        for candidate in nodes[index+1:index+9]:
            value = candidate.attrib.get("text", "").strip().replace(",", "")
            if value.isdigit():
                print(value); raise SystemExit
print(0)
PY
}

replay_count=0
for attempt in $(seq 1 240); do
  dump_ui || true
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
  dump_ui || true
  if grep -qi "Als Trainingsziel übernehmen" "$ui_xml"; then
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
