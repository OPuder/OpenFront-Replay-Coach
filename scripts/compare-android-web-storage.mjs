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
  // IndexedDB is a logical database, not an immutable collection of LevelDB files.
  // Schema upgrades can compact/rewrite .ldb tables, so byte-for-byte table
  // equality is invalid here. The inspector validates exact replay IDs, raw
  // GameRecords, engine metadata, verified analyses and training-goal data.
  // Local Storage is separate from IndexedDB: compare its data-bearing LevelDB
  // files across the update so a rewrite or loss cannot be mistaken for survival.
  const afterIndexedTables = after.immutableTables.filter(item => item.path.startsWith("IndexedDB/"));
  if (!afterIndexedTables.length) {
    throw new Error("IndexedDB has no persistent immutable tables after the APK upgrade.");
  }


  const beforeLocalStorageByPath = new Map(beforeLocalStorageFiles.map(item => [item.path, item]));
  const afterLocalStorageByPath = new Map(afterLocalStorageFiles.map(item => [item.path, item]));
  const missingLocalStorageFiles = [];
  const modifiedLocalStorageFiles = [];
  const addedLocalStorageFiles = [];
  for (const [path, file] of beforeLocalStorageByPath) {
    const current = afterLocalStorageByPath.get(path);
    if (!current) missingLocalStorageFiles.push(path);
    else if (current.sha256 !== file.sha256 || current.size !== file.size) modifiedLocalStorageFiles.push(path);
  }
  for (const path of afterLocalStorageByPath.keys()) {
    if (!beforeLocalStorageByPath.has(path)) addedLocalStorageFiles.push(path);
  }
  if (missingLocalStorageFiles.length) {
    throw new Error(`Missing data files across APK upgrade: ${JSON.stringify(missingLocalStorageFiles)}.`);
  }
  if (modifiedLocalStorageFiles.length) {
    throw new Error(`Local Storage modified data files across APK upgrade: ${JSON.stringify(modifiedLocalStorageFiles)}.`);
  }
  if (addedLocalStorageFiles.length) {
    throw new Error(`Added Local Storage data files across APK upgrade: ${JSON.stringify(addedLocalStorageFiles)}.`);
  }

  console.log(JSON.stringify({
    result: "PASS",
    comparison: "logical-indexeddb-plus-hash-verified-localstorage-files",
    baselineIndexedDbTables: beforeIndexedTables.length,
    postUpgradeIndexedDbTables: afterIndexedTables.length,
    baselineLocalStorageDataFiles: beforeLocalStorageFiles.length,
    preservedLocalStorageDataFiles: beforeLocalStorageFiles.length,
    localStorageWriteAheadLogs: afterLocalStorageFiles.filter(item => /(?:^|\/)\d+\.log$/i.test(item.path)).length,
    baselineFiles: before.files.length,
    updatedFiles: after.files.length,
    indexedDbPhysicalTableHashesCompared: false,
    localStorageDataFileHashesCompared: true,
    indexedDbLogicalIntegrityVerifiedByInspector: true,
  }, null, 2));
}
