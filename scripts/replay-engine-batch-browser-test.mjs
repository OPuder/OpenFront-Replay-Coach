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
  const publicRecords = await Promise.all(publicCohort.slice(0, -1).map(fixture =>
    loadReplay(fixture.gameId, fixture.commit, fixture.map, fixture.hashes, "Free For All", "Public"),
  ));
  publicRecords.push(levant);
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
    ...publicCohort.map((fixture, index) => [fixture.gameId, publicRecords[index]]),
  ];
  for (const [gameId, record] of fixtures) {
    const input = JSON.stringify(record).replaceAll("<", "\\u003c");
    await window.webContents.executeJavaScript(
      `window.__setBatchReplay(${JSON.stringify(gameId)}, ${input})`,
      true,
    );
  }

  const batchIds = fixtures.map(([gameId]) => gameId);
  const batch = await window.webContents.executeJavaScript(
    `window.__runBatchReplayTest(${JSON.stringify(batchIds)})`,
    true,
  );
  assert.deepEqual(batch.summary, {
    total: 8,
    completed: 8,
    verified: 7,
    unverified: 0,
    unsupported: 1,
    failed: 0,
    cancelled: false,
  }, "One unsupported engine must not block other selected matches");

  const expectedCoachingIds = ["Europe", ...publicCohort.map(fixture => fixture.gameId)].sort();
  assert.deepEqual(batch.coaching.map(item => item.gameId).sort(), expectedCoachingIds,
    "Europe plus all six comparable Public FFA matches must produce profile-specific coaching reviews");
  for (const gameId of expectedCoachingIds) {
    const outcome = batch.outcomes.find(item => item.gameId === gameId);
    assert.equal(outcome?.status, "verified", gameId + " must pass exact-engine replay verification");
    assert.equal(outcome?.verifiedHashes, outcome?.recordedHashes, gameId + " must verify every recorded hash");
  }

  const europeResult = batch.outcomes.find(item => item.gameId === "Europe");
  const unsupportedResult = batch.outcomes.find(item => item.gameId === "unsupported-engine");
  const levantResult = batch.outcomes.find(item => item.gameId === "dLNCLHCvMK");
  assert.equal(europeResult?.status, "verified");
  assert.equal(europeResult?.recordedHashes, 1006);
  assert.equal(europeResult?.verifiedHashes, 1006);
  assert.equal(unsupportedResult?.status, "unsupported");
  assert.equal(levantResult?.status, "verified");
  assert.equal(levantResult?.recordedHashes, 626);
  assert.equal(levantResult?.verifiedHashes, 626);

  for (const gameId of ["Europe", "dLNCLHCvMK"]) {
    const coaching = batch.coaching.find(item => item.gameId === gameId);
    assert.equal(coaching?.player, "OligenOle", gameId + " must be coached for OligenOle");
    assert.ok((coaching?.engineTop3?.length ?? 0) >= 1 && (coaching?.engineTop3?.length ?? 0) <= 3, gameId + " must produce one to three evidence-backed prioritized engine insights");
    assert.ok((coaching?.findings?.length ?? 0) <= 3, gameId + " must keep ProCoach findings to at most three");
    for (const insight of [...(coaching?.engineTop3 ?? []), ...(coaching?.findings ?? [])]) {
      assert.ok(Number.isFinite(insight.seconds), gameId + " insight " + insight.id + " must have an exact replay timestamp");
      assert.match(String(insight.evidence ?? ""), /\b\d{1,2}:\d{2}\b/, gameId + " insight " + insight.id + " must cite a timestamped replay event");
      assert.ok(Boolean(insight.decision || insight.summary), gameId + " insight " + insight.id + " must explain the observed decision/context");
      assert.ok(Boolean(insight.alternative), gameId + " insight " + insight.id + " must provide a better alternative");
      assert.ok(Boolean(insight.nextStep || insight.trainingRule), gameId + " insight " + insight.id + " must include an actionable lesson");
    }
  }

  const longitudinal = batch.longitudinal;
  assert.equal(longitudinal?.status, "ready");
  assert.equal(longitudinal?.comparableMatches, 6);
  assert.equal(longitudinal?.comparableGroup, "Free For All · Public");
  assert.deepEqual(longitudinal?.matchProgress.map(item => item.gameId),
    ["cHFTSJS4hT", "c4DBD1VsyU", "c5gCRN1cHU", "dzXSbgxQUe", "dbuAxuNWHz", "dLNCLHCvMK"],
    "The six Public FFA matches must be compared in recorded chronological order");
  assert.ok(longitudinal.metricTrends.some(trend => trend.direction !== "insufficient-data"),
    "At least one longitudinal metric must have six complete comparable observations");
  for (const trend of longitudinal.metricTrends.filter(item => item.direction !== "insufficient-data")) {
    assert.equal(trend.previousExamples.length, 3, trend.id + " must use a complete previous three-match window");
    assert.equal(trend.latestExamples.length, 3, trend.id + " must use a complete latest three-match window");
  }
  console.log("Mixed-engine multi-match batch:", JSON.stringify({ summary: batch.summary, outcomes: batch.outcomes }));
  console.log("Profile-specific Europe/Levant and Public FFA coaching Top-3:", JSON.stringify(batch.coaching));
  console.log("Real six-match Public FFA longitudinal analysis:", JSON.stringify(longitudinal));


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
  assert.equal(persisted.length, 8, "All selected match records must survive refresh");
  for (const gameId of expectedCoachingIds) {
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
