import { decodeApiGameRecord } from "../../main/decoder/ApiTurnDecoder";
import { analyzeActions } from "../../main/decoder/ActionAnalysis";
import { analyzeDetailedActions } from "../../main/decoder/DetailedAnalysis";
import { buildCoachInsights } from "../../main/decoder/CoachInsights";
import { assessReplayCompatibility } from "../../main/decoder/ReplayCompatibility";

const API_BASE = "https://api.openfront.io/public";
const MAX_REPLAY_BYTES = 250 * 1024 * 1024;
const importedReplayJson = new Map<string, string>();
let assetManifestCache: { manifest: Record<string, string>; cdnBase: string; fetchedAt: number } | null = null;
const previewCache = new Map<string, string | null>();

function parseGameId(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); }
  catch { throw new Error("Bitte einen gültigen OpenFront-Spiel-Link einfügen."); }
  if (!["openfront.io", "www.openfront.io"].includes(url.hostname.toLowerCase())) {
    throw new Error("Der Link muss von openfront.io stammen.");
  }
  const pathMatch = url.pathname.match(/\/game\/([A-Za-z0-9_-]{4,80})/);
  const hashMatch = url.hash.match(/(?:^|[?&])replay-viewer=([A-Za-z0-9_-]{4,80})/);
  const id = pathMatch?.[1] ?? hashMatch?.[1];
  if (!id) throw new Error("Im Link wurde keine Game-ID gefunden.");
  return id;
}

function validPlayerId(value: string): string {
  let id = value.trim();
  if (id.length > 500) throw new Error("Die Spieler-ID oder Profil-URL ist zu lang.");
  if (/^https?:\/\//i.test(id)) {
    let url: URL;
    try { url = new URL(id); } catch { throw new Error("Die Profil-URL ist ungültig."); }
    if (!["openfront.io", "www.openfront.io"].includes(url.hostname.toLowerCase())) {
      throw new Error("Bitte einen Profil-Link von openfront.io verwenden.");
    }
    const match = url.pathname.match(/^\/player\/([A-Za-z0-9_-]{4,80})\/?$/);
    if (!match) throw new Error("Erwartet wird z. B. https://openfront.io/player/5SVg4WbI.");
    id = match[1];
  }
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(id)) throw new Error("Bitte eine gültige OpenFront-Spieler-ID eingeben.");
  return id;
}

