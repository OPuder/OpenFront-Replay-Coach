import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "engine-build/engines.json");
const engines = JSON.parse(readFileSync(catalogPath, "utf8"));
const outputDir = path.join(root, "src/renderer/engine");
const manifestPath = path.join(root, ".openfront-engine-build.json");
const force = process.argv.includes("--force");

if (!Array.isArray(engines) || engines.length === 0) {
  throw new Error("engine-build/engines.json must contain at least one supported engine");
}

function git(source, args) {
  const result = spawnSync("git", ["-C", source, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Git ${args.join(" ")} failed in ${source}: ${result.stderr || "unknown error"}`);
  return result.stdout.trim();
}

function inputFingerprint() {
  const hash = createHash("sha256");
  hash.update(readFileSync(catalogPath));
  const visit = (directory, relative = "") => {
    for (const entry of readdirSync(path.join(directory, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.posix.join(relative.split(path.sep).join("/"), entry.name);
      if (entry.isDirectory()) visit(directory, file);
      else if (entry.isFile()) {
        hash.update(file);
        hash.update(readFileSync(path.join(directory, file)));
      }
    }
  };
  visit(path.join(root, "engine-build"));
  for (const engine of engines) {
    hash.update(engine.commit);
    hash.update(engine.bundleId);
    hash.update(readFileSync(path.join(root, engine.source, "package-lock.json")));
  }
  return hash.digest("hex");
}

function sourcesMatchPins() {
  return engines.every((engine) => {
    if (!/^[0-9a-f]{40}$/.test(engine.commit) || !/^[0-9a-f]{12}$/.test(engine.bundleId)) {
      throw new Error(`Invalid engine catalog entry: ${JSON.stringify(engine)}`);
    }
    return git(path.join(root, engine.source), ["rev-parse", "HEAD"]) === engine.commit;
  });
}

function sourcesAreClean() {
  return engines.every((engine) => git(path.join(root, engine.source), ["status", "--porcelain", "--untracked-files=normal"]) === "");
}

function bundlesComplete() {
  return engines.every(({ bundleId }) => {
    const file = path.join(outputDir, `replay-engine-${bundleId}.js`);
    return existsSync(file) && readFileSync(file).length > 0;
  });
}

const sourcesReady = sourcesMatchPins();
const cleanSources = sourcesReady && sourcesAreClean();
const fingerprint = cleanSources ? inputFingerprint() : null;
if (!force && cleanSources && bundlesComplete() && existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.schema === 1 && manifest.fingerprint === fingerprint) {
      console.log(`Replay engine bundles are current (${engines.length} exact revisions); skipping rebuild. Use --force to rebuild.`);
      process.exit(0);
    }
  } catch {
    // Invalid or missing metadata is a cache miss, never a reason to trust stale bundles.
  }
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

for (const engine of engines) {
  const source = path.join(root, engine.source);
  const vite = path.join(source, "node_modules/vite/bin/vite.js");
  if (!existsSync(vite)) throw new Error(`Missing Vite installation for ${engine.commit}: run npm ci in ${engine.source}`);
  if (git(source, ["rev-parse", "HEAD"]) !== engine.commit) {
    throw new Error(`Engine source ${engine.source} is not checked out at exact commit ${engine.commit}`);
  }
  console.log(`Building exact OpenFront replay engine ${engine.commit}`);
  const result = spawnSync(process.execPath, [vite, "build", "--config", "engine-build/vite.config.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, OPENFRONT_ENGINE_SOURCE: engine.source, OPENFRONT_ENGINE_ID: engine.bundleId },
  });
  if (result.status !== 0) throw new Error(`Engine build failed for ${engine.commit} (exit ${result.status})`);
}

if (!bundlesComplete()) throw new Error("Engine build completed without producing every expected replay bundle.");
if (!sourcesMatchPins()) throw new Error("Engine checkout changed during the build; refusing to accept the result.");
if (sourcesAreClean()) {
  writeFileSync(manifestPath, JSON.stringify({
    schema: 1,
    fingerprint: inputFingerprint(),
    engines: engines.map(({ commit, bundleId }) => ({ commit, bundleId })),
    builtAt: new Date().toISOString(),
  }, null, 2) + "\n");
  console.log(`Built and verified ${engines.length} exact OpenFront replay engines; reusable cache metadata written.`);
} else {
  rmSync(manifestPath, { force: true });
  console.log("Built exact pinned engine checkouts with local modifications; cache reuse disabled for this build.");
}
