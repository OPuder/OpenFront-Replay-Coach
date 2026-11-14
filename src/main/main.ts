import { app, BrowserWindow, dialog, ipcMain, shell, net } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeApiGameRecord } from './decoder/ApiTurnDecoder';
import { analyzeActions } from './decoder/ActionAnalysis';
import { analyzeDetailedActions } from './decoder/DetailedAnalysis';
import { buildCoachInsights } from './decoder/CoachInsights';
import { assessReplayCompatibility } from './decoder/ReplayCompatibility';
import { autoUpdateOnStartup, registerUpdaterIpc } from './updater';

const isDev = !app.isPackaged;
const API_BASE = 'https://api.openfront.io/public/game/';
const MAX_RESPONSE_BYTES = 750 * 1024 * 1024;


const PLAYER_API = 'https://api.openfront.io/public/player/';

async function apiJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'OpenFront-Replay-Coach/1.0.0' } });
    if (response.status === 404) throw new Error('Spieler oder Spieldaten wurden nicht gefunden.');
    if (response.status === 429) throw new Error('OpenFront begrenzt gerade die API-Anfragen (HTTP 429). Bitte kurz warten.');
    if (!response.ok) throw new Error(`OpenFront-API antwortet mit HTTP ${response.status}.`);
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Zeitüberschreitung bei der OpenFront-API.');
    throw error;
  } finally { clearTimeout(timeout); }
}

function validPlayerId(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) throw new Error('Bitte eine gültige OpenFront-Spieler-ID oder Profil-URL eingeben.');
  let id = value.trim();
  if (/^https?:\/\//i.test(id)) {
    let parsed: URL; try { parsed = new URL(id); } catch { throw new Error('Die Profil-URL ist ungültig.'); }
    if (!['openfront.io', 'www.openfront.io'].includes(parsed.hostname.toLowerCase())) throw new Error('Bitte einen Profil-Link von openfront.io verwenden.');
    const match = parsed.pathname.match(/^\/player\/([A-Za-z0-9_-]{4,80})\/?$/);
    if (!match) throw new Error('Erwartet wird z. B. https://openfront.io/player/5SVg4WbI.');
    id = match[1];
  }
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(id)) throw new Error('Bitte eine gültige OpenFront-Spieler-ID eingeben.');
  return id;
}

const previewCache = new Map<string, string | null>();
// Keep the most recently imported API records available for an explicit later JSON export.
const importedReplayJson = new Map<string, string>();
let assetManifestCache: { manifest: Record<string, string>; cdnBase: string; fetchedAt: number } | null = null;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function readBalancedObject(source: string, start: number): string | null {
  const open = source.indexOf('{', start);
  if (open < 0) return null;
  let depth = 0; let inString = false; let escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return source.slice(open, i + 1);
  }
  return null;
}

async function getOpenFrontAssetManifest() {
  if (assetManifestCache && Date.now() - assetManifestCache.fetchedAt < 6 * 60 * 60 * 1000) return assetManifestCache;
  // Use Electron/Chromium networking instead of Node fetch: OpenFront's edge
  // can reject Node-style TLS/client fingerprints with HTTP 403.
  const response = await net.fetch('https://openfront.io/', {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
      'User-Agent': app.userAgentFallback,
      Referer: 'https://openfront.io/',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1'
    },
    signal: AbortSignal.timeout(20000)
  });
  if (response.status === 403) throw new Error('OpenFront blockiert den Manifest-Abruf weiterhin (HTTP 403), auch über Chromium-Netzwerk.');
  if (!response.ok) throw new Error(`OpenFront-Startseite liefert HTTP ${response.status}.`);
  const html = await response.text();
  const marker = html.indexOf('assetManifest:');
  if (marker < 0) throw new Error('OpenFront-Asset-Manifest wurde in BOOTSTRAP_CONFIG nicht gefunden.');
  const objectText = readBalancedObject(html, marker + 'assetManifest:'.length);
  if (!objectText) throw new Error('OpenFront-Asset-Manifest ist unvollständig.');
  const manifest = JSON.parse(objectText) as Record<string, string>;
  const cdnMatch = html.match(/cdnBase:\s*("(?:\\.|[^"\\])*")/);
  const cdnBase = cdnMatch ? JSON.parse(cdnMatch[1]) as string : '';
  assetManifestCache = { manifest, cdnBase, fetchedAt: Date.now() };
  return assetManifestCache;
}

