#!/usr/bin/env bash
# Bounded Android emulator/ADB diagnostics shared by release-upgrade CI scripts.
set -Eeuo pipefail

OFRC_ANDROID_DIAG_DIR="${RUNNER_TEMP:-/tmp}/ofrc-android-diagnostics"
mkdir -p "$OFRC_ANDROID_DIAG_DIR"

android_diag_log() {
  echo "::notice::[Android emulator] $*"
}

android_capture_diagnostics() {
  local stage="${1:-failure}"
  local prefix="$OFRC_ANDROID_DIAG_DIR/$stage"
  {
    echo "stage=$stage"
    echo "timestamp_utc=$(date -u +%FT%TZ)"
    echo "adb_version:"
    timeout 10s adb version 2>&1 || true
    echo
    echo "adb_server_status:"
    timeout 10s adb server-status 2>&1 || true
    echo
    echo "adb_devices:"
    timeout 15s adb devices -l 2>&1 || true
    echo
    echo "adb_host_processes:"
    ps -ef 2>&1 | grep -E '[a]db|[e]mulator' | tail -n 40 || true
    echo
    echo "device_get_state:"
    timeout 10s adb -s emulator-5554 get-state 2>&1 || true
    echo
    echo "boot_properties:"
    timeout 15s adb -s emulator-5554 shell getprop 2>&1 | grep -E 'sys.boot_completed|dev.bootcomplete|init.svc.bootanim|ro.boot.qemu' || true
    echo
    echo "focused_window:"
    timeout 15s adb -s emulator-5554 shell dumpsys window 2>&1 | grep -E 'mCurrentFocus|mFocusedApp' | tail -n 12 || true
    echo
    echo "resumed_activity:"
    timeout 15s adb -s emulator-5554 shell dumpsys activity activities 2>&1 | grep -E 'mResumedActivity|topResumedActivity|Resumed:' | tail -n 20 || true
    echo
    echo "package_state:"
    timeout 20s adb -s emulator-5554 shell dumpsys package de.openfront.replaycoach 2>&1 | grep -E 'versionCode=|versionName=|pkg=|User 0:|installed=' | head -n 40 || true
    echo
    echo "package_manager_ready:"
    timeout 15s adb -s emulator-5554 shell cmd package list packages 2>&1 | head -n 30 || true
    echo
    echo "logcat_android_runtime_activity_package:"
    timeout 20s adb -s emulator-5554 logcat -d -t 1200 2>&1 | grep -Ei 'FATAL EXCEPTION|AndroidRuntime|ActivityTaskManager|ActivityManager|PackageManager|PackageInstaller|installd|uiautomator|Accessibility|WindowManager|de\.openfront\.replaycoach|INSTALL_' | tail -n 240 || true
  } >"$prefix.log" 2>&1

  if timeout 30s adb -s emulator-5554 exec-out screencap -p >"$prefix.png" 2>"$prefix-screencap.log" && [[ -s "$prefix.png" ]]; then
    echo "screenshot=$prefix.png" >>"$prefix.log"
    echo "screenshot_sha256=$(sha256sum "$prefix.png" | awk '{print $1}')" >>"$prefix.log"
  else
    echo "screenshot_failed=$(cat "$prefix-screencap.log" 2>/dev/null || true)" >>"$prefix.log"
  fi
  android_diag_log "Saved stage '$stage' diagnostics under $OFRC_ANDROID_DIAG_DIR"
}

