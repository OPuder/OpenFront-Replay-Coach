import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.env.RUNNER_TEMP ?? "/tmp";
const before = JSON.parse(readFileSync(join(root, "ofrc-android-storage-before", "manifest.json"), "utf8"));
const after = JSON.parse(readFileSync(join(root, "ofrc-android-storage-after", "manifest.json"), "utf8"));

const beforeMap = new Map(before.immutableTables.map(item => [item.path, item.sha256]));
const afterMap = new Map(after.immutableTables.map(item => [item.path, item.sha256]));
const missing = [];
const changed = [];
for (const [path, hash] of beforeMap) {
  if (!afterMap.has(path)) missing.push(path);
  else if (afterMap.get(path) !== hash) changed.push(path);
}

const beforeIndexed = before.immutableTables.filter(item => item.path.startsWith("IndexedDB/")).length;
const beforeLocal = before.immutableTables.filter(item => item.path.startsWith("Local Storage/")).length;
if (!beforeIndexed || !beforeLocal) {
  throw new Error(`Baseline did not contain both IndexedDB and Local Storage immutable tables (IndexedDB=${beforeIndexed}, LocalStorage=${beforeLocal}).`);
}
if (missing.length || changed.length) {
  throw new Error(`Persistent WebView storage changed across the APK upgrade. Missing immutable tables: ${JSON.stringify(missing)}; modified immutable tables: ${JSON.stringify(changed)}.`);
}

console.log(JSON.stringify({
  result: "PASS",
  baselineImmutableTables: beforeMap.size,
  preservedImmutableTables: beforeMap.size,
  additionalImmutableTables: afterMap.size - beforeMap.size,
  indexedDbTables: beforeIndexed,
  localStorageTables: beforeLocal,
  baselineFiles: before.files.length,
  updatedFiles: after.files.length,
}, null, 2));
