import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

const previous = path.resolve(process.env.PREVIOUS_RELEASE_DIR || "");
const current = path.resolve(process.env.CURRENT_RELEASE_DIR || "release/packages");
const temp = process.env.RUNNER_TEMP || os.tmpdir();
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const oldInstaller = "OpenFront.Replay.Coach.Setup.2.2.51.exe";
const oldPortable = "OpenFront.Replay.Coach-2.2.51-win.zip";
const newInstaller = "OpenFront Replay Coach Setup " + version + ".exe";
const newPortable = "OpenFront Replay Coach-" + version + "-win.zip";
const appName = "OpenFront Replay Coach.exe";
const helper = path.resolve("scripts/windows-webview-storage.mjs");
for (const file of [path.join(previous, oldInstaller), path.join(previous, oldPortable), path.join(current, newInstaller), path.join(current, newPortable)]) {
  assert.ok(existsSync(file) && statSync(file).size > 1000000, "Missing or implausibly small upgrade package: " + file);
}
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, timeout: 240000, env });
  if (result.error || result.status !== 0) throw new Error(command + " failed: " + (result.error || result.stderr || result.stdout));
  return result.stdout || "";
}
const digest = file => createHash("sha256").update(readFileSync(file)).digest("hex");
function stop(child) {
  if (child?.pid) try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
}
async function launch(file, dataDir, port, mode) {
  const child = spawn(file, ["--user-data-dir=" + dataDir, "--remote-debugging-port=" + port, "--remote-allow-origins=*", "--no-first-run"], { stdio: "ignore", windowsHide: true });
  try {
    run(process.execPath, [helper, mode, String(port)]);
    return child;
  } catch (error) {
    stop(child);
    throw error;
  }
}
function install(file, directory) {
  run(file, ["/S", "/D=" + directory]);
  const executable = path.join(directory, appName);
  const archive = path.join(directory, "resources", "app.asar");
  assert.ok(existsSync(executable) && existsSync(archive), "NSIS install did not place executable and app.asar.");
  return { executable, archive };
}
function extract(zip, directory) {
  mkdirSync(directory, { recursive: true });
  run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $env:OFRC_ZIP -DestinationPath $env:OFRC_DEST -Force"], {
    ...process.env, OFRC_ZIP: zip, OFRC_DEST: directory,
  });
  const executable = path.join(directory, appName);
  const archive = path.join(directory, "resources", "app.asar");
  assert.ok(existsSync(executable) && existsSync(archive), "Portable ZIP is missing executable or app.asar.");
  return { executable, archive };
}
async function verify(kind, baseline, update, dataDir, port) {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  const before = digest(baseline.archive);
  let child = await launch(baseline.executable, dataDir, port, "seed");
  stop(child);
  update();
  const candidate = update.candidate;
  assert.notEqual(digest(candidate.archive), before, kind + " did not replace application files.");
  child = await launch(candidate.executable, dataDir, port, "verify");
  stop(child);
  console.log("WINDOWS_IN_PLACE_UPGRADE_OK", kind, "v2.2.51 -> v" + version, "profile/replay/analysis/settings retained");
}
const installerDir = path.join(temp, "ofrc-nsis-in-place");
const installerData = path.join(temp, "ofrc-nsis-user-data");
rmSync(installerDir, { recursive: true, force: true });
const baseInstaller = install(path.join(previous, oldInstaller), installerDir);
let candidateInstaller;
const installerUpdate = () => { candidateInstaller = install(path.join(current, newInstaller), installerDir); installerUpdate.candidate = candidateInstaller; };
await verify("NSIS installer", baseInstaller, installerUpdate, installerData, 9231);

const portableDir = path.join(temp, "ofrc-portable-in-place");
const portableData = path.join(temp, "ofrc-portable-user-data");
rmSync(portableDir, { recursive: true, force: true });
const basePortable = extract(path.join(previous, oldPortable), portableDir);
let candidatePortable;
const portableUpdate = () => { candidatePortable = extract(path.join(current, newPortable), portableDir); portableUpdate.candidate = candidatePortable; };
await verify("Portable ZIP", basePortable, portableUpdate, portableData, 9232);
console.log("WINDOWS_IN_PLACE_UPGRADE_SUITE_OK", JSON.stringify({ baseline: "2.2.51", candidate: version, installer: true, portable: true, userDataPreserved: true }));
