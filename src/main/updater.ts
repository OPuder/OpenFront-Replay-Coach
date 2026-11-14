import { app, BrowserWindow, ipcMain } from 'electron';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const RELEASE_API = 'https://api.github.com/repos/OPuder/OpenFront-Replay-Coach/releases/latest';
const MAX_UPDATE_BYTES = 400 * 1024 * 1024;
type ReleaseAsset = { name: string; browser_download_url: string; size: number; digest?: string | null };
type Release = { tag_name: string; html_url: string; assets: ReleaseAsset[] };

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
async function getLatestRelease(): Promise<Release> {
  const response = await fetch(RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'OpenFront-Replay-Coach/' + app.getVersion() },
    cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('GitHub Update-Server antwortet mit HTTP ' + response.status + '.');
  const release = await response.json() as Release;
  if (!release.tag_name || !Array.isArray(release.assets)) throw new Error('Die GitHub-Release-Antwort ist unvollständig.');
  return release;
}
function chooseWindowsAsset(release: Release, portable: boolean): ReleaseAsset {
  const asset = portable
    ? release.assets.find(item => /-win\.zip$/i.test(item.name))
    : release.assets.find(item => /\.Setup\.[\d.]+\.exe$/i.test(item.name));
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
async function isPortableInstall(executable: string): Promise<boolean> {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return true;
  try {
    await fs.access(path.join(path.dirname(executable), 'Uninstall OpenFront Replay Coach.exe'));
    return false;
  } catch { /* ZIP-extracted edition has no NSIS uninstaller. */ }
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], path.join(os.homedir(), 'AppData', 'Local', 'Programs')]
    .filter((value): value is string => Boolean(value)).map(value => path.resolve(value).toLowerCase());
  const current = path.resolve(executable).toLowerCase();
  return !roots.some(root => current.startsWith(root + path.sep));
}
async function scheduleWindowsInstall(downloadPath: string, portable: boolean): Promise<void> {
  const executable = app.getPath('exe');
  const processId = process.pid;
  const targetDirectory = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(executable);
  const scriptPath = path.join(os.tmpdir(), 'openfront-replay-coach-update-' + processId + '.ps1');
  const common = [
    "$ErrorActionPreference = 'Stop'",
    '$ProcessIdToWait = ' + processId,
    '$Executable = ' + quotePowerShell(executable),
    '$Download = ' + quotePowerShell(downloadPath),
    'try { Wait-Process -Id $ProcessIdToWait -ErrorAction SilentlyContinue } catch {}',
    'Start-Sleep -Milliseconds 900'
  ].join('\n');
  const portableScript = [
    common,
    '$Target = ' + quotePowerShell(targetDirectory),
    "$Stage = Join-Path $env:TEMP ('ofrc-stage-' + [guid]::NewGuid().ToString('N'))",
    "$Backup = Join-Path $env:TEMP ('ofrc-backup-' + [guid]::NewGuid().ToString('N'))",
    'New-Item -ItemType Directory -Path $Stage -Force | Out-Null',
    'New-Item -ItemType Directory -Path $Backup -Force | Out-Null',
    'try {',
    "  Expand-Archive -LiteralPath $Download -DestinationPath $Stage -Force",
    "  $NewExe = Get-ChildItem -LiteralPath $Stage -Filter 'OpenFront Replay Coach.exe' -File -Recurse | Select-Object -First 1",
    "  if (-not $NewExe) { throw 'Die Portable-ZIP enthält keine Programmdatei.' }",
    '  $Source = $NewExe.Directory.FullName',
    "  if (Test-Path -LiteralPath $Target) { Copy-Item -Path (Join-Path $Target '*') -Destination $Backup -Recurse -Force -ErrorAction SilentlyContinue }",
    '  try {',
    "    Copy-Item -Path (Join-Path $Source '*') -Destination $Target -Recurse -Force",
    "    if (-not (Test-Path -LiteralPath $Executable)) { throw 'Die aktualisierte Programmdatei fehlt.' }",
    '  } catch {',
    "    Copy-Item -Path (Join-Path $Backup '*') -Destination $Target -Recurse -Force -ErrorAction SilentlyContinue",
    '    throw',
    '  }',
    '  Start-Process -FilePath $Executable',
    '} finally {',
    '  Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue',
    '  Remove-Item -LiteralPath $Backup -Recurse -Force -ErrorAction SilentlyContinue',
    '  Remove-Item -LiteralPath $Download -Force -ErrorAction SilentlyContinue',
    '}'
  ].join('\n');
  const installerScript = [
    common,
    '$Installer = $Download',
    "$Exit = Start-Process -FilePath $Installer -ArgumentList '/S' -Wait -PassThru",
    "if ($Exit.ExitCode -ne 0) { throw ('Der Windows-Installer wurde mit Exitcode ' + $Exit.ExitCode + ' beendet.') }",
    'Start-Sleep -Seconds 2',
    "if (-not (Test-Path -LiteralPath $Executable)) { throw 'Die aktualisierte Anwendung wurde am bisherigen Installationsort nicht gefunden.' }",
    'Start-Process -FilePath $Executable',
    'Remove-Item -LiteralPath $Installer -Force -ErrorAction SilentlyContinue'
  ].join('\n');
  await fs.writeFile(scriptPath, portable ? portableScript : installerScript, { encoding: 'utf8', flag: 'wx' });
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.once('error', error => console.error('[ReplayCoach] Update-Helfer konnte nicht gestartet werden:', error));
  child.unref();
  setTimeout(() => app.quit(), 250);
}
async function installLatestWindowsUpdate(): Promise<{ scheduled: boolean; version: string }> {
  if (process.platform !== 'win32' || !app.isPackaged) throw new Error('Automatische Installation ist nur in der installierten oder portablen Windows-App verfügbar.');
  const release = await getLatestRelease();
  const version = release.tag_name.replace(/^v/i, '');
  if (compareVersions(version, app.getVersion()) <= 0) throw new Error('Du verwendest bereits die aktuelle Version.');
  const portable = await isPortableInstall(app.getPath('exe'));
  const asset = chooseWindowsAsset(release, portable);
  const downloadPath = await downloadVerifiedAsset(asset);
  await scheduleWindowsInstall(downloadPath, portable);
  return { scheduled: true, version };
}
export function registerUpdaterIpc(): void {
  ipcMain.handle('updates:install', async () => installLatestWindowsUpdate());
}
export async function autoUpdateOnStartup(): Promise<boolean> {
  if (process.platform !== 'win32' || !app.isPackaged) return false;
  try {
    const release = await getLatestRelease();
    const version = release.tag_name.replace(/^v/i, '');
    if (compareVersions(version, app.getVersion()) <= 0) return false;
    console.info('[ReplayCoach] Neues Update ' + version + ' erkannt; Installation wird vorbereitet.');
    const portable = await isPortableInstall(app.getPath('exe'));
    const asset = chooseWindowsAsset(release, portable);
    const downloadPath = await downloadVerifiedAsset(asset);
    await scheduleWindowsInstall(downloadPath, portable);
    return true;
  } catch (error) {
    console.warn('[ReplayCoach] Automatisches Update übersprungen; Programm startet mit der installierten Version:', error);
    return false;
  }
}