function normalizeMapAssetId(mapName: string): string {
  const aliases: Record<string, string> = {
    'tourney 2 teams': 'tourney1', 'tourney 3 teams': 'tourney2',
    'tourney 4 teams': 'tourney3', 'tourney 8 teams': 'tourney4',
    'amazon river': 'amazonriver', 'bab el-mandeb strait': 'babelmandebstrait',
    'world inverted': 'worldinverted', 'southeastasia': 'southeastasia'
  };
  const key = mapName.trim().toLowerCase();
  return aliases[key] ?? key.replace(/[\s.()]+/g, '').replace(/[^a-z0-9_-]/g, '');
}

async function resolveOfficialMapPreview(mapName: string): Promise<string | null> {
  const mapId = normalizeMapAssetId(mapName);
  if (!mapId || !/^[a-z0-9_-]{2,80}$/.test(mapId)) return null;
  const cached = previewCache.get(mapId);
  // Cache only successful previews. A previous 404 must never suppress a later retry.
  if (typeof cached === 'string') return cached;
  if (cached === null) previewCache.delete(mapId);
  try {
    const { manifest, cdnBase } = await getOpenFrontAssetManifest();
    const expectedKey = `maps/${mapId}/thumbnail.webp`;
    const manifestKey = Object.keys(manifest).find(key => key.toLowerCase() === expectedKey);
    const assetPath = manifestKey ? manifest[manifestKey] : null;
    if (!assetPath) {
      console.warn(`[ReplayCoach] Kartenbild ${mapName}: kein Manifest-Eintrag für maps/${mapId}/thumbnail.webp gefunden. Verfügbare ähnliche Keys:`,
        Object.keys(manifest).filter(key => key.toLowerCase().includes(`/maps/${mapId}/`) || key.toLowerCase().includes(`maps/${mapId}/`)).slice(0, 8));
      previewCache.set(mapId, null);
      return null;
    }
    // Match OpenFront's official buildAssetUrl() semantics exactly:
    // the CDN base may contain a deployment prefix (e.g. /game_assets).
    // new URL('/_assets/...', base) would discard that prefix and cause HTTP 404.
    const imageUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(assetPath)
      ? assetPath
      : cdnBase
        ? `${cdnBase.replace(/\/+$/, '')}/${assetPath.replace(/^\/+/, '')}`
        : new URL(assetPath.replace(/^\/+/, ''), 'https://openfront.io/').toString();
    const imageResponse = await fetch(imageUrl, { method: 'GET', headers: { Accept: 'image/webp,image/*;q=0.9' }, signal: AbortSignal.timeout(15000) });
    if (!imageResponse.ok) throw new Error(`Thumbnail ${mapName} (Asset-ID: ${mapId}, Manifest-Key: ${manifestKey}, URL: ${imageUrl}) liefert HTTP ${imageResponse.status}.`);
    const contentType = imageResponse.headers.get('content-type') ?? '';
    if (!contentType.includes('image/')) throw new Error(`Thumbnail ${mapName} lieferte keine Bilddatei (${contentType || 'unbekannter Typ'}).`);
    await imageResponse.arrayBuffer(); // Ensure the URL is a real, reachable image before exposing it to the renderer.
    previewCache.set(mapId, imageUrl);
    return imageUrl;
  } catch (error) {
    console.warn(`[ReplayCoach] Kartenbild ${mapName} konnte nicht geladen werden:`, error);
    previewCache.set(mapId, null);
    return null;
  }
}

