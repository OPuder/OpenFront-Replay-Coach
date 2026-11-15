import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MIN_PACKAGE_BYTES = 1_000_000;

export function expectedReleaseNames(version) {
  if (!/^\\d+\\.\\d+\\.\\d+$/.test(version)) throw new Error("RELEASE_VERSION must be a stable x.y.z version.");
  return {
    installer: `OpenFront Replay Coach Setup ${version}.exe`,
    portable: `OpenFront Replay Coach-${version}-win.zip`,
    android: `OpenFront-Replay-Coach-${version}-Android.apk`,
    checksums: "SHA256SUMS.txt",
    manifest: "release-manifest.json",
  };
}

async function digestFile(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function listRegularFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const info = await lstat(fullPath);
    assert.ok(info.isFile() && !info.isSymbolicLink(), `Unexpected non-regular release entry: ${entry.name}`);
    files.push(entry.name);
  }
  return files.sort();
}

export async function generateReleaseMetadata(directory, version) {
  const names = expectedReleaseNames(version);
  const files = await listRegularFiles(directory);
  const expectedPackages = [names.installer, names.portable, names.android].sort();
  assert.deepEqual(files, expectedPackages, "Release staging directory must contain exactly the three correctly named distributables before metadata generation.");
  const artifacts = [];
  for (const name of expectedPackages) {
    const filePath = path.join(directory, name);
    const size = (await lstat(filePath)).size;
    assert.ok(size > MIN_PACKAGE_BYTES, `Release package is empty or implausibly small: ${name} (${size} bytes)`);
    artifacts.push({ name, size, sha256: await digestFile(filePath) });
  }
  await writeFile(path.join(directory, names.checksums), artifacts.map(item => `${item.sha256}  ${item.name}`).join("\\n") + "\\n", "utf8");
  await writeFile(path.join(directory, names.manifest), JSON.stringify({ schemaVersion: 1, version, artifacts }, null, 2) + "\\n", "utf8");
  return verifyReleaseArtifacts(directory, version);
}

export async function verifyReleaseArtifacts(directory, version) {
  const names = expectedReleaseNames(version);
  const expected = Object.values(names).sort();
  const actual = await listRegularFiles(directory);
  assert.deepEqual(actual, expected, "Release directory contains missing, unexpected or incorrectly named files.");

  const manifest = JSON.parse(await readFile(path.join(directory, names.manifest), "utf8"));
  assert.equal(manifest.schemaVersion, 1, "Unsupported release manifest schema.");
  assert.equal(manifest.version, version, "Release manifest version does not match the requested version.");
  assert.ok(Array.isArray(manifest.artifacts), "Release manifest artifacts must be an array.");

  const packageNames = [names.installer, names.portable, names.android].sort();
  const manifestNames = manifest.artifacts.map(item => item?.name).sort();
  assert.deepEqual(manifestNames, packageNames, "Manifest must describe exactly one installer, one portable ZIP and one Android APK.");
  assert.equal(new Set(manifestNames).size, packageNames.length, "Manifest contains duplicate package names.");

  const checksumText = await readFile(path.join(directory, names.checksums), "utf8");
  const checksumLines = checksumText.trimEnd().split(/\\r?\\n/);
  assert.equal(checksumLines.length, packageNames.length, "SHA256SUMS.txt must contain exactly three checksum entries.");
  const checksums = new Map();
  for (const line of checksumLines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    assert.ok(match, `Malformed SHA-256 checksum line: ${line}`);
    assert.ok(!checksums.has(match[2]), `Duplicate checksum entry: ${match[2]}`);
    checksums.set(match[2], match[1]);
  }
  assert.deepEqual([...checksums.keys()].sort(), packageNames, "SHA256SUMS.txt must contain exactly the three expected package filenames.");

  for (const name of packageNames) {
    const filePath = path.join(directory, name);
    const info = await lstat(filePath);
    assert.ok(info.isFile() && !info.isSymbolicLink(), `Package is not a regular file: ${name}`);
    assert.ok(info.size > MIN_PACKAGE_BYTES, `Package is empty or implausibly small: ${name} (${info.size} bytes)`);
    const sha256 = await digestFile(filePath);
    const record = manifest.artifacts.find(item => item.name === name);
    assert.equal(record.size, info.size, `Manifest byte size mismatch: ${name}`);
    assert.match(record.sha256, /^[a-f0-9]{64}$/, `Malformed manifest SHA-256: ${name}`);
    assert.equal(record.sha256, sha256, `Manifest SHA-256 mismatch: ${name}`);
    assert.equal(checksums.get(name), sha256, `SHA256SUMS.txt mismatch: ${name}`);
  }
  return { version, files: expected, artifacts: manifest.artifacts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directory = path.resolve(process.env.RELEASE_DIR ?? "release");
  const version = process.env.RELEASE_VERSION ?? "";
  const mode = process.argv[2] ?? "verify";
  const result = mode === "generate"
    ? await generateReleaseMetadata(directory, version)
    : await verifyReleaseArtifacts(directory, version);
  console.log(`Release artifact verification passed for v${result.version}: ${result.files.join(", ")}`);
}
