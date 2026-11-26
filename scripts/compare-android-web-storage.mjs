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

const beforeIndexedTables = before.immutableTables.filter(item => item.path.startsWith("IndexedDB/"));
const beforeLocalStorageTables = before.immutableTables.filter(item => item.path.startsWith("Local Storage/"));
const isPersistentLevelDbFile = path => /\.(?:ldb|sst)$/i.test(path) || /(?:^|\/)\d+\.log$/i.test(path);
const localStorageDataFiles = manifest => manifest.files.filter(item =>
  item.path.startsWith("Local Storage/") && isPersistentLevelDbFile(item.path));
const beforeLocalStorageFiles = localStorageDataFiles(before);
const afterLocalStorageFiles = localStorageDataFiles(after);
const beforeLocalStorageMap = new Map(beforeLocalStorageFiles.map(item => [item.path, item.sha256]));
const afterLocalStorageMap = new Map(afterLocalStorageFiles.map(item => [item.path, item.sha256]));
const missingLocalStorageFiles = [];
const changedLocalStorageFiles = [];
for (const [path, hash] of beforeLocalStorageMap) {
  if (!afterLocalStorageMap.has(path)) missingLocalStorageFiles.push(path);
  else if (afterLocalStorageMap.get(path) !== hash) changedLocalStorageFiles.push(path);
}

if (!beforeIndexedTables.length) {
  throw new Error("Baseline did not contain IndexedDB immutable tables; cannot prove persisted replay data survived the APK upgrade.");
}
if (!beforeLocalStorageFiles.length) {
  throw new Error("Baseline Local Storage did not contain persistent LevelDB data files (immutable tables or numbered write-ahead logs).");
}
if (missing.length || changed.length) {
  throw new Error(`Persistent IndexedDB storage changed across the APK upgrade. Missing immutable tables: ${JSON.stringify(missing)}; modified immutable tables: ${JSON.stringify(changed)}.`);
}
if (missingLocalStorageFiles.length || changedLocalStorageFiles.length) {
  throw new Error(`Persistent Local Storage data changed across the APK upgrade. Missing data files: ${JSON.stringify(missingLocalStorageFiles)}; modified data files: ${JSON.stringify(changedLocalStorageFiles)}.`);
}

console.log(JSON.stringify({
  result: "PASS",
  baselineImmutableTables: beforeMap.size,
  preservedImmutableTables: beforeMap.size,
  additionalImmutableTables: afterMap.size - beforeMap.size,
  indexedDbTables: beforeIndexedTables.length,
  localStorageTables: beforeLocalStorageTables.length,
  baselineLocalStorageDataFiles: beforeLocalStorageFiles.length,
  preservedLocalStorageDataFiles: beforeLocalStorageFiles.length,
  localStorageWriteAheadLogs: beforeLocalStorageFiles.filter(item => /(?:^|\/)\d+\.log$/i.test(item.path)).length,
  baselineFiles: before.files.length,
  updatedFiles: after.files.length,
}, null, 2));
