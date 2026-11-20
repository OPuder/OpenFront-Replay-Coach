import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const portableDir = path.join(temp, `ofrc-portable-${version}`);
rmSync(portableDir, { recursive: true, force: true });
mkdirSync(portableDir, { recursive: true });

function inspectPe(file) {
  const bytes = readFileSync(file);
  assert.ok(bytes.length > 0x40, `Executable is too small to contain a valid PE header: ${file}`);
  const peOffset = bytes.readUInt32LE(0x3c);
  assert.ok(peOffset + 6 <= bytes.length, `Executable PE header offset is outside the file: ${file}`);
  const signature = bytes.subarray(peOffset, peOffset + 4);
  assert.ok(signature.equals(Buffer.from([0x50, 0x45, 0x00, 0x00])), `Executable has no valid PE header: ${file}`);
  const machine = bytes.readUInt16LE(peOffset + 4);
  const architecture = ({ 0x014c: "x86", 0x8664: "x64", 0xaa64: "arm64" })[machine] ?? `unknown (0x${machine.toString(16)})`;
  return {
    path: file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
    peOffset, peSignatureHex: signature.toString("hex"),
    peMachine: `0x${machine.toString(16).padStart(4, "0")}`, architecture,
  };
}

const installerPe = inspectPe(installer);
const installerBytes = readFileSync(installer);
const portableBytes = readFileSync(portable);
console.log(JSON.stringify({
  installerBootstrapper: { ...installerPe, runnerArchitecture: process.arch, runnerPlatform: process.platform },
  portableArchive: { path: portable, bytes: portableBytes.length, sha256: createHash("sha256").update(portableBytes).digest("hex") },
}, null, 2));
assert.ok(["x86", "x64"].includes(installerPe.architecture),
  `Unsupported NSIS bootstrapper architecture: ${installerPe.architecture}; the installed application payload is validated separately as x64.`);

const installerAttempts = Number(process.env.OFRC_INSTALLER_ATTEMPTS ?? "2");
assert.ok(Number.isInteger(installerAttempts) && installerAttempts >= 2 && installerAttempts <= 3,
  "OFRC_INSTALLER_ATTEMPTS must be an integer between 2 and 3 so intermittent NSIS failures are exercised.");
const failures = [];
const smokeScript = path.join(root, "scripts", "smoke-test-windows.mjs");
const idleSoakMs = Number(process.env.OFRC_IDLE_SOAK_MS ?? 5 * 60 * 1000);
assert.ok(Number.isFinite(idleSoakMs) && idleSoakMs >= 300_000, "Each Windows distribution must complete at least five minutes of renderer idle stability.");
const werKey = `HKCU\\Software\\Microsoft\\Windows\\Windows Error Reporting\\LocalDumps\\${path.basename(installer)}`;

function runRendererSmoke(kind, executable) {
  console.log(`Launching ${kind} distribution: ${executable}`);
  const smoke = spawnSync(process.execPath, [smokeScript, executable], {
    stdio: "inherit", windowsHide: true,
    env: { ...process.env, OFRC_IDLE_SOAK_MS: String(idleSoakMs) },
    timeout: idleSoakMs + 180_000,
  });
  if (smoke.error || smoke.status !== 0) {
    const failure = { kind, status: smoke.status, signal: smoke.signal, error: smoke.error?.message };
    failures.push(failure);
    console.error("WINDOWS_DISTRIBUTION_ATTEMPT_FAILED", JSON.stringify(failure));
    return false;
  }
  console.log("WINDOWS_DISTRIBUTION_ATTEMPT_OK", JSON.stringify({ kind, idleSoakMs }));
  return true;
}

