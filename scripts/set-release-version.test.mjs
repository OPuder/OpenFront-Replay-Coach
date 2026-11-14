import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptSource = fileURLToPath(new URL("./set-release-version.mjs", import.meta.url));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ofrc-release-version-"));
  mkdirSync(join(root, "src", "renderer"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "2.2.34" }));
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ version: "2.2.34", packages: { "": { version: "2.2.34" } } }));
  writeFileSync(join(root, "START_HERE.txt"), "OPENFRONT REPLAY COACH 2.2.34\n");
  writeFileSync(join(root, "src", "renderer", "main.tsx"), "OpenFront Replay Coach · 2.2.34");
  return root;
}

test("release version preparation updates desktop and Android app metadata", () => {
  const root = fixture();
  try {
    const result = spawnSync(process.execPath, [scriptSource, "2.2.35"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, "2.2.35");
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
    assert.equal(lock.version, "2.2.35");
    assert.equal(lock.packages[""].version, "2.2.35");
    assert.match(readFileSync(join(root, "START_HERE.txt"), "utf8"), /COACH 2\.2\.35/);
    assert.match(readFileSync(join(root, "src", "renderer", "main.tsx"), "utf8"), /Coach · 2\.2\.35/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release version preparation rejects invalid versions without changing app metadata", () => {
  const root = fixture();
  try {
    const before = readFileSync(join(root, "package.json"), "utf8");
    const result = spawnSync(process.execPath, [scriptSource, "latest"], { cwd: root, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(join(root, "package.json"), "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
