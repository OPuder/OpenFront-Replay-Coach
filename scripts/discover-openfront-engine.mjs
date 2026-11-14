import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const remote = execFileSync("git", ["ls-remote", "https://github.com/openfrontio/OpenFrontIO.git", "refs/heads/main"], { encoding: "utf8" }).trim();
const commit = remote.split(/\s+/)[0]?.toLowerCase();
if (!/^[0-9a-f]{40}$/.test(commit ?? "")) throw new Error("Could not resolve the upstream OpenFront main commit.");

const manifestPath = "engine-build/engines.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.some(engine => engine.commit === commit)) {
  console.log(`Latest upstream engine ${commit} is already registered.`);
  process.exit(0);
}

const bundleId = commit.slice(0, 12);
if (manifest.some(engine => engine.bundleId === bundleId || engine.source === `vendor/OpenFrontIO-${bundleId}`)) {
  throw new Error(`Engine bundle identifier collision for ${commit}`);
}
const source = `vendor/OpenFrontIO-${bundleId}`;
console.log(`Preparing candidate OpenFront engine ${commit}`);

execFileSync("git", ["submodule", "add", "--depth", "1", "https://github.com/openfrontio/OpenFrontIO.git", source], { stdio: "inherit" });
execFileSync("git", ["-C", source, "fetch", "--depth", "1", "origin", commit], { stdio: "inherit" });
execFileSync("git", ["-C", source, "checkout", "--detach", commit], { stdio: "inherit" });

manifest.push({ commit, source, bundleId });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const catalogPath = "src/main/decoder/ReplayEngineCatalog.ts";
let catalog = readFileSync(catalogPath, "utf8");
catalog = catalog.replace("] as const;", `  { commit: "${commit}", source: "${source}", bundleId: "${bundleId}" },\n] as const;`);
writeFileSync(catalogPath, catalog);

const registryPath = "src/renderer/engineRegistry.ts";
let registry = readFileSync(registryPath, "utf8");
registry = registry.replace("};\n\nexport async function loadReplayEngineModule", `  "${commit}": () => import("./engine/replay-engine-${bundleId}.js"),\n};\n\nexport async function loadReplayEngineModule`);
writeFileSync(registryPath, registry);

console.log(`Added candidate engine ${commit}. It must pass exact-source builds and real replay hash verification before being treated as replay-verified.`);