async function fetchJson<T>(url: string, timeoutMs = 120_000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      signal: controller.signal,
    });
    if (response.status === 404) throw new Error("Spieler oder Replay wurden nicht gefunden (404).");
    if (response.status === 429) throw new Error("OpenFront begrenzt gerade die API-Anfragen (429). Bitte später erneut versuchen.");
    if (!response.ok) throw new Error("OpenFront-API antwortet mit HTTP " + response.status + ".");
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Zeitüberschreitung beim Abruf von OpenFront.");
    if (error instanceof TypeError) {
      throw new Error("OpenFront konnte aus diesem Browser nicht erreicht werden. Der Browser meldet möglicherweise eine CORS- oder Netzwerkbeschränkung. Du kannst stattdessen die Replay-JSON-Datei direkt vom Handy auswählen.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function readBalancedObject(source: string, start: number): string | null {
  const open = source.indexOf("{", start);
  if (open < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  return null;
}

async function getOpenFrontAssetManifest() {
  if (assetManifestCache && Date.now() - assetManifestCache.fetchedAt < 6 * 60 * 60 * 1000) {
    return assetManifestCache;
  }
  let response: Response;
  try {
    response = await fetch("https://openfront.io/", {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: { Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("Die OpenFront-Asset-Liste ist aus dieser Web-App nicht abrufbar. Prüfe die Verbindung oder nutze die Windows-Version für die Engine-Simulation.");
  }
  if (!response.ok) throw new Error("OpenFront liefert beim Laden der Asset-Liste HTTP " + response.status + ".");
  const html = await response.text();
  const marker = html.indexOf("assetManifest:");
  if (marker < 0) throw new Error("Die aktuelle OpenFront-Asset-Liste wurde nicht gefunden.");
  const objectText = readBalancedObject(html, marker + "assetManifest:".length);
  if (!objectText) throw new Error("Die OpenFront-Asset-Liste ist unvollständig.");
  const manifest = JSON.parse(objectText) as Record<string, string>;
  const cdnMatch = html.match(/cdnBase:\s*("(?:\\.|[^"\\])*")/);
  const cdnBase = cdnMatch ? JSON.parse(cdnMatch[1]) as string : "";
  assetManifestCache = { manifest, cdnBase, fetchedAt: Date.now() };
  return assetManifestCache;
}

function normalizeMapAssetId(mapName: string): string {
  const aliases: Record<string, string> = {
    "tourney 2 teams": "tourney1", "tourney 3 teams": "tourney2",
    "tourney 4 teams": "tourney3", "tourney 8 teams": "tourney4",
    "amazon river": "amazonriver", "bab el-mandeb strait": "babelmandebstrait",
    "world inverted": "worldinverted", southeastasia: "southeastasia",
  };
  const key = mapName.trim().toLowerCase();
  return aliases[key] ?? key.replace(/[\s.()]+/g, "").replace(/[^a-z0-9_-]/g, "");
}

async function resolveOfficialMapPreview(mapName: string): Promise<string | null> {
  const mapId = normalizeMapAssetId(mapName);
  if (!mapId || !/^[a-z0-9_-]{2,80}$/.test(mapId)) return null;
  const cached = previewCache.get(mapId);
  if (typeof cached === "string") return cached;
  try {
    const assetData = await getOpenFrontAssetManifest();
    const manifest = assetData.manifest;
    const cdnBase = assetData.cdnBase;
    const key = Object.keys(manifest).find(value => value.toLowerCase() === "maps/" + mapId + "/thumbnail.webp");
    const assetPath = key ? manifest[key] : null;
    if (!assetPath) return null;
    const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(assetPath)
      ? assetPath
      : cdnBase
        ? cdnBase.replace(/\/+$/, "") + "/" + assetPath.replace(/^\/+/, "")
        : new URL(assetPath.replace(/^\/+/, ""), "https://openfront.io/").toString();
    previewCache.set(mapId, url);
    return url;
  } catch {
    previewCache.set(mapId, null);
    return null;
  }
}

function summarizeRecord(record: any, gameId: string, fileSize: number): ApiImportSummary {
  const root = record?.game ?? record;
  const info = root?.info ?? {};
  const config = info?.config ?? root?.config ?? {};
  const players = info?.players ?? root?.players ?? [];
  const turns = root?.turns;
  const decoded = info && Array.isArray(turns) ? decodeApiGameRecord(record) : null;
  const durationSeconds = Number(info?.duration ?? root?.duration ?? 0);
  const engineCompatibility = assessReplayCompatibility(record);
  const playerStats = (info?.players ?? []).map((p: any) => ({
    name: p.username ?? p.displayName ?? p.name ?? "Unbekannt",
    clientID: p.clientID ?? null,
    publicID: p.publicID ?? null,
    stats: p.stats ?? {},
  }));
  return {
    record,
    gameId,
    fileSize,
    savePath: null,
    topLevelKeys: Object.keys(record ?? {}),
    mapName: config.gameMap ?? config.map ?? "Nicht im API-Datensatz erkannt",
    gameType: config.gameType ?? config.type ?? "Nicht erkannt",
    gameMode: config.gameMode ?? config.mode ?? "Nicht erkannt",
    difficulty: config.difficulty ?? "Nicht erkannt",
    playerCount: Array.isArray(players) ? players.length : null,
    turnCount: Array.isArray(turns) ? turns.length : null,
    actionCount: decoded?.actionCount ?? null,
    winner: info?.winner ?? root?.winner ?? null,
    durationSeconds: durationSeconds || null,
    chunkCount: Array.isArray(root?.append?.chunks) ? root.append.chunks.length : null,
    eventGroups: Object.keys(root?.events ?? {}),
    recordShape: Array.isArray(turns) ? "game-record-with-turns" : "game-record-unclassified",
    gitCommit: record?.gitCommit ?? root?.gitCommit ?? null,
    engineCompatibility,
    hashedTurns: Array.isArray(turns) ? turns.filter((turn: any) => turn?.hash !== null && turn?.hash !== undefined).length : 0,
    decodedActions: decoded?.actions ?? [],
    actionCounts: decoded?.counts ?? {},
    categoryCounts: decoded?.categoryCounts ?? {},
    actionAnalysis: decoded ? analyzeActions(decoded.actions, durationSeconds) : null,
    detailedAnalysis: decoded ? analyzeDetailedActions(decoded.actions, durationSeconds) : null,
    coachInsights: decoded ? buildCoachInsights(decoded.actions, durationSeconds) : [],
    playerStats,
    note: "API-Datensatz im Browser geladen. Die Datei bleibt auf diesem Gerät.",
  };
}

async function importReplayUrl(input: string): Promise<ApiImportSummary> {
  if (typeof input !== "string" || input.length > 4000) throw new Error("Ungültiger oder zu langer Link.");
  const gameId = parseGameId(input);
  const url = API_BASE + "/game/" + encodeURIComponent(gameId);
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "omit",
    signal: AbortSignal.timeout(120_000),
  }).catch(error => {
    if (error instanceof TypeError) {
      throw new Error("Der Browser darf die OpenFront-API von dieser Web-Adresse aus nicht lesen (CORS/Netzwerk). Öffne die Replay-JSON-Datei über „Replay importieren“ oder nutze die Windows-Version.");
    }
    throw error;
  });
  if (response.status === 404) throw new Error("Für Game-ID " + gameId + " wurde kein öffentlicher Datensatz gefunden.");
  if (response.status === 429) throw new Error("Die OpenFront-API begrenzt gerade Anfragen (429). Bitte später erneut versuchen.");
  if (!response.ok) throw new Error("OpenFront-API antwortet mit HTTP " + response.status + ".");
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REPLAY_BYTES) throw new Error("Das Replay ist für die mobile Web-Version zu groß. Bitte verwende die Windows-Version.");
  const raw = await response.text();
  const byteLength = new Blob([raw]).size;
  if (byteLength > MAX_REPLAY_BYTES) throw new Error("Das Replay ist für die mobile Web-Version zu groß. Bitte verwende die Windows-Version.");
  let record: any;
  try { record = JSON.parse(raw); } catch { throw new Error("OpenFront hat keine gültige Replay-JSON geliefert."); }
  importedReplayJson.set(gameId, raw);
  while (importedReplayJson.size > 10) importedReplayJson.delete(importedReplayJson.keys().next().value as string);
  const summary = summarizeRecord(record, gameId, byteLength);
  summary.previewUrl = await resolveOfficialMapPreview(summary.mapName);
  return summary;
}

function makeFilePicker(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.position = "fixed";
    input.style.left = "-10000px";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    }, { once: true });
    input.addEventListener("cancel", () => {
      input.remove();
      resolve(null);
    }, { once: true });
    input.click();
  });
}

