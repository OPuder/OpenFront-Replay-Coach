#!/usr/bin/env bash
set -Eeuo pipefail

package_id="de.openfront.replaycoach"
player_id="5SVg4WbI"
ui_xml="$RUNNER_TEMP/ofrc-android-ui.xml"

log() { echo "::notice::[Android baseline UI seed] $*"; }
fail() { echo "::error::[Android baseline UI seed] $*"; exit 1; }

dump_ui() {
  timeout 25s adb -s emulator-5554 shell uiautomator dump /sdcard/ofrc-window.xml >/dev/null 2>&1 || true
  timeout 20s adb -s emulator-5554 pull /sdcard/ofrc-window.xml "$ui_xml" >/dev/null 2>&1 || true
  test -s "$ui_xml"
}

find_bounds() {
  local needle="$1"
  local mode="$2"
  python3 - "$ui_xml" "$needle" "$mode" <<'PY'
import sys, xml.etree.ElementTree as ET
path, needle, mode = sys.argv[1:]
root = ET.parse(path).getroot()
matches = []
for node in root.iter("node"):
    attrs = node.attrib
    text = " ".join((attrs.get("text", ""), attrs.get("content-desc", ""), attrs.get("hint", "")))
    if mode == "edit":
        if attrs.get("class") != "android.widget.EditText":
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
    matches.append((area, (x1+x2)//2, (y1+y2)//2, text))
if matches:
    _, x, y, _ = min(matches)
    print(f"{x} {y}")
PY
}

tap_text() {
  local needle="$1"
  local coords=""
  for attempt in $(seq 1 20); do
    dump_ui || true
    coords="$(find_bounds "$needle" text || true)"
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

tap_text "Partien"
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
for attempt in $(seq 1 600); do
  dump_ui || true
  replay_count="$(read_metric "REPLAYS GESPEICHERT")"
  if [[ "$replay_count" =~ ^[0-9]+$ ]] && (( replay_count >= 2 )); then break; fi
  sleep 2
done
[[ "$replay_count" =~ ^[0-9]+$ ]] && (( replay_count >= 2 )) || fail "The actual app UI did not show at least two saved replay records within 20 minutes; last observed count=$replay_count."
log "UI confirms $replay_count locally saved replays. Waiting for at least one hash-verified analysis."

verified_count=0
for attempt in $(seq 1 600); do
  dump_ui || true
  verified_count="$(read_metric "HASH-VERIFIZIERT")"
  if [[ "$verified_count" =~ ^[0-9]+$ ]] && (( verified_count >= 1 )); then break; fi
  sleep 2
done
[[ "$verified_count" =~ ^[0-9]+$ ]] && (( verified_count >= 1 )) || fail "No hash-verified replay analysis became visible in the real app UI."

log "Opening a real match from the UI and saving its evidence-backed training goal."
tap_text "Coach öffnen"
training_goal=false
for attempt in $(seq 1 600); do
  dump_ui || true
  if grep -qi "Als Trainingsziel übernehmen" "$ui_xml"; then
    training_goal=true
    break
  fi
  sleep 2
done
if [[ "$training_goal" == true ]]; then
  tap_text "Als Trainingsziel übernehmen"
  log "A training goal was created through the actual Coach UI."
else
  fail "The real Coach UI did not expose an evidence-backed training goal after opening the verified replay."
fi

log "Stopping the published app before the baseline storage snapshot."
adb -s emulator-5554 shell am force-stop "$package_id"
sleep 2
