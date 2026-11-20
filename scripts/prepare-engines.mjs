import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";

const engines = JSON.parse(readFileSync("engine-build/engines.json", "utf8"));
if (!Array.isArray(engines) || engines.length === 0) throw new Error("No replay engines are registered.");

const sources = [...new Set(engines.map(engine => engine.source))];
const checkout = spawnSync("git", ["submodule", "update", "--init", "--depth", "1", "--", ...sources], {
  encoding: "utf8",
});
if (checkout.stdout) process.stdout.write(checkout.stdout);
if (checkout.stderr) process.stderr.write(checkout.stderr);
if (checkout.status !== 0 || checkout.error) {
  const diagnostic = {
    command: "git submodule update --init --depth 1 -- " + sources.join(" "),
    status: checkout.status,
    signal: checkout.signal,
    error: checkout.error ? { name: checkout.error.name, message: checkout.error.message, code: checkout.error.code, errno: checkout.error.errno, syscall: checkout.error.syscall, path: checkout.error.path } : null,
    stdout: String(checkout.stdout ?? "").slice(-8000),
    stderr: String(checkout.stderr ?? "").slice(-8000),
  };
  console.error("Historical engine checkout failed:", JSON.stringify(diagnostic));
  throw new Error("Could not initialize all exact OpenFront engine submodules.");
}

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

for (const [lockHash, group] of dependencyGroups) {
  const representative = group[0];
  const representativePath = path.resolve(representative.source);
  console.log(`Installing shared dependencies for ${group.length} exact engines (lock ${lockHash.slice(0, 12)})`);
  let install;
  for (let attempt = 1; attempt <= 2; attempt++) {
    install = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: representativePath,
      encoding: "utf8",
      shell: process.platform === "win32",
      maxBuffer: 20 * 1024 * 1024,
    });
    if (install.stdout) process.stdout.write(install.stdout);
    if (install.stderr) process.stderr.write(install.stderr);
    if (install.status === 0 && !install.error) break;
    const diagnostic = {
      command: process.platform === "win32" ? "npm.cmd ci --ignore-scripts --no-audit --no-fund" : "npm ci --ignore-scripts --no-audit --no-fund",
      cwd: representativePath,
      attempt,
      status: install.status,
      signal: install.signal,
      error: install.error ? {
        name: install.error.name,
        message: install.error.message,
        code: install.error.code,
        errno: install.error.errno,
        syscall: install.error.syscall,
        path: install.error.path,
      } : null,
      stdout: String(install.stdout ?? "").slice(-12000),
      stderr: String(install.stderr ?? "").slice(-12000),
    };
    console.error("Historical engine dependency installation failed:", JSON.stringify(diagnostic));
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (install.status !== 0 || install.error) {
    throw new Error(`Dependency installation failed for lockfile group ${lockHash}`);
  }
  console.log(`Validated dependency group lock=${lockHash} engines=${group.map(engine => engine.commit).join(",")}`);

  for (const engine of group.slice(1)) {
    const target = path.join(path.resolve(engine.source), "node_modules");
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    symlinkSync(path.join(representativePath, "node_modules"), target, process.platform === "win32" ? "junction" : "dir");
  }
}
console.log(`Prepared ${engines.length} exact OpenFront replay engines across ${dependencyGroups.size} immutable dependency groups.`);
