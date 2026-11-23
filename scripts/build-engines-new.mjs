import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  createWriteStream,
  createReadStream,
} from "node:fs";
import { createHash } from "node:crypto";
import archiver from "archiver";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const engines = JSON.parse(readFileSync(path.join(root, "engine-build/engines.json"), "utf8"));
const outputDir = path.join(root, "src/renderer/engine");
const enginesManifest = [];

if (!Array.isArray(engines) || engines.length === 0) {
  throw new Error("engine-build/engines.json must contain at least one supported engine");
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

async function buildEngine(engine) {
  if (!/^[0-9a-f]{40}$/.test(engine.commit) || !/^[0-9a-f]{12}$/.test(engine.bundleId)) {
    throw new Error(`Invalid engine catalog entry: ${JSON.stringify(engine)}`);
  }
  const source = path.join(root, engine.source);
  const vite = path.join(source, "node_modules/vite/bin/vite.js");
  if (!existsSync(vite)) {
    throw new Error(`Missing Vite installation for ${engine.commit}: run npm ci in ${engine.source}`);
  }
  const checkout = spawnSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (checkout.status !== 0 || checkout.stdout.trim() !== engine.commit) {
    throw new Error(`Engine source ${engine.source} is not checked out at exact commit ${engine.commit}`);
  }
  console.log(`Building exact OpenFront replay engine ${engine.commit}`);
  const result = spawnSync(process.execPath, [vite, "build", "--config", "engine-build/vite.config.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      OPENFRONT_ENGINE_SOURCE: engine.source,
      OPENFRONT_ENGINE_ID: engine.bundleId,
    },
  });
  if (result.status !== 0) {
    throw new Error(`Engine build failed for ${engine.commit} (exit ${result.status})`);
  }

  const jsFile = path.join(outputDir, `replay-engine-${engine.bundleId}.js`);
  if (!existsSync(jsFile)) {
    throw new Error(`Expected build artifact missing: ${jsFile}`);
  }

  const artifactsDir = path.join(root, "engine-build/artifacts");
  mkdirSync(artifactsDir, { recursive: true });
  const archivePath = path.join(artifactsDir, `${engine.bundleId}.zip`);
  const output = createHash("sha256");
  const outputStream = createWriteStream(archivePath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.file(jsFile, { name: path.basename(jsFile) });
  archive.pipe(outputStream);
  archive.finalize();
  await new Promise((resolve, reject) => {
    archive.on("close", resolve);
    archive.on("error", reject);
  });

  const hashStream = createReadStream(archivePath);
  hashStream.on("data", chunk => output.update(chunk));
  await new Promise((resolve, reject) => {
    hashStream.on("end", () => resolve());
    hashStream.on("error", err => reject(err));
  });
  const sha256 = output.digest("hex");

  enginesManifest.push({
    commit: engine.commit,
    bundleId: engine.bundleId,
    artifact: path.relative(root, archivePath),
    sha256,
  });
}

async function main() {
  for (const engine of engines) {
    await buildEngine(engine);
  }
  const manifestPath = path.join(root, "engine-build/engines.manifest.json");
  writeFileSync(manifestPath, JSON.stringify(enginesManifest, null, 2), "utf8");
  console.log("All engines built. Manifest written to", manifestPath);
}

main().catch(e => {
  console.error("Error building engines:", e);
  process.exit(1);
});