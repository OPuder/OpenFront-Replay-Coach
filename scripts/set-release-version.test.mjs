import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptSource = fileURLToPath(new URL("./set-release-version.mjs", import.meta.url));

function fixture(cacheName) {
  const root = mkdtempSync(join(tmpdir(), "ofrc-release-version-"));
  mkdirSync(join(root, "public"), { recursive: true });
  mkdirSync(join(root, "src", "renderer"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "2.2.33" }));
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ version: "2.2.33", packages: { "": { version: "2.2.33" } } }));
  writeFileSync(join(root, "START_HERE.txt"), "OPENFRONT REPLAY COACH 2.2.33\n");
  writeFileSync(join(root, "src", "renderer", "main.tsx"), "OpenFront Replay Coach · 2.2.33");
  writeFileSync(join(root, "public", "sw.js"), 'const CACHE_NAME = "' + cacheName + '";\n');
  return root;
}

test("release version preparation accepts an already matching PWA cache version", () => {
  const root = fixture("openfront-replay-coach-shell-v2.2.34");
  try {
    const result = spawnSync(process.execPath, [scriptSource, "2.2.34"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(readFileSync(join(root, "public", "sw.js"), "utf8"), /shell-v2\.2\.34/);
    assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, "2.2.34");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release version preparation upgrades an older PWA cache version", () => {
  const root = fixture("openfront-replay-coach-shell-v2.2.33");
  try {
    const result = spawnSync(process.execPath, [scriptSource, "2.2.34"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(readFileSync(join(root, "public", "sw.js"), "utf8"), /shell-v2\.2\.34/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release version preparation fails clearly when the service-worker cache name is missing", () => {
  const root = fixture("unexpected-cache-name");
  try {
    const result = spawnSync(process.execPath, [scriptSource, "2.2.34"], { cwd: root, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cache name could not be found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
