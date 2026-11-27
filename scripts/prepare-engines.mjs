import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { computeEngineBundleFingerprint, verifyEngineBundleCache } from "./engine-bundle-cache.mjs";

const engines = JSON.parse(readFileSync("engine-build/engines.json", "utf8"));
if (!Array.isArray(engines) || engines.length === 0) throw new Error("No replay engines are registered.");

const sources = [...new Set(engines.map(engine => engine.source))];
const run = (command, args, options, label, timeoutMs) => {
  console.log(`[${new Date().toISOString()}] ${label}`);
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "inherit",
    timeout: timeoutMs,
    killSignal: "SIGTERM",
    ...options,
  });
  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      throw new Error(`${label} exceeded its ${Math.round(timeoutMs / 60_000)} minute timeout.`);
    }
    throw result.error;
  }
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
};

const catalogPath = path.resolve("engine-build/engines.json");
const engineBuildDirectory = path.resolve("engine-build");
const outputDirectory = path.resolve("src/renderer/engine");
const manifestPath = path.resolve(".openfront-engine-build.json");
const fingerprint = computeEngineBundleFingerprint(catalogPath, engineBuildDirectory, engines, [
  path.resolve("scripts/build-engines.mjs"),
  path.resolve("scripts/engine-bundle-cache.mjs"),
]);
function existingSourceCheckoutsAreSafeForCache() {
  return engines.every(engine => {
    const source = path.resolve(engine.source);
    if (!existsSync(path.join(source, ".git"))) return true;
    const revision = spawnSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" });
    if (revision.status !== 0 || revision.stdout.trim() !== engine.commit) return false;
    const status = spawnSync("git", ["-C", source, "status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8" });
    return status.status === 0 && status.stdout.trim() === "";
  });
}
if (verifyEngineBundleCache(manifestPath, outputDirectory, fingerprint, engines)
  && existingSourceCheckoutsAreSafeForCache()) {
  console.log(`Verified cache contains all ${engines.length} exact engine bundles; skipping historical submodule checkout and dependency installs.`);
  process.exit(0);
}

console.log(`Preparing ${engines.length} exact engine revisions from ${sources.length} submodule paths.`);

// Initialize pinned submodules with bounded retries. GitHub occasionally
// terminates large pack transfers (early EOF/index-pack errors); repeating the
// update lets Git reuse successfully fetched objects instead of failing the
// whole validation on a transient network interruption.
const initializeSubmodules = [
  // GitHub-hosted runners sometimes throttle large historical OpenFront packs.
  // The default low-speed cutoff aborts healthy but temporarily slow transfers
  // (curl 28 / early EOF). Disable that cutoff, force HTTP/1.1, and serialize
  // requests; the outer retry remains bounded by the per-attempt timeout.
  "-c", "http.lowSpeedLimit=0",
  "-c", "http.lowSpeedTime=0",
  "-c", "http.version=HTTP/1.1",
  "-c", "http.maxRequests=1",
  "-c", "fetch.parallel=1",
  "submodule", "update", "--init", "--depth", "1", "--jobs=1", "--progress", "--",
  ...sources,
];
let initialized = false;
for (let attempt = 1; attempt <= 4; attempt++) {
  try {
    run("git", initializeSubmodules, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }, `Initialize exact OpenFront engine submodules (attempt ${attempt}/4)`, 12 * 60_000);
    initialized = true;
    break;
  } catch (error) {
    if (attempt === 4) throw error;
    const delaySeconds = attempt * 15;
    console.warn(`Submodule initialization attempt ${attempt} failed; retrying in ${delaySeconds}s.`);
    // Use Node's portable synchronous wait so the retry works on both Windows
    // runners and Linux without relying on an external sleep executable.
    run(process.execPath, [
      "-e", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.argv[1]) * 1000);",
      String(delaySeconds),
    ], {}, "Wait before submodule retry", 60_000);
  }
}
if (!initialized) throw new Error("Could not initialize exact OpenFront engine submodules after four attempts.");

// Historical revisions share immutable dependency lockfiles. Install each
// lockfile once and link the identical node_modules tree into its engine group.
const dependencyGroups = new Map();
for (const engine of engines) {
  const source = path.resolve(engine.source);
  const revision = spawnSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (revision.status !== 0 || revision.stdout.trim() !== engine.commit) {
    throw new Error(`Engine source ${engine.source} is not pinned to ${engine.commit}`);
  }
  const lockPath = path.join(source, "package-lock.json");
  if (!existsSync(lockPath)) throw new Error(`Missing package-lock.json for ${engine.commit}`);
  const lockHash = createHash("sha256").update(readFileSync(lockPath)).digest("hex");
  const group = dependencyGroups.get(lockHash) ?? [];
  group.push(engine);
  dependencyGroups.set(lockHash, group);
}

// A verified bundle-cache hit means the exact engines are already built. In that
// case only the pinned source checkouts are required; installing eleven historical
// dependency trees again would add minutes without contributing to the build.

for (const [lockHash, group] of dependencyGroups) {
  const representative = group[0];
  const representativePath = path.resolve(representative.source);
  console.log(`Installing shared dependencies for ${group.length} exact engines (lock ${lockHash.slice(0, 12)}).`);
  run(process.platform === "win32" ? "npm.cmd" : "npm", [
    "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline",
    "--fetch-retries=2", "--fetch-timeout=120000",
  ], {
    cwd: representativePath,
    shell: process.platform === "win32",
  }, `Install engine dependency group ${lockHash.slice(0, 12)}`, 12 * 60_000);

  for (const engine of group.slice(1)) {
    const target = path.join(path.resolve(engine.source), "node_modules");
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    symlinkSync(path.join(representativePath, "node_modules"), target, process.platform === "win32" ? "junction" : "dir");
  }
}
console.log(`[${new Date().toISOString()}] Prepared ${engines.length} exact OpenFront replay engines across ${dependencyGroups.size} immutable dependency groups.`);