ipcMain.handle('player:load', async (event, rawId: string) => {
  const playerId = validPlayerId(rawId);
  const cachePath = path.join(app.getPath('userData'), `player-history-${playerId}.json`);
  let cached: any = null;
  try { cached = JSON.parse(await fs.readFile(cachePath, 'utf8')); } catch { /* no usable local cache yet */ }
  const cachedGames: any[] = Array.isArray(cached?.games) ? cached.games : [];
  const cachedComplete = cached?.complete === true;
  const cachedIds = new Set(cachedGames.map(g => String(g.gameId)));
  const profile = await apiJson(`${PLAYER_API}${encodeURIComponent(playerId)}`);
  const freshGames: any[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let pagesLoaded = 0;
  let foundCacheOverlap = false;
  const maxPages = 10000;
  do {
    const gamesUrl = new URL(`${PLAYER_API}${encodeURIComponent(playerId)}/games`);
    if (cursor) gamesUrl.searchParams.set('cursor', cursor);
    let gamesPage: any;
    let retries = 0;
    while (true) {
      try { gamesPage = await apiJson(gamesUrl.toString()); break; }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('HTTP 429') || retries >= 4) throw error;
        retries++;
        event.sender.send('player:load-progress', { loaded: cachedGames.length + freshGames.length, pages: pagesLoaded, status: `API-Limit – neuer Versuch ${retries}/4` });
        await sleep(1000 * (2 ** retries));
      }
    }
    if (!Array.isArray(gamesPage?.results)) throw new Error('Die Spielhistorie hat ein unerwartetes API-Format.');
    for (const game of gamesPage.results) {
      const id = String(game?.gameId ?? '');
      if (cachedComplete && id && cachedIds.has(id)) { foundCacheOverlap = true; break; }
      if (id && !cachedIds.has(id)) freshGames.push(game);
    }
    pagesLoaded++;
    const next = typeof gamesPage.nextCursor === 'string' && gamesPage.nextCursor ? gamesPage.nextCursor : null;
    event.sender.send('player:load-progress', { loaded: cachedGames.length + freshGames.length, pages: pagesLoaded, status: cachedComplete && foundCacheOverlap ? 'Lokale Historie aktualisiert' : next ? 'Lade weitere Partien …' : 'Spielhistorie vollständig geladen' });
    if (next && seenCursors.has(next)) throw new Error('Die OpenFront-API hat denselben Cursor erneut geliefert. Laden sicherheitshalber gestoppt.');
    if (next) seenCursors.add(next);
    cursor = foundCacheOverlap ? null : next;
    if (cursor && pagesLoaded >= maxPages) throw new Error('Sicherheitslimit beim Laden der Spielhistorie erreicht.');
    if (cursor) await sleep(350);
  } while (cursor);

  const combined = [...freshGames, ...cachedGames];
  const uniqueGames = [...new Map(combined.filter(g => g?.gameId).map(g => [String(g.gameId), g])).values()]
    .sort((a,b) => new Date(b.start ?? 0).getTime() - new Date(a.start ?? 0).getTime());
  // Never trust persisted preview URLs: OpenFront changes content hashes during
  // deployments and old URLs can remain as 404s indefinitely. Re-resolve every
  // map against the current official asset manifest whenever player history loads.
  const mapPreviews: Record<string, string> = {};
  const mapNames = [...new Set(uniqueGames.map(g => String(g.map ?? '').trim()).filter(Boolean))];
  let previewIndex = 0;
  const workers = Array.from({ length: Math.min(4, mapNames.length) }, async () => {
    while (previewIndex < mapNames.length) {
      const mapName = mapNames[previewIndex++];
      const mapKey = mapName.toLowerCase();
      if (mapPreviews[mapKey]) continue;
      const image = await resolveOfficialMapPreview(mapName);
      if (image) mapPreviews[mapKey] = image;
    }
  });
  await Promise.all(workers);
  const result = { playerId, profile, games: uniqueGames, nextCursor: null, pagesLoaded, mapPreviews };
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify({ complete: true, games: uniqueGames, mapPreviews, updatedAt: new Date().toISOString() }), 'utf8');
  event.sender.send('player:load-progress', { loaded: uniqueGames.length, pages: pagesLoaded, status: 'Alle verfügbaren Partien geladen und lokal gespeichert' });
  return result;
});

ipcMain.handle('map:resolve-preview', async (_event, mapName: string) => ({ imageUrl: await resolveOfficialMapPreview(String(mapName ?? '')) }));
ipcMain.handle('replay:get-engine-assets', async () => {
  const { manifest, cdnBase } = await getOpenFrontAssetManifest();
  return { manifest, cdnBase };
});

