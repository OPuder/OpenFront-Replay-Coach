import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const engines = JSON.parse(readFileSync("engine-build/engines.json", "utf8"));
if (!Array.isArray(engines) || engines.length === 0) {
  throw new Error("Engine catalog is empty; refusing to accept an empty cache.");
}
const outputDir = path.resolve("src/renderer/engine");
const missing = [];
for (const engine of engines) {
  if (!/^[0-9a-f]{12}$/.test(engine.bundleId)) {
    throw new Error(`Invalid engine bundle ID: ${engine.bundleId}`);
  }
  const bundle = path.join(outputDir, `replay-engine-${engine.bundleId}.js`);
  if (!existsSync(bundle) || !statSync(bundle).isFile() || statSync(bundle).size < 1024) {
    missing.push({ commit: engine.commit, bundle });
  }
}
if (missing.length) {
  console.error("Missing or implausibly small replay engine bundles:", missing);
  process.exitCode = 1;
} else {
  console.log(`Verified ${engines.length} replay engine bundles against the exact pinned catalog.`);
}
