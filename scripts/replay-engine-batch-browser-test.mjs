import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { app, BrowserWindow } from "electron";

const VITE_PORT = 5179;
let server;

async function loadReplay(gameId, expectedCommit, expectedMap, expectedHashes) {
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

  const europe = await loadReplay("c2R2JHZgUi", "8b5d071eed95f07c701b32e4c64e95b03f8577c1", "Europe", 1006);
  const levant = await loadReplay("dLNCLHCvMK", "bc3e3334c573c4959ec6a6745df6826d07233b4d", "Levant", 626);
  const unsupported = { ...europe, gitCommit: "0000000000000000000000000000000000000000" };
  const hashMismatch = structuredClone(europe);
  const firstCheckpoint = hashMismatch.turns.find(turn => turn?.hash !== null && turn?.hash !== undefined);
  assert.ok(firstCheckpoint, "Europe fixture must contain a checkpoint to corrupt");
  firstCheckpoint.hash = Number(firstCheckpoint.hash) ^ 1;
  const malformedReplay = {
    ...europe,
    info: { ...europe.info, config: { ...europe.info.config, gameMap: "!" } },
  };

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
    ["hash-mismatch", hashMismatch],
    ["malformed-replay", malformedReplay],
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
    `window.__runBatchReplayTest(["Europe", "unsupported-engine", "hash-mismatch", "malformed-replay", "Levant"])`,
    true,
  );
  assert.deepEqual(batch.summary, {
    total: 5,
    completed: 5,
    verified: 2,
    unverified: 0,
    unsupported: 1,
    failed: 2,
    cancelled: false,
  }, "One unsupported engine must not block other selected matches");

  const europeResult = batch.outcomes.find(item => item.gameId === "Europe");
  const unsupportedResult = batch.outcomes.find(item => item.gameId === "unsupported-engine");
  const hashMismatchResult = batch.outcomes.find(item => item.gameId === "hash-mismatch");
  const malformedResult = batch.outcomes.find(item => item.gameId === "malformed-replay");
  const levantResult = batch.outcomes.find(item => item.gameId === "Levant");
  assert.equal(europeResult?.status, "verified");
  assert.equal(europeResult?.recordedHashes, 1006);
  assert.equal(europeResult?.verifiedHashes, 1006);
  assert.equal(unsupportedResult?.status, "unsupported");
  assert.equal(hashMismatchResult?.status, "failed");
  assert.match(hashMismatchResult?.error ?? "", /Replay-Hash-Abweichung/);
  assert.equal(malformedResult?.status, "failed");
  assert.match(malformedResult?.error ?? "", /Karten-ID/);
  assert.equal(levantResult?.status, "verified");
  assert.equal(levantResult?.recordedHashes, 626);
  assert.equal(levantResult?.verifiedHashes, 626);
  for (const [gameId, outcome] of [["Europe", europeResult], ["Levant", levantResult]]) {
    assert.ok(Array.isArray(outcome?.coachingFindings), gameId + " must pass its verified engine result through the coaching/replay adapter");
    assert.equal(outcome.coachingPlayerName, "OligenOle", gameId + " must coach the exact OligenOle profile, not merely any player");
    assert.ok(outcome.detectedFindingCount > 0 && outcome.coachingFindings.length > 0, gameId + " must produce actionable strategic findings for the selected player");
    assert.ok(Array.isArray(outcome.timelineFrameChecks) && outcome.timelineFrameChecks.length >= 2,
      gameId + " must prove timeline-to-engine-frame mapping with at least two actual simulated territory samples");
    for (const check of outcome.timelineFrameChecks) {
      assert.ok(Number.isFinite(check.timelineSeconds) && check.timelineSeconds >= 0);
      assert.equal(check.timelineSeconds * 10, check.sourceTick,
        gameId + " timeline time must be derived from the actual replay tick");
      assert.equal(check.selectedTick, check.sourceTick,
        gameId + " timeline selection must resolve the exact actual replay tick");
      assert.equal(check.selectedFrame, check.sourceFrame,
        gameId + " timeline selection must display the corresponding actual engine frame");
    }
    for (const finding of outcome.coachingFindings) {
      assert.equal(finding.matchId, gameId, gameId + " finding must remain scoped to its source match");
      assert.ok(finding.evidenceReferences > 0, gameId + " finding must retain its replay evidence reference");
      assert.ok(finding.timestampSeconds === null || (Number.isFinite(finding.timestampSeconds) && finding.timestampSeconds >= 0));
      if (finding.timestampSeconds === null) {
        assert.ok(finding.evidence.every(reference => reference.seconds === null && reference.frame === null),
          gameId + " missing timestamp must not expose a fabricated evidence time or frame");
        assert.match(finding.uncertainty, /Kein belastbarer Replay-Zeitstempel/,
          gameId + " missing timestamp must be explicitly labelled as unavailable");
      } else {
        assert.ok(finding.evidence.every(reference => reference.seconds === finding.timestampSeconds),
          gameId + " evidence timestamp must match the actual finding timestamp");
      }
      assert.ok(["high", "medium"].includes(finding.priority), "Primary replay cards must exclude low-priority context-only findings");
      assert.ok(["high", "medium", "low"].includes(finding.confidence));
    }
  }
  console.log("Mixed-engine multi-match batch + real replay timeline/frame mapping + strategic coaching contract:", JSON.stringify({ summary: batch.summary, outcomes: batch.outcomes }));

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
  assert.equal(persisted.length, 5, "All selected match records must survive refresh");
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
  const hashMismatchStored = persisted.find(entry => entry.gameId === "hash-mismatch");
  assert.equal(hashMismatchStored?.analysisStatus, "failed");
  const malformedStored = persisted.find(entry => entry.gameId === "malformed-replay");
  assert.equal(malformedStored?.analysisStatus, "failed");
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
