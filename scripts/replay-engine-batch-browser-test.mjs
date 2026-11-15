import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { app, BrowserWindow } from "electron";

const VITE_PORT = 5179;
let server;

async function loadReplay(gameId, expectedCommit, expectedMap, expectedHashes, expectedMode, expectedType) {
  const response = await fetch(`https://api.openfront.io/public/game/${encodeURIComponent(gameId)}`, {
    headers: { Accept: "application/json", "User-Agent": "OpenFront-Replay-Coach-CI/1.0" },
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, `Public replay API must return ${expectedMap}`);
  const payload = await response.json();
  const record = payload?.game ?? payload?.data?.game ?? payload?.data ?? payload;
  const hashes = record.turns?.filter(turn => turn?.hash !== null && turn?.hash !== undefined).length ?? 0;
  assert.equal(record.gitCommit, expectedCommit);
  assert.equal(record.info?.config?.gameMap, expectedMap);
  assert.equal(hashes, expectedHashes);
  if (expectedMode) assert.equal(record.info?.config?.gameMode, expectedMode);
  if (expectedType) assert.equal(record.info?.config?.gameType, expectedType);
  assert.ok(Number.isFinite(record.info?.start), `${gameId} must include the recorded start timestamp`);
  const profilePlayer = record.info?.players?.find(player =>
    /oligenole/i.test(String(player?.displayName ?? player?.name ?? player?.username ?? "")),
  );
  assert.ok(profilePlayer?.clientID, `${gameId} must include the OligenOle profile`);
  return record;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("Vite batch replay test server did not become ready");
}

async function main() {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-gpu");
  await app.whenReady();

  const europe = await loadReplay("c2R2JHZgUi", "8b5d071eed95f07c701b32e4c64e95b03f8577c1", "Europe", 1006, "Free For All", "Private");
  const levant = await loadReplay("dLNCLHCvMK", "bc3e3334c573c4959ec6a6745df6826d07233b4d", "Levant", 626, "Free For All", "Public");
  const publicCohort = [
    { gameId: "cHFTSJS4hT", map: "Scandinavia", commit: "0211f17b71efa762242b620b91ffa5d8439522e6", hashes: 998 },
    { gameId: "c4DBD1VsyU", map: "Strait of Gibraltar", commit: "0211f17b71efa762242b620b91ffa5d8439522e6", hashes: 1736 },
    { gameId: "c5gCRN1cHU", map: "France", commit: "0211f17b71efa762242b620b91ffa5d8439522e6", hashes: 1157 },
    { gameId: "dzXSbgxQUe", map: "Warship Warship", commit: "bc3e3334c573c4959ec6a6745df6826d07233b4d", hashes: 1056 },
    { gameId: "dbuAxuNWHz", map: "Mars", commit: "bc3e3334c573c4959ec6a6745df6826d07233b4d", hashes: 947 },
    { gameId: "dLNCLHCvMK", map: "Levant", commit: "bc3e3334c573c4959ec6a6745df6826d07233b4d", hashes: 626 },
  ];
  const publicRecords = await Promise.all(publicCohort.map(fixture =>
    loadReplay(fixture.gameId, fixture.commit, fixture.map, fixture.hashes, "Free For All", "Public"),
  ));
  const unsupported = { ...europe, gitCommit: "0000000000000000000000000000000000000000" };

  server = spawn("node", ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  server.stdout.on("data", data => process.stdout.write(`[vite] ${data}`));
  server.stderr.on("data", data => process.stderr.write(`[vite] ${data}`));
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
  await window.loadURL(`http://127.0.0.1:${VITE_PORT}/scripts/replay-engine-test.html`);

  for (let attempt = 0; attempt < 80; attempt++) {
    const ready = await window.webContents.executeJavaScript(
      "typeof window.__setBatchReplay === 'function' && typeof window.__runBatchReplayTest === 'function'",
    );
    if (ready) break;
    if (attempt === 79) throw new Error("Multi-match browser harness did not initialize");
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  await window.webContents.executeJavaScript("window.__prepareLegacyMatchStore()", true);

  const fixtures = [
    ["Europe", europe],
    ["unsupported-engine", unsupported],
    ["Levant", levant],
  ];
  for (const [gameId, record] of fixtures) {
    const input = JSON.stringify(record).replaceAll("<", "\\u003c");
    await window.webContents.executeJavaScript(
      `window.__setBatchReplay(${JSON.stringify(gameId)}, ${input})`,
      true,
    );
  }

  const batch = await window.webContents.executeJavaScript(
    `window.__runBatchReplayTest(["Europe", "unsupported-engine", "Levant"])`,
    true,
  );
  assert.deepEqual(batch.summary, {
    total: 3,
    completed: 3,
    verified: 2,
    unverified: 0,
    unsupported: 1,
    failed: 0,
    cancelled: false,
  }, "One unsupported engine must not block other selected matches");

  const europeResult = batch.outcomes.find(item => item.gameId === "Europe");
  const unsupportedResult = batch.outcomes.find(item => item.gameId === "unsupported-engine");
  const levantResult = batch.outcomes.find(item => item.gameId === "Levant");
  assert.equal(europeResult?.status, "verified");
  assert.equal(europeResult?.recordedHashes, 1006);
  assert.equal(europeResult?.verifiedHashes, 1006);
  assert.equal(unsupportedResult?.status, "unsupported");
  assert.equal(levantResult?.status, "verified");
  assert.equal(levantResult?.recordedHashes, 626);
  assert.equal(levantResult?.verifiedHashes, 626);
  assert.deepEqual(batch.coaching.map(item => item.gameId).sort(), ["Europe", "Levant"],
    "Both real replays must produce a profile-specific coaching review after exact-engine verification");
  console.log("Mixed-engine multi-match batch:", JSON.stringify({ summary: batch.summary, outcomes: batch.outcomes }));
  console.log("Profile-specific Europe/Levant coaching ranking:", JSON.stringify(batch.coaching));

  const abortResult = await window.webContents.executeJavaScript(
    'window.__testAbortBatchReplay("Europe")',
    true,
  );
  assert.equal(abortResult.aborted, true, "An active batch simulation must be cancellable");
  console.log("Batch engine cancellation: passed");

  await new Promise(resolve => {
    window.webContents.once("did-finish-load", resolve);
    window.webContents.reload();
  });
  for (let attempt = 0; attempt < 80; attempt++) {
    const ready = await window.webContents.executeJavaScript("typeof window.__verifyBatchStoreTest === 'function'");
    if (ready) break;
    if (attempt === 79) throw new Error("Batch IndexedDB verification harness did not initialize after refresh");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const persisted = await window.webContents.executeJavaScript("window.__verifyBatchStoreTest()", true);
  assert.equal(persisted.length, 3, "All selected match records must survive refresh");
  for (const gameId of ["Europe", "Levant"]) {
    const item = persisted.find(entry => entry.gameId === gameId);
    assert.equal(item?.analysisStatus, "verified");
    assert.equal(item?.simulationStatus, "verified");
    assert.ok(item?.sampleCount > 0);
    assert.equal(item?.jsonExportRestored, true, `${gameId} must export its persisted original JSON after renderer reload`);
  }
  const unsupportedStored = persisted.find(entry => entry.gameId === "unsupported-engine");
  assert.equal(unsupportedStored?.status, "engine-mismatch");
  assert.equal(unsupportedStored?.analysisStatus, "unsupported");
  console.log("Multi-match IndexedDB persistence after refresh:", JSON.stringify(persisted));

  const playerIndex = await window.webContents.executeJavaScript("window.__verifyPlayerIndexTest()", true);
  assert.deepEqual(playerIndex, {
    indexPresent: true,
    playerAMatches: ["index-a-1", "index-a-2"],
    playerBMatches: ["index-b-1"],
    legacyMatches: ["legacy-index-game"],
  }, "Player library reads must use the player index and never leak other profiles' matches");
  console.log("Indexed per-player match library:", JSON.stringify(playerIndex));

  window.destroy();
  await app.quit();
}

main().catch(async error => {
  console.error(error);
  if (server && !server.killed) server.kill();
  app.exit(1);
});

process.on("exit", () => {
  if (server && !server.killed) server.kill();
});
