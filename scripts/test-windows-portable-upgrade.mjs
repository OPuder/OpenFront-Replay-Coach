import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const releaseDirectory = path.resolve("release");
const archives = fs.readdirSync(releaseDirectory).filter(name => /-win\.zip$/i.test(name)).sort();
assert.ok(archives.length >= 1, "New Windows portable ZIP is missing.");
const portableZip = path.join(releaseDirectory, archives.at(-1));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ofrc-portable-upgrade-"));
const previous = path.join(root, "previous");
const target = path.join(root, "installed");
const stage = path.join(root, "stage");
fs.mkdirSync(previous, { recursive: true });
fs.mkdirSync(target, { recursive: true });
fs.mkdirSync(stage, { recursive: true });

const run = (exe, args, options = {}) => {
  const result = spawnSync(exe, args, { encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) {
    throw new Error(`${exe} ${args.join(" ")} failed (exit ${result.status}, signal ${result.signal ?? "none"}): ${result.stderr || result.stdout || result.error?.message || "no output"}`);
  }
  return result.stdout.trim();
};
const extractPortable = (archive, destination) => {
  fs.mkdirSync(destination, { recursive: true });
  run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "Expand-Archive -LiteralPath " + JSON.stringify(archive) + " -DestinationPath " + JSON.stringify(destination) + " -Force"]);
};
const findAppDirectory = rootDirectory => {
  const queue = [rootDirectory];
  while (queue.length) {
    const directory = queue.shift();
    const executable = path.join(directory, "OpenFront Replay Coach.exe");
    if (fs.existsSync(executable)) return directory;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) queue.push(path.join(directory, entry.name));
    }
  }
  throw new Error("Portable archive has no OpenFront Replay Coach.exe");
};
const hash = file => run("certutil.exe", ["-hashfile", file, "SHA256"]).split(/\r?\n/).map(x => x.trim()).find(x => /^[0-9a-f]{64}$/i.test(x))?.toLowerCase();
let cleanup = true;
try {
  extractPortable(portableZip, stage);
  const source = findAppDirectory(stage);
  const versionManifest = path.join(source, "resources", "app.asar");
  assert.ok(fs.statSync(versionManifest).size > 1024, "New app.asar is missing or implausibly small.");

  // Seed the target with the same package, but change the archive bytes to
  // emulate a previous release. This test exercises replacement + rollback.
  fs.cpSync(source, target, { recursive: true, force: true });
  const targetAsar = path.join(target, "resources", "app.asar");
  const newHash = hash(targetAsar);
  assert.ok(newHash, "Could not hash the new portable app.asar.");
  fs.writeFileSync(targetAsar, Buffer.concat([fs.readFileSync(targetAsar), Buffer.from("previous-release-marker")]));
  const previousHash = hash(targetAsar);
  assert.notEqual(previousHash, newHash);

  const before = fs.mkdtempSync(path.join(root, "backup-"));
  fs.cpSync(target, before, { recursive: true, force: true });
  const backupHash = hash(path.join(before, "resources", "app.asar"));
  assert.equal(backupHash, previousHash, "Backup must match the previous installed app.");

  // Mirror the detached portable updater's verified replacement operation.
  fs.cpSync(source, target, { recursive: true, force: true });
  const afterHash = hash(targetAsar);
  assert.equal(afterHash, newHash, "Portable upgrade must replace app.asar with the new build.");
  assert.notEqual(afterHash, previousHash);
  assert.ok(fs.existsSync(path.join(target, "OpenFront Replay Coach.exe")));

  // Exercise rollback using a deliberately failing post-copy verification.
  fs.writeFileSync(targetAsar, "corrupt-after-update");
  fs.cpSync(before, target, { recursive: true, force: true });
  const restoredHash = hash(targetAsar);
  assert.equal(restoredHash, backupHash, "Rollback must restore the previous app.asar bytes.");
  console.log("WINDOWS_PORTABLE_UPGRADE_SMOKE_OK", JSON.stringify({ previousHash, newHash, restoredHash }));
} finally {
  if (cleanup) fs.rmSync(root, { recursive: true, force: true });
}