async function openReplay(): Promise<ReplaySummary | null> {
  const file = await makeFilePicker();
  if (!file) return null;
  if (file.size > MAX_REPLAY_BYTES) throw new Error("Die Replay-Datei ist für die mobile Web-Version zu groß. Verwende dafür bitte die Windows-Version.");
  const raw = await file.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new Error("Die ausgewählte Datei enthält kein gültiges JSON."); }
  const root = data?.game ?? data;
  if (root?.info && Array.isArray(root?.turns)) {
    const gameId = String(root.info.gameID ?? root.info.gameId ?? "lokales-replay");
    const summary = summarizeRecord(data, gameId, file.size);
    importedReplayJson.set(gameId, raw);
    return {
      apiSummary: summary,
      fileName: file.name,
      fileSize: file.size,
      gameId,
      map: "API-Spielbericht",
      mapName: summary.mapName,
      mode: String(summary.gameType) + " / " + String(summary.gameMode),
      difficulty: String(summary.difficulty),
      bots: null,
      keyframeInterval: null,
      players: Number(summary.playerCount ?? 0),
      chunks: 0,
      frames: Number(summary.turnCount ?? 0),
      secondsAt10Ticks: Number(summary.durationSeconds ?? 0),
      playerName: "Ausgewählter Replay-Datensatz",
      playerCount: Number(summary.playerCount ?? 0),
      unitTypes: 0,
      eventGroups: summary.eventGroups ?? [],
      packedEventBytes: 0,
      compressedChunkBytes: file.size,
      firstChunkLooksGzip: false,
      importStatus: "valid-api-game-record",
      decoderStatus: "api-turns-decoded",
      notes: [String(summary.turnCount ?? 0) + " Spielzüge und " + String(summary.actionCount ?? 0) + " Aktionen erkannt."],
      decodedActions: summary.decodedActions,
      actionCounts: summary.actionCounts,
      categoryCounts: summary.categoryCounts,
      gitCommit: summary.gitCommit,
      hashedTurns: summary.hashedTurns,
    };
  }
  throw new Error("Diese JSON-Datei ist kein unterstützter API-GameRecord. Bitte eine OpenFront-Replay-JSON mit „info“ und „turns“ auswählen.");
}