for (let attempt = 1; attempt <= installerAttempts; attempt++) {
  const installDir = path.join(temp, `ofrc-installer-${version}-attempt-${attempt}`);
  const dumpDir = path.join(temp, `ofrc-nsis-crash-dumps-attempt-${attempt}`);
  rmSync(installDir, { recursive: true, force: true });
  mkdirSync(installDir, { recursive: true });
  mkdirSync(dumpDir, { recursive: true });
  const werSetup = spawnSync("reg.exe", ["add", werKey, "/v", "DumpFolder", "/t", "REG_EXPAND_SZ", "/d", dumpDir, "/f"], { encoding: "utf8", windowsHide: true });
  if (werSetup.status === 0) {
    spawnSync("reg.exe", ["add", werKey, "/v", "DumpType", "/t", "REG_DWORD", "/d", "2", "/f"], { encoding: "utf8", windowsHide: true });
    spawnSync("reg.exe", ["add", werKey, "/v", "DumpCount", "/t", "REG_DWORD", "/d", "5", "/f"], { encoding: "utf8", windowsHide: true });
  }
  const crashWindowStart = new Date(Date.now() - 30_000).toISOString();
  const invocation = { attempt, executable: installer, arguments: ["/S", `/D=${installDir}`], cwd: root, timeoutMs: 180_000 };
  console.log("NSIS_INSTALL_ATTEMPT_START", JSON.stringify(invocation));
  const attemptStartedAt = Date.now();
  const install = spawnSync(installer, ["/S", `/D=${installDir}`], { encoding: "utf8", windowsHide: true, timeout: 180_000 });
  if (install.error || install.status !== 0) {
    const exitCode = install.status == null ? null : install.status >>> 0;
    const exitHex = exitCode == null ? null : `0x${exitCode.toString(16).padStart(8, "0").toUpperCase()}`;
    const metadata = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "$p=$env:OFRC_INSTALLER; $i=Get-Item -LiteralPath $p; $s=Get-AuthenticodeSignature -LiteralPath $p; [pscustomobject]@{FullName=$i.FullName;Length=$i.Length;FileVersion=$i.VersionInfo.FileVersion;ProductVersion=$i.VersionInfo.ProductVersion;CompanyName=$i.VersionInfo.CompanyName;SignatureStatus=[string]$s.Status;Signer=$s.SignerCertificate.Subject;LastWriteTimeUtc=$i.LastWriteTimeUtc} | ConvertTo-Json -Compress"
    ], { encoding: "utf8", windowsHide: true, env: { ...process.env, OFRC_INSTALLER: installer } });
    const events = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "$since=[datetime]::Parse($env:OFRC_CRASH_WINDOW); Get-WinEvent -FilterHashtable @{LogName='Application';StartTime=$since} -ErrorAction SilentlyContinue | Where-Object {$_.Id -in 1000,1001,1026 -or $_.Message -match 'NSIS|OpenFront Replay Coach Setup'} | Select-Object -First 20 TimeCreated,Id,ProviderName,LevelDisplayName,Message | ConvertTo-Json -Depth 4 -Compress"
    ], { encoding: "utf8", windowsHide: true, env: { ...process.env, OFRC_CRASH_WINDOW: crashWindowStart } });
    const dumps = readdirSync(dumpDir).map(name => ({ name, bytes: statSync(path.join(dumpDir, name)).size }));
    const failure = {
      attempt, elapsedMs: Date.now() - attemptStartedAt, status: install.status, exitCode, exitHex,
      signal: install.signal, error: install.error?.message, stdout: install.stdout, stderr: install.stderr,
      installerPath: installer, installerBytes: installerBytes.length, installerSha256: installerPe.sha256,
      peSignatureHex: installerPe.peSignatureHex, peArchitecture: installerPe.architecture,
      installerMetadata: metadata.stdout?.trim(), metadataError: metadata.stderr?.trim(),
      applicationCrashEvents: events.stdout?.trim(), eventQueryError: events.stderr?.trim(),
      werDumpDirectory: dumpDir, werDumps: dumps,
      werRegistrySetupExitCode: werSetup.status, werRegistrySetupError: werSetup.stderr?.trim(),
    };
    failures.push(failure);
    console.error("NSIS_INSTALL_ATTEMPT_FAILED", JSON.stringify(failure, null, 2));
    continue;
  }
  const installedExe = path.join(installDir, "OpenFront Replay Coach.exe");
  const installedAsar = path.join(installDir, "resources", "app.asar");
  if (!existsSync(installedExe) || !existsSync(installedAsar) || statSync(installedExe).size <= 1_000_000 || statSync(installedAsar).size <= 1_000) {
    const failure = { attempt, kind: "NSIS install contents", installDir, executableExists: existsSync(installedExe), appAsarExists: existsSync(installedAsar) };
    failures.push(failure);
    console.error("NSIS_INSTALL_ATTEMPT_FAILED", JSON.stringify(failure));
    continue;
  }
  const installedPe = inspectPe(installedExe);
  if (installedPe.architecture !== "x64") {
    const failure = { attempt, kind: "installed application architecture", expected: "x64", actual: installedPe.architecture, installedPe };
    failures.push(failure);
    console.error("NSIS_INSTALL_ATTEMPT_FAILED", JSON.stringify(failure));
    continue;
  }
  console.log("NSIS_INSTALL_ATTEMPT_OK", JSON.stringify({
    attempt, elapsedMs: Date.now() - attemptStartedAt, installDir,
    installedApplication: installedPe, appAsarBytes: statSync(installedAsar).size,
  }));
  runRendererSmoke(`installed NSIS attempt ${attempt}`, installedExe);
}

