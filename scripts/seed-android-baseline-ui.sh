#!/usr/bin/env bash
set -Eeuo pipefail

package_id="de.openfront.replaycoach"
player_id="5SVg4WbI"
current_search_query=""

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
  local dump_output="" pull_output="" attempt
  for attempt in 1 2; do
    rm -f "$ui_xml"
    timeout 20s adb -s emulator-5554 shell uiautomator dump /sdcard/ofrc-window.xml >"$RUNNER_TEMP/ofrc-uiautomator-dump.log" 2>&1 || {
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

tap_edit_field() {
  local occurrence="${1:-1}" current_query="${2:-$current_search_query}" coords=""
  # The IME can resize the WebView and leave the search input clipped. Dismiss it before locating or tapping the field.
  dismiss_search_ime
  # The library field can be above the viewport or expose invalid WebView bounds.
  # Bring the toolbar into view, then prefer its current query text in OCR.
  for attempt in $(seq 1 8); do
    require_baseline_app_window
    if dump_ui; then
      coords="$(find_bounds "" edit "$occurrence" 2>/dev/null || true)"
    fi
    if [[ -z "$coords" ]]; then
      if [[ -n "$current_query" ]]; then
        coords="$(ocr_find_bounds "$current_query" 1 || true)"
      else
        coords="$(ocr_find_bounds "Match-ID suchen" 1 || true)"
        if [[ -z "$coords" ]]; then coords="$(ocr_find_bounds "Karte oder" 1 || true)"; fi
        # Some published WebView builds do not expose the empty search
        # placeholder to OCR. On the narrow layout the search field spans
        # the row directly below the third filter; use it as a visual anchor,
        # then require typed-query and exact-result verification below.
        if [[ -z "$coords" ]]; then
          anchor="$(ocr_find_bounds "Alle Spieltypen" 1 || true)"
          if [[ -z "$anchor" ]]; then anchor="$(ocr_find_bounds "Spieltypen" 1 || true)"; fi
          if [[ -n "$anchor" ]]; then
            read -r anchor_x anchor_y <<< "$anchor"
            candidate_y=$((anchor_y + 70))
            if (( anchor_x >= 100 && anchor_x <= 1000 && candidate_y >= 150 && candidate_y <= 1400 )); then
              coords="540 $candidate_y"
              log "Search placeholder not OCR-readable; using filter-row anchor $anchor_x,$anchor_y."
            fi
          fi
        fi
      fi
    fi
    if [[ -n "$coords" ]]; then
      read -r x y <<< "$coords"
      # OCR occasionally associates the placeholder with keyboard suggestion
      # text and returns coordinates inside the IME. The search input is in the central library filter card; never tap the
      # keyboard or lower cards.
      if (( x >= 100 && x <= 1000 && y >= 850 && y <= 1400 )); then
        log "Tapping the visible library search field at $x,$y (UI hierarchy/OCR, attempt $attempt/8)."
        timeout 10s adb -s emulator-5554 shell input tap "$x" "$y" || fail "ADB tap failed for the library search field."
        return 0
      fi
      coords=""
    fi
    log "Library search field not safely visible (attempt $attempt/8); scrolling toward the toolbar."
    require_baseline_app_window
    # Start well below the status-bar/notification gesture region. Drag down
    # inside the app to reveal its toolbar; never swipe from the upper edge.
    timeout 10s adb -s emulator-5554 shell input swipe 500 700 500 1250 550 >/dev/null 2>&1 || true
    sleep 1
  done
  fail "Could not locate a safely visible library search field after scrolling to the toolbar. OCR: $(ocr_text 2>/dev/null | tr '\n' ' ' | head -c 800); UI: $(cat "$ui_xml" 2>/dev/null | head -c 2500)"
}
tap_text() {
  local needle="$1"
  local occurrence="${2:-1}"
  local mode="${3:-text}"
  local required="${4:-true}"
  local max_ocr_attempts=12
  local coords=""
  if [[ "$required" == "false" ]]; then max_ocr_attempts=1; fi
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
  for attempt in $(seq 1 "$max_ocr_attempts"); do
    coords="$(ocr_find_bounds "$needle" "$occurrence" || true)"
    if [[ -n "$coords" ]]; then
      read -r x y <<< "$coords"
      log "Tapping '$needle' at $x,$y (German/English screenshot OCR, attempt $attempt/$max_ocr_attempts)."
      timeout 10s adb -s emulator-5554 shell input tap "$x" "$y" || fail "ADB tap failed for '$needle'."
      return 0
    fi
    if (( attempt % 3 == 0 )); then
      log "Waiting for visible UI control '$needle' (OCR attempt $attempt/$max_ocr_attempts)."
    fi
    sleep 2
  done
  if [[ "$required" == "false" ]]; then
    log "Optional UI control '$needle' was not found through UIAutomator/OCR; caller will use its guarded fallback."
    return 1
  fi
  local ocr_dump
  ocr_dump="$(ocr_text 2>/dev/null | tr '\n' ' ' || true)"
  fail "Could not find the UI control '$needle' in UIAutomator or OCR after bounded retries. OCR text: ${ocr_dump:0:1200}. Captured UI: $(cat "$ui_xml" 2>/dev/null | head -c 4000)"
}

log "Rechecking ADB transport and boot state before launching the published baseline."
android_prepare_emulator || fail "Baseline emulator preparation failed; inspect stage-specific ADB/boot diagnostics."
log "Launching the genuine published v2.2.51 APK and classifying ADB, ActivityManager and crash failures."
android_launch_package "$package_id" "the published v2.2.51 baseline APK" || fail "Published baseline app launch failed; see classified emulator diagnostics."
sleep 20
# A non-debuggable WebView can initially expose only its container to
# UIAutomator. The same screen may expose its DOM-backed EditText nodes a few
# seconds later, so do not treat the first valid-but-shallow hierarchy as a
# missing field or fall back to OCR immediately.
coords=""
for attempt in $(seq 1 15); do
  if dump_ui; then
    coords="$(find_bounds "" edit 1 2>/dev/null || true)"
    if [[ -n "$coords" ]]; then
      log "Located the profile input through the expanded WebView accessibility hierarchy (attempt $attempt/15)."
      break
    fi
  fi
  if (( attempt % 3 == 0 )); then
    log "Waiting for the WebView profile EditText to appear in UIAutomator (attempt $attempt/15)."
  fi
  sleep 2
done
if [[ -z "$coords" ]]; then
  log "The WebView accessibility tree did not expose an editable field after bounded retries; trying screenshot OCR as a fallback."
  coords="$(ocr_find_bounds "OpenFront-Profillink" 1 || true)"
  if [[ -z "$coords" ]]; then coords="$(ocr_find_bounds "Profillink" 1 || true)"; fi
  if [[ -z "$coords" ]]; then coords="$(ocr_find_bounds "Spieler-ID" 1 || true)"; fi
fi
if [[ -z "$coords" ]]; then
  ocr_dump="$(ocr_text 2>/dev/null | tr '\n' ' ' || true)"
  fail "Could not locate the profile input field in the WebView after waiting for accessibility nodes and trying OCR. OCR text: ${ocr_dump:0:1200}"
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
wait_for_library_page() {
  local wait_seconds="${1:-12}"
  local started=$SECONDS ocr_dump=""
  while (( SECONDS - started < wait_seconds )); do
    if dump_ui && grep -q 'text="Spielbibliothek"' "$ui_xml"; then
      log "Verified that the published app is on the Spielbibliothek page through UIAutomator."
      return 0
    fi
    # Published WebView accessibility sometimes omits page headings. Verify the
    # actual visible screen with OCR as a second independent signal.
    ocr_dump="$(ocr_text 2>/dev/null | tr '\n' ' ' || true)"
    if grep -qi "Spielbibliothek" <<< "$ocr_dump"; then
      log "Verified that the published app is on the Spielbibliothek page through screenshot OCR."
      return 0
    fi
    sleep 2
  done
  return 1
}

baseline_app_window_is_focused() {
  local window_state="" current_focus="" focused_app=""
  window_state="$(timeout 10s adb -s emulator-5554 shell dumpsys window 2>&1)" || return 1
  current_focus="$(grep -E 'mCurrentFocus=' <<< "$window_state" | tail -n 1 || true)"
  focused_app="$(grep -E 'mFocusedApp=' <<< "$window_state" | tail -n 1 || true)"
  # A notification shade or launcher focus is never a safe target for WebView
  # coordinates, even when ActivityManager still reports the app as resumed.
  if [[ "$current_focus" =~ NotificationShade|com\.android\.systemui|QuickstepLauncher ]]; then return 1; fi
  if [[ "$current_focus" == *"$package_id"* ]] && { [[ -z "$focused_app" ]] || [[ "$focused_app" == *"$package_id"* ]]; }; then return 0; fi
  if [[ "$current_focus" =~ InputMethod|input_method ]] && [[ "$focused_app" == *"$package_id"* ]]; then return 0; fi
  return 1
}
require_baseline_app_window() {
  local focus_state=""
  focus_state="$(timeout 10s adb -s emulator-5554 shell dumpsys window 2>&1 | grep -E 'mCurrentFocus=|mFocusedApp=' | tail -n 2 || true)"
  baseline_app_window_is_focused || fail "The published baseline app is not safely foregrounded; refusing Back or coordinate gestures. Window focus: ${focus_state:-unavailable}"
}

navigate_to_library() {
  log "Navigating to the published app's match library with verified UI retries."
  for attempt in 1 2 3; do
    local tapped=false coords="" x="" y="" screen_size="" screen_width="" screen_height=""
    if (( attempt == 1 )); then
      if tap_text "Partien" last exact false; then
        tapped=true
      else
        log "Partien was not available through the first fresh UI/OCR lookup; continuing to guarded fallbacks."
      fi
    elif (( attempt == 2 )); then
      # Re-sample the visible label once. If OCR cannot provide fresh bounds,
      # do not hard-fail here; the final viewport fallback is independently guarded.
      coords="$(ocr_find_bounds "Partien" last || true)"
      if [[ -n "$coords" ]]; then
        read -r x y <<< "$coords"
        if (( x >= 350 && x <= 730 && y >= 1600 && y <= 1800 )); then
          log "Retrying the visible Partien navigation label at $x,$y using fresh OCR bounds."
          timeout 10s adb -s emulator-5554 shell input tap "$x" "$y" || fail "ADB retry tap failed for Partien navigation."
          tapped=true
        else
          log "Fresh Partien OCR bounds ($x,$y) were outside the safe bottom-navigation viewport; refusing that tap."
        fi
      else
        log "OCR did not return fresh Partien bounds; continuing to the guarded viewport fallback."
      fi
    else
      # Accessibility and OCR can both fail while the published WebView is
      # rendering. Verify the app still owns the foreground window, then derive
      # a fresh center point from the emulator's current supported viewport.
      require_baseline_app_window
      screen_size="$(timeout 10s adb -s emulator-5554 shell wm size | sed -n 's/.*: \\([0-9]*\\)x\\([0-9]*\\).*/\\1 \\2/p' | tail -n 1)"
      read -r screen_width screen_height <<< "$screen_size"
      if [[ "$screen_width" =~ ^[0-9]+$ && "$screen_height" =~ ^[0-9]+$ ]] && (( screen_width >= 800 && screen_height >= 1400 )); then
        nav_x=$((screen_width / 2))
        nav_y=$((screen_height * 89 / 100))
        if (( nav_x > 0 && nav_x < screen_width && nav_y > 0 && nav_y < screen_height )); then
          log "Using verified bottom-navigation fallback at $nav_x,$nav_y for $screen_width x $screen_height viewport."
          timeout 10s adb -s emulator-5554 shell input tap "$nav_x" "$nav_y" || fail "ADB fallback tap failed for Partien navigation."
          tapped=true
        else
          fail "Calculated Partien navigation point is outside the current Android viewport: $nav_x,$nav_y in $screen_width x $screen_height."
        fi
      else
        fail "Cannot safely calculate bottom-navigation fallback from Android screen size: $screen_size"
      fi
    fi
    if [[ "$tapped" == "true" ]] && wait_for_library_page 12; then return 0; fi
    if [[ "$tapped" == "true" ]]; then
      log "Partien navigation did not verify after attempt $attempt/3; retrying with fresh bounds."
    else
      log "No safe Partien tap was available on attempt $attempt/3; retrying."
    fi
  done
  fail "The Partien navigation did not reach the Spielbibliothek after three verified attempts. OCR: $(ocr_text 2>/dev/null | tr '\n' ' ' | head -c 1200); UI: $(cat "$ui_xml" 2>/dev/null | head -c 3500)"
}
navigate_to_library
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

combined_text = " ".join(texts)
for value in (combined_text, *texts):
    imported = re.search(r"\b(\d+)\s+Replays?\s+importiert\b", value, re.IGNORECASE)
    if imported:
        print(imported.group(1))
        raise SystemExit(0)
    loaded = re.search(r"\b(\d+)\s+von\s+(\d+)\s+geladenen\s+Partien\b", value, re.IGNORECASE)
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
  # Read the accessible WebView hierarchy, not a guessed dashboard statistic.
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
log "The published profile reports $replay_count imported match(es). Verifying the library page before opening a compatible replay."

# These two public matches were exported from the archived profile used above.
# Both carry the exact 9f4a28f16fae engine commit bundled in the published baseline.
# Fixed IDs avoid selecting a newer profile match whose engine is not in v2.2.51.
wait_for_search_ime() {
  local ime_state="" attempt
  for attempt in $(seq 1 8); do
    ime_state="$(timeout 8s adb -s emulator-5554 shell dumpsys input_method 2>&1 || true)"
    if grep -Eiq 'mInputShown=true|mInputViewShown=true|isInputViewShown=true|mShowRequested=true' <<< "$ime_state"; then
      log "Android input method is ready (attempt $attempt/8); allowing the WebView field to settle."
      sleep 1
      return 0
    fi
    sleep 1
  done
  log "IME visibility is not exposed by dumpsys input_method; waiting briefly before verified typing."
  sleep 2
}

dismiss_search_ime() {
  local ime_state="" ime_state_lc="" attempt visibility_flags="" hidden_streak=0
  local visible_pattern='minputshown=true'
  local hidden_pattern='minputshown=false'
  ime_state="$(timeout 8s adb -s emulator-5554 shell dumpsys input_method 2>&1)" || fail "Could not read Android IME state before re-focusing the library search field."
  [[ -n "$ime_state" ]] || fail "Android IME state was empty; refusing to guess whether the keyboard covers the WebView."
  ime_state_lc="${ime_state,,}"
  visibility_flags="$(grep -Eo 'minputshown=(true|false)|minputviewshown=(true|false)|isinputviewshown=(true|false)' <<< "$ime_state_lc" | tr '\n' ' ' || true)"
  log "Android IME visibility flags: ${visibility_flags:-not exposed}."
  if grep -Eq "$visible_pattern" <<< "$ime_state_lc"; then
    require_baseline_app_window
    log "Android reports mInputShown=true; dismissing the keyboard while the baseline app remains foregrounded."
    timeout 10s adb -s emulator-5554 shell input keyevent 4 || fail "Could not dismiss Android keyboard before re-focusing the library search field."
  elif grep -Eq "$hidden_pattern" <<< "$ime_state_lc"; then
    log "Android reports mInputShown=false; treating secondary IME view flags as diagnostic only and never sending Back."
  else
    fail "Android IME visibility is unknown (${visibility_flags:-no visibility flags}); refusing to send Back or tap coordinates that may be covered by the keyboard."
  fi
  for attempt in $(seq 1 8); do
    ime_state="$(timeout 8s adb -s emulator-5554 shell dumpsys input_method 2>&1)" || fail "Could not re-check Android IME visibility after dismissal."
    [[ -n "$ime_state" ]] || fail "Android IME state became empty after dismissal; refusing to guess keyboard visibility."
    ime_state_lc="${ime_state,,}"
    visibility_flags="$(grep -Eo 'minputshown=(true|false)|minputviewshown=(true|false)|isinputviewshown=(true|false)' <<< "$ime_state_lc" | tr '\n' ' ' || true)"
    if grep -Eq "$hidden_pattern" <<< "$ime_state_lc"; then
      hidden_streak=$((hidden_streak + 1))
      if (( hidden_streak >= 2 )); then
        require_baseline_app_window
        if grep -Eq 'minputviewshown=true|isinputviewshown=true' <<< "$ime_state_lc"; then
          log "Secondary IME view flags remain stale while mInputShown=false; primary window visibility is stable, so no Back is sent."
        else
          log "Android keyboard is confirmed hidden (${visibility_flags:-primary visibility flag}); no Back is sent."
        fi
        log "The WebView search field will be re-located from fresh UI/OCR bounds after the IME dismissal."
        return 0
      fi
    elif grep -Eq "$visible_pattern" <<< "$ime_state_lc"; then
      hidden_streak=0
      require_baseline_app_window
    else
      fail "Android IME visibility became unknown after dismissal (${visibility_flags:-no visibility flags}); refusing to tap clipped coordinates."
    fi
    sleep 1
  done
  fail "Android keyboard did not remain hidden for two consecutive checks; refusing to tap coordinates clipped by the IME."
}

search_query_visible() {
  local query="$1"
  if dump_ui && grep -Fi "text=\"$query\"" "$ui_xml" >/dev/null; then return 0; fi
  ocr_text 2>/dev/null | grep -Fi "$query" >/dev/null
}

send_search_query_by_keyevents() {
  local query="$1" char ascii keycode index
  local -a keycodes=()
  [[ "$query" =~ ^[a-z0-9]+$ ]] || fail "Refusing key-event fallback for non-alphanumeric search query."
  for ((index=0; index<${#query}; index++)); do
    char="${query:index:1}"
    printf -v ascii '%d' "'$char"
    if [[ "$char" =~ [a-z] ]]; then
      keycode=$((ascii - 68)) # Android KEYCODE_A (29) through KEYCODE_Z (54)
    elif [[ "$char" =~ [0-9] ]]; then
      keycode=$((ascii - 41)) # Android KEYCODE_1 (8) through KEYCODE_9 (16), KEYCODE_0 (7)
    else
      fail "Unsupported character in archived replay ID."
    fi
    keycodes+=("$keycode")
  done
  log "Typing the verified alphanumeric search query with Android key events as an IME fallback."
  for keycode in "${keycodes[@]}"; do
    timeout 5s adb -s emulator-5554 shell input keyevent "$keycode" || fail "Android key-event fallback failed for the library search query."
  done
}

seed_verified_match() {
  local game_id="$1" expected_commit="$2" clear_search="$3"
  log "Filtering the actual published library to archived match $game_id (expected engine $expected_commit)."
  # The previous Coach page may have been scrolled to its training section.
  # Return the library viewport to its search toolbar before interacting.
  for _ in 1 2 3; do
    timeout 10s adb -s emulator-5554 shell input swipe 500 420 500 1500 500 >/dev/null 2>&1 || true
  done
  # The published WebView exposes this input as an unnamed EditText node
  # (NAF=true); its placeholder is visible in pixels but absent from the
  # accessibility text, so OCR is both slower and less reliable than bounds.
  tap_edit_field 1 "$current_search_query"
  # Wait for Android's IME before any edit/select command; the published WebView
  # may ignore Ctrl+A while the keyboard/focus transition is still settling.
  local search_query typed=false
  search_query="$(printf '%s' "$game_id" | tr '[:upper:]' '[:lower:]')"
  wait_for_search_ime
  if [[ "$clear_search" == "true" ]]; then
    timeout 10s adb -s emulator-5554 shell input keycombination 113 29 >/dev/null 2>&1 || fail "Could not select the previous library search query."
  fi
  log "Entering archived match ID $game_id with the Android text-input command."
  timeout 10s adb -s emulator-5554 shell input text "$search_query" || log "Android text-input command returned nonzero; will verify and use key-event fallback if needed."
  sleep 1
  for attempt in $(seq 1 5); do
    if search_query_visible "$search_query"; then
      typed=true
      log "Verified search query $search_query after text-input attempt $attempt/5."
      break
    fi
    sleep 1
  done
  if [[ "$typed" != true ]]; then
    log "Text input did not appear in the focused search field; dismissing the IME, re-locating the visible input, and retrying with individual Android key events."
    dismiss_search_ime
    tap_edit_field 1 "$current_search_query"
    wait_for_search_ime
    timeout 10s adb -s emulator-5554 shell input keycombination 113 29 >/dev/null 2>&1 || true
    timeout 10s adb -s emulator-5554 shell input keyevent 67 >/dev/null 2>&1 || true
    send_search_query_by_keyevents "$search_query"
    sleep 1
    for attempt in $(seq 1 6); do
      if search_query_visible "$search_query"; then
        typed=true
        log "Verified search query $search_query after key-event fallback (attempt $attempt/6)."
        break
      fi
      sleep 1
    done
  fi
  [[ "$typed" == true ]] || fail "Android text input and key-event fallback both failed to populate the library search field for $game_id; refusing to treat an empty search as a match."
  current_search_query="$search_query"
  # Commit the verified query with ENTER before hiding the keyboard.
  timeout 10s adb -s emulator-5554 shell input keyevent 66 || fail "Could not commit archived match ID $game_id in the library search."
  sleep 2
  timeout 10s adb -s emulator-5554 shell input keyevent 4 || fail "Could not dismiss the Android keyboard after committing archived match ID $game_id."
  sleep 2

  # Do not scroll blindly while the filter is still unconfirmed: doing so can
  # move the input and card off-screen and make a failed search look like a
  # missing Coach button. First require the exact one-result state and ID.
  local filtered=false visible_coach_button="" search_screen_text=""
  for attempt in $(seq 1 12); do
    if dump_ui && grep -Fi "$game_id" "$ui_xml" >/dev/null &&
       grep -F "1 aktuell gefiltert" "$ui_xml" >/dev/null; then
      filtered=true
      break
    fi
    if (( attempt % 3 == 0 )); then
      search_screen_text="$(ocr_text 2>/dev/null | tr '\n' ' ' || true)"
      log "Waiting for exact library search result $game_id (attempt $attempt/12). Current screen: ${search_screen_text:0:500}"
    fi
    sleep 2
  done
  [[ "$filtered" == true ]] || fail "The library search did not reduce the results to exactly one match for $game_id after committing the Android input. Last screen: ${search_screen_text:0:1200}; UI: $(cat "$ui_xml" 2>/dev/null | head -c 2500)"

  # Android's UIAutomator often reports WebView DOM nodes with [0,0][0,0]
  # bounds even when the text is visible. Use screenshot OCR as a fallback
  # and tap the visible label rather than rejecting an actionable card.
  local coach_button_source="UI hierarchy"
  for attempt in $(seq 1 12); do
    if dump_ui; then
      visible_coach_button="$(find_bounds "Coach öffnen" exact 1 2>/dev/null || true)"
    else
      visible_coach_button=""
    fi
    if [[ -z "$visible_coach_button" ]]; then
      visible_coach_button="$(ocr_find_bounds "Coach öffnen" 1 || true)"
      if [[ -n "$visible_coach_button" ]]; then coach_button_source="screenshot OCR"; fi
    fi
    if [[ -n "$visible_coach_button" ]]; then
      read -r candidate_x candidate_y <<< "$visible_coach_button"
      # The fixed bottom navigation overlays the WebView. Do not clamp a tap
      # into the nav bar: scroll the library until the CTA is safely exposed.
      if (( candidate_y <= 1500 )); then
        break
      fi
      log "Coach action is too close to the bottom navigation (y=$candidate_y); scrolling it into the safe viewport (attempt $attempt/12)."
      visible_coach_button=""
    fi
    timeout 10s adb -s emulator-5554 shell input swipe 500 1450 500 450 500 >/dev/null 2>&1 || true
    sleep 1
  done
  [[ -n "$visible_coach_button" ]] || fail "The unique archived match $game_id was filtered correctly, but its Coach action could not be located in the safe viewport by UIAutomator or OCR after scrolling. UI: $(cat "$ui_xml" 2>/dev/null | head -c 3000)"

  read -r coach_x coach_y <<< "$visible_coach_button"
  (( coach_y <= 1500 )) || fail "Refusing to tap Coach action for $game_id outside the safe WebView viewport (y=$coach_y)."
  log "Tapping the visible Coach action for $game_id at $coach_x,$coach_y ($coach_button_source)."
  timeout 10s adb -s emulator-5554 shell input tap "$coach_x" "$coach_y" || fail "ADB tap failed for the visible Coach action on $game_id."
  log "Opened archived match $game_id. Waiting for its actual Original-Engine result."

  local started=$SECONDS state=""
  while (( SECONDS - started < 600 )); do
    if dump_ui; then
      if grep -F "REPLAY GELADEN · ENGINE FEHLT" "$ui_xml" >/dev/null; then
        fail "Archived match $game_id does not have its expected bundled Original-Engine $expected_commit in the published baseline. Refusing to treat an unsupported replay as verified."
      fi
      if grep -F "ANALYSE VERIFIZIERT" "$ui_xml" >/dev/null && grep -F "Replay erfolgreich reproduziert" "$ui_xml" >/dev/null; then
        log "Archived match $game_id completed a verified Original-Engine simulation."
        return 0
      fi
      if grep -F "ANALYSE IN VORBEREITUNG" "$ui_xml" >/dev/null; then
        state="simulation still running"
      fi
    fi
    if (( (SECONDS - started) % 60 < 10 )); then
      log "Waiting for verified replay $game_id (elapsed=$((SECONDS - started))s; $state)."
    fi
    sleep 8
  done
  fail "Archived match $game_id did not complete a hash-verified Original-Engine simulation within 10 minutes. Last UI: $(cat "$ui_xml" 2>/dev/null | head -c 5000)"
}

# The baseline must contain two genuine, engine-verified matches. A training
# goal is optional in the published baseline; if one exists, the inspector must
# prove it references persisted data. A generic card "ready" label is not enough:
# validate the exact replay after opening it before accepting it as a fixture.
seed_verified_match "cRVdxGEG5j" "9f4a28f16fae951df0daf727e5e64b34ce8b77d1" false

navigate_to_library
seed_verified_match "c4CW3VJWQ9" "9f4a28f16fae951df0daf727e5e64b34ce8b77d1" true
log "Stopping the published app before the baseline storage snapshot."
adb -s emulator-5554 shell am force-stop "$package_id"
sleep 2
