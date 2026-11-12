import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
assert.match(html, /apple-mobile-web-app-capable/, "Apple home-screen metadata is missing");
assert.equal(manifest.name, "OpenFront Replay Coach");
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.equal(manifest.display, "standalone");
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, "PWA icons are missing");

const iconDimensions = new Map();
for (const icon of manifest.icons) {
  const iconPath = path.resolve(dist, icon.src.replace(/^\.\//, ""));
  assert.ok(iconPath.startsWith(dist + path.sep), "PWA icon path escapes dist");
  assert.ok(existsSync(iconPath), `PWA icon is missing: ${icon.src}`);
  const png = readFileSync(iconPath);
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", `Icon is not a PNG: ${icon.src}`);
  assert.equal(png.readUInt32BE(16), Number(icon.sizes.split("x")[0]), `Icon width mismatch: ${icon.src}`);
  assert.equal(png.readUInt32BE(20), Number(icon.sizes.split("x")[1]), `Icon height mismatch: ${icon.src}`);
  iconDimensions.set(icon.sizes, (iconDimensions.get(icon.sizes) ?? 0) + 1);
}
assert.ok(iconDimensions.has("192x192"), "192px Android icon is missing");
assert.ok(iconDimensions.has("512x512"), "512px Android icon is missing");
assert.ok(manifest.icons.some(icon => icon.purpose === "maskable" && icon.sizes === "512x512"), "512px maskable icon is missing");

assert.match(worker, /addEventListener\(["']install["']/, "service worker has no install handler");
assert.match(worker, /addEventListener\(["']fetch["']/, "service worker has no fetch handler");
assert.match(worker, /openfront-replay-coach-shell/, "service worker cache namespace is missing");
assert.ok(!worker.includes("api.openfront.io"), "service worker must not cache upstream API traffic");
assert.match(worker, /response\.clone\(\)\.text\(\)/, "service worker does not inspect the app shell before caching");
assert.match(worker, /bundledAssets/, "service worker does not precache the built renderer bundles");

const scriptRefs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
const cssRefs = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(match => match[1]);
assert.ok(scriptRefs.length > 0, "No renderer JavaScript bundle is referenced");
for (const ref of [...scriptRefs, ...cssRefs]) {
  const assetPath = path.resolve(dist, ref.replace(/^\.\//, ""));
  assert.ok(assetPath.startsWith(dist + path.sep), `Asset path escapes dist: ${ref}`);
  assert.ok(existsSync(assetPath), `Referenced web asset is missing: ${ref}`);
  assert.ok(statSync(assetPath).size > 0, `Referenced web asset is empty: ${ref}`);
}

const platformAdapter = readFileSync(path.join(projectRoot, "src/renderer/platform/BrowserReplayAPI.ts"), "utf8");
assert.match(platformAdapter, /\/api\/openfront\/public/, "Browser API does not use the same-origin public proxy");
assert.match(platformAdapter, /\/api\/openfront\/bootstrap/, "Browser engine assets do not use the same-origin bootstrap proxy");
assert.ok(!platformAdapter.includes("https://api.openfront.io/public"), "Browser code still bypasses the same-origin proxy");
assert.match(platformAdapter, /100 \* 1024 \* 1024/, "Mobile replay size cap is missing");

const functionFiles = [
  "functions/_lib/openfront.js",
  "functions/api/openfront/bootstrap.js",
  "functions/api/openfront/public/[[path]].js",
  "functions/api/openfront/assets/[[path]].js",
];
for (const relativePath of functionFiles) {
  const filePath = path.join(projectRoot, relativePath);
  assert.ok(existsSync(filePath), `Cloudflare Pages Function missing: ${relativePath}`);
  const source = readFileSync(filePath, "utf8");
  execFileSync(process.execPath, ["--input-type=module", "--check"], { input: source, stdio: ["pipe", "pipe", "pipe"] });
}

const publicFunction = readFileSync(path.join(projectRoot, functionFiles[2]), "utf8");
assert.match(publicFunction, /Only public GET requests are supported/, "Public API proxy does not enforce GET-only access");
assert.ok(publicFunction.includes("const isGame =") && publicFunction.includes("/^game"), "Game endpoint is not allowlisted");
assert.ok(publicFunction.includes("const isPlayerGames =") && publicFunction.includes("/games$"), "Player history endpoint is not allowlisted");
const assetFunction = readFileSync(path.join(projectRoot, functionFiles[3]), "utf8");
assert.match(assetFunction, /official OpenFront manifest/, "Asset proxy does not validate assets against the upstream manifest");
assert.match(assetFunction, /Only static GET requests are supported/, "Asset proxy does not enforce GET-only access");
assert.ok(existsSync(path.join(projectRoot, "scripts/build-cloudflare.sh")), "Cloudflare Pages build script is missing");
assert.ok(existsSync(path.join(projectRoot, "wrangler.toml")), "Cloudflare Pages configuration is missing");
assert.ok(existsSync(path.join(projectRoot, "scripts/build-cloudflare.sh")), "Cloudflare build script is missing");
execFileSync(process.execPath, [path.join(projectRoot, "scripts/smoke-test-pages-functions.mjs")], { stdio: "inherit" });

console.log("Web/PWA smoke test passed: app shell, PNG icons, offline bundles, same-origin API proxy and Cloudflare functions are valid.");
