import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const releaseDir = path.resolve(process.env.RELEASE_DIR ?? "release");
const version = process.env.RELEASE_VERSION ?? JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const installerName = `OpenFront Replay Coach Setup ${version}.exe`;
const portableName = `OpenFront Replay Coach-${version}-win.zip`;
const entries = readdirSync(releaseDir, { withFileTypes: true });
const packageFiles = entries.filter(entry => entry.isFile()).map(entry => entry.name).sort();
const unexpectedDirectories = entries.filter(entry => entry.isDirectory() && entry.name !== "win-unpacked").map(entry => entry.name);
assert.deepEqual(packageFiles, [installerName, portableName].sort(), "Windows release directory must contain exactly one correctly named NSIS installer and one portable ZIP, with no additional files.");
assert.deepEqual(unexpectedDirectories, [], "Windows release directory contains an unexpected directory.");
const installer = path.join(releaseDir, installerName);
const portable = path.join(releaseDir, portableName);
for (const file of [installer, portable]) {
  const info = lstatSync(file);
  assert.ok(info.isFile() && !info.isSymbolicLink(), `Invalid Windows package file: ${path.basename(file)}`);
  assert.ok(info.size > 1_000_000, `Windows package is implausibly small: ${path.basename(file)}`);
}
assert.equal(readFileSync(installer).subarray(0, 2).toString("ascii"), "MZ", "NSIS installer is not a Windows PE executable.");
assert.equal(readFileSync(portable).subarray(0, 2).toString("ascii"), "PK", "Portable distribution is not a ZIP archive.");
assert.notEqual(installerName, portableName, "Installer and portable distribution names must be distinct.");

const temp = process.env.RUNNER_TEMP ?? os.tmpdir();
const installDir = path.join(temp, `ofrc-installer-${version}`);
const portableDir = path.join(temp, `ofrc-portable-${version}`);
rmSync(installDir, { recursive: true, force: true });
rmSync(portableDir, { recursive: true, force: true });
mkdirSync(installDir, { recursive: true });
mkdirSync(portableDir, { recursive: true });

console.log("Installing the NSIS distribution silently into an isolated directory.");
const install = spawnSync(installer, ["/S", `/D=${installDir}`], { encoding: "utf8", windowsHide: true, timeout: 180_000 });
if (install.error || install.status !== 0) {
  throw new Error(`NSIS installer failed (status ${install.status}): ${install.error ?? install.stderr ?? install.stdout}`);
}
const installedExe = path.join(installDir, "OpenFront Replay Coach.exe");
const installedAsar = path.join(installDir, "resources", "app.asar");
assert.ok(existsSync(installedExe) && statSync(installedExe).size > 1_000_000, "NSIS installation did not install a runnable application executable.");
assert.ok(existsSync(installedAsar) && statSync(installedAsar).size > 1_000, "NSIS installation is missing resources/app.asar.");

console.log("Extracting the independent portable ZIP.");
const expand = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $env:OFRC_PORTABLE_ZIP -DestinationPath $env:OFRC_PORTABLE_DIR -Force"], {
  encoding: "utf8", windowsHide: true,
  env: { ...process.env, OFRC_PORTABLE_ZIP: portable, OFRC_PORTABLE_DIR: portableDir },
  timeout: 180_000,
});
if (expand.error || expand.status !== 0) throw new Error(`Portable ZIP extraction failed: ${expand.error ?? expand.stderr ?? expand.stdout}`);
const portableExe = path.join(portableDir, "OpenFront Replay Coach.exe");
const portableAsar = path.join(portableDir, "resources", "app.asar");
assert.ok(existsSync(portableExe) && statSync(portableExe).size > 1_000_000, "Portable ZIP is missing its directly launchable executable.");
assert.ok(existsSync(portableAsar) && statSync(portableAsar).size > 1_000, "Portable ZIP is missing resources/app.asar.");

const smokeScript = path.join(root, "scripts", "smoke-test-windows.mjs");
const idleSoakMs = process.env.OFRC_IDLE_SOAK_MS ?? "300000";
for (const [kind, executable] of [["installed NSIS", installedExe], ["portable ZIP", portableExe]]) {
  console.log(`Launching ${kind} distribution: ${executable}`);
  const smoke = spawnSync(process.execPath, [smokeScript, executable], {
    stdio: "inherit", windowsHide: true,
    env: { ...process.env, OFRC_IDLE_SOAK_MS: idleSoakMs },
    timeout: Number(idleSoakMs) + 180_000,
  });
  if (smoke.error || smoke.status !== 0) throw new Error(`${kind} renderer smoke test failed (status ${smoke.status}): ${smoke.error ?? "see smoke-test output"}`);
}
console.log("WINDOWS_DISTRIBUTIONS_OK: installer and portable are distinct, extracted/installed and both launched with a responsive renderer.");