android_prepare_emulator() {
  local server_ok=false device_ok=false boot_ok=false state=""
  android_diag_log "Checking host ADB server independently from emulator state."
  if timeout 15s adb devices -l >/dev/null 2>&1; then
    server_ok=true
  else
    android_diag_log "ADB server did not answer; restarting the host ADB daemon once."
    timeout 10s adb kill-server >/dev/null 2>&1 || true
    timeout 20s adb start-server || true
    timeout 15s adb devices -l >/dev/null 2>&1 && server_ok=true
  fi
  if [[ "$server_ok" != true ]]; then
    android_capture_diagnostics "adb-server-unavailable"
    return 21
  fi

  state="$(timeout 10s adb devices -l | awk '$1 == "emulator-5554" {print $2; exit}' || true)"
  if [[ "$state" != "device" ]]; then
    android_diag_log "Emulator transport state is '$state'; requesting one controlled reconnect."
    timeout 10s adb reconnect offline >/dev/null 2>&1 || true
    timeout 60s adb -s emulator-5554 wait-for-device || true
  fi

  for attempt in 1 2 3; do
    state="$(timeout 10s adb devices -l | awk '$1 == "emulator-5554" {print $2; exit}' || true)"
    if [[ "$state" == "device" ]] && timeout 10s adb -s emulator-5554 get-state 2>/dev/null | grep -qx device; then
      device_ok=true
      break
    fi
    android_diag_log "Emulator not online (attempt $attempt/3; state=${state:-missing})."
    if [[ "$attempt" -eq 1 ]]; then
      timeout 10s adb kill-server >/dev/null 2>&1 || true
      timeout 20s adb start-server >/dev/null 2>&1 || true
      timeout 10s adb reconnect offline >/dev/null 2>&1 || true
    fi
    sleep 5
  done
  if [[ "$device_ok" != true ]]; then
    android_capture_diagnostics "emulator-adb-offline"
    return 22
  fi

  android_diag_log "ADB device emulator-5554 is online; checking Android boot completion separately."
  for attempt in $(seq 1 30); do
    state="$(timeout 4s adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [[ "$state" == "1" ]]; then boot_ok=true; break; fi
    if (( attempt % 6 == 0 )); then
      android_diag_log "Android boot not complete yet (attempt $attempt/30; sys.boot_completed=${state:-empty})."
    fi
    sleep 3
  done
  if [[ "$boot_ok" != true ]]; then
    android_capture_diagnostics "emulator-boot-incomplete"
    return 23
  fi

  local pm_ready=false
  for attempt in 1 2 3 4 5 6; do
    if timeout 5s adb -s emulator-5554 shell cmd package list packages 2>/dev/null | grep -q '^package:'; then
      pm_ready=true
      break
    fi
    sleep 3
  done
  if [[ "$pm_ready" != true ]]; then
    android_capture_diagnostics "package-manager-not-ready"
    return 24
  fi
  local qemu_identity="" model=""
  qemu_identity="$(timeout 10s adb -s emulator-5554 shell getprop ro.kernel.qemu 2>/dev/null | tr -d '\r' || true)"
  if [[ "$qemu_identity" != "1" ]]; then
    qemu_identity="$(timeout 10s adb -s emulator-5554 shell getprop ro.boot.qemu 2>/dev/null | tr -d '\r' || true)"
  fi
  model="$(timeout 10s adb -s emulator-5554 shell getprop ro.product.model 2>/dev/null | tr -d '\r' || true)"
  if [[ "$qemu_identity" != "1" ]]; then
    android_capture_diagnostics "emulator-identity-unverified"
    android_diag_log "Expected an emulator but QEMU identity was not confirmed (ro.kernel.qemu/ro.boot.qemu=$qemu_identity; model=$model)."
    return 25
  fi
  android_diag_log "ADB transport, QEMU emulator identity (model=$model), boot completion and Package Manager are independently ready."
}

