import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import os from "node:os";
import {
  UpgradeContextError, assertUpgradeSnapshotsEqual,
} from "./windows-upgrade-storage-contract.mjs";

const previous = path.resolve(process.env.PREVIOUS_RELEASE_DIR || "");
const current = path.resolve(process.env.CURRENT_RELEASE_DIR || "release/packages");
const portableBaselineZip = path.resolve(process.env.PORTABLE_UPDATE_BASELINE || "");
const temp = process.env.RUNNER_TEMP || os.tmpdir();
const packageMetadata = JSON.parse(readFileSync("package.json", "utf8"));
const version = packageMetadata.version;
const oldInstaller = "OpenFront.Replay.Coach.Setup.2.2.51.exe";
const oldPortable = "OpenFront.Replay.Coach-2.2.51-win.zip";
const newInstaller = "OpenFront Replay Coach Setup " + version + ".exe";
const newPortable = "OpenFront Replay Coach-" + version + "-win.zip";
const appName = "OpenFront Replay Coach.exe";
const helper = path.resolve("scripts/windows-webview-storage.mjs");
for (const file of [path.join(previous, oldInstaller), path.join(previous, oldPortable), path.join(current, newInstaller), path.join(current, newPortable), portableBaselineZip]) {
  assert.ok(existsSync(file) && statSync(file).size > 1000000, "Missing or implausibly small upgrade package: " + file);
}
function run(command, args, env = process.env, timeout = 240000) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, timeout, env });
  if (result.error || result.status !== 0) throw new Error(command + " failed: " + (result.error || result.stderr || result.stdout));
  return result.stdout || "";
}
const digest = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try { last = await predicate(); if (last) return last; } catch {}
    await delay(500);
  }
  throw new Error("Timed out waiting for " + description + (last ? ": " + String(last) : ""));
}
function stop(child) {
  if (child?.pid && child.exitCode === null) {
    try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
  }
}
function stopExecutable(executable) {
  const escaped = executable.replace(/'/g, "''");
  run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$target='" + escaped + "'; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $target } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
  ], process.env, 30000);
}
function isExecutableRunning(executable) {
  const escaped = executable.replace(/'/g, "''");
  const output = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$target='" + escaped + "'; @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $target }).Count"
  ], process.env, 30000);
  return Number(output.trim()) > 0;
}
function findIndexedDbDirectories(root) {
  const found = [];
  const visit = directory => {
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = path.join(directory, entry.name);
      if (entry.name.toLowerCase() === "indexeddb") found.push(child);
      else visit(child);
    }
  };
  visit(root);
  return found;
}
function readElectronContext(output) {
  const line = output.split(/\r?\n/).find(value => value.includes("OFRC_UPGRADE_CONTEXT="));
  if (!line) return null;
  try { return JSON.parse(line.slice(line.indexOf("OFRC_UPGRADE_CONTEXT=") + "OFRC_UPGRADE_CONTEXT=".length)); }
  catch { throw new UpgradeContextError("Electron emitted malformed userData diagnostics: " + line); }
}
function normalizedWindows(value) { return path.win32.normalize(path.win32.resolve(value)).toLowerCase(); }
function attachContext(snapshot, session, dataDir) {
  const indexedDbDirectories = findIndexedDbDirectories(dataDir);
  if (indexedDbDirectories.length !== 1) {
    throw new UpgradeContextError("Expected exactly one physical Chromium IndexedDB directory for the isolated app profile; found " + JSON.stringify(indexedDbDirectories));
  }
  const physicalUserDataPath = path.dirname(indexedDbDirectories[0]);
  const context = session.electronContext;
  const userDataPath = normalizedWindows(context?.userDataPath || physicalUserDataPath);
  const appDataPath = normalizedWindows(context?.appDataPath || session.appData);
  if (userDataPath !== normalizedWindows(physicalUserDataPath)) {
    throw new UpgradeContextError("Electron app.getPath('userData') does not own the IndexedDB directory: userData=" + userDataPath + "; IndexedDB=" + indexedDbDirectories[0]);
  }
  return {
    ...snapshot,
    electron: { userDataPath, appDataPath, executablePath: context?.executablePath || session.executable },
    profileIdentity: userDataPath + "|" + snapshot.renderer.origin,
  };
}
async function invokeHelper(mode, port, installDirectory) {
  const output = run(process.execPath, [helper, mode, String(port), installDirectory], process.env, 210000);
  const line = output.trim().split(/\r?\n/).at(-1);
  try { return JSON.parse(line); }
  catch { throw new Error("Windows storage helper returned invalid JSON: " + output.slice(-4000)); }
}
async function launch(executable, dataDir, port, mode, extraEnv = {}, requireElectronDiagnostics = false) {
  const appData = path.join(dataDir, "appdata");
  const localData = path.join(dataDir, "localdata");
  mkdirSync(appData, { recursive: true });
  mkdirSync(localData, { recursive: true });
  const env = {
    ...process.env, ...extraEnv,
    APPDATA: appData, LOCALAPPDATA: localData,
    OFRC_UPGRADE_DIAGNOSTICS: "1",
  };
  const child = spawn(executable, [
    "--remote-debugging-port=" + port,
    "--remote-allow-origins=*",
    "--no-first-run",
  ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env });
  let childOutput = "";
  child.stdout.on("data", chunk => { childOutput += String(chunk); });
  child.stderr.on("data", chunk => { childOutput += String(chunk); });
  try {
    const helperResult = await invokeHelper(mode, port, path.dirname(executable));
    const electronContext = requireElectronDiagnostics
      ? await waitFor(() => readElectronContext(childOutput), 10000, "Electron userData diagnostics from the packaged main process")
      : readElectronContext(childOutput);
    return { child, helperResult, childOutput, electronContext, appData, localData, executable };
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
  run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "Expand-Archive -LiteralPath $env:OFRC_ZIP -DestinationPath $env:OFRC_DEST -Force"
  ], { ...process.env, OFRC_ZIP: zip, OFRC_DEST: directory });
  const executable = path.join(directory, appName);
  const archive = path.join(directory, "resources", "app.asar");
  assert.ok(existsSync(executable) && existsSync(archive), "Portable ZIP is missing executable or app.asar.");
  return { executable, archive };
}
function reportSnapshot(label, snapshot) {
  console.log("WINDOWS_UPGRADE_" + label + "_SNAPSHOT " + JSON.stringify(snapshot));
}
async function verifyNsisUpdate() {
  const installDirectory = path.join(temp, "ofrc-nsis-in-place");
  const dataDirectory = path.join(temp, "ofrc-nsis-user-data");
  rmSync(installDirectory, { recursive: true, force: true });
  rmSync(dataDirectory, { recursive: true, force: true });
  const baseline = install(path.join(previous, oldInstaller), installDirectory);
  const baselineSession = await launch(baseline.executable, dataDirectory, 9231, "seed");
  try {
    const before = attachContext(baselineSession.helperResult.snapshot, baselineSession, dataDirectory);
    reportSnapshot("NSIS_BEFORE", before);
    const beforeHash = digest(baseline.archive);
    stop(baselineSession.child);
    const candidate = install(path.join(current, newInstaller), installDirectory);
    assert.notEqual(digest(candidate.archive), beforeHash, "NSIS installer did not replace the existing application files.");
    assert.equal(normalizedWindows(candidate.executable), normalizedWindows(baseline.executable), "NSIS update changed the installed executable path.");
    assert.equal(normalizedWindows(candidate.archive), normalizedWindows(baseline.archive), "NSIS update changed the installed app.asar path.");
    const updatedSession = await launch(candidate.executable, dataDirectory, 9231, "snapshot", {}, true);
    try {
      const after = attachContext(updatedSession.helperResult.snapshot, updatedSession, dataDirectory);
      reportSnapshot("NSIS_AFTER", after);
      assertUpgradeSnapshotsEqual(before, after);
      console.log("WINDOWS_IN_PLACE_UPGRADE_OK NSIS v2.2.51 -> v" + version + " full profile, match, replay, simulation, analysis, LocalStorage and IndexedDB contents retained");
    } finally { stop(updatedSession.child); }
  } finally { stop(baselineSession.child); }
}

