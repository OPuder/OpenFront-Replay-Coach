#!/usr/bin/env bash
set -Eeuo pipefail

package_id="de.openfront.replaycoach"
phase="${1:?Usage: snapshot-android-web-storage.sh before|after}"
destination="${RUNNER_TEMP:-/tmp}/ofrc-android-storage-$phase"

log() { echo "::notice::[Android storage snapshot] $*"; }
fail() { echo "::error::[Android storage snapshot] $*"; exit 1; }

mkdir -p "$destination"
adb root >/dev/null 2>&1 || fail "The Android emulator does not permit root access; release app storage cannot be inspected safely."
timeout 60s adb -s emulator-5554 wait-for-device || fail "ADB did not reconnect after enabling emulator root."
identity="$(timeout 20s adb -s emulator-5554 shell id 2>&1)"
grep -q 'uid=0(root)' <<< "$identity" || fail "ADB root access was not confirmed."

webview_root="/data/user/0/$package_id/app_webview"
indexed_db="$(adb -s emulator-5554 shell "find '$webview_root' -type d -name IndexedDB -print -quit" | tr -d '\r')"
local_storage="$(adb -s emulator-5554 shell "find '$webview_root' -type d -name 'Local Storage' -print -quit" | tr -d '\r')"
[[ -n "$indexed_db" && -n "$local_storage" ]] || fail "Could not locate both WebView IndexedDB and Local Storage directories under $webview_root."

adb -s emulator-5554 pull "$indexed_db" "$destination/IndexedDB" >/dev/null || fail "Could not pull the baseline IndexedDB directory."
adb -s emulator-5554 pull "$local_storage" "$destination/Local Storage" >/dev/null || fail "Could not pull the baseline Local Storage directory."

python3 - "$destination" "$phase" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
phase = sys.argv[2]
files = []
for path in sorted(root.rglob("*")):
    if not path.is_file():
        continue
    if path.name in {"LOCK", "LOG", "LOG.old"} or path.name.startswith("LOG."):
        continue
    rel = path.relative_to(root).as_posix()
    data = path.read_bytes()
    files.append({"path": rel, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
immutable = [item for item in files if item["path"].endswith((".ldb", ".sst"))]
if not immutable:
    raise SystemExit("No immutable LevelDB table files were found; cannot prove persistent WebView data survived.")
manifest = {"phase": phase, "files": files, "immutableTables": immutable}
(root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(json.dumps({"phase": phase, "files": len(files), "immutableTables": len(immutable), "bytes": sum(item["size"] for item in files)}, indent=2))
PY

log "Captured IndexedDB and Local Storage LevelDB files for phase $phase at $destination."