async function resolvePackagedRendererIndex(): Promise<string> {
  // Electron's app path differs between installed, portable and unpacked builds.
  // Resolve only real files; never let a missing path fall through to a URL.
  const candidates = [
    path.resolve(__dirname, '../dist/index.html'),
    path.resolve(app.getAppPath(), 'dist/index.html'),
    path.resolve(process.resourcesPath, 'app.asar/dist/index.html'),
    path.resolve(process.resourcesPath, 'app/dist/index.html')
  ];
  for (const candidate of [...new Set(candidates)]) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        console.info('[ReplayCoach] Renderer-HTML gefunden:', candidate);
        return candidate;
      }
    } catch {
      // Try the next known layout.
    }
  }
  throw new Error(`Renderer-HTML fehlt. Geprüfte Pfade: ${candidates.join(' | ')}. app.getAppPath=${app.getAppPath()}, __dirname=${__dirname}, resourcesPath=${process.resourcesPath}`);
}

function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 940, minWidth: 1050, minHeight: 700,
    title: 'OpenFront Replay Coach', backgroundColor: '#0b1020',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('[ReplayCoach] Renderer konnte nicht geladen werden:', { errorCode, errorDescription, validatedURL, isMainFrame, appPath: app.getAppPath(), exe: app.getPath('exe') });
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[ReplayCoach] Renderer-Prozess beendet:', details);
  });
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error('[ReplayCoach] Renderer-Konsole:', message, sourceId, line);
  });
  if (isDev) {
    void win.loadURL('http://localhost:5173').catch(error => console.error('[ReplayCoach] Dev-Renderer konnte nicht geladen werden:', error));
  } else {
    void resolvePackagedRendererIndex()
      .then(rendererIndex => win.loadFile(rendererIndex))
      .catch(error => {
        console.error('[ReplayCoach] Renderer-Start fehlgeschlagen:', error);
        void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>Startfehler</title><style>body{font:15px Segoe UI;background:#0b1020;color:#fff;padding:32px}pre{white-space:pre-wrap;color:#ffb9ae}</style><h2>OpenFront Replay Coach konnte nicht starten</h2><p>Die Programmdateien sind unvollständig. Bitte die Anwendung vollständig entpacken bzw. neu installieren.</p><pre>${String(error).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!))}</pre>`));
      });
  }
}

function parseGameId(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('Bitte einen gültigen OpenFront-Link einfügen.'); }
  if (!['openfront.io', 'www.openfront.io'].includes(url.hostname.toLowerCase())) throw new Error('Der Link muss von openfront.io stammen.');
  const match = url.pathname.match(/\/game\/([A-Za-z0-9_-]+)/);
  const hashMatch = url.hash.match(/(?:^|[?&])replay-viewer=([A-Za-z0-9_-]+)/);
  const id = match?.[1] ?? hashMatch?.[1];
  if (!id) throw new Error('Im Link wurde keine Game-ID gefunden. Erwartet wird z. B. https://openfront.io/w5/game/ABC123.');
  return id;
}

function summarizeRecord(record: any, gameId: string, fileSize: number, savePath: string | null): any {
  const root = record?.game ?? record;
  const info = root?.info ?? {};
  const config = info?.config ?? root?.config ?? root?.gameStartInfo?.config ?? root?.base?.gameStartInfo?.config ?? {};
  const players = info?.players ?? root?.players ?? root?.gameStartInfo?.players ?? root?.base?.gameStartInfo?.players ?? [];
  const turns = root?.turns ?? root?.append?.turns;
  const chunks = root?.append?.chunks;
  const events = root?.events ?? root?.append?.events;
  const decoded = info && Array.isArray(root?.turns) ? decodeApiGameRecord(record) : null;
  const actions = decoded?.actionCount ?? (Array.isArray(turns) ? turns.reduce((sum: number, turn: any) => sum + (Array.isArray(turn?.intents) ? turn.intents.length : 0), 0) : null);
  const durationSeconds = Number(info?.duration ?? root?.duration ?? 0);
  const engineCompatibility = assessReplayCompatibility(record);
  const playerStats = (info?.players ?? []).map((p: any) => ({ name: p.username ?? p.displayName ?? p.name ?? 'Unbekannt', clientID: p.clientID ?? null, publicID: p.publicID ?? null, stats: p.stats ?? {} }));
  return {
    gameId, fileSize, savePath,
    topLevelKeys: Object.keys(record ?? {}),
    mapName: config.gameMap ?? config.map ?? 'Nicht im API-Datensatz erkannt',
    gameType: config.gameType ?? config.type ?? 'Nicht erkannt',
    gameMode: config.gameMode ?? config.mode ?? 'Nicht erkannt',
    difficulty: config.difficulty ?? 'Nicht erkannt',
    playerCount: Array.isArray(players) ? players.length : null,
    turnCount: Array.isArray(turns) ? turns.length : null,
    actionCount: actions,
    winner: info?.winner ?? root?.winner ?? null,
    durationSeconds: durationSeconds || null,
    chunkCount: Array.isArray(chunks) ? chunks.length : null,
    eventGroups: events && typeof events === 'object' ? Object.keys(events) : [],
    recordShape: chunks ? 'stored-replay-like' : Array.isArray(turns) ? 'game-record-with-turns' : 'game-record-unclassified',
    gitCommit: record?.gitCommit ?? root?.gitCommit ?? null,
    engineCompatibility,
    hashedTurns: Array.isArray(turns) ? turns.filter((t: any) => t?.hash !== null && t?.hash !== undefined).length : 0,
    decodedActions: decoded?.actions ?? [],
    actionCounts: decoded?.counts ?? {},
    categoryCounts: decoded?.categoryCounts ?? {},
    actionAnalysis: decoded ? analyzeActions(decoded.actions, durationSeconds) : null,
    detailedAnalysis: decoded ? analyzeDetailedActions(decoded.actions, durationSeconds) : null,
    coachInsights: decoded ? buildCoachInsights(decoded.actions, durationSeconds) : [],
    playerStats,
    note: 'API-Datensatz vollständig geladen. Die JSON-Speicherung ist optional; die Analyse kann direkt fortgesetzt werden.'
  };
}

