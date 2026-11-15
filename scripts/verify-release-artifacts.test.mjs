import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateReleaseMetadata, verifyReleaseArtifacts, expectedReleaseNames } from "./verify-release-artifacts.mjs";

const version = "2.2.52";
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ofrc-release-audit-"));
  const names = expectedReleaseNames(version);
  for (const name of [names.installer, names.portable, names.android]) {
    await writeFile(path.join(directory, name), Buffer.alloc(1_000_001, name.length % 251));
  }
  return { directory, names };
}

test("generates and verifies checksums and manifest for exactly three packages", async () => {
  const { directory } = await fixture();
  try {
    const result = await generateReleaseMetadata(directory, version);
    assert.equal(result.artifacts.length, 3);
    await verifyReleaseArtifacts(directory, version);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rejects unexpected additional files", async () => {
  const { directory } = await fixture();
  try {
    await writeFile(path.join(directory, "unexpected.exe"), "not a release");
    await assert.rejects(() => generateReleaseMetadata(directory, version), /exactly the three correctly named distributables/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rejects a missing distributable before generating release metadata", async () => {
  const { directory, names } = await fixture();
  try {
    await rm(path.join(directory, names.android));
    await assert.rejects(() => generateReleaseMetadata(directory, version), /exactly the three correctly named distributables/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rejects malformed package names", async () => {
  const { directory, names } = await fixture();
  try {
    await writeFile(path.join(directory, "OpenFront-Replay-Coach-2.2.52.apk"), Buffer.alloc(1_000_001));
    await rm(path.join(directory, names.android));
    await assert.rejects(() => generateReleaseMetadata(directory, version), /correctly named distributables/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rejects a modified package after metadata generation", async () => {
  const { directory, names } = await fixture();
  try {
    await generateReleaseMetadata(directory, version);
    await writeFile(path.join(directory, names.android), Buffer.alloc(1_000_002, 7));
    await assert.rejects(() => verifyReleaseArtifacts(directory, version), /Manifest byte size mismatch|Manifest SHA-256 mismatch|SHA256SUMS.txt mismatch/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rejects duplicate or missing checksum entries", async () => {
  const { directory, names } = await fixture();
  try {
    await generateReleaseMetadata(directory, version);
    await writeFile(path.join(directory, names.checksums), "bad  duplicate.exe\\n");
    await assert.rejects(() => verifyReleaseArtifacts(directory, version), /exactly three checksum entries|Malformed SHA-256 checksum line/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rejects a manifest for a different version", async () => {
  const { directory, names } = await fixture();
  try {
    await generateReleaseMetadata(directory, version);
    const manifestPath = path.join(directory, names.manifest);
    const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(manifestPath, "utf8"));
    manifest.version = "2.2.51";
    await writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(() => verifyReleaseArtifacts(directory, version), /version does not match/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rejects a missing or malformed manifest", async () => {
  const { directory, names } = await fixture();
  try {
    await generateReleaseMetadata(directory, version);
    await rm(path.join(directory, names.manifest));
    await assert.rejects(() => verifyReleaseArtifacts(directory, version));
    await writeFile(path.join(directory, names.manifest), "{ invalid json", "utf8");
    await assert.rejects(() => verifyReleaseArtifacts(directory, version), SyntaxError);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rejects missing manifest fields and malformed SHA-256 values", async () => {
  const { directory, names } = await fixture();
  try {
    await generateReleaseMetadata(directory, version);
    const manifestPath = path.join(directory, names.manifest);
    const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(manifestPath, "utf8"));
    delete manifest.artifacts[0].sha256;
    await writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(() => verifyReleaseArtifacts(directory, version), /Unexpected manifest fields/);
    manifest.artifacts[0].sha256 = "invalid";
    await writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(() => verifyReleaseArtifacts(directory, version), /Malformed manifest SHA-256/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rejects corrupted checksum files and truncated downloads", async () => {
  const { directory, names } = await fixture();
  try {
    await generateReleaseMetadata(directory, version);
    const checksumPath = path.join(directory, names.checksums);
    const original = await (await import("node:fs/promises")).readFile(checksumPath, "utf8");
    await writeFile(checksumPath, original.replace(/[a-f0-9]{64}/, "0".repeat(64)));
    await assert.rejects(() => verifyReleaseArtifacts(directory, version), /SHA256SUMS\.txt mismatch/);
    await writeFile(checksumPath, original);
    await writeFile(path.join(directory, names.portable), Buffer.alloc(512, 7));
    await assert.rejects(() => verifyReleaseArtifacts(directory, version), /Manifest byte size mismatch|implausibly small/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