android_launch_package() {
  local package_id="$1"
  local description="$2"
  local resolve_output="" launcher="" start_output="" start_status=0 pid="" activity="" system_anr=""
  if ! timeout 10s adb -s emulator-5554 get-state 2>/dev/null | grep -qx device; then
    android_capture_diagnostics "adb-lost-before-launch"
    android_diag_log "CLASSIFICATION=ADB_CONNECTION_FAILURE before launching $description."
    return 31
  fi
  resolve_output="$(timeout 20s adb -s emulator-5554 shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER "$package_id" 2>&1)" || {
    if ! timeout 10s adb -s emulator-5554 get-state 2>/dev/null | grep -qx device; then
      android_capture_diagnostics "adb-lost-during-activity-resolution"
      android_diag_log "CLASSIFICATION=ADB_CONNECTION_FAILURE while resolving the launcher for $description."
      return 31
    fi
    android_capture_diagnostics "activity-resolution-failed"
    android_diag_log "CLASSIFICATION=ACTIVITY_RESOLUTION_FAILURE for $description: $resolve_output"
    return 32
  }
  launcher="$(tr -d '\r' <<<"$resolve_output" | grep -E '^[[:alnum:]_.]+/[[:alnum:]_.$]+' | tail -n 1 || true)"
  if [[ -z "$launcher" ]]; then
    android_capture_diagnostics "activity-not-resolved"
    android_diag_log "CLASSIFICATION=ACTIVITY_RESOLUTION_FAILURE; no launcher component resolved for $description: $resolve_output"
    return 33
  fi

  start_output="$(timeout 30s adb -s emulator-5554 shell am start -W -n "$launcher" 2>&1)" || start_status=$?
  android_diag_log "Activity start for $description returned exit=$start_status: ${start_output:-<empty>}"
  if [[ "$start_status" -ne 0 ]] || grep -Eqi 'Status: error|Error:|Exception' <<<"$start_output"; then
    if ! timeout 10s adb -s emulator-5554 get-state 2>/dev/null | grep -qx device; then
      android_capture_diagnostics "adb-lost-during-activity-start"
      android_diag_log "CLASSIFICATION=ADB_CONNECTION_FAILURE during ActivityManager start for $description."
      return 31
    fi
    android_capture_diagnostics "activity-start-command-failed"
    android_diag_log "CLASSIFICATION=ACTIVITY_START_FAILURE for $description."
    return 34
  fi

  for attempt in $(seq 1 20); do
    if ! timeout 4s adb -s emulator-5554 get-state 2>/dev/null | grep -qx device; then
      android_capture_diagnostics "adb-lost-during-launch"
      android_diag_log "CLASSIFICATION=ADB_CONNECTION_FAILURE while launching $description."
      return 31
    fi
    pid="$(timeout 4s adb -s emulator-5554 shell pidof "$package_id" 2>/dev/null | tr -d '\r' || true)"
    activity="$(timeout 4s adb -s emulator-5554 shell dumpsys activity activities 2>/dev/null | grep -E 'mResumedActivity|topResumedActivity' | tail -n 2 || true)"
    if [[ -n "$pid" ]] && grep -F "$launcher" <<<"$activity" >/dev/null; then
      system_anr="$(timeout 8s adb -s emulator-5554 shell dumpsys window 2>&1 | grep -F 'Application Not Responding: system' | tail -n 1 || true)"
      if [[ -n "$system_anr" ]]; then
        android_capture_diagnostics "system-server-anr-during-launch"
        android_diag_log "CLASSIFICATION=SYSTEM_ANR; Android system_server is showing an Application Not Responding dialog while $description is nominally resumed: $system_anr"
        return 37
      fi
      android_diag_log "Activity $launcher is resumed and process $pid is running for $description."
      return 0
    fi
    sleep 2
  done

  local crash_context="" crash=""
  crash_context="$(timeout 15s adb -s emulator-5554 logcat -d -t 1200 2>&1 | grep -B 8 -A 18 -F "Process: $package_id" | tail -n 100 || true)"
  if grep -Eqi "FATAL EXCEPTION|Fatal signal" <<<"$crash_context"; then crash="$crash_context"; fi
  android_capture_diagnostics "app-launch-not-resumed"
  if [[ -n "$crash" ]]; then
    android_diag_log "CLASSIFICATION=APP_CRASH for $description; fatal runtime evidence follows: $crash"
    return 35
  fi
  android_diag_log "CLASSIFICATION=ACTIVITY_NOT_RESUMED for $description; no fatal crash evidence found. Start output: $start_output; pid: ${pid:-none}; activity: ${activity:-none}"
  return 36
}