console.log("Extracting the independent portable ZIP.");
const expand = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $env:OFRC_PORTABLE_ZIP -DestinationPath $env:OFRC_PORTABLE_DIR -Force"], {
  encoding: "utf8", windowsHide: true,
  env: { ...process.env, OFRC_PORTABLE_ZIP: portable, OFRC_PORTABLE_DIR: portableDir },
  timeout: 180_000,
});
if (expand.error || expand.status !== 0) {
  failures.push({ kind: "portable ZIP extraction", status: expand.status, error: expand.error?.message, stdout: expand.stdout, stderr: expand.stderr });
} else {
  const portableEntries = [];
  const collectPortableEntries = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) collectPortableEntries(file);
      else if (entry.isFile()) portableEntries.push(file);
    }
  };
  collectPortableEntries(portableDir);
  const portableExecutables = portableEntries.filter(file => path.basename(file) === "OpenFront Replay Coach.exe");
  const portableAsars = portableEntries.filter(file =>
    path.basename(file) === "app.asar" && path.basename(path.dirname(file)).toLowerCase() === "resources");
  if (portableExecutables.length !== 1 || portableAsars.length !== 1) {
    failures.push({
      kind: "portable ZIP contents",
      executableMatches: portableExecutables.map(file => path.relative(portableDir, file)),
      appAsarMatches: portableAsars.map(file => path.relative(portableDir, file)),
      archiveEntries: portableEntries.slice(0, 40).map(file => path.relative(portableDir, file)),
    });
  } else {
    const portableExe = portableExecutables[0];
    const portableAsar = portableAsars[0];
    if (statSync(portableExe).size <= 1_000_000 || statSync(portableAsar).size <= 1_000) {
      failures.push({
        kind: "portable ZIP contents",
        executable: { path: path.relative(portableDir, portableExe), bytes: statSync(portableExe).size },
        appAsar: { path: path.relative(portableDir, portableAsar), bytes: statSync(portableAsar).size },
      });
    } else {
    const portablePe = inspectPe(portableExe);
    if (portablePe.architecture !== "x64") {
      failures.push({ kind: "portable application architecture", expected: "x64", actual: portablePe.architecture, portablePe });
    } else {
      console.log("PORTABLE_APPLICATION_ARCHITECTURE_OK", JSON.stringify(portablePe));
      runRendererSmoke("portable ZIP", portableExe);
    }
    }
  }
}
if (failures.length > 0) {
  console.error("WINDOWS_DISTRIBUTION_FAILURE_SUMMARY", JSON.stringify(failures, null, 2));
  throw new Error(`Windows distribution verification failed in ${failures.length} attempt(s); no installer or portable failure was ignored.`);
}
console.log("WINDOWS_DISTRIBUTIONS_OK", JSON.stringify({ installerAttempts, successfulInstallerAttempts: installerAttempts, portable: true, idleSoakMs }));
