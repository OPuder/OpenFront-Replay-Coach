import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { assertFixtureRelationships } from "./windows-upgrade-fixture.mjs";
import os from "node:os";
import {
  UpgradeContextError, assertContextContinuity, assertUpgradeSnapshotsEqual,
} from "./windows-upgrade-storage-contract.mjs";

const previous = path.resolve(process.env.PREVIOUS_RELEASE_DIR || "");
const current = path.resolve(process.env.CURRENT_RELEASE_DIR || "release/packages");
const portableBaselineZip = path.resolve(process.env.PORTABLE_UPDATE_BASELINE || "");
const temp = process.env.RUNNER_TEMP || os.tmpdir();
const packageMetadata = JSON.parse(readFileSync("package.json", "utf8"));
const version = packageMetadata.version;
const oldInstaller = "OpenFront.Replay.Coach.Setup.2.2.51.exe";
const newInstaller = "OpenFront Replay Coach Setup " + version + ".exe";
const newPortable = "OpenFront Replay Coach-" + version + "-win.zip";
const appName = "OpenFront Replay Coach.exe";
const helper = path.resolve("scripts/windows-webview-storage.mjs");
for (const file of [path.join(previous, oldInstaller), path.join(current, newInstaller), path.join(current, newPortable), portableBaselineZip]) {
  assert.ok(existsSync(file) && statSync(file).size > 1000000, "Missing or implausibly small upgrade package: " + file);
}
function run(command, args, env = process.env, timeout = 240000) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, timeout, env });
  if (result.error || result.status !== 0) {
    const diagnostic = {
      status: result.status,
      signal: result.signal,
      error: result.error ? { name: result.error.name, message: result.error.message, code: result.error.code, errno: result.error.errno, syscall: result.error.syscall, path: result.error.path } : null,
      stdout: String(result.stdout ?? "").slice(-8000),
      stderr: String(result.stderr ?? "").slice(-8000),
    };
    throw new Error(command + " failed: " + JSON.stringify(diagnostic));
  }
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
  if (indexedDbDirectories.length > 1) {
    throw new UpgradeContextError("Multiple physical Chromium IndexedDB directories make the active profile ambiguous: " + JSON.stringify(indexedDbDirectories));
  }
  const context = session.electronContext;
  if (!context?.userDataPath && indexedDbDirectories.length !== 1) {
    throw new UpgradeContextError("Cannot establish the active Electron userData profile from main-process diagnostics or a physical IndexedDB directory.");
  }
  const physicalUserDataPath = indexedDbDirectories.length === 1 ? path.dirname(indexedDbDirectories[0]) : null;
  const userDataPath = normalizedWindows(context?.userDataPath || physicalUserDataPath);
  const appDataPath = normalizedWindows(context?.appDataPath || session.appData);
  if (physicalUserDataPath && userDataPath !== normalizedWindows(physicalUserDataPath)) {
    throw new UpgradeContextError("Electron app.getPath('userData') does not own the IndexedDB directory: userData=" + userDataPath + "; IndexedDB=" + indexedDbDirectories[0]);
  }
  if (!physicalUserDataPath && !snapshot.indexedDB?.missing) {
    throw new UpgradeContextError("IndexedDB records were returned but no physical IndexedDB profile directory could be located.");
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
  // Electron's Chromium profile must be isolated from the runner account and
  // remain identical across the published baseline and candidate executable.
  // Passing --user-data-dir makes this deterministic even for v2.2.51, which
  // predates the main-process diagnostics added to the candidate build.
  const profilePath = path.join(dataDir, "electron-user-data");
  mkdirSync(profilePath, { recursive: true });
  const localProxyBypass = extraEnv.OFRC_UPDATE_TEST_MODE === "1" && extraEnv.OFRC_UPDATE_TEST_RELEASE_URL
    ? {
        NO_PROXY: [process.env.NO_PROXY, "127.0.0.1,localhost"].filter(Boolean).join(","),
        no_proxy: [process.env.no_proxy, "127.0.0.1,localhost"].filter(Boolean).join(","),
      }
    : {};
  const env = {
    ...process.env, ...extraEnv, ...localProxyBypass,
    APPDATA: appData, LOCALAPPDATA: localData,
    OFRC_UPGRADE_DIAGNOSTICS: "1",
    OFRC_UPGRADE_CONTEXT_FILE: path.join(dataDir, "electron-upgrade-context.json"),
  };
  const child = spawn(executable, [
    "--user-data-dir=" + profilePath,
    "--remote-debugging-port=" + port,
    "--remote-allow-origins=*",
    "--no-first-run",
  ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env });
  let childOutput = "";
  child.stdout.on("data", chunk => { childOutput += String(chunk); });
  child.stderr.on("data", chunk => { childOutput += String(chunk); });
  try {
    const helperResult = await invokeHelper(mode, port, path.dirname(executable));
    const readPackagedContext = () => {
      const contextFile = env.OFRC_UPGRADE_CONTEXT_FILE;
      if (existsSync(contextFile)) {
        try { return JSON.parse(readFileSync(contextFile, "utf8")); }
        catch (error) { throw new UpgradeContextError("Packaged Electron wrote malformed upgrade context: " + String(error)); }
      }
      return readElectronContext(childOutput);
    };
    const electronContext = requireElectronDiagnostics
      ? await waitFor(readPackagedContext, 10000, "Electron userData diagnostics file from the packaged main process")
      : readPackagedContext();
    return { child, helperResult, get childOutput() { return childOutput; }, electronContext, appData, localData, executable };
  } catch (error) {
    const diagnostic = {
      executable,
      pid: child.pid ?? null,
      exitCode: child.exitCode,
      signalCode: child.signalCode,
      childOutput: childOutput.slice(-12000),
      error: String(error?.stack ?? error),
    };
    stop(child);
    throw new Error("Packaged Electron launch or storage helper failed: " + JSON.stringify(diagnostic), { cause: error });
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
  console.log("NSIS_UPDATER_BASELINE: exercising the production Update Center IPC and detached installer against loopback release metadata.");
  const installDirectory = path.join(temp, "ofrc-nsis-in-place");
  const dataDirectory = path.join(temp, "ofrc-nsis-user-data");
  const candidateInstaller = path.join(current, newInstaller);
  rmSync(installDirectory, { recursive: true, force: true });
  rmSync(dataDirectory, { recursive: true, force: true });
  const baseline = install(path.join(previous, oldInstaller), installDirectory);
  const server = await startLocalReleaseServer(candidateInstaller, newInstaller);
  const testEnv = { OFRC_UPDATE_TEST_MODE: "1", OFRC_UPDATE_TEST_RELEASE_URL: server.releaseUrl };
  let baselineSession;
  let updatedSession;
  try {
    baselineSession = await launch(baseline.executable, dataDirectory, 9231, "seed", testEnv, true);
    const before = attachContext(baselineSession.helperResult.snapshot, baselineSession, dataDirectory);
    assertFixtureRelationships(before, "baseline");
    reportSnapshot("NSIS_BEFORE", before);
    const beforeHash = digest(baseline.archive);
    const scheduled = await invokeHelper("update", 9231, installDirectory);
    assert.equal(scheduled.result?.scheduled, true, "NSIS updater did not schedule the real installer update: " + JSON.stringify(scheduled));
    await waitFor(() => baselineSession.child.exitCode !== null, 30000, "published v2.2.51 NSIS process to exit after handing off the installer");
    const updateLog = path.join(before.electron.userDataPath, "update-install.log");
    await waitFor(() => existsSync(updateLog) && readFileSync(updateLog, "utf8").includes("installer-install-verified"), 120000, "NSIS updater to install and verify the candidate installer");
    const updatedExecutable = path.join(installDirectory, appName);
    const updatedArchive = path.join(installDirectory, "resources", "app.asar");
    assert.notEqual(digest(updatedArchive), beforeHash, "NSIS updater did not replace the existing application files.");
    assert.equal(normalizedWindows(updatedExecutable), normalizedWindows(baseline.executable), "NSIS updater changed the installed executable path.");
    assert.equal(normalizedWindows(updatedArchive), normalizedWindows(baseline.archive), "NSIS updater changed the installed app.asar path.");
    await waitFor(() => isExecutableRunning(updatedExecutable), 30000, "NSIS updater to restart the updated application");
    stopExecutable(updatedExecutable);
    updatedSession = await launch(updatedExecutable, dataDirectory, 9231, "snapshot", testEnv, true);
    const after = attachContext(updatedSession.helperResult.snapshot, updatedSession, dataDirectory);
    reportSnapshot("NSIS_AFTER", after);
    assertContextContinuity(before, after);
    assertFixtureRelationships(after, "updated");
    assertUpgradeSnapshotsEqual(before, after);
    assert(server.requests.some(request => request.url === "/release"), "NSIS release lookup never reached the local test server.");
    assert(server.requests.some(request => request.url === "/candidate-asset"), "NSIS installer was not downloaded.");
    console.log("WINDOWS_IN_PLACE_UPGRADE_OK NSIS updater IPC v2.2.51 -> v" + version + " downloaded and verified installer; full profile, match, replay, simulation, analysis, LocalStorage and IndexedDB contents retained");
  } catch (error) {
    const updateLogPath = path.join(dataDirectory, "electron-user-data", "update-install.log");
    console.error("NSIS_UPDATER_FAILURE_DIAGNOSTICS", JSON.stringify({
      releaseUrl: server.releaseUrl, serverRequests: server.requests,
      appOutput: baselineSession?.childOutput?.slice(-12000) ?? "",
      updaterLog: existsSync(updateLogPath) ? readFileSync(updateLogPath, "utf8").slice(-12000) : null,
      error: String(error?.stack ?? error),
    }));
    throw error;
  } finally {
    if (baselineSession) stop(baselineSession.child);
    if (updatedSession) stop(updatedSession.child);
    try { server.server.close(); } catch {}
  }
}

async function startLocalReleaseServer(candidateZip, assetName = newPortable) {
  const size = statSync(candidateZip).size;
  const sha256 = digest(candidateZip);
  let origin = "";
  const requests = [];
  const server = createServer((request, response) => {
    const entry = { method: request.method, url: request.url, at: new Date().toISOString() };
    requests.push(entry);
    console.log("PORTABLE_UPDATE_SERVER_REQUEST", JSON.stringify(entry));
    if (request.url === "/release") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({
        tag_name: "v" + version,
        html_url: "http://127.0.0.1/test-release",
        assets: [{
          name: assetName,
          browser_download_url: origin + "/candidate-asset",
          size,
          digest: "sha256:" + sha256,
        }],
      }));
      return;
    }
    if (request.url === "/candidate-asset") {
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
  return { server, releaseUrl: origin + "/release", sha256, requests };
}
async function verifyNsisRollback() {
  console.log("NSIS_ROLLBACK_BASELINE: exercising the production installer updater with a deliberately invalid but SHA-256-valid EXE.");
  const installDirectory = path.join(temp, "ofrc-nsis-rollback");
  const dataDirectory = path.join(temp, "ofrc-nsis-rollback-user-data");
  const invalidInstaller = path.join(temp, newInstaller);
  rmSync(installDirectory, { recursive: true, force: true });
  rmSync(dataDirectory, { recursive: true, force: true });
  writeFileSync(invalidInstaller, Buffer.alloc(1_100_000, 0));
  const server = await startLocalReleaseServer(invalidInstaller, newInstaller);
  const testEnv = { OFRC_UPDATE_TEST_MODE: "1", OFRC_UPDATE_TEST_RELEASE_URL: server.releaseUrl };
  let baselineSession;
  let restoredSession;
  try {
    const baseline = install(path.join(previous, oldInstaller), installDirectory);
    baselineSession = await launch(baseline.executable, dataDirectory, 9234, "seed", testEnv, true);
    const before = attachContext(baselineSession.helperResult.snapshot, baselineSession, dataDirectory);
    assertFixtureRelationships(before, "baseline");
    reportSnapshot("NSIS_ROLLBACK_BEFORE", before);
    const beforeArchiveHash = digest(baseline.archive);
    const beforeExecutableHash = digest(baseline.executable);
    const scheduled = await invokeHelper("update", 9234, installDirectory);
    assert.equal(scheduled.result?.scheduled, true, "NSIS updater did not schedule the deliberately invalid installer: " + JSON.stringify(scheduled));
    await waitFor(() => baselineSession.child.exitCode !== null, 30000, "NSIS baseline process to exit after updater handoff");
    const updateLog = path.join(before.electron.userDataPath, "update-install.log");
    await waitFor(() => existsSync(updateLog) && readFileSync(updateLog, "utf8").includes("installer-rollback-verified"), 120000, "NSIS updater to reject the invalid installer and verify rollback");
    assert.equal(digest(baseline.archive), beforeArchiveHash, "NSIS rollback did not restore the original app.asar.");
    assert.equal(digest(baseline.executable), beforeExecutableHash, "NSIS rollback did not restore the original executable.");
    await waitFor(() => isExecutableRunning(baseline.executable), 30000, "restored NSIS application to restart");
    stopExecutable(baseline.executable);
    restoredSession = await launch(baseline.executable, dataDirectory, 9234, "snapshot", testEnv, true);
    const after = attachContext(restoredSession.helperResult.snapshot, restoredSession, dataDirectory);
    reportSnapshot("NSIS_ROLLBACK_AFTER", after);
    assertContextContinuity(before, after);
    assertFixtureRelationships(after, "updated");
    assertUpgradeSnapshotsEqual(before, after);
    assert(server.requests.some(request => request.url === "/release"), "NSIS release lookup never reached the local test server.");
    assert(server.requests.some(request => request.url === "/candidate-asset"), "NSIS invalid installer was not downloaded.");
    console.log("WINDOWS_NSIS_ROLLBACK_OK invalid SHA-256-valid installer rejected; original executable/app.asar restored, relaunched, and complete LocalStorage/IndexedDB contents retained.");
  } catch (error) {
    const updateLogPath = path.join(dataDirectory, "electron-user-data", "update-install.log");
    console.error("NSIS_ROLLBACK_FAILURE_DIAGNOSTICS", JSON.stringify({
      releaseUrl: server.releaseUrl, serverRequests: server.requests,
      appOutput: baselineSession?.childOutput?.slice(-12000) ?? "",
      updaterLog: existsSync(updateLogPath) ? readFileSync(updateLogPath, "utf8").slice(-12000) : null,
      error: String(error?.stack ?? error),
    }));
    throw error;
  } finally {
    if (baselineSession) stop(baselineSession.child);
    if (restoredSession) stop(restoredSession.child);
    try { server.server.close(); } catch {}
    rmSync(invalidInstaller, { force: true });
  }
}

async function verifyPortableUpdater() {
  console.log("PORTABLE_UPDATER_BASELINE: rebuilt v2.2.51 package from this commit; exercising the production Update Center IPC and PowerShell updater against loopback release metadata.");
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
    assertFixtureRelationships(before, "baseline");
    reportSnapshot("PORTABLE_BEFORE", before);
    const beforeHash = digest(baseline.archive);
    const scheduled = await invokeHelper("update", 9232, portableDirectory);
    assert.equal(scheduled.result?.scheduled, true, "Portable updater did not schedule a real update: " + JSON.stringify(scheduled));
    await waitFor(() => baselineSession.child.exitCode !== null, 30000, "baseline portable process to exit after handing off the update");
    const userDataPath = before.electron.userDataPath;
    const updateLog = path.join(userDataPath, "update-install.log");
    await waitFor(() => existsSync(updateLog) && readFileSync(updateLog, "utf8").includes("phase=portable-install-verified"),
      120000, "the actual portable updater to verify and install the downloaded candidate ZIP");
    assert.notEqual(digest(baseline.archive), beforeHash, "Portable updater did not replace app.asar.");
    await waitFor(() => isExecutableRunning(baseline.executable), 30000, "the portable updater to restart the updated application");
    stopExecutable(baseline.executable);
    const updatedSession = await launch(baseline.executable, dataDirectory, 9232, "snapshot", testEnv, true);
    try {
      const after = attachContext(updatedSession.helperResult.snapshot, updatedSession, dataDirectory);
      reportSnapshot("PORTABLE_AFTER", after);
      assertContextContinuity(before, after);
      assertFixtureRelationships(after);
      assertUpgradeSnapshotsEqual(before, after);
      console.log("WINDOWS_IN_PLACE_UPGRADE_OK PORTABLE updater-script v2.2.51 -> v" + version + " downloaded ZIP SHA-256=" + server.sha256 + "; full profile, match, replay, simulation, analysis, LocalStorage and IndexedDB contents retained");
    } finally { stop(updatedSession.child); }
  } catch (error) {
    const updateLogPath = path.join(dataDirectory, "electron-user-data", "update-install.log");
    console.error("PORTABLE_UPDATER_FAILURE_DIAGNOSTICS", JSON.stringify({
      releaseUrl: server.releaseUrl,
      serverRequests: server.requests,
      appOutput: baselineSession?.childOutput?.slice(-12000) ?? "",
      updaterLog: existsSync(updateLogPath) ? readFileSync(updateLogPath, "utf8").slice(-12000) : null,
      error: String(error?.stack ?? error),
    }));
    throw error;
  } finally {
    if (baselineSession) stop(baselineSession.child);
    try { server.server.close(); } catch {}
  }
}


async function verifyPortableRollback() {
  const portableDirectory = path.join(temp, "ofrc-portable-rollback");
  const dataDirectory = path.join(temp, "ofrc-portable-rollback-user-data");
  const candidateSourceDirectory = path.join(temp, "ofrc-rollback-candidate-source");
  const invalidRoot = path.join(temp, "ofrc-invalid-portable-package");
  const invalidZip = path.join(temp, "ofrc-invalid-portable-update.zip");
  for (const directory of [portableDirectory, dataDirectory, candidateSourceDirectory, invalidRoot]) {
    rmSync(directory, { recursive: true, force: true });
  }
  try { rmSync(invalidZip, { force: true }); } catch {}
  const baseline = extract(portableBaselineZip, portableDirectory);
  const candidateSource = extract(path.join(current, newPortable), candidateSourceDirectory);
  mkdirSync(invalidRoot, { recursive: true });
  // A valid ZIP and executable, but deliberately no resources/app.asar. The
  // detached updater starts copying, detects that the archive did not change,
  // and must restore the verified backup before relaunching the old app.
  copyFileSync(candidateSource.executable, path.join(invalidRoot, appName));
  run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$ErrorActionPreference='Stop'; Compress-Archive -Path (Join-Path $env:OFRC_BAD_ROOT '*') -DestinationPath $env:OFRC_BAD_ZIP -Force"
  ], { ...process.env, OFRC_BAD_ROOT: invalidRoot, OFRC_BAD_ZIP: invalidZip });
  assert.ok(existsSync(invalidZip) && statSync(invalidZip).size > 1000000, "Rollback fixture ZIP is missing or implausibly small.");
  const server = await startLocalReleaseServer(invalidZip);
  const testEnv = { OFRC_UPDATE_TEST_MODE: "1", OFRC_UPDATE_TEST_RELEASE_URL: server.releaseUrl };
  let baselineSession;
  let restoredSession;
  try {
    baselineSession = await launch(baseline.executable, dataDirectory, 9233, "seed", testEnv, true);
    const before = attachContext(baselineSession.helperResult.snapshot, baselineSession, dataDirectory);
    assertFixtureRelationships(before, "baseline");
    const beforeArchiveHash = digest(baseline.archive);
    const beforeExecutableHash = digest(baseline.executable);
    reportSnapshot("PORTABLE_ROLLBACK_BEFORE", before);
    const scheduled = await invokeHelper("update", 9233, portableDirectory);
    assert.equal(scheduled.result?.scheduled, true, "Portable updater did not schedule the deliberately invalid package: " + JSON.stringify(scheduled));
    await waitFor(() => baselineSession.child.exitCode !== null, 30000, "portable app to exit before rollback test");
    const updateLog = path.join(before.electron.userDataPath, "update-install.log");
    await waitFor(() => existsSync(updateLog) && readFileSync(updateLog, "utf8").includes("phase=portable-rollback-verified"),
      120000, "the detached updater to reject the incomplete package and verify rollback");
    await waitFor(() => isExecutableRunning(baseline.executable), 30000, "the restored portable application to restart");
    stopExecutable(baseline.executable);
    restoredSession = await launch(baseline.executable, dataDirectory, 9233, "snapshot", testEnv, true);
    const after = attachContext(restoredSession.helperResult.snapshot, restoredSession, dataDirectory);
    reportSnapshot("PORTABLE_ROLLBACK_AFTER", after);
    assertContextContinuity(before, after);
    assertFixtureRelationships(after, "updated");
    assertUpgradeSnapshotsEqual(before, after);
    assert.equal(digest(baseline.archive), beforeArchiveHash, "Rollback did not restore the original app.asar SHA-256.");
    assert.equal(digest(baseline.executable), beforeExecutableHash, "Rollback did not restore the original application executable.");
    console.log("WINDOWS_PORTABLE_ROLLBACK_OK invalid ZIP passed SHA-256 download verification, updater rejected incomplete app.asar, restored original executable/archive and retained full LocalStorage/IndexedDB records.");
  } finally {
    if (baselineSession) stop(baselineSession.child);
    if (restoredSession) stop(restoredSession.child);
    try { server.server.close(); } catch {}
  }
}

await verifyNsisUpdate();
await verifyNsisRollback();
await verifyPortableUpdater();
await verifyPortableRollback();
console.log("WINDOWS_IN_PLACE_UPGRADE_SUITE_OK " + JSON.stringify({
  publishedNsisBaseline: "v2.2.51",
  portableUpdaterBaseline: "same-source updater-enabled v2.2.51 test package",
  portableRollback: "invalid but SHA-256-valid ZIP triggers detached updater rollback and full storage verification",
  candidate: version,
  nsis: "actual silent installer update in the same install directory",
  portable: "actual Update Center -> verified download -> detached PowerShell updater -> same portable directory",
  compared: ["renderer URL/origin", "Electron userData/appData", "LocalStorage keys and values", "IndexedDB schema/counts/full records", "profile-match-replay relationships"],
}));
