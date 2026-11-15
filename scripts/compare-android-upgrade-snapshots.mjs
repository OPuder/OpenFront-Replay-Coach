import { readFileSync } from "node:fs";

const beforePath = process.argv[2];
const afterPath = process.argv[3];
if (!beforePath || !afterPath) throw new Error("Usage: compare-android-upgrade-snapshots.mjs before.json after.json");
const before = JSON.parse(readFileSync(beforePath, "utf8"));
const after = JSON.parse(readFileSync(afterPath, "utf8"));

function storeMap(snapshot) {
  return new Map(snapshot.indexedDb.stores.map(store => [
    store.name,
    new Map(store.records.map(record => [record.key, record.sha256])),
  ]));
}
const beforeStores = storeMap(before);
const afterStores = storeMap(after);
const differences = [];
for (const [name, records] of beforeStores) {
  const updated = afterStores.get(name);
  if (!updated) {
    differences.push(`store missing after negative test: ${name}`);
    continue;
  }
  for (const [key, hash] of records) {
    if (updated.get(key) !== hash) differences.push(`record changed or missing: ${name} ${key}`);
  }
  if (updated.size !== records.size) differences.push(`record count changed in ${name}: ${records.size} -> ${updated.size}`);
}
if (afterStores.size !== beforeStores.size) differences.push("IndexedDB store set changed.");
if (JSON.stringify(before.localStorage.entries) !== JSON.stringify(after.localStorage.entries)) {
  differences.push("LocalStorage key/value set changed.");
}
if (JSON.stringify(before.indexedDb.relationships) !== JSON.stringify(after.indexedDb.relationships)) {
  differences.push("IndexedDB profile/match/replay relationships changed.");
}
if (differences.length) throw new Error(`Failed negative-install data-integrity check: ${differences.join("; ")}`);

console.log(JSON.stringify({
  result: "PASS",
  localStorageKeys: before.localStorage.entries.length,
  indexedDbStores: beforeStores.size,
  indexedDbRecords: [...beforeStores.values()].reduce((sum, records) => sum + records.size, 0),
  unchangedLocalStorage: true,
  unchangedIndexedDbRecords: true,
  unchangedRelationships: true,
}, null, 2));
