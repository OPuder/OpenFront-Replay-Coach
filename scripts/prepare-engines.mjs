import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";

const engines = JSON.parse(readFileSync("engine-build/engines.json", "utf8"));
if (!Array.isArray(engines) || engines.length === 0) throw new Error("No replay engines are registered.");

const sources = [...new Set(engines.map(engine => engine.source))];
const checkout = spawnSync("git", ["submodule", "update", "--init", "--depth", "1", "--", ...sources], {
  encoding: "utf8",
  stdio: "inherit",
});
if (checkout.status !== 0) throw new Error("Could not initialize all exact OpenFront engine submodules.");

// Historical revisions in this catalog share two immutable dependency lockfiles.
// Install each lockfile once and link the identical node_modules tree into its
// matching engine sources. This avoids ten redundant multi-minute npm installs.
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

if (process.env.OPENFRONT_SKIP_ENGINE_DEPENDENCIES === "1") {
  console.log("Skipping historical engine npm installs because OPENFRONT_SKIP_ENGINE_DEPENDENCIES=1.");
} else {
  for (const [lockHash, group] of dependencyGroups) {
    const representative = group[0];
    const representativePath = path.resolve(representative.source);
    console.log(`Installing shared dependencies for ${group.length} exact engines (lock ${lockHash.slice(0, 12)})`);
    const install = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: representativePath,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      shell: process.platform === "win32",
    });
    if (install.stdout) process.stdout.write(install.stdout);
    if (install.stderr) process.stderr.write(install.stderr);
    if (install.status !== 0 || install.error) {
      console.error(JSON.stringify({
        engineLockGroup: lockHash,
        representativeEngine: representative.commit,
        platform: process.platform,
        exitCode: install.status,
        signal: install.signal,
        error: install.error?.message ?? null,
      }, null, 2));
      throw new Error(`Dependency installation failed for lockfile group ${lockHash} (exit ${install.status ?? "null"}, signal ${install.signal ?? "none"}).`);
    }
  
    for (const engine of group.slice(1)) {
      const target = path.join(path.resolve(engine.source), "node_modules");
      if (existsSync(target)) rmSync(target, { recursive: true, force: true });
      symlinkSync(path.join(representativePath, "node_modules"), target, process.platform === "win32" ? "junction" : "dir");
    }
  }
  
}
console.log(`Prepared ${engines.length} exact OpenFront replay engines across ${dependencyGroups.size} immutable dependency groups.`);
