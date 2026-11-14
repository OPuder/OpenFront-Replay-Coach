import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const engines = JSON.parse(readFileSync("engine-build/engines.json", "utf8"));
if (!Array.isArray(engines) || engines.length === 0) throw new Error("No replay engines are registered.");

const sources = [...new Set(engines.map(engine => engine.source))];
const checkout = spawnSync("git", ["submodule", "update", "--init", "--depth", "1", "--", ...sources], {
  encoding: "utf8",
  stdio: "inherit",
});
if (checkout.status !== 0) throw new Error("Could not initialize all exact OpenFront engine submodules.");

for (const engine of engines) {
  const source = path.resolve(engine.source);
  const revision = spawnSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (revision.status !== 0 || revision.stdout.trim() !== engine.commit) {
    throw new Error(`Engine source ${engine.source} is not pinned to ${engine.commit}`);
  }
  console.log(`Installing dependencies for exact engine ${engine.commit}`);
  const install = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--ignore-scripts"], { cwd: source, stdio: "inherit", shell: process.platform === "win32" });
  if (install.status !== 0) throw new Error(`Dependency installation failed for ${engine.commit}`);
}
console.log(`Prepared ${engines.length} exact OpenFront replay engines.`);
