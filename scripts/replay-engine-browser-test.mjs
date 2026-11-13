import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { app, BrowserWindow, net } from "electron";

const GAME_ID = process.env.OPENFRONT_REPLAY_ID ?? "c2R2JHZgUi";
const EXPECTED_COMMIT = "8b5d071eed95f07c701b32e4c64e95b03f8577c1";
const EXPECTED_HASHES = 1006;
const VITE_PORT = 5178;
let server;

function readBalancedObject(source, start) {
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

async function loadReplay() {
  const response = await fetch(`https://api.openfront.io/public/game/${encodeURIComponent(GAME_ID)}`, {
    headers: { Accept: "application/json", "User-Agent": "OpenFront-Replay-Coach-CI/1.0" },
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, "Public OpenFront replay API must be reachable");
  const payload = await response.json();
  const record = payload?.game ?? payload?.data?.game ?? payload?.data ?? payload;
  assert.equal(record.gitCommit, EXPECTED_COMMIT, "Fixture must remain the Europe replay engine revision");
  assert.equal(record.info?.config?.gameMap, "Europe");
  assert.equal(record.turns?.filter((turn) => turn?.hash !== null && turn?.hash !== undefined).length, EXPECTED_HASHES);
  return record;
}

async function loadAssets() {
  const response = await net.fetch("https://openfront.io/", {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": app.userAgentFallback,
      Referer: "https://openfront.io/",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Upgrade-Insecure-Requests": "1",
    },
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(response.ok, `OpenFront asset manifest returned HTTP ${response.status}`);
  const html = await response.text();
  const marker = html.indexOf("assetManifest:");
  assert.ok(marker >= 0, "OpenFront asset manifest marker must exist");
  const objectText = readBalancedObject(html, marker + "assetManifest:".length);
  assert.ok(objectText, "OpenFront asset manifest must be complete");
  const manifest = JSON.parse(objectText);
  const cdnMatch = html.match(/cdnBase:\\s*("(?:\\\\.|[^"\\\\])*")/);
  const cdnBase = cdnMatch ? JSON.parse(cdnMatch[1]) : "";
  assert.ok(Object.keys(manifest).length > 0, "Asset manifest must not be empty");
  return { manifest, cdnBase };
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite replay test server did not become ready");
}

async function main() {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-gpu");
  await app.whenReady();

  const record = await loadReplay();
  const assets = await loadAssets();

  server = spawn("node", ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  server.stdout.on("data", (data) => process.stdout.write(`[vite] ${data}`));
  server.stderr.on("data", (data) => process.stderr.write(`[vite] ${data}`));
  await waitForServer(`http://127.0.0.1:${VITE_PORT}/scripts/replay-engine-test.html`);

  const window = new BrowserWindow({
    show: false,
    width: 900,
    height: 700,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) console.error("[renderer]", message);
  });
  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error("[renderer-load]", code, description, url);
  });
  await window.loadURL(`http://127.0.0.1:${VITE_PORT}/scripts/replay-engine-test.html`);

  for (let attempt = 0; attempt < 80; attempt++) {
    const ready = await window.webContents.executeJavaScript("typeof window.__runReplayTest === 'function'");
    if (ready) break;
    if (attempt === 79) throw new Error("Replay engine browser harness did not initialize");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const input = JSON.stringify({ record, assets }).replaceAll("<", "\\u003c");
  const result = await window.webContents.executeJavaScript(
    `const payload = ${input}; window.__runReplayTest(payload.record, payload.assets)`,
    true,
  );
  assert.equal(result.status, "verified", "Original engine must reproduce the real Europe replay");
  assert.equal(result.verifiedHashes, EXPECTED_HASHES, "Every recorded Europe hash must be verified");
  assert.ok(result.totalTicks > 0, "Replay must produce reconstructed frames");
  assert.ok(result.playerReview, "Selected player's state review must be reconstructed");
  console.log(JSON.stringify({
    gameId: GAME_ID,
    engineCommit: EXPECTED_COMMIT,
    status: result.status,
    verifiedHashes: result.verifiedHashes,
    totalTicks: result.totalTicks,
    playerReview: result.playerReview,
  }, null, 2));

  window.destroy();
  server.kill();
  app.quit();
}

main().catch((error) => {
  console.error(error);
  if (server) server.kill();
  app.exit(1);
});
