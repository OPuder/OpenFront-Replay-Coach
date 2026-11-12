import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(projectRoot, "dist");
const indexPath = path.join(dist, "index.html");
const manifestPath = path.join(dist, "manifest.webmanifest");
const workerPath = path.join(dist, "sw.js");

assert.ok(existsSync(indexPath), "dist/index.html is missing");
assert.ok(existsSync(manifestPath), "PWA manifest is missing");
assert.ok(existsSync(workerPath), "PWA service worker is missing");

const html = readFileSync(indexPath, "utf8");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const worker = readFileSync(workerPath, "utf8");

assert.match(html, /rel="manifest"/, "index.html does not link the web manifest");
assert.match(html, /name="viewport"/, "mobile viewport metadata is missing");
assert.equal(manifest.name, "OpenFront Replay Coach");
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.equal(manifest.display, "standalone");
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 1, "PWA icons are missing");

for (const icon of manifest.icons) {
  const iconPath = path.resolve(dist, icon.src.replace(/^\.\//, ""));
  assert.ok(iconPath.startsWith(dist + path.sep), "PWA icon path escapes dist");
  assert.ok(existsSync(iconPath), `PWA icon is missing: ${icon.src}`);
}

assert.match(worker, /addEventListener\(["']install["']/, "service worker has no install handler");
assert.match(worker, /addEventListener\(["']fetch["']/, "service worker has no fetch handler");
assert.match(worker, /openfront-replay-coach-shell/, "service worker cache namespace is missing");
assert.ok(!worker.includes("api.openfront.io"), "service worker must not cache OpenFront API data");

const scriptRefs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
const cssRefs = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(match => match[1]);
assert.ok(scriptRefs.length > 0, "No renderer JavaScript bundle is referenced");
for (const ref of [...scriptRefs, ...cssRefs]) {
  const assetPath = path.resolve(dist, ref.replace(/^\.\//, ""));
  assert.ok(assetPath.startsWith(dist + path.sep), `Asset path escapes dist: ${ref}`);
  assert.ok(existsSync(assetPath), `Referenced web asset is missing: ${ref}`);
  assert.ok(statSync(assetPath).size > 0, `Referenced web asset is empty: ${ref}`);
}

console.log("Web/PWA smoke test passed: HTML, manifest, icons, service worker and bundled assets are present.");
