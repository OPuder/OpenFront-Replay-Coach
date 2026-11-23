import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";

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

console.log(`Preparing ${engines.length} exact engine revisions from ${sources.length} submodule paths.`);

// Initialize independent pinned worktrees in parallel. The explicit network
// low-speed limits prevent a stalled GitHub transfer from occupying a runner
// indefinitely; the timeout provides a second hard upper bound.
run("git", [
  "-c", "http.lowSpeedLimit=1000",
  "-c", "http.lowSpeedTime=30",
  "-c", "fetch.parallel=4",
  "submodule", "update", "--init", "--depth", "1", "--jobs=4", "--progress", "--",
  ...sources,
], {
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
}, "Initialize exact OpenFront engine submodules", 15 * 60_000);

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

for (const [lockHash, group] of dependencyGroups) {
  const representative = group[0];
  const representativePath = path.resolve(representative.source);
  console.log(`Installing shared dependencies for ${group.length} exact engines (lock ${lockHash.slice(0, 12)}).`);
  run(process.platform === "win32" ? "npm.cmd" : "npm", [
    "ci", "--ignore-scripts", "--no-audit", "--no-fund",
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
