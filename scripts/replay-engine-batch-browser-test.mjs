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
      "typeof window.__setBatchReplay === 'function' && typeof window.__runBatchReplayTest === 'function' && typeof window.__testAbortBatchReplay === 'function'",
    );
    if (ready) break;
    if (attempt === 79) throw new Error("Multi-match browser harness did not initialize");
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  await window.webContents.executeJavaScript("window.__prepareLegacyMatchStore()", true);
  const migrated = await window.webContents.executeJavaScript("window.__verifyLegacyMigration()", true);
  assert.deepEqual(migrated, {
    version: 4,
    hasAnalysisStore: true,
    hasUpdatedAtIndex: true,
    legacyMatchHasSimulation: false,
    legacyMatchHasRawReplay: false,
    legacyMatchHasDecodedActions: false,
    libraryHasDecodedActions: false,
    libraryHasSimulation: false,
    legacyMatchHasRawReplay: false,
    profileName: "OligenOle",
    matchStatus: "loaded",
    analysisStatus: "verified",
    migratedSimulationStatus: "verified",
    migratedSampleCount: 1,
    migratedDecodedActionCount: 1,
    migratedActionAnalysisMarker: "preserved",
    replayId: "legacy-replay",
    replayHash: "legacy-hash",
    rawOnlyReplayHash: "legacy-hash",
  }, "IndexedDB v2 → v4 upgrade must preserve profile, match metadata, raw replay and migrate analysis payload");

  await window.webContents.executeJavaScript("window.__prepareLegacyV3ReplayStore()", true);
  const migratedV3 = await window.webContents.executeJavaScript("window.__verifyLegacyV3ReplayMigration()", true);
  assert.deepEqual(migratedV3, {
    version: 4,
    hasAnalysisStore: true,
    rawReplayPreserved: true,
    rawReplayGameId: "legacy-v3-replay",
    rawReplayHash: "legacy-v3-hash",
    hydratedGameId: "legacy-v3-replay",
    hydratedEngineCommit: "legacy-v3-engine",
    hydratedTurnCount: 1,
    hydratedDecodedActionCount: 1,
    hydratedActionAnalysisMarker: "v3-cache-preserved",
    lightweightMatchHasReplayPayload: false,
  }, "IndexedDB v3 → v4 migration must merge decoded-action caches without replacing the existing raw replay with undefined");

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
  if (batch.summary.failed > 0) {
    console.error("Replay batch diagnostic outcomes:", JSON.stringify(batch.outcomes, null, 2));
    for (const outcome of batch.outcomes.filter(item => item.status === "failed")) {
      console.error(`Replay ${outcome.gameId} failed: ${outcome.error ?? "no error supplied"}`);
    }
  }
  assert.deepEqual(batch.summary, {
    total: 5,
    completed: 5,
    verified: 2,
    unverified: 0,
    unsupported: 1,
    failed: 2,
    cancelled: false,
  }, "One unsupported engine must not block other selected matches");

  console.log("Coaching result bridge diagnostics:", JSON.stringify({
    summary: batch.summary,
    bridgeDiagnostics: batch.bridgeDiagnostics ?? null,
    reports: Array.isArray(batch.coaching) ? batch.coaching.map(report => ({
      gameId: report.gameId,
      selectedPlayer: report.selectedPlayer,
      clientId: report.clientId,
      verifiedHashes: report.verifiedHashes,
      sampleCount: report.sampleCount,
      actionCount: report.actionCount,
      findingCount: report.proReport?.findings?.length ?? 0,
      engineFindingCount: report.engineInsights?.length ?? 0,
      timelineCount: report.timeline?.length ?? 0,
    })) : null,
  }));
  assert.equal(batch.coaching.length, 2, "Both real replays should produce coach reports");
  const replayIds = { Europe: "c2R2JHZgUi", Levant: "dLNCLHCvMK" };
  assert.equal(new Set(batch.coaching.map(report => report.matchId)).size, 2,
    "The two coaching reports must retain distinct canonical replay IDs");
  for (const gameId of ["Europe", "Levant"]) {
    const report = batch.coaching.find(item => item.gameId === gameId);
    assert.ok(report, `${gameId} coach report missing`);
    assert.equal(report.matchId, replayIds[gameId], `${gameId} must retain its original replay match ID`);
    assert.equal(report.engineId, gameId === "Europe"
      ? "8b5d071eed95f07c701b32e4c64e95b03f8577c1"
      : "bc3e3334c573c4959ec6a6745df6826d07233b4d");
    assert.equal(String(report.selectedPlayer).toLowerCase(), "oligenole");
    assert.equal(report.selectedClientId, report.clientId);
    assert.ok(report.clientId);
    assert.ok(report.verifiedHashes > 0);
    assert.ok(report.sampleCount > 0);
    assert.equal(report.proReport.phases.length, 3);
    assert.ok(report.proReport.dataCoverage.samples > 0);
    assert.ok(report.proReport.findings.length > 0,
      `${gameId} must produce evidence-backed findings from its real simulation`);
    for (const finding of report.proReport.findings) {
      assert.ok(finding.decision?.trim());
      assert.ok(finding.consequence?.trim());
      assert.ok(finding.alternative?.trim());
      assert.ok(finding.trainingRule?.trim());
      assert.ok(finding.evidence?.trim());
      assert.ok(finding.seconds === null || (Number.isFinite(finding.seconds) && finding.seconds >= 0));
    }
    assert.ok(report.engineInsights.length > 0);
    for (const insight of report.engineInsights) {
      assert.ok(insight.evidence?.trim());
      assert.ok(insight.nextStep?.trim());
      assert.ok(insight.limitation?.trim());
    }
    assert.ok(report.timeline.length > 0);
    assert.ok(report.selection.primary.length <= 3);
    for (const entry of report.timeline) {
      assert.equal(entry.matchId, report.matchId, `${gameId} timeline entry must retain its match identity`);
      assert.ok(Number.isFinite(entry.time) && entry.time >= 0);
    }
    for (const entry of report.timeline.filter(item => item.id.startsWith("coach-"))) {
      assert.ok(entry.insight.evidence);
      assert.ok(entry.insight.nextStep);
      assert.ok(entry.insight.limitation);
    }
    for (const action of report.timeline.filter(item => item.id.startsWith("event-"))) {
      assert.equal(action.time, action.turn / 10);
    }
  }
  assert.equal(batch.longitudinal.importedMatches, 2,
    "Longitudinal analysis must receive both real replay inputs");
  assert.equal(batch.longitudinal.verifiedMatches, 2,
    "Both real simulations must be included in longitudinal analysis");
  assert.equal(batch.longitudinal.excludedMatches, 1,
    "The Public match is intentionally outside the selected Private comparison cohort, not lost from ingestion or verification");
  // Europe is Private while Levant is Public. The longitudinal engine correctly
  // compares only within a shared mode + game-type cohort, so these two inputs
  // remain imported/verified but form separate one-match cohorts.
  assert.equal(batch.longitudinal.comparableMatches, 1,
    "Only one match belongs to the selected shared mode/type comparison cohort");
  assert.equal(batch.longitudinal.comparableGroup, "Free For All · Private");
  assert.deepEqual(batch.bridgeDiagnostics.longitudinal.matchProgressIds, ["c2R2JHZgUi"]);
  assert.equal(batch.longitudinal.status, "insufficient-data",
    "One Private match is not enough to claim a longitudinal comparison when the other real match is Public");
  assert.ok(batch.longitudinal.message.includes(
    "mindestens zwei vollständig hash-verifizierte Partien desselben Modus und Spieltyps",
  ), "The longitudinal report must explain why the two imported matches are not yet comparable");
  assert.deepEqual(batch.bridgeDiagnostics.reportIdentities.map(item => ({
    gameId: item.gameId, sourceMatchId: item.sourceMatchId, reportMatchId: item.reportMatchId,
    mode: item.mode, type: item.type,
  })), [
    { gameId: "Europe", sourceMatchId: "c2R2JHZgUi", reportMatchId: "c2R2JHZgUi", mode: "Free For All", type: "Private" },
    { gameId: "Levant", sourceMatchId: "dLNCLHCvMK", reportMatchId: "dLNCLHCvMK", mode: "Free For All", type: "Public" },
  ]);
  console.log("Longitudinal cohort diagnostics:", JSON.stringify(batch.bridgeDiagnostics.longitudinal));
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
  console.log("Mixed-engine/corruption multi-match batch:", JSON.stringify({ summary: batch.summary, outcomes: batch.outcomes }));

  const abortResult = await window.webContents.executeJavaScript(
    'window.__testAbortBatchReplay("Europe")',
    true,
  );
  assert.equal(abortResult.simulationStarted, true,
    "Abort must be triggered only after progress from the original-engine worker is received");
  assert.equal(abortResult.cancelled, true, "The sequential batch runner must report cancellation");
  assert.equal(abortResult.completed, 0, "An aborted simulation must not be counted as completed");
  assert.equal(abortResult.failed, 0, "An intentional abort must not be misreported as a replay failure");
  assert.equal(abortResult.aborted, true, "An active original-engine batch simulation must be cancellable");
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
    const matchId = replayIds[gameId];
    const item = persisted.find(entry => entry.gameId === matchId);
    const report = batch.coaching.find(entry => entry.matchId === matchId);
    assert.ok(report, gameId + " coaching report must be available for post-reload comparison");
    assert.equal(item?.analysisStatus, "verified");
    assert.equal(item?.simulationStatus, "verified");
    assert.ok(item?.sampleCount > 0);
    assert.ok(item?.actionCount > 0);
    assert.equal(item?.clientId, report.clientId, gameId + " player identity must survive reload");
    assert.equal(item?.playerName, "OligenOle");
    assert.equal(item?.verifiedHashes, report.verifiedHashes);
    assert.equal(item?.findingCount, report.proReport.findings.length);
    assert.deepEqual(item?.findings, report.proReport.findings,
      gameId + " coaching findings and evidence must rebuild identically after reload");
    assert.deepEqual(item?.engineInsights, report.engineInsights,
      gameId + " engine coaching evidence must rebuild identically after reload");
    assert.deepEqual(item?.timeline, report.timeline.map(entry => ({
      id: entry.id, time: entry.time, title: entry.title, kind: entry.kind,
      turn: entry.turn, evidence: entry.insight?.evidence ?? null,
    })), gameId + " timeline markers and timestamps must survive reload");
    assert.equal(item?.jsonExportRestored, true, gameId + " must export its persisted original JSON after renderer reload");
  }
  const unsupportedStored = persisted.find(entry => entry.gameId === "unsupported-engine");
  assert.equal(unsupportedStored?.status, "engine-mismatch");
  assert.equal(unsupportedStored?.analysisStatus, "unsupported");
  const hashMismatchStored = persisted.find(entry => entry.gameId === "hash-mismatch");
  assert.equal(hashMismatchStored?.analysisStatus, "failed");
  const malformedStored = persisted.find(entry => entry.gameId === "malformed-replay");
  assert.equal(malformedStored?.analysisStatus, "failed");
  console.log("Multi-match IndexedDB persistence after refresh:", JSON.stringify(persisted));
  assert.equal(hashMismatchStored?.status, "loaded");
  assert.equal(malformedStored?.status, "loaded");
  assert.equal(persisted.every(entry => entry.jsonExportRestored), true,
    "Every persisted real and synthetic replay must preserve its full JSON export");

  const profile = await window.webContents.executeJavaScript("window.__verifyPersistedProfileTest()", true);
  assert.equal(profile.profilePresent, true, "Player profile must survive renderer restart");
  assert.equal(profile.profileName, "OligenOle");
  assert.deepEqual(profile.gameIds, Object.values(replayIds).sort());
  assert.deepEqual(profile.verifiedGames, Object.values(replayIds).sort());
  console.log("Player profile after renderer restart:", JSON.stringify(profile));

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