ipcMain.handle('replay:import-url', async (_event, input: string) => {
  if (typeof input !== 'string' || input.length > 4000) throw new Error('Ungültiger oder zu langer Link.');
  const gameId = parseGameId(input);
  const endpoint = `${API_BASE}${encodeURIComponent(gameId)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let response: Response;
  try {
    response = await fetch(endpoint, { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'OpenFront-Replay-Coach/1.0.0' } });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Zeitüberschreitung beim Abruf der OpenFront-API (120 Sekunden).');
    throw new Error(`OpenFront-API konnte nicht erreicht werden: ${error instanceof Error ? error.message : String(error)}`);
  } finally { clearTimeout(timeout); }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    if (response.status === 404) throw new Error(`Für Game-ID ${gameId} wurde kein öffentlicher Datensatz gefunden. Private oder lokal gespeicherte Replays sind möglicherweise nicht über die öffentliche API abrufbar.`);
    if (response.status === 429) throw new Error('Die OpenFront-API hat eine Zugriffsbeschränkung (429) zurückgegeben. Bitte später erneut versuchen.');
    throw new Error(`OpenFront-API antwortet mit HTTP ${response.status}: ${detail || response.statusText}`);
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) throw new Error('Die API-Antwort ist größer als das derzeit unterstützte Limit von 750 MB.');
  const text = await response.text();
  const byteLength = Buffer.byteLength(text, 'utf8');
  if (byteLength > MAX_RESPONSE_BYTES) throw new Error('Die API-Antwort überschreitet das derzeit unterstützte Limit von 750 MB.');
  let record: any;
  try { record = JSON.parse(text); } catch { throw new Error('Die OpenFront-API hat keine gültige JSON-Antwort geliefert.'); }
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Die API-Antwort hat ein unerwartetes Format.');

  importedReplayJson.set(gameId, text);
  // Keep memory bounded: the latest 30 imports are enough for the active review session.
  while (importedReplayJson.size > 30) importedReplayJson.delete(importedReplayJson.keys().next().value as string);
  const savePath: string | null = null;
  const summary = summarizeRecord(record, gameId, byteLength, savePath);
  summary.previewUrl = await resolveOfficialMapPreview(summary.mapName);
  // The renderer needs the untouched GameRecord for the pinned upstream processor.
  // It is never persisted or uploaded by the Coach.
  summary.record = record;
  return summary;
});

ipcMain.handle('replay:save-json', async (event, gameId: string) => {
  const id = String(gameId ?? '').trim();
  const raw = importedReplayJson.get(id);
  if (!raw) {
    throw new Error('Für diese Partie liegt keine Original-JSON mehr im Arbeitsspeicher. Lade die Partie bitte erneut über ihren OpenFront-Link und speichere sie anschließend.');
  }

  const safeId = id.replace(/[^A-Za-z0-9_-]/g, '_');
  const defaultPath = path.join(app.getPath('downloads'), `OpenFront-${safeId}.json`);
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const saveDialogOptions = {
    title: 'OpenFront-Replay als JSON speichern',
    defaultPath,
    buttonLabel: 'JSON speichern',
    filters: [{ name: 'JSON-Datei', extensions: ['json'] }]
  };
  const choice = parentWindow
    ? await dialog.showSaveDialog(parentWindow, saveDialogOptions)
    : await dialog.showSaveDialog(saveDialogOptions);

  if (choice.canceled || !choice.filePath) {
    return { saved: false, canceled: true };
  }

  const filePath = choice.filePath.toLowerCase().endsWith('.json')
    ? choice.filePath
    : `${choice.filePath}.json`;

  await fs.writeFile(filePath, raw, { encoding: 'utf8', flag: 'w' });
  const stat = await fs.stat(filePath);
  const expectedBytes = Buffer.byteLength(raw, 'utf8');
  if (stat.size === 0 || stat.size !== expectedBytes) {
    throw new Error(`Replay-Export unvollständig: ${stat.size} Bytes geschrieben, ${expectedBytes} Bytes erwartet.`);
  }

  // Explorer reveal is only a convenience; it must not turn a successful save into an error.
  try { shell.showItemInFolder(filePath); } catch (error) {
    console.warn('[ReplayCoach] Datei wurde gespeichert, Explorer konnte aber nicht geöffnet werden:', error);
  }
  return { saved: true, filePath, bytes: stat.size };
});

ipcMain.handle('replay:open', async () => {
  const picked = await dialog.showOpenDialog({ title: 'OpenFront-Replay auswählen', properties: ['openFile'], filters: [{ name: 'OpenFront Replay', extensions: ['json'] }] });
  if (picked.canceled || !picked.filePaths[0]) return null;
  const filePath = picked.filePaths[0];
  const stat = await fs.stat(filePath);
  const raw = await fs.readFile(filePath, 'utf8');
  let data: any;
  try { data = JSON.parse(raw); } catch (e) { throw new Error(`Die Datei ist kein gültiges JSON: ${String(e)}`); }

  // API GameRecord JSON (info + turns) and local StoredReplay JSON (base + append)
  // are both valid import sources. Keep their origin explicit in the summary.
  const apiRoot = data?.game ?? data;
  if (apiRoot?.info && Array.isArray(apiRoot?.turns)) {
    const info = apiRoot.info;
    const config = info.config ?? {};
    const players = info.players ?? [];
    const turns = apiRoot.turns;
    const decoded = decodeApiGameRecord(data);
    const actionCount = decoded.actionCount;
    const winner = info.winner ?? apiRoot.winner ?? null;
    const hashedTurns = turns.filter((t: any) => t?.hash !== null && t?.hash !== undefined).length;
    const firstTurn = turns.length ? Number(turns[0]?.turnNumber ?? 0) : null;
    const lastTurn = turns.length ? Number(turns[turns.length - 1]?.turnNumber ?? 0) : null;
    const apiSummary = summarizeRecord(data, info.gameID ?? info.gameId ?? 'local-replay', stat.size, filePath);
    apiSummary.record = data;
    return {
      apiSummary,
      fileName: path.basename(filePath), fileSize: stat.size,
      gameId: info.gameID ?? info.gameId ?? data.gameID ?? 'unbekannt',
      map: 'API-Spielbericht', mapName: config.gameMap ?? config.map ?? 'unbekannt',
      mode: `${config.gameType ?? '—'} / ${config.gameMode ?? '—'}`,
      difficulty: config.difficulty ?? '—', bots: config.bots ?? null,
      keyframeInterval: null, players: Array.isArray(players) ? players.length : 0,
      chunks: 0, frames: turns.length, secondsAt10Ticks: null,
      playerName: players.find((p: any) => p.name === 'OligenOle' || p.displayName === 'OligenOle')?.displayName ?? players.find((p: any) => p.name === 'OligenOle')?.name ?? 'Nicht erkannt',
      playerCount: Array.isArray(players) ? players.length : 0, unitTypes: 0,
      eventGroups: [], packedEventBytes: 0, compressedChunkBytes: 0,
      firstChunkLooksGzip: false, importStatus: 'valid-api-game-record',
      decoderStatus: 'api-turns-decoded', decodedActions: decoded.actions, actionCounts: decoded.counts, categoryCounts: decoded.categoryCounts, gitCommit: decoded.gitCommit, hashedTurns, firstTurn, lastTurn,
      notes: [`API-Aktionsprotokoll dekodiert: ${turns.length.toLocaleString('de-DE')} Turns und ${actionCount.toLocaleString('de-DE')} Aktionen.`, winner ? `Gewinner: ${Array.isArray(winner) ? winner.join(' / ') : String(winner)}.` : 'Kein Gewinnerfeld im Datensatz erkannt.', `Hash-Prüfpunkte im Datensatz: ${hashedTurns}. Spielzüge: ${firstTurn ?? '—'} bis ${lastTurn ?? '—'}.`, 'Die Aktionen sind dekodiert; vollständige Karten-/Truppen-Zustände erfordern zusätzlich die exakt passende OpenFront-Engine.']
    };
  }

  if (!data?.base?.gameStartInfo || !Array.isArray(data?.append?.chunks)) {
    const keys = Object.keys(data ?? {}).join(', ') || 'keine';
    throw new Error(`JSON ist gültig, aber kein unterstütztes OpenFront-Replay-Format. Erkannte Felder: ${keys}. Unterstützt werden API-GameRecords (info + turns) und StoredReplays (base + append.chunks).`);
  }
  const base = data.base; const start = base.gameStartInfo; const players = start.players ?? [];
  const playerIndex = players.findIndex((p: any) => p.name === 'OligenOle' || p.displayName === 'OligenOle' || p.playerType === 0);
  const chunks = data.append.chunks as any[]; const frameCount = chunks.reduce((sum, c) => sum + (Number(c.frameCount) || 0), 0);
  const byteLength = (v: any) => v && typeof v === 'object' ? Object.keys(v).length : 0;
  const chunkBytes = chunks.reduce((sum, c) => sum + byteLength(c.compressed), 0);
  const firstChunk = chunks[0]?.compressed ?? {}; const firstBytes = Object.keys(firstChunk).slice(0, 3).map((k) => Number(firstChunk[k]));
  return { fileName: path.basename(filePath), fileSize: stat.size, gameId: start.gameID ?? 'unbekannt',
    map: base.mapWidth && base.mapHeight ? `${base.mapWidth} × ${base.mapHeight}` : 'unbekannt', mapName: start.config?.gameMap ?? 'unbekannt',
    mode: `${start.config?.gameType ?? '—'} / ${start.config?.gameMode ?? '—'}`, difficulty: start.config?.difficulty ?? '—', bots: start.config?.bots ?? null,
    keyframeInterval: base.keyframeInterval ?? null, players: players.length, chunks: chunks.length, frames: frameCount, secondsAt10Ticks: frameCount / 10,
    playerName: playerIndex >= 0 ? (players[playerIndex].displayName ?? players[playerIndex].name) : 'Nicht erkannt', playerCount: data.append.players?.length ?? 0,
    unitTypes: data.append.unitTypes?.length ?? 0, eventGroups: Object.keys(data.append.events ?? {}), packedEventBytes: byteLength(data.append.packedEvents),
    compressedChunkBytes: chunkBytes, firstChunkLooksGzip: firstBytes[0] === 31 && firstBytes[1] === 139,
    importStatus: 'valid-stored-replay', decoderStatus: 'not-yet-decoded', notes: ['Replay-Metadaten und Containerstruktur erfolgreich erkannt.', 'Die komprimierten Frame-Chunks sind noch nicht in Spielzustände dekodiert.'] };
});

registerUpdaterIpc();
app.whenReady().then(() => {
  // Show the app immediately. The release check and verified download run in
  // the background so a slow GitHub connection never looks like a failed launch.
  createWindow();
  void autoUpdateOnStartup();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('replay:open-official', async (_event, gameId: string) => {
  if (typeof gameId !== 'string' || !/^[A-Za-z0-9_-]{4,80}$/.test(gameId)) throw new Error('Ungültige Game-ID für den offiziellen Replay-Viewer.');
  const url = `https://openfront.io/#replay-viewer=${encodeURIComponent(gameId)}`;
  await shell.openExternal(url);
  return { opened: true, url };
});
