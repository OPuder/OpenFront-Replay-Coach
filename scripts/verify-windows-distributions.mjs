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
const installDir = path.join(temp, `ofrc-installer-${version}`);
const portableDir = path.join(temp, `ofrc-portable-${version}`);
rmSync(installDir, { recursive: true, force: true });
rmSync(portableDir, { recursive: true, force: true });
mkdirSync(installDir, { recursive: true });
mkdirSync(portableDir, { recursive: true });

const installerBytes = readFileSync(installer);
const peOffset = installerBytes.readUInt32LE(0x3c);
assert.equal(installerBytes.toString("ascii", peOffset, peOffset + 4), "PE\\0\\0", "Installer has no valid PE header.");
const machine = installerBytes.readUInt16LE(peOffset + 4);
const architecture = ({ 0x014c: "x86", 0x8664: "x64", 0xaa64: "arm64" })[machine] ?? `unknown (0x${machine.toString(16)})`;
assert.equal(architecture, "x64", `Expected the Windows installer to target x64, received ${architecture}.`);
const installerSha256 = createHash("sha256").update(installerBytes).digest("hex");
console.log(JSON.stringify({
  installer: {
    path: installer, bytes: installerBytes.length, sha256: installerSha256,
    peArchitecture: architecture, peMachine: `0x${machine.toString(16).padStart(4, "0")}`,
    runnerArchitecture: process.arch, runnerPlatform: process.platform,
  },
  invocation: { executable: installer, arguments: ["/S", `/D=${installDir}`], cwd: root, timeoutMs: 180_000 },
}, null, 2));

const dumpDir = path.join(temp, "ofrc-nsis-crash-dumps");
mkdirSync(dumpDir, { recursive: true });
const werKey = `HKCU\\Software\\Microsoft\\Windows\\Windows Error Reporting\\LocalDumps\\${path.basename(installer)}`;
const werSetup = spawnSync("reg.exe", ["add", werKey, "/v", "DumpFolder", "/t", "REG_EXPAND_SZ", "/d", dumpDir, "/f"], { encoding: "utf8", windowsHide: true });
if (werSetup.status === 0) {
  spawnSync("reg.exe", ["add", werKey, "/v", "DumpType", "/t", "REG_DWORD", "/d", "2", "/f"], { encoding: "utf8", windowsHide: true });
  spawnSync("reg.exe", ["add", werKey, "/v", "DumpCount", "/t", "REG_DWORD", "/d", "5", "/f"], { encoding: "utf8", windowsHide: true });
}
const crashWindowStart = new Date(Date.now() - 30_000).toISOString();
console.log("Installing the NSIS distribution silently into an isolated directory.");
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
  console.error(JSON.stringify({
    installerFailure: { status: install.status, exitCode, exitHex, signal: install.signal, error: install.error?.message, stdout: install.stdout, stderr: install.stderr },
    installerMetadata: metadata.stdout?.trim(), metadataError: metadata.stderr?.trim(),
    applicationCrashEvents: events.stdout?.trim(), eventQueryError: events.stderr?.trim(),
    werDumpDirectory: dumpDir, werDumps: dumps,
    werRegistrySetupExitCode: werSetup.status, werRegistrySetupError: werSetup.stderr?.trim(),
  }, null, 2));
  throw new Error(`NSIS installer failed (status ${install.status}, ${exitHex ?? "no exit code"}); see PE metadata, Windows Application crash events and WER dump diagnostics above.`);
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
