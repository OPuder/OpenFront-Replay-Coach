import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { findPortableApplicationRoots } from "./windows-portable-layout.mjs";

function makePortableApp(directory) {
  mkdirSync(path.join(directory, "resources"), { recursive: true });
  writeFileSync(path.join(directory, "OpenFront Replay Coach.exe"), "MZ");
  writeFileSync(path.join(directory, "resources", "app.asar"), "asar");
}

test("finds a portable app stored directly at the ZIP root", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ofrc-portable-root-"));
  try {
    makePortableApp(root);
    assert.deepEqual(findPortableApplicationRoots(root), [{
      executable: path.join(root, "OpenFront Replay Coach.exe"),
      appAsar: path.join(root, "resources", "app.asar"),
    }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("finds a portable app nested under one ZIP wrapper directory", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ofrc-portable-wrapper-"));
  try {
    const wrapped = path.join(root, "win-unpacked");
    makePortableApp(wrapped);
    assert.deepEqual(findPortableApplicationRoots(root), [{
      executable: path.join(wrapped, "OpenFront Replay Coach.exe"),
      appAsar: path.join(wrapped, "resources", "app.asar"),
    }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not accept incomplete or ambiguous portable app payloads", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ofrc-portable-invalid-"));
  try {
    mkdirSync(path.join(root, "partial"), { recursive: true });
    writeFileSync(path.join(root, "partial", "OpenFront Replay Coach.exe"), "MZ");
    assert.deepEqual(findPortableApplicationRoots(root), []);
    makePortableApp(path.join(root, "first"));
    makePortableApp(path.join(root, "second"));
    assert.equal(findPortableApplicationRoots(root).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
