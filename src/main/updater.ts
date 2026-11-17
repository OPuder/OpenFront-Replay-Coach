import { app, BrowserWindow, ipcMain } from 'electron';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const RELEASE_API = 'https://api.github.com/repos/OPuder/OpenFront-Replay-Coach/releases/latest';
const MAX_UPDATE_BYTES = 400 * 1024 * 1024;
type ReleaseAsset = { name: string; browser_download_url: string; size: number; digest?: string | null };
type Release = { tag_name: string; html_url: string; assets: ReleaseAsset[] };
type AutoUpdateAttempt = { targetVersion: string; installedVersion: string; attemptedAt: string };
const autoUpdateAttemptPath = () => path.join(app.getPath('userData'), 'auto-update-attempt.json');
async function readAutoUpdateAttempt(): Promise<AutoUpdateAttempt | null> {
  try { return JSON.parse(await fs.readFile(autoUpdateAttemptPath(), 'utf8')) as AutoUpdateAttempt; }
  catch { return null; }
}
async function writeAutoUpdateAttempt(targetVersion: string): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(autoUpdateAttemptPath(), JSON.stringify({ targetVersion, installedVersion: app.getVersion(), attemptedAt: new Date().toISOString() } satisfies AutoUpdateAttempt), 'utf8');
}
async function clearAutoUpdateAttempt(): Promise<void> {
  await fs.rm(autoUpdateAttemptPath(), { force: true }).catch(() => undefined);
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.replace(/^v/i, '').split('.').slice(0, 3).map(part => Number.parseInt(part, 10) || 0);
  const a = parse(left); const b = parse(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}
function reportProgress(phase: string, percent: number) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('updates:progress', { phase, percent });
  }
}
function resolveReleaseApiUrl(): string {
  if (process.env.OFRC_UPDATE_TEST_MODE !== '1') return RELEASE_API;
  const testUrl = process.env.OFRC_UPDATE_TEST_RELEASE_URL;
  if (!testUrl) throw new Error('OFRC_UPDATE_TEST_MODE ist aktiv, aber OFRC_UPDATE_TEST_RELEASE_URL fehlt.');
  let parsed: URL;
  try { parsed = new URL(testUrl); } catch { throw new Error('Ungültige lokale Update-Test-URL.'); }
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1') {
    throw new Error('Der Update-Testmodus akzeptiert ausschließlich einen lokalen HTTP-Server auf 127.0.0.1.');
  }
  return parsed.toString();
}
async function getLatestRelease(): Promise<Release> {
  const endpoint = resolveReleaseApiUrl();
  const testMode = process.env.OFRC_UPDATE_TEST_MODE === '1';
  logWindowsUpdateLifecycle('release-fetch-started', {
    endpoint,
    testMode,
    nodeVersion: process.versions.node,
    proxyConfigured: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy),
    noProxyIncludesLoopback: /(^|[,\\s])(127\\.0\\.0\\.1|localhost)([,\\s]|$)/i.test(process.env.NO_PROXY || process.env.no_proxy || ''),
  });
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'OpenFront-Replay-Coach/' + app.getVersion() },
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    logWindowsUpdateLifecycle('release-fetch-failed', { endpoint, errorName: error instanceof Error ? error.name : typeof error, error: String(error) });
    throw error;
  }
  logWindowsUpdateLifecycle('release-fetch-response', { endpoint, status: response.status, ok: response.ok });
  if (!response.ok) throw new Error('GitHub Update-Server antwortet mit HTTP ' + response.status + '.');
  const release = await response.json() as Release;
  if (!release.tag_name || !Array.isArray(release.assets)) throw new Error('Die GitHub-Release-Antwort ist unvollständig.');
  if (testMode) console.info('[ReplayCoach] Update regression: release lookup succeeded', { tag: release.tag_name, assets: release.assets.map(asset => asset.name) });
  return release;
}
function chooseWindowsAsset(release: Release, portable: boolean): ReleaseAsset {
  const asset = portable
    ? release.assets.find(item => /-win\.zip$/i.test(item.name))
    : release.assets.find(item => /(?:\.Setup\.| Setup )[\d.]+\.exe$/i.test(item.name));
  if (!asset) throw new Error(portable ? 'Für diese Version wurde kein Windows-Portable-Paket veröffentlicht.' : 'Für diese Version wurde kein Windows-Installer veröffentlicht.');
  if (!asset.digest?.startsWith('sha256:')) throw new Error('Das Release enthält keine SHA-256-Prüfsumme. Das Update wird aus Sicherheitsgründen nicht installiert.');
  if (!Number.isFinite(asset.size) || asset.size < 1 || asset.size > MAX_UPDATE_BYTES) throw new Error('Die Update-Datei hat eine ungültige oder nicht unterstützte Größe.');
  return asset;
}
async function downloadVerifiedAsset(asset: ReleaseAsset): Promise<string> {
  reportProgress('Update wird heruntergeladen', 5);
  const response = await fetch(asset.browser_download_url, {
    headers: { 'User-Agent': 'OpenFront-Replay-Coach/' + app.getVersion() },
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error('Download fehlgeschlagen (HTTP ' + response.status + ').');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== asset.size) throw new Error('Download unvollständig: ' + bytes.length + ' statt ' + asset.size + ' Bytes.');
  reportProgress('Prüfsumme wird überprüft', 85);
  const actual = createHash('sha256').update(bytes).digest('hex');
  const expected = asset.digest!.slice(7).toLowerCase();
  if (actual !== expected) throw new Error('Die SHA-256-Prüfsumme stimmt nicht. Das Update wurde verworfen.');
  const updateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfront-replay-coach-update-'));
  const destination = path.join(updateDir, asset.name);
  await fs.writeFile(destination, bytes, { flag: 'wx' });
  reportProgress('Update ist geprüft und bereit', 100);
  return destination;
}
function quotePowerShell(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}
function logWindowsUpdateLifecycle(phase: string, details: Record<string, unknown> = {}): void {
  const entry = { at: new Date().toISOString(), phase, pid: process.pid, ...details };
  console.info('[ReplayCoach] Windows update lifecycle', entry);
  try {
    if (app.isReady()) appendFileSync(path.join(app.getPath('userData'), 'update-install.log'), JSON.stringify(entry) + '\\n', 'utf8');
  } catch (error) {
    console.error('[ReplayCoach] Could not persist update lifecycle diagnostic', { phase, error: String(error) });
  }
}
async function isPortableInstall(executable: string): Promise<boolean> {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return true;
  try {
    await fs.access(path.join(path.dirname(executable), 'Uninstall OpenFront Replay Coach.exe'));
    return false;
  } catch { /* ZIP-extracted edition has no NSIS uninstaller. */ }
  // The ZIP edition has no NSIS uninstaller, regardless of where the user
  // extracted it (including Program Files). Never infer edition from location.
  return true;
}
async function scheduleWindowsInstall(downloadPath: string, portable: boolean): Promise<void> {
  const executable = app.getPath('exe');
  const processId = process.pid;
  const targetDirectory = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(executable);
  const scriptPath = path.join(os.tmpdir(), 'openfront-replay-coach-update-' + processId + '.ps1');
  const logPath = path.join(app.getPath('userData'), 'update-install.log');
  const common = [
    "$ErrorActionPreference = 'Stop'",
    '$ProcessIdToWait = ' + processId,
    '$Executable = ' + quotePowerShell(executable),
    '$Download = ' + quotePowerShell(downloadPath),
    '$Log = ' + quotePowerShell(logPath),
    'function Write-UpdateLog([string]$Phase) { Add-Content -LiteralPath $Log -Value ("[" + (Get-Date -Format o) + "] phase=" + $Phase + " helperPid=" + $PID + " parentPid=" + $ProcessIdToWait) }',
    'Write-UpdateLog "helper-started"',
    'Write-UpdateLog "waiting-for-parent-exit"',
    'try { Wait-Process -Id $ProcessIdToWait -ErrorAction SilentlyContinue } catch {}',
    'Write-UpdateLog "parent-process-exited"',
    'Start-Sleep -Milliseconds 900'
  ].join('\n');
  const portableScript = [
    common,
    '$Target = ' + quotePowerShell(targetDirectory),
    "$ArchivePath = Join-Path (Join-Path $Target 'resources') 'app.asar'",
    "  $BeforeArchiveHash = if (Test-Path -LiteralPath $ArchivePath) { (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash } else { $null }",
    "$Stage = Join-Path $env:TEMP ('ofrc-stage-' + [guid]::NewGuid().ToString('N'))",
    "$Backup = Join-Path $env:TEMP ('ofrc-backup-' + [guid]::NewGuid().ToString('N'))",
    '$UpdateStarted = $false',
    '$Restored = $false',
    '$Installed = $false',
    'New-Item -ItemType Directory -Path $Stage -Force | Out-Null',
    'New-Item -ItemType Directory -Path $Backup -Force | Out-Null',
    'try {',
    '  Write-UpdateLog "portable-expand-started"',
    "  Expand-Archive -LiteralPath $Download -DestinationPath $Stage -Force",
    '  Write-UpdateLog "portable-expand-completed"',
    "  $NewExe = Get-ChildItem -LiteralPath $Stage -Filter 'OpenFront Replay Coach.exe' -File -Recurse | Select-Object -First 1",
    "  if (-not $NewExe) { throw 'Die Portable-ZIP enthält keine Programmdatei.' }",
    '  $Source = $NewExe.Directory.FullName',
    "  if (Test-Path -LiteralPath $Target) { Copy-Item -Path (Join-Path $Target '*') -Destination $Backup -Recurse -Force -ErrorAction SilentlyContinue }",
    "  $BackupArchive = Join-Path (Join-Path $Backup 'resources') 'app.asar'",
    "  if (-not $BeforeArchiveHash -or -not (Test-Path -LiteralPath $BackupArchive) -or (Get-FileHash -LiteralPath $BackupArchive -Algorithm SHA256).Hash -ne $BeforeArchiveHash) { throw 'Die Sicherung der Portable-Version konnte nicht verifiziert werden. Das Update wurde nicht gestartet.' }",
    '  $UpdateStarted = $true',
    '  Write-UpdateLog "portable-install-started"',
    "  Copy-Item -Path (Join-Path $Source '*') -Destination $Target -Recurse -Force",
    "  if (-not (Test-Path -LiteralPath $Executable)) { throw 'Die aktualisierte Programmdatei fehlt.' }",
    "  if (-not $BeforeArchiveHash -or -not (Test-Path -LiteralPath $ArchivePath)) { throw 'Die Portable-App enthält keine prüfbare resources/app.asar-Datei.' }",
    "  $AfterArchiveHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash",
    "  if ($AfterArchiveHash -eq $BeforeArchiveHash) { throw 'Die Portable-Dateien wurden nicht aktualisiert; die alte Programmversion bleibt erhalten.' }",
    '  Write-UpdateLog "portable-install-verified"',
    "  Add-Content -LiteralPath $Log -Value ('[' + (Get-Date -Format o) + '] Portable-Programmdateien geändert und verifiziert; starte Anwendung.')",
    '  Write-UpdateLog "portable-restart-requested"',
    '  Start-Process -FilePath $Executable',
    '  $Installed = $true',
    '} catch {',
    '  $_ | Out-String | Add-Content -LiteralPath $Log',
    '  Write-UpdateLog "portable-update-failed"',
    '  if (-not $UpdateStarted) { $Restored = $true }',
    '  if ($UpdateStarted) {',
    '    try {',
    '      Write-UpdateLog "portable-rollback-started"',
    "      Copy-Item -Path (Join-Path $Backup '*') -Destination $Target -Recurse -Force",
    "      $RestoredHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash",
    '      if ($RestoredHash -ne $BeforeArchiveHash) { throw "Die wiederhergestellte Portable-Version stimmt nicht mit der Sicherung überein." }',
    '      $Restored = $true',
    "      Add-Content -LiteralPath $Log -Value 'Rollback erfolgreich; vorherige Version wurde wiederhergestellt.'",
    '      Write-UpdateLog "portable-rollback-verified"',
    '    } catch {',
    '      $_ | Out-String | Add-Content -LiteralPath $Log',
    "      Add-Content -LiteralPath $Log -Value ('WICHTIG: Die vorherige Portable-Version liegt als Sicherung unter ' + $Backup)",
    '    }',
    '  }',
    '  if ($Restored -and (Test-Path -LiteralPath $Executable)) { Write-UpdateLog "portable-rollback-restart-requested"; Start-Process -FilePath $Executable }',
    '  exit 1',
    '} finally {',
    '  Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue',
    '  if (($Installed -or $Restored -or -not $UpdateStarted) -and (Test-Path -LiteralPath $Backup)) { Remove-Item -LiteralPath $Backup -Recurse -Force -ErrorAction SilentlyContinue }',
    '  Remove-Item -LiteralPath $Download -Force -ErrorAction SilentlyContinue',
    '}'
  ].join('\n');
  const installerScript = [
    common,
    '$InstallDirectory = Split-Path -Parent $Executable',
    "$Backup = Join-Path $env:TEMP ('ofrc-installer-backup-' + [guid]::NewGuid().ToString('N'))",
    '$BackupVerified = $false',
    '$Restored = $false',
    '$Installed = $false',
    'try {',
    '  $Installer = $Download',
    "  $AppArchive = Join-Path (Join-Path (Split-Path -Parent $Executable) 'resources') 'app.asar'",
    "  $BeforeArchiveHash = if (Test-Path -LiteralPath $AppArchive) { (Get-FileHash -LiteralPath $AppArchive -Algorithm SHA256).Hash } else { $null }",
    "  if (-not $BeforeArchiveHash) { throw 'Die installierte Anwendung enthält keine prüfbare app.asar-Datei. Das Update wurde nicht gestartet.' }",
    '  New-Item -ItemType Directory -Path $Backup -Force | Out-Null',
    "  Copy-Item -Path (Join-Path $InstallDirectory '*') -Destination $Backup -Recurse -Force",
    "  $BackupArchive = Join-Path (Join-Path $Backup 'resources') 'app.asar'",
    "  if (-not (Test-Path -LiteralPath $BackupArchive) -or (Get-FileHash -LiteralPath $BackupArchive -Algorithm SHA256).Hash -ne $BeforeArchiveHash) { throw 'Die Sicherung der installierten Version konnte nicht verifiziert werden. Das Update wurde nicht gestartet.' }",
    '  $BackupVerified = $true',
    '  Write-UpdateLog "installer-backup-verified"',
    "  Add-Content -LiteralPath $Log -Value ('[' + (Get-Date -Format o) + '] Verifizierte Sicherung erstellt: ' + $Backup)",
    '  Write-UpdateLog "installer-started"',
    "  Add-Content -LiteralPath $Log -Value ('[' + (Get-Date -Format o) + '] Starte Installer: ' + $Installer)",
    "  $Exit = Start-Process -FilePath $Installer -ArgumentList '/S' -Wait -PassThru",
    "  if ($Exit.ExitCode -ne 0) {",
    "    Add-Content -LiteralPath $Log -Value ('[' + (Get-Date -Format o) + '] Installer ohne Elevation beendet: ' + $Exit.ExitCode + '; versuche mit Administratorrechten.')",
    "    $Exit = Start-Process -FilePath $Installer -ArgumentList '/S' -Verb RunAs -Wait -PassThru",
    '  }',
    "  if ($Exit.ExitCode -ne 0) { throw ('Der Windows-Installer wurde mit Exitcode ' + $Exit.ExitCode + ' beendet.') }",
    '  Start-Sleep -Seconds 2',
    "  if (-not (Test-Path -LiteralPath $Executable)) { throw 'Die aktualisierte Anwendung wurde am bisherigen Installationsort nicht gefunden.' }",
    "  if (-not $BeforeArchiveHash -or -not (Test-Path -LiteralPath $AppArchive)) { throw 'Die installierte Anwendung enthält keine prüfbare resources/app.asar-Datei.' }",
    "  $AfterArchiveHash = (Get-FileHash -LiteralPath $AppArchive -Algorithm SHA256).Hash",
    "  if ($AfterArchiveHash -eq $BeforeArchiveHash) { throw 'Der Installer meldete Erfolg, aber die Programmdateien wurden nicht ersetzt.' }",
    '  Write-UpdateLog "installer-install-verified"',
    "  Add-Content -LiteralPath $Log -Value ('[' + (Get-Date -Format o) + '] Programmdateien geändert und verifiziert; starte Anwendung.')",
    '  Write-UpdateLog "installer-restart-requested"',
    '  Start-Process -FilePath $Executable',
    '  $Installed = $true',
    '} catch {',
    '  $_ | Out-String | Add-Content -LiteralPath $Log',
    '  if (-not $BackupVerified) { $Restored = $true }',
    '  if ($BackupVerified) {',
    '    try {',
    "      Copy-Item -Path (Join-Path $Backup '*') -Destination $InstallDirectory -Recurse -Force",
    "      $RestoredHash = (Get-FileHash -LiteralPath $AppArchive -Algorithm SHA256).Hash",
    '      if ($RestoredHash -ne $BeforeArchiveHash) { throw "Die wiederhergestellte Version stimmt nicht mit der Sicherung überein." }',
    '      $Restored = $true',
    '    } catch {',
    '      $_ | Out-String | Add-Content -LiteralPath $Log',
    "      Add-Content -LiteralPath $Log -Value ('WICHTIG: Die vorherige Version liegt als Sicherung unter ' + $Backup)",
    '    }',
    '  }',
    "  Add-Content -LiteralPath $Log -Value ('[' + (Get-Date -Format o) + '] Update fehlgeschlagen; installierte Anwendung wird wieder gestartet.')",
    '  if ($Restored -and (Test-Path -LiteralPath $Executable)) { Start-Process -FilePath $Executable }',
    '  exit 1',
    '} finally {',
    '  if (($Installed -or $Restored -or -not $BackupVerified) -and (Test-Path -LiteralPath $Backup)) { Remove-Item -LiteralPath $Backup -Recurse -Force -ErrorAction SilentlyContinue }',
    '  Remove-Item -LiteralPath $Download -Force -ErrorAction SilentlyContinue',
    '}'
  ].join('\n');
  await fs.writeFile(scriptPath, portable ? portableScript : installerScript, { encoding: 'utf8', flag: 'wx' });
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    detached: true, stdio: 'ignore', windowsHide: true,
  });
  // Do not quit until Windows confirms that the detached helper process exists.
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  logWindowsUpdateLifecycle('helper-spawned', { helperPid: child.pid, scriptPath, logPath });
  // The IPC handler must return its result before the main process exits. The
  // detached helper waits for this process, so shutdown is scheduled by the
  // IPC boundary only after installLatestWindowsUpdate has resolved.
}
let activeWindowsUpdate: Promise<{ scheduled: boolean; version: string }> | null = null;
async function installLatestWindowsUpdate(): Promise<{ scheduled: boolean; version: string }> {
  if (activeWindowsUpdate) return activeWindowsUpdate;
  if (process.platform !== 'win32' || !app.isPackaged) throw new Error('Automatische Installation ist nur in der installierten oder portablen Windows-App verfügbar.');
  activeWindowsUpdate = (async () => {
    logWindowsUpdateLifecycle('release-lookup-started');
    const release = await getLatestRelease();
    logWindowsUpdateLifecycle('release-lookup-completed', { tag: release.tag_name, assetCount: release.assets.length });
    const version = release.tag_name.replace(/^v/i, '');
    if (compareVersions(version, app.getVersion()) <= 0) throw new Error('Du verwendest bereits die aktuelle Version.');
    const portable = await isPortableInstall(app.getPath('exe'));
    const asset = chooseWindowsAsset(release, portable);
    console.info('[ReplayCoach] Windows update: release asset selected', { name: asset.name, size: asset.size, portable });
    logWindowsUpdateLifecycle('asset-download-started', { asset: asset.name, size: asset.size });
    const downloadPath = await downloadVerifiedAsset(asset);
    logWindowsUpdateLifecycle('asset-download-and-validation-completed', { asset: asset.name, downloadPath });
    console.info('[ReplayCoach] Windows update: asset download and SHA-256 validation succeeded', { name: asset.name });
    // A user-triggered retry is explicit; clear the old guard, then persist this attempt
    // so a failed detached installer cannot trigger an automatic restart loop.
    await clearAutoUpdateAttempt();
    await writeAutoUpdateAttempt(version);
    try {
      await scheduleWindowsInstall(downloadPath, portable);
      logWindowsUpdateLifecycle('update-handoff-ready', { version, portable });
    } catch (error) {
      await clearAutoUpdateAttempt();
      throw error;
    }
    return { scheduled: true, version };
  })();
  try { return await activeWindowsUpdate; }
  finally { activeWindowsUpdate = null; }
}
export async function getWindowsUpdateStatus(): Promise<{ failed: boolean; message: string } | null> {
  if (process.platform !== 'win32' || !app.isPackaged) return null;
  const attempt = await readAutoUpdateAttempt();
  if (!attempt) return null;
  if (attempt.installedVersion !== app.getVersion()) {
    await clearAutoUpdateAttempt();
    return null;
  }
  return {
    failed: true,
    message: 'Das Update auf Version ' + attempt.targetVersion + ' konnte nicht abgeschlossen werden. Deine bisherige Version ' + app.getVersion() + ' bleibt erhalten. Du kannst das Update jetzt erneut versuchen.'
  };
}
export function registerUpdaterIpc(): void {
  ipcMain.handle('updates:install', async () => {
    logWindowsUpdateLifecycle('ipc-install-received');
    try {
      const result = await installLatestWindowsUpdate();
      logWindowsUpdateLifecycle('ipc-install-response-ready', result);
      if (result.scheduled) {
        const shutdownTimer = setTimeout(() => {
          logWindowsUpdateLifecycle('main-process-shutdown-after-ipc-response');
          app.quit();
        }, 1500);
      }
      return result;
    } catch (error) {
      console.error('[ReplayCoach] IPC updates:install failed', error);
      throw error;
    }
  });
  ipcMain.handle('updates:status', async () => getWindowsUpdateStatus());
}
export async function autoUpdateOnStartup(): Promise<boolean> {
  if (process.platform !== 'win32' || !app.isPackaged) return false;
  // The integration test invokes the explicit Update Center IPC against its
  // loopback release server. Suppress the unrelated startup check so it cannot
  // race or consume the same test endpoint before the user-triggered install.
  if (process.env.OFRC_UPDATE_TEST_MODE === '1') {
    console.info('[ReplayCoach] Update test mode: automatic startup check suppressed.');
    return false;
  }
  try {
    const release = await getLatestRelease();
    const version = release.tag_name.replace(/^v/i, '');
    if (compareVersions(version, app.getVersion()) <= 0) {
      await clearAutoUpdateAttempt();
      return false;
    }
    const previousAttempt = await readAutoUpdateAttempt();
    if (previousAttempt?.targetVersion === version && previousAttempt.installedVersion === app.getVersion()) {
      console.error('[ReplayCoach] Automatisches Update ' + version + ' wurde bereits versucht, aber die installierte Version ist unverändert. Wiederholter Neustart wird verhindert; bitte Update manuell erneut starten.', previousAttempt.attemptedAt);
      return false;
    }
    // Startup checks must never close the app unexpectedly. Installation is
    // initiated only from the Update Center after an explicit user action.
    console.info('[ReplayCoach] Update ' + version + ' ist verfügbar; Installation wartet auf Bestätigung im Update Center.');
    return false;
  } catch (error) {
    console.warn('[ReplayCoach] Automatisches Update übersprungen; Programm startet mit der installierten Version:', error);
    return false;
  }
}
