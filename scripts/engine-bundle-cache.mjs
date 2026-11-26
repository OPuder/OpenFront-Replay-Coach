import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

function visitFiles(directory, relative = "") {
  const entries = readdirSync(path.join(directory, relative), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    const child = path.posix.join(relative.split(path.sep).join("/"), entry.name);
    if (entry.isDirectory()) files.push(...visitFiles(directory, child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

/** Fingerprint only immutable build inputs. Exact source content is represented by its pinned Git commit. */
export function computeEngineBundleFingerprint(catalogPath, engineBuildDirectory, engines, buildScripts = []) {
  const hash = createHash("sha256");
  hash.update(readFileSync(catalogPath));
  for (const file of visitFiles(engineBuildDirectory)) {
    hash.update(file);
    hash.update(readFileSync(path.join(engineBuildDirectory, file)));
  }
  for (const scriptPath of buildScripts) {
    hash.update(path.relative(path.dirname(catalogPath), scriptPath).split(path.sep).join("/"));
    hash.update(readFileSync(scriptPath));
  }
  for (const engine of engines) {
    hash.update(engine.commit);
    hash.update(engine.bundleId);
  }
  return hash.digest("hex");
}

export function verifyEngineBundleCache(manifestPath, outputDirectory, fingerprint, engines) {
  if (!existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.schema !== 2 || manifest.fingerprint !== fingerprint || !Array.isArray(manifest.engines)) return false;
    const expected = engines.map(({ commit, bundleId }) => ({ commit, bundleId }));
    const actual = manifest.engines.map(({ commit, bundleId }) => ({ commit, bundleId }));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) return false;
    return engines.every(engine => {
      const file = path.join(outputDirectory, `replay-engine-${engine.bundleId}.js`);
      if (!existsSync(file)) return false;
      const bytes = readFileSync(file);
      if (bytes.length === 0) return false;
      const entry = manifest.engines.find(item => item.commit === engine.commit && item.bundleId === engine.bundleId);
      const digest = createHash("sha256").update(bytes).digest("hex");
      return entry?.sha256 === digest;
    });
  } catch {
    return false;
  }
}

export function createEngineBundleManifest(fingerprint, engines, outputDirectory) {
  return {
    schema: 2,
    fingerprint,
    engines: engines.map(({ commit, bundleId }) => ({
      commit,
      bundleId,
      sha256: createHash("sha256")
        .update(readFileSync(path.join(outputDirectory, `replay-engine-${bundleId}.js`)))
        .digest("hex"),
    })),
    builtAt: new Date().toISOString(),
  };
}
