import React from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { CheckCircle2, RefreshCw, Smartphone, MonitorDown, Globe, AlertCircle } from 'lucide-react';
import './UpdateCenter.css';

declare const __APP_VERSION__: string;

type ReleaseAsset = { name: string; browser_download_url: string; size: number; digest?: string | null };
type LatestRelease = { tag_name: string; html_url: string; published_at: string; assets: ReleaseAsset[] };
type ApkUpdaterPlugin = { downloadAndInstall(options: { url: string; digest: string; size: number; name: string }): Promise<{ started: boolean }> };
const ApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater');

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map(part => Number.parseInt(part, 10) || 0);
  const a = parse(left); const b = parse(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

function findAsset(assets: ReleaseAsset[], pattern: RegExp): ReleaseAsset | undefined {
  return assets.find(asset => pattern.test(asset.name));
}

export function UpdateCenter() {
  const [release, setRelease] = React.useState<LatestRelease | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [checkedAt, setCheckedAt] = React.useState<Date | null>(null);
  const [error, setError] = React.useState('');
  const [webUpdateWaiting, setWebUpdateWaiting] = React.useState(false);
  const [applyingWebUpdate, setApplyingWebUpdate] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);
  const [installProgress, setInstallProgress] = React.useState<{ phase: string; percent: number } | null>(null);
  const [installMessage, setInstallMessage] = React.useState('');
  const currentVersion = __APP_VERSION__;
  const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const isDesktop = /Electron/i.test(navigator.userAgent);
  const isBrowserPwa = !isAndroid && !isDesktop;

  const checkForUpdates = React.useCallback(async () => {
    if (checking) return;
    setChecking(true); setError('');
    try {
      const response = await fetch('https://api.github.com/repos/OPuder/OpenFront-Replay-Coach/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(response.status === 403 ? 'GitHub begrenzt gerade Update-Abfragen. Bitte später erneut versuchen.' : `Update-Server antwortet mit HTTP ${response.status}.`);
      const data = await response.json() as LatestRelease;
      if (!data.tag_name || !Array.isArray(data.assets)) throw new Error('Die Release-Antwort ist unvollständig.');
      setRelease(data); setCheckedAt(new Date());
      if (isBrowserPwa && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
          setWebUpdateWaiting(Boolean(registration.waiting));
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Update-Prüfung fehlgeschlagen.');
    } finally { setChecking(false); }
  }, [checking, isBrowserPwa]);

  React.useEffect(() => {
    void checkForUpdates();
    const interval = window.setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (!isDesktop || !window.replayAPI?.onUpdateProgress) return;
    return window.replayAPI.onUpdateProgress(progress => setInstallProgress(progress));
  }, [isDesktop]);

  React.useEffect(() => {
    if (!isBrowserPwa || !('serviceWorker' in navigator)) return;
    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    void navigator.serviceWorker.getRegistration().then(registration => setWebUpdateWaiting(Boolean(registration?.waiting)));
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, [isBrowserPwa]);

  const latestVersion = release?.tag_name.replace(/^v/i, '') ?? '';
  const hasNewVersion = Boolean(latestVersion && compareVersions(latestVersion, currentVersion) > 0);
  const isCurrent = Boolean(latestVersion && !hasNewVersion);
  const installer = release && findAsset(release.assets, /\.Setup\.[\d.]+\.exe$/i);
  const portable = release && findAsset(release.assets, /-win\.zip$/i);
  const apk = release && findAsset(release.assets, /-Android\.apk$/i);
  const web = release && findAsset(release.assets, /-Web-PWA\.zip$/i);

  async function installDesktopUpdate() {
    setInstalling(true); setError(''); setInstallMessage('Update wird vorbereitet …');
    try {
      const result = await window.replayAPI.installUpdate();
      setInstallMessage(result.scheduled ? `Version ${result.version} ist geprüft. Das Programm startet nach der Installation neu.` : 'Update konnte nicht gestartet werden.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Update konnte nicht installiert werden.');
      setInstalling(false);
    }
  }

  async function installAndroidUpdate(asset: ReleaseAsset | undefined) {
    if (!asset?.digest) { setError('Für diese APK fehlt die offizielle SHA-256-Prüfsumme.'); return; }
    setInstalling(true); setError(''); setInstallMessage('APK wird heruntergeladen und geprüft …');
    try {
      await ApkUpdater.downloadAndInstall({ url: asset.browser_download_url, digest: asset.digest, size: asset.size, name: asset.name });
      setInstallMessage('Android-Installationsdialog wurde geöffnet. Bestätige dort das Update.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Android-Update fehlgeschlagen.');
      setInstalling(false);
    }
  }

  const androidAutoUpdateAttempted = React.useRef(false);
  React.useEffect(() => {
    if (isAndroid && hasNewVersion && apk && !androidAutoUpdateAttempted.current) {
      androidAutoUpdateAttempted.current = true;
      void installAndroidUpdate(apk);
    }
  }, [isAndroid, hasNewVersion, apk?.name]);

  function applyWebUpdate() {
    void navigator.serviceWorker.getRegistration().then(registration => {
      if (!registration?.waiting) { window.location.reload(); return; }
      setApplyingWebUpdate(true);
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    });
  }

  return <div className="update-center" aria-live="polite">
    <button type="button" className={`update-center-trigger ${hasNewVersion ? 'has-update' : ''}`} onClick={() => void checkForUpdates()} disabled={checking} title="Nach Programmupdates suchen">
      <RefreshCw size={14} className={checking ? 'update-spin' : ''}/>
      <span>{checking ? 'Prüfe …' : hasNewVersion ? `Update ${latestVersion}` : 'Updates'}</span>
      {hasNewVersion && <i/>}
    </button>
    <div className="update-center-popover">
      <div className="update-center-heading"><div><span>SOFTWARE-UPDATES</span><b>Version {currentVersion}</b></div><button type="button" onClick={() => void checkForUpdates()} disabled={checking} aria-label="Erneut prüfen"><RefreshCw size={14}/></button></div>
      {error && <p className="update-center-message is-error"><AlertCircle size={15}/>{error}</p>}{checking && !release ? <p className="update-center-message">Suche nach einer aktuellen Version …</p> : hasNewVersion ? <div className="update-center-release"><span className="update-center-badge">NEUE VERSION · {latestVersion}</span><p>Eine neuere stabile Version ist verfügbar. Wähle den Download für dein Gerät.</p>
        {isDesktop && <><button type="button" className="update-center-apply" onClick={() => void installDesktopUpdate()} disabled={installing || checking}><MonitorDown size={15}/>{installing ? "Update wird installiert …" : "Jetzt herunterladen und installieren"}</button>{installProgress && <div className="update-center-progress"><span>{installProgress.phase}</span><div><i style={{width: installProgress.percent + "%"}}/></div></div>}{installMessage && <p className="update-center-message">{installMessage}</p>}{portable && installer && <small className="update-center-platform">Windows Installer und Portable werden automatisch passend zur Installation ausgewählt.</small>}</>}
        {isAndroid && apk && <><button type="button" className="update-center-apply" onClick={() => void installAndroidUpdate(apk)} disabled={installing}><Smartphone size={15}/>{installing ? "APK wird vorbereitet …" : "Android-Update herunterladen und installieren"}</button>{installMessage && <p className="update-center-message">{installMessage}</p>}<small className="update-center-platform">Android zeigt zur Sicherheit seinen eigenen Installationsdialog. Eine Bestätigung ist erforderlich.</small></>}
        {isBrowserPwa && <>{web && <a href={web.browser_download_url} target="_blank" rel="noreferrer"><Globe size={15}/>Web/PWA-Paket <small>Nur für eigene Bereitstellung</small></a>}{webUpdateWaiting && <button type="button" className="update-center-apply" onClick={applyWebUpdate} disabled={applyingWebUpdate}><RefreshCw size={15}/>Web-App jetzt aktualisieren</button>}</>}
        <a className="update-center-release-link" href={release?.html_url} target="_blank" rel="noreferrer">Release-Notizen ansehen</a>
      </div> : isCurrent ? <p className="update-center-message is-current"><CheckCircle2 size={15}/>Du verwendest die aktuelle Version {currentVersion}.</p> : <p className="update-center-message">Noch keine veröffentlichte stabile Version gefunden.</p>}
      <small className="update-center-checked">{checkedAt ? `Zuletzt geprüft: ${checkedAt.toLocaleTimeString('de-DE', {hour:'2-digit',minute:'2-digit'})}` : 'Prüfung erfolgt automatisch beim Start und alle 6 Stunden.'}</small>
    </div>
  </div>;
}
