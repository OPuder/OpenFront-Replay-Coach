import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  computeEngineBundleFingerprint,
  createEngineBundleManifest,
  verifyEngineBundleCache,
} from "./engine-bundle-cache.mjs";

test("verified cache accepts exact catalog and intact bundle hashes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ofrc-engine-cache-"));
  try {
    const catalogPath = path.join(root, "engines.json");
    const buildDir = path.join(root, "engine-build");
    const outputDir = path.join(root, "bundles");
    const manifestPath = path.join(root, "manifest.json");
    mkdirSync(buildDir);
    mkdirSync(outputDir);
    const engines = [{ commit: "a".repeat(40), bundleId: "b".repeat(12) }];
    writeFileSync(catalogPath, JSON.stringify(engines));
    writeFileSync(path.join(buildDir, "config.mjs"), "export default 1;");
    writeFileSync(path.join(outputDir, "replay-engine-" + engines[0].bundleId + ".js"), "/* bundle */");
    const fingerprint = computeEngineBundleFingerprint(catalogPath, buildDir, engines);
    writeFileSync(manifestPath, JSON.stringify(createEngineBundleManifest(fingerprint, engines, outputDir)));
    assert.equal(verifyEngineBundleCache(manifestPath, outputDir, fingerprint, engines), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verified cache rejects modified bundle bytes and changed build inputs", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ofrc-engine-cache-"));
  try {
    const catalogPath = path.join(root, "engines.json");
    const buildDir = path.join(root, "engine-build");
    const outputDir = path.join(root, "bundles");
    const manifestPath = path.join(root, "manifest.json");
    mkdirSync(buildDir);
    mkdirSync(outputDir);
    const engines = [{ commit: "c".repeat(40), bundleId: "d".repeat(12) }];
    writeFileSync(catalogPath, JSON.stringify(engines));
    writeFileSync(path.join(buildDir, "config.mjs"), "export default 1;");
    const bundlePath = path.join(outputDir, "replay-engine-" + engines[0].bundleId + ".js");
    writeFileSync(bundlePath, "/* original */");
    const fingerprint = computeEngineBundleFingerprint(catalogPath, buildDir, engines);
    writeFileSync(manifestPath, JSON.stringify(createEngineBundleManifest(fingerprint, engines, outputDir)));
    writeFileSync(bundlePath, "/* tampered */");
    assert.equal(verifyEngineBundleCache(manifestPath, outputDir, fingerprint, engines), false);
    writeFileSync(bundlePath, "/* original */");
    writeFileSync(path.join(buildDir, "config.mjs"), "export default 2;");
    const changedFingerprint = computeEngineBundleFingerprint(catalogPath, buildDir, engines);
    assert.notEqual(changedFingerprint, fingerprint);
    assert.equal(verifyEngineBundleCache(manifestPath, outputDir, changedFingerprint, engines), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verified cache rejects missing engine entries or bundle files", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ofrc-engine-cache-"));
  try {
    const catalogPath = path.join(root, "engines.json");
    const buildDir = path.join(root, "engine-build");
    const outputDir = path.join(root, "bundles");
    const manifestPath = path.join(root, "manifest.json");
    mkdirSync(buildDir);
    mkdirSync(outputDir);
    const engines = [{ commit: "e".repeat(40), bundleId: "f".repeat(12) }];
    writeFileSync(catalogPath, JSON.stringify(engines));
    writeFileSync(path.join(buildDir, "config.mjs"), "export default 1;");
    const fingerprint = computeEngineBundleFingerprint(catalogPath, buildDir, engines);
    writeFileSync(manifestPath, JSON.stringify({ schema: 2, fingerprint, engines: [] }));
    assert.equal(verifyEngineBundleCache(manifestPath, outputDir, fingerprint, engines), false);
    const bundlePath = path.join(outputDir, "replay-engine-" + engines[0].bundleId + ".js");
    writeFileSync(bundlePath, "/* cached */");
    writeFileSync(manifestPath, JSON.stringify(createEngineBundleManifest(fingerprint, engines, outputDir)));
    rmSync(bundlePath);
    assert.equal(verifyEngineBundleCache(manifestPath, outputDir, fingerprint, engines), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
