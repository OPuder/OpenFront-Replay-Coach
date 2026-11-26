import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.env.RUNNER_TEMP ?? "/tmp";
const beforePath = process.argv[2] ?? join(root, "ofrc-android-storage-before", "manifest.json");
const afterPath = process.argv[3] ?? join(root, "ofrc-android-storage-after", "manifest.json");
const exact = process.argv[4] === "--exact";
const before = JSON.parse(readFileSync(beforePath, "utf8"));
const after = JSON.parse(readFileSync(afterPath, "utf8"));

const isPersistentLevelDbFile = path => /\.(?:ldb|sst)$/i.test(path) || /(?:^|\/)\d+\.log$/i.test(path);
const localStorageDataFiles = manifest => manifest.files.filter(item =>
  item.path.startsWith("Local Storage/") && isPersistentLevelDbFile(item.path));
const beforeIndexedTables = before.immutableTables.filter(item => item.path.startsWith("IndexedDB/"));
const beforeLocalStorageTables = before.immutableTables.filter(item => item.path.startsWith("Local Storage/"));
const beforeLocalStorageFiles = localStorageDataFiles(before);
const afterLocalStorageFiles = localStorageDataFiles(after);

if (!beforeIndexedTables.length) {
  throw new Error("Baseline did not contain IndexedDB immutable tables; cannot prove persisted replay data survived the APK upgrade.");
}
if (!beforeLocalStorageFiles.length) {
  throw new Error("Baseline Local Storage did not contain persistent LevelDB data files (immutable tables or numbered write-ahead logs).");
}

if (exact) {
  // Used immediately after Package Manager rejects an invalid APK, while the
  // valid app remains force-stopped. At this point no app startup/background
  // analysis is allowed to mutate the WebView database between snapshots.
  const persistentFiles = manifest => manifest.files.filter(item =>
    item.path.startsWith("IndexedDB/") || item.path.startsWith("Local Storage/"));
  const fileMap = manifest => new Map(persistentFiles(manifest).map(item => [item.path, item]));
  const beforeFiles = fileMap(before);
  const afterFiles = fileMap(after);
  const missing = [];
  const changed = [];
  const added = [];
  for (const [path, file] of beforeFiles) {
    const current = afterFiles.get(path);
    if (!current) missing.push(path);
    else if (current.sha256 !== file.sha256 || current.size !== file.size) changed.push(path);
  }
  for (const path of afterFiles.keys()) {
    if (!beforeFiles.has(path)) added.push(path);
  }
  if (missing.length || changed.length || added.length) {
    throw new Error(`Persistent WebView files changed after failed APK install. Missing: ${JSON.stringify(missing)}; modified: ${JSON.stringify(changed)}; added: ${JSON.stringify(added)}.`);
  }
  console.log(JSON.stringify({
    result: "PASS",
    comparison: "exact-persistent-files",
    indexedDbFiles: persistentFiles(before).filter(item => item.path.startsWith("IndexedDB/")).length,
    localStorageFiles: persistentFiles(before).filter(item => item.path.startsWith("Local Storage/")).length,
    unchangedPersistentFiles: beforeFiles.size,
  }, null, 2));
} else {
  const beforeMap = new Map(before.immutableTables.map(item => [item.path, item.sha256]));
  const afterMap = new Map(after.immutableTables.map(item => [item.path, item.sha256]));
  const missing = [];
  const changed = [];
  for (const [path, hash] of beforeMap) {
    if (!afterMap.has(path)) missing.push(path);
    else if (afterMap.get(path) !== hash) changed.push(path);
  }

  const beforeLocalStorageMap = new Map(beforeLocalStorageFiles.map(item => [item.path, item.sha256]));
  const afterLocalStorageMap = new Map(afterLocalStorageFiles.map(item => [item.path, item.sha256]));
  const missingLocalStorageFiles = [];
  const changedLocalStorageFiles = [];
  for (const [path, hash] of beforeLocalStorageMap) {
    if (!afterLocalStorageMap.has(path)) missingLocalStorageFiles.push(path);
    else if (afterLocalStorageMap.get(path) !== hash) changedLocalStorageFiles.push(path);
  }

  if (missing.length || changed.length) {
    throw new Error(`Persistent IndexedDB storage changed across the APK upgrade. Missing immutable tables: ${JSON.stringify(missing)}; modified immutable tables: ${JSON.stringify(changed)}.`);
  }
  if (missingLocalStorageFiles.length || changedLocalStorageFiles.length) {
    throw new Error(`Persistent Local Storage data changed across the APK upgrade. Missing data files: ${JSON.stringify(missingLocalStorageFiles)}; modified data files: ${JSON.stringify(changedLocalStorageFiles)}.`);
  }

  console.log(JSON.stringify({
    result: "PASS",
    comparison: "upgrade-persistence",
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
}
