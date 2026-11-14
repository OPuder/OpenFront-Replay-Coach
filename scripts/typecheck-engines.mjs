import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const engines = JSON.parse(readFileSync("engine-build/engines.json", "utf8"));
for (const engine of engines) {
  const source = path.resolve(engine.source);
  console.log(`Type-checking original OpenFront engine ${engine.commit}`);
  const result = spawnSync("npm", ["run", "typecheck"], { cwd: source, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Type-check failed for exact engine ${engine.commit}`);
}
console.log(`Type-checked all ${engines.length} exact replay engines.`);
