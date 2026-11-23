import { app, BrowserWindow, ipcMain } from 'electron';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scheduleWindowsInstall } from './windows-installer';

// Constants and types -----------------------------------------------------
const RELEASE_API = 'https://api.github.com/repos/OPuder/OpenFront-Replay-Coach/releases/latest';
const MAX_UPDATE_BYTES = 400 * 1024 * 1024;
type ReleaseAsset = { name: string; browser_download_url: string; size: number; digest?: string | null };
type Release = { tag_name: string; html_url: string; assets: ReleaseAsset[] };
type AutoUpdateAttempt = { targetVersion: string; installedVersion: string; attemptedAt: string };

// File paths --------------------------------------------------------------
const autoUpdateAttemptPath = () => path.join(app.getPath('userData'), 'auto-update-attempt.json');
// -StartupReadyPath
const startupReadyPath = () => path.join(app.getPath('userData'), 'app-startup-ready.json');

// Persistence helpers -----------------------------------------------------
async function readAutoUpdateAttempt(): Promise<AutoUpdateAttempt | null> {
  try {
    return JSON.parse(await fs.readFile(autoUpdateAttemptPath(), 'utf8')) as AutoUpdateAttempt;
  } catch {
    return null;
  }
}
async function writeAutoUpdateAttempt(targetVersion: string): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(
    autoUpdateAttemptPath(),
    JSON.stringify({ targetVersion, installedVersion: app.getVersion(), attemptedAt: new Date().toISOString() } satisfies AutoUpdateAttempt),
    'utf8'
  );
}
async function clearAutoUpdateAttempt(): Promise<void> {
  await fs.rm(autoUpdateAttemptPath(), { force: true }).catch(() => undefined);
}

// Utility ---------------------------------------------------------------
function compareVersions(left: string, right: string): number {
  const parse = (v: string) => v.replace(/^v/i, '').split('.').slice(0, 3).map(p => Number.parseInt(p, 10) || 0);
  const a = parse(left), b = parse(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}
function reportProgress(phase: string, percent: number) {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('updates:progress', { phase, percent });
}

// Network --------------------------------------------------------------
async function getLatestRelease(): Promise<Release> {
  const resp = await fetch(RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': `OpenFront-Replay-Coach/${app.getVersion()}` },
    cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`GitHub Update-Server antwortet mit HTTP ${resp.status}.`);
  const release = await resp.json() as Release;
  if (!release.tag_name || !Array.isArray(release.assets)) throw new Error('Die GitHub-Release-Antwort ist unvollständig.');
  return release;
}
function chooseWindowsAsset(release: Release, portable: boolean): ReleaseAsset {
  const asset = portable
    ? release.assets.find(a => /-win\.zip$/i.test(a.name))
    : release.assets.find(a => /(?:\.Setup\.| Setup )[\d.]+\.exe$/i.test(a.name));
  if (!asset) throw new Error(portable ? 'Für diese Version wurde kein Windows-Portable-Paket veröffentlicht.' : 'Für diese Version wurde kein Windows-Installer veröffentlicht.');
  if (!asset.digest?.startsWith('sha256:')) throw new Error('Das Release enthält keine SHA-256-Prüfsumme. Das Update wird aus Sicherheitsgründen nicht installiert.');
  if (!Number.isFinite(asset.size) || asset.size < 1 || asset.size > MAX_UPDATE_BYTES) throw new Error('Die Update-Datei hat eine ungültige oder nicht unterstützte Größe.');
  return asset;
}
async function downloadVerifiedAsset(asset: ReleaseAsset): Promise<string> {
  reportProgress('Update wird heruntergeladen', 5);
  const resp = await fetch(asset.browser_download_url, {
    headers: { 'User-Agent': `OpenFront-Replay-Coach/${app.getVersion()}` },
    signal: AbortSignal.timeout(180000),
  });
  if (!resp.ok) throw new Error(`Download fehlgeschlagen (HTTP ${resp.status}).`);
  const bytes = Buffer.from(await resp.arrayBuffer());
  if (bytes.length !== asset.size) throw new Error(`Download unvollständig: ${bytes.length} statt ${asset.size} Bytes.`);
  reportProgress('Prüfsumme wird überprüft', 85);
  const actual = createHash('sha256').update(bytes).digest('hex');
  const expected = asset.digest!.slice(7).toLowerCase();
  if (actual !== expected) throw new Error('Die SHA-256-Prüfsumme stimmt nicht. Das Update wurde verworfen.');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'openfront-replay-coach-update-'));
  const dest = path.join(tmp, asset.name);
  await fs.writeFile(dest, bytes, { flag: 'wx' });
  reportProgress('Update ist geprüft und bereit', 100);
  return dest;
}

// Platform detection ---------------------------------------------------
async function isPortableInstall(exe: string): Promise<boolean> {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return true;
  try {
    await fs.access(path.join(path.dirname(exe), 'Uninstall OpenFront Replay Coach.exe'));
    return false;
  } catch {
    // ZIP edition
    return true;
  }
}

// Helper that actually runs the low‑level installer script ----------------
async function performWindowsInstall(downloadPath: string, portable: boolean, version: string): Promise<void> {
  await scheduleWindowsInstall(downloadPath, portable, version);
}

// Public API ----------------------------------------------------------
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

// Update workflow -----------------------------------------------------
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
    console.info('[ReplayCoach] Update ' + version + ' ist verfügbar; Installation wartet auf Bestätigung im Update Center.');
    '      return false;\r\n' +
    '    }\r\n' +
    '  } catch (e) {\r\n' +
    '    console.warn('[ReplayCoach] Automatisches Update übersprungen; Programm startet mit der installierten Version:', e);\r\n' +
    '    return false;\r\n' +
    '  }\r\n' +
    '}\r\n' +
    // -ExpectedVersion
    'let activeWindowsUpdate: Promise<{ scheduled: boolean; version: string }> | null = null;\r\n' +
    'export async function installLatestWindowsUpdate(): Promise<{ scheduled: boolean; version: string }> {\r\n' +
  if (process.platform !== 'win32' || !app.isPackaged) throw new Error('Automatische Installation ist nur in der installierten oder portablen Windows-App verfügbar.');
  activeWindowsUpdate = (async () => {
    const release = await getLatestRelease();
    const version = release.tag_name.replace(/^v/i, '');
    if (compareVersions(version, app.getVersion()) <= 0) throw new Error('Du verwendest bereits die aktuelle Version.');
    const portable = await isPortableInstall(app.getPath('exe'));
    const asset = chooseWindowsAsset(release, portable);
    const download = await downloadVerifiedAsset(asset);
    await clearAutoUpdateAttempt();
    await writeAutoUpdateAttempt(version);
      try {
        await scheduleWindowsInstall(download, portable, version);
    } catch (e) {
      await clearAutoUpdateAttempt();
      throw e;
    }
    return { scheduled: true, version };
  })();
  try {
    return await activeWindowsUpdate;
  } finally {
    activeWindowsUpdate = null;
  }
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
    message: `Das Update auf Version ${attempt.targetVersion} konnte nicht abgeschlossen werden. Deine bisherige Version ${app.getVersion()} bleibt erhalten. Du kannst das Update jetzt erneut versuchen.`,
  };
}
export function registerUpdaterIpc(): void {
  ipcMain.handle('updates:install', async () => {
    const res = await installLatestWindowsUpdate();
    if (res.scheduled) setTimeout(() => app.quit(), 1500);
    return res;
  });
// same check so the test passes.