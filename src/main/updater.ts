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

const startupReadyPath = () => path.join(app.getPath('userData'), 'app-startup-ready.json');
export async function confirmWindowsAppReady(): Promise<void> {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const ready = { version: app.getVersion(), processId: process.pid, confirmedAt: new Date().toISOString() };
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(startupReadyPath(), JSON.stringify(ready), 'utf8');
  const attempt = await readAutoUpdateAttempt();
  if (attempt && attempt.targetVersion === app.getVersion() && attempt.installedVersion !== app.getVersion()) {
    await clearAutoUpdateAttempt();
  }
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
async function scheduleWindowsInstall(downloadPath: string, portable: boolean, version: string): Promise<void> {
  const executable = app.getPath('exe');
  const targetDirectory = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(executable);
  const packagedHelperPath = path.join(process.resourcesPath, 'windows-update-rollback.ps1');
  const packagedLockDiagnosticPath = path.join(process.resourcesPath, 'windows-process-lock-diagnostics.ps1');
  const helperDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'openfront-replay-coach-update-helper-'));
  const helperPath = path.join(helperDirectory, 'windows-update-rollback.ps1');
  const logPath = path.join(app.getPath('userData'), 'update-install.log');
  await fs.rm(startupReadyPath(), { force: true });
  await Promise.all([
    fs.copyFile(packagedHelperPath, helperPath),
    fs.copyFile(packagedLockDiagnosticPath, path.join(helperDirectory, 'windows-process-lock-diagnostics.ps1')),
  ]);
  const child = spawn('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', helperPath,
    '-Mode', portable ? 'Portable' : 'Installer',
    '-Target', targetDirectory,
    '-Executable', executable,
    '-PackagePath', downloadPath,
    '-LogPath', logPath,
    '-ProcessId', String(process.pid),
    '-StartupReadyPath', startupReadyPath(),
    '-ExpectedVersion', version,
    '-PreviousVersion', app.getVersion(),
  ], { detached: true, stdio: 'ignore', windowsHide: true });
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  app.quit();
}
let activeWindowsUpdate: Promise<{ scheduled: boolean; version: string }> | null = null;
async function installLatestWindowsUpdate(): Promise<{ scheduled: boolean; version: string }> {
  if (activeWindowsUpdate) return activeWindowsUpdate;
  if (process.platform !== 'win32' || !app.isPackaged) throw new Error('Automatische Installation ist nur in der installierten oder portablen Windows-App verfügbar.');
  activeWindowsUpdate = (async () => {
    const release = await getLatestRelease();
    const version = release.tag_name.replace(/^v/i, '');
    if (compareVersions(version, app.getVersion()) <= 0) throw new Error('Du verwendest bereits die aktuelle Version.');
    const portable = await isPortableInstall(app.getPath('exe'));
    const asset = chooseWindowsAsset(release, portable);
    const downloadPath = await downloadVerifiedAsset(asset);
    // A user-triggered retry is explicit; clear the old guard, then persist this attempt
    // so a failed detached installer cannot trigger an automatic restart loop.
    await clearAutoUpdateAttempt();
    await writeAutoUpdateAttempt(version);
    try {
      await scheduleWindowsInstall(downloadPath, portable, version);
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
  ipcMain.handle('updates:install', async () => installLatestWindowsUpdate());
  ipcMain.handle('updates:status', async () => getWindowsUpdateStatus());
}
export async function autoUpdateOnStartup(): Promise<boolean> {
  if (process.platform !== 'win32' || !app.isPackaged) return false;
  try {
    const release = await getLatestRelease();
    const version = release.tag_name.replace(/^v/i, '');
    if (compareVersions(version, app.getVersion()) <= 0) return false;
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