async function startLocalReleaseServer(candidateZip) {
  const size = statSync(candidateZip).size;
  const sha256 = digest(candidateZip);
  let origin = "";
  const server = createServer((request, response) => {
    if (request.url === "/release") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({
        tag_name: "v" + version,
        html_url: "http://127.0.0.1/test-release",
        assets: [{
          name: newPortable,
          browser_download_url: origin + "/candidate.zip",
          size,
          digest: "sha256:" + sha256,
        }],
      }));
      return;
    }
    if (request.url === "/candidate.zip") {
      response.writeHead(200, { "content-type": "application/zip", "content-length": size });
      createReadStream(candidateZip).pipe(response);
      return;
    }
    response.writeHead(404); response.end("not found");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  origin = "http://127.0.0.1:" + address.port;
  return { server, releaseUrl: origin + "/release", sha256 };
}
async function verifyPortableUpdater() {
  const portableDirectory = path.join(temp, "ofrc-portable-real-update");
  const dataDirectory = path.join(temp, "ofrc-portable-user-data");
  rmSync(portableDirectory, { recursive: true, force: true });
  rmSync(dataDirectory, { recursive: true, force: true });
  const baseline = extract(portableBaselineZip, portableDirectory);
  const candidateZip = path.join(current, newPortable);
  const server = await startLocalReleaseServer(candidateZip);
  const testEnv = {
    OFRC_UPDATE_TEST_MODE: "1",
    OFRC_UPDATE_TEST_RELEASE_URL: server.releaseUrl,
  };
  let baselineSession;
  try {
    baselineSession = await launch(baseline.executable, dataDirectory, 9232, "seed", testEnv, true);
    const before = attachContext(baselineSession.helperResult.snapshot, baselineSession, dataDirectory);
    reportSnapshot("PORTABLE_BEFORE", before);
    const beforeHash = digest(baseline.archive);
    const scheduled = await invokeHelper("update", 9232, portableDirectory);
    assert.equal(scheduled.result?.scheduled, true, "Portable updater did not schedule a real update: " + JSON.stringify(scheduled));
    await waitFor(() => baselineSession.child.exitCode !== null, 30000, "baseline portable process to exit after handing off the update");
    const userDataPath = before.electron.userDataPath;
    const updateLog = path.join(userDataPath, "update-install.log");
    await waitFor(() => existsSync(updateLog) && readFileSync(updateLog, "utf8").includes("Programmdateien geändert und verifiziert; starte Anwendung."),
      120000, "the actual portable updater to verify and install the downloaded candidate ZIP");
    assert.notEqual(digest(baseline.archive), beforeHash, "Portable updater did not replace app.asar.");
    await waitFor(() => isExecutableRunning(baseline.executable), 30000, "the portable updater to restart the updated application");
    stopExecutable(baseline.executable);
    const updatedSession = await launch(baseline.executable, dataDirectory, 9232, "snapshot", testEnv, true);
    try {
      const after = attachContext(updatedSession.helperResult.snapshot, updatedSession, dataDirectory);
      reportSnapshot("PORTABLE_AFTER", after);
      assertUpgradeSnapshotsEqual(before, after);
      console.log("WINDOWS_IN_PLACE_UPGRADE_OK PORTABLE updater-script v2.2.51 -> v" + version + " downloaded ZIP SHA-256=" + server.sha256 + "; full profile, match, replay, simulation, analysis, LocalStorage and IndexedDB contents retained");
    } finally { stop(updatedSession.child); }
  } finally {
    if (baselineSession) stop(baselineSession.child);
    try { server.server.close(); } catch {}
  }
}

await verifyNsisUpdate();
await verifyPortableUpdater();
console.log("WINDOWS_IN_PLACE_UPGRADE_SUITE_OK " + JSON.stringify({
  publishedNsisBaseline: "v2.2.51",
  portableUpdaterBaseline: "same-source updater-enabled v2.2.51 test package",
  candidate: version,
  nsis: "actual silent installer update in the same install directory",
  portable: "actual Update Center -> verified download -> detached PowerShell updater -> same portable directory",
  compared: ["renderer URL/origin", "Electron userData/appData", "LocalStorage keys and values", "IndexedDB schema/counts/full records", "profile-match-replay relationships"],
}));