async function loadPlayer(rawId: string, onProgress?: (progress: { loaded: number; pages: number; status: string }) => void): Promise<PlayerPage> {
  const playerId = validPlayerId(rawId);
  const profile = await fetchJson<any>(API_BASE + "/player/" + encodeURIComponent(playerId), 30_000);
  const games: PlayerGame[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  do {
    const url = new URL(API_BASE + "/player/" + encodeURIComponent(playerId) + "/games");
    if (cursor) url.searchParams.set("cursor", cursor);
    const result = await fetchJson<any>(url.toString(), 30_000);
    if (!Array.isArray(result?.results)) throw new Error("Die Spielhistorie hat ein unerwartetes API-Format.");
    games.push(...result.results);
    pages++;
    const next = typeof result.nextCursor === "string" && result.nextCursor ? result.nextCursor : null;
    onProgress?.({ loaded: games.length, pages, status: next ? "Lade weitere Partien …" : "Spielhistorie vollständig geladen" });
    if (next && cursors.has(next)) throw new Error("Die OpenFront-API hat denselben Cursor erneut geliefert. Laden sicherheitshalber gestoppt.");
    if (next) cursors.add(next);
    cursor = next;
    if (cursor) await new Promise(resolve => window.setTimeout(resolve, 250));
  } while (cursor && pages < 500);
  if (cursor) throw new Error("Sicherheitslimit beim Laden der Spielhistorie erreicht.");
  const uniqueGames = [...new Map(games.filter(game => game?.gameId).map(game => [String(game.gameId), game])).values()]
    .sort((a, b) => new Date(b.start ?? 0).getTime() - new Date(a.start ?? 0).getTime());
  const mapPreviews: Record<string, string> = {};
  const names = [...new Set(uniqueGames.map(game => String(game.map ?? "").trim()).filter(Boolean))];
  let index = 0;
  const workers = Array.from({ length: Math.min(3, names.length) }, async () => {
    while (index < names.length) {
      const map = names[index++];
      const preview = await resolveOfficialMapPreview(map);
      if (preview) mapPreviews[map.toLowerCase()] = preview;
    }
  });
  await Promise.all(workers);
  onProgress?.({ loaded: uniqueGames.length, pages, status: "Spielhistorie geladen" });
  return { playerId, profile, games: uniqueGames, nextCursor: null, pagesLoaded: pages, mapPreviews };
}

async function saveReplayJson(gameId: string): Promise<{ saved: boolean; canceled?: boolean; filePath?: string; bytes?: number }> {
  const raw = importedReplayJson.get(String(gameId));
  if (!raw) throw new Error("Für diese Partie liegt keine Replay-JSON mehr im Browser-Speicher. Lade die Partie bitte erneut.");
  const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "OpenFront-" + String(gameId).replace(/[^A-Za-z0-9_-]/g, "_") + ".json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { saved: true, filePath: link.download, bytes: blob.size };
}

function installBrowserReplayAPI() {
  if ("replayAPI" in window && window.replayAPI) return;
  window.replayAPI = {
    openReplay,
    loadPlayer,
    resolveMapPreview: async (mapName: string) => ({ imageUrl: await resolveOfficialMapPreview(mapName) }),
    importReplayUrl,
    getReplayEngineAssets: getOpenFrontAssetManifest,
    saveReplayJson,
    openOfficialReplay: async (gameId: string) => {
      if (!/^[A-Za-z0-9_-]{4,80}$/.test(String(gameId))) throw new Error("Ungültige Game-ID.");
      const url = "https://openfront.io/#replay-viewer=" + encodeURIComponent(gameId);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) throw new Error("Der Browser hat das neue Fenster blockiert. Erlaube Pop-ups für diese App oder öffne den OpenFront-Link manuell.");
      return { opened: true, url };
    },
  };
}

export { installBrowserReplayAPI };
