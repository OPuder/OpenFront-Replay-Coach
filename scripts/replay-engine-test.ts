import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ReplayVisualization } from "../src/renderer/ReplayVisualization";
import { buildReplayEngineAssets, simulateReplay } from "../src/renderer/ReplaySimulation";
import { decodeTileOwners, selectTerritorySample } from "../src/renderer/ReplayTerritory";
import { loadImportedMatch, loadImportedMatches, saveImportedMatch } from "../src/renderer/matchStore";
import { runSequentialBatchAnalysis } from "../src/renderer/BatchAnalysisRunner";
import { assessReplayCompatibility } from "../src/main/decoder/ReplayCompatibility";
import { resolveReplayJsonExport } from "../src/main/decoder/ReplayJsonExport";
import { buildProCoachReport } from "../src/main/decoder/ProCoachAlgorithm";
import { toReplayCoachFindings } from "../src/renderer/ReplayCoachIntegration";

const batchTestRecords = new Map<string, any>();

function verifyRecordedActionFrameConvention(gameId: string, result: any) {
  const samplesByFrame = new Map<number, any>();
  for (const sample of result.samples) {
    if (samplesByFrame.has(sample.frame))
      throw new Error(gameId + ": duplicate ReplayReader sample for engine frame " + sample.frame);
    samplesByFrame.set(sample.frame, sample);
    if (sample.tick !== sample.frame + 1)
      throw new Error(gameId + ": ReplayReader sample frame " + sample.frame + " carries tick " + sample.tick + ", expected " + (sample.frame + 1));
  }
  const checked = result.actionReviews.filter((action: any) => Number.isInteger(action.turn) && action.turn >= 1);
  if (checked.length === 0) throw new Error(gameId + ": no recorded actions available for frame convention verification");
  const requiredObservations = new Map<number, Set<string>>();
  const requireFrame = (frame: number, reason: string) => {
    if (frame < 0 || frame >= result.totalTicks) return;
    const reasons = requiredObservations.get(frame) ?? new Set<string>();
    reasons.add(reason);
    requiredObservations.set(frame, reasons);
  };
  for (const action of checked) {
    const actionFrame = action.turn - 1;
    if (action.frame !== actionFrame)
      throw new Error(gameId + ": recorded tick " + action.turn + " must map to zero-based ReplayReader frame " + actionFrame + ", got " + action.frame);
    if (action.seconds !== action.turn / 10)
      throw new Error(gameId + ": action timestamp must be recorded tick / 10 seconds");
    requireFrame(actionFrame, "action");
    requireFrame(actionFrame - 1, "before");
    requireFrame(actionFrame + 1, "after");
    for (const offset of [50, 100, 300]) requireFrame(actionFrame + offset, "delayed+" + offset);
  }
  const observations = [...requiredObservations.entries()].sort((a,b) => a[0] - b[0]);
  for (const [frame, reasons] of observations) {
    const sample = samplesByFrame.get(frame);
    if (!sample)
      throw new Error(gameId + ": required " + [...reasons].join("/") + " ReplayReader sample missing for frame " + frame);
    const expectedTick = frame + 1;
    if (sample.tick !== expectedTick)
      throw new Error(gameId + ": ReplayReader frame " + frame + " carries tick " + sample.tick + ", expected " + expectedTick);
    if (reasons.has("action")) {
      const actionsAtFrame = checked.filter((action: any) => action.turn - 1 === frame);
      if (!actionsAtFrame.length || actionsAtFrame.some((action: any) => action.frame !== frame || action.turn !== sample.tick))
        throw new Error(gameId + ": action review does not reference its exact ReplayReader sample at frame " + frame);
    }
  }
  return {
    recordedActions: checked.length,
    requiredUniqueSamples: observations.length,
    actionSamples: [...requiredObservations.entries()].filter(([,reasons]) => reasons.has("action")).length,
    beforeAfterAndDelayedSamples: observations.length - [...requiredObservations.entries()].filter(([,reasons]) => reasons.has("action")).length,
    convention: "turnNumber=tick (1-based); ReplayReader frame=turnNumber-1 (0-based)",
  };
}

function verifyActualTimelineFrameMapping(gameId: string, samples: any[]) {
  const territorySamples = samples.filter(sample =>
    sample?.territory && Number.isInteger(sample.tick) && sample.tick >= 0 && sample.tick % 10 === 0 &&
    Number.isInteger(sample.frame) && sample.frame >= 0
  );
  const tickGroups = new Map<number, any[]>();
  for (const sample of territorySamples) {
    const group = tickGroups.get(sample.tick) ?? [];
    group.push(sample);
    tickGroups.set(sample.tick, group);
  }
  const uniqueTimeSamples = [...tickGroups.values()]
    .filter(group => group.length === 1)
    .map(group => group[0])
    .sort((a, b) => a.tick - b.tick);
  if (uniqueTimeSamples.length < 2) {
    throw new Error(gameId + ": fewer than two unambiguous real territory samples are available for timeline-to-frame verification");
  }
  const indices = uniqueTimeSamples.length >= 3
    ? [0, Math.floor((uniqueTimeSamples.length - 1) / 2), uniqueTimeSamples.length - 1]
    : [0, uniqueTimeSamples.length - 1];
  const checks = [...new Set(indices)].map(index => {
    const source = uniqueTimeSamples[index];
    // Replay ticks are ten per second. Use the tick captured by ReplayReader,
    // not a synthetic fixture time or an inferred frame number.
    const timelineSeconds = source.tick / 10;
    const selected = selectTerritorySample(samples, timelineSeconds);
    if (!selected || selected.tick !== source.tick || selected.frame !== source.frame) {
      throw new Error(
        gameId + ": timeline " + timelineSeconds + "s selected " +
        (selected ? "tick " + selected.tick + " / frame " + selected.frame : "no engine sample") +
        " instead of actual tick " + source.tick + " / frame " + source.frame
      );
    }
    return { timelineSeconds, sourceTick: source.tick, sourceFrame: source.frame,
      selectedTick: selected.tick, selectedFrame: selected.frame };
  });
  if (checks.length < 2 || new Set(checks.map(check => check.sourceTick)).size < 2) {
    throw new Error(gameId + ": timeline verification did not cover two distinct real replay times");
  }
  return checks;
}


declare global {
  interface Window {
    __setBatchReplay?: (gameId: string, record: unknown) => void;
    __runBatchReplayTest?: (gameIds: string[]) => Promise<{ summary: unknown; outcomes: Array<any> }>;
    __verifyBatchStoreTest?: () => Promise<Array<any>>;
    __prepareLegacyMatchStore?: () => Promise<void>;
    __verifyPlayerIndexTest?: () => Promise<{ indexPresent: boolean; playerAMatches: string[]; playerBMatches: string[]; legacyMatches: string[] }>;
    __testAbortBatchReplay?: (gameId: string) => Promise<{ aborted: boolean }>;
    __testAbort?: (record: unknown) => Promise<{ aborted: boolean }>;
    __verifyStoreTest?: (gameId: string) => Promise<{ analysisStatus?: string; simulationStatus?: string; sampleCount: number }>;
    __runReplayTest?: (record: unknown, gameId: string) => Promise<{
      status: string;
      verifiedHashes: number;
      samples: number;
      totalTicks: number;
      playerReview: unknown;
      territorySnapshots: number;
      territoryTileCount: number;
      movementSampleCount: number;
    }>;
  }
}


window.__prepareLegacyMatchStore = async () => {
  await new Promise<void>((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase("openfront-replay-coach");
    deletion.onsuccess = () => {
      const request = indexedDB.open("openfront-replay-coach", 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("matches", { keyPath: ["playerId", "game.gameId"] });
        db.createObjectStore("profiles", { keyPath: "playerId" });
        db.createObjectStore("replay-records", { keyPath: ["playerId", "gameId"] });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("matches", "readwrite");
        tx.objectStore("matches").put({
          playerId: "legacy-index-player",
          game: { gameId: "legacy-index-game", map: "CI", mode: "Free For All", type: "Private" },
          status: "loaded",
          updatedAt: 1,
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Could not seed legacy IndexedDB match row")); };
        tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Legacy IndexedDB seed was aborted")); };
      };
      request.onerror = () => reject(request.error ?? new Error("Could not create legacy IndexedDB v2"));
      request.onblocked = () => reject(new Error("Legacy IndexedDB database deletion was blocked"));
    };
    deletion.onerror = () => reject(deletion.error ?? new Error("Could not reset IndexedDB for migration test"));
    deletion.onblocked = () => reject(new Error("IndexedDB reset was blocked by another connection"));
  });
};

window.__runReplayTest = async (record, gameId) => {
  const assets = buildReplayEngineAssets(record);
  const result = await simulateReplay(
    record,
    assets,
    (percent, phase) => {
      const status = document.getElementById("status");
      if (status) status.textContent = `${percent}% — ${phase}`;
    },
    50,
    Array.isArray((record as any)?.info?.players) ? String((record as any).info.players.find((player: any) => player?.clientID)?.clientID ?? "") || null : null,
  );
  await saveImportedMatch("ci-persistence-player", {
    game: { gameId, map: "CI replay", mode: "Free For All", type: "Private" } as any,
    status: "loaded",
    analysisStatus: result.status === "verified" ? "verified" : "unverified",
    simulation: result,
  });
  const territorySamples = result.samples.filter(sample => sample.territory);
  const firstTerritory = territorySamples[0]?.territory ?? null;
  const decodedTerritory = firstTerritory ? decodeTileOwners(firstTerritory) : null;
  return {
    status: result.status,
    verifiedHashes: result.verifiedHashes,
    samples: result.samples.length,
    totalTicks: result.totalTicks,
    playerReview: result.playerReview,
    territorySnapshots: territorySamples.length,
    territoryTileCount: decodedTerritory?.length ?? 0,
    movementSampleCount: result.samples.filter(sample => sample.unitMovements.length > 0).length,
  };
};
document.getElementById("status")!.textContent = "Replay engine test harness ready";

window.__verifyStoreTest = async (gameId) => {
  const matches = await loadImportedMatches("ci-persistence-player");
  const saved = matches.find(item => item.game.gameId === gameId);
  return {
    analysisStatus: saved?.analysisStatus,
    simulationStatus: saved?.simulation?.status,
    sampleCount: saved?.simulation?.samples?.length ?? 0,
  };
};

window.__testAbort = async (record) => {
  const controller = new AbortController();
  const clientId = Array.isArray((record as any)?.info?.players)
    ? String((record as any).info.players[0]?.clientID ?? "") || null
    : null;
  const running = simulateReplay(record, buildReplayEngineAssets(record), () => undefined, 50, clientId, controller.signal);
  window.setTimeout(() => controller.abort(), 50);
  try {
    await running;
    return { aborted: false };
  } catch (error) {
    return { aborted: error instanceof Error && error.name === "AbortError" };
  }
};


/** Render verified real replay output through the production React replay component. */
async function verifyRealReplayReactUi(gameId: string, record: any, result: any, findings: any[]) {
  const container = document.createElement("div");
  container.dataset.realReplayGameId = gameId;
  document.body.appendChild(container);
  const root = createRoot(container);
  const events = findings.flatMap(finding => finding.timestampSeconds === null ? [] : [{
    id: "pro-" + finding.id, title: finding.title, kind: "Strategisches Coaching",
    detail: finding.consequence, time: finding.timestampSeconds, isCoach: true,
  }]).sort((a, b) => a.time - b.time);
  let selectedEventId: string | null = events[0]?.id ?? null;
  const render = () => flushSync(() => root.render(React.createElement(ReplayVisualization, {
    mapName: String(record?.info?.config?.gameMap ?? "Unbekannte Karte"),
    durationSeconds: result.totalTicks / 10, samples: result.samples, findings, events,
    selectedEventId, onSelectEvent: (id: string) => { selectedEventId = id; render(); },
    onOpenReplay: () => undefined,
  })));
  const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  try {
    render(); await nextFrame(); await nextFrame();
    const cards = [...container.querySelectorAll<HTMLButtonElement>(".replay-viz-priority-card")];
    if (cards.length !== findings.length) throw new Error(gameId + ": rendered card count differs from actual findings");
    const checked: any[] = [];
    for (let index = 0; index < findings.length; index++) {
      const finding = findings[index], card = cards[index], cardText = card.textContent ?? "";
      if (finding.matchId !== gameId) throw new Error(gameId + ": cross-match finding " + finding.id);
      for (const [field, value] of [["title", finding.title], ["consequence", finding.consequence], ["alternative", finding.alternative]] as const)
        if (!value || !cardText.includes(value)) throw new Error(gameId + "/" + finding.id + ": card omitted " + field);
      if (finding.timestampSeconds === null) {
        if (!card.disabled || !cardText.includes("Kein genauer Replay-Zeitpunkt"))
          throw new Error(gameId + "/" + finding.id + ": missing timestamp is not visibly unavailable");
        if ([...container.querySelectorAll(".replay-viz-marker")].some(node => node.getAttribute("aria-label")?.includes(finding.title)))
          throw new Error(gameId + "/" + finding.id + ": missing timestamp created a timeline marker");
        checked.push({ id: finding.id, timestampSeconds: null, disabled: true });
        continue;
      }
      if (card.disabled) throw new Error(gameId + "/" + finding.id + ": valid timestamp card is disabled");
      card.click(); await nextFrame(); await nextFrame();
      const details = container.querySelector(".replay-viz-coach-detail")?.textContent ?? "";
      for (const [field, value] of [["decision", finding.decision], ["context", finding.context], ["consequence", finding.consequence], ["alternative", finding.alternative], ["learning rule", finding.learningRule]] as const)
        if (!value || !details.includes(value)) throw new Error(gameId + "/" + finding.id + ": selected detail omitted " + field);
      const seconds = Math.max(0, Math.floor(finding.timestampSeconds));
      const expectedTime = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
      const selectedTime = container.querySelector(".replay-viz-focus-head b")?.textContent;
      if (selectedTime !== expectedTime) throw new Error(gameId + "/" + finding.id + ": timeline time mismatch");
      const selectedSample = selectTerritorySample(result.samples, finding.timestampSeconds);
      if (selectedSample?.territory) {
        const frameText = container.querySelector(".replay-viz-map-head span:last-child")?.textContent;
        if (frameText !== "Engine-Frame " + selectedSample.frame)
          throw new Error(gameId + "/" + finding.id + ": map frame does not match actual engine sample");
      } else if (!container.querySelector(".replay-viz-map-label"))
        throw new Error(gameId + "/" + finding.id + ": missing territory sample is not shown as unavailable");
      if (container.querySelectorAll(".replay-viz-marker.active").length !== 1)
        throw new Error(gameId + "/" + finding.id + ": timeline selection is not unique");
      const evidenceText = [...container.querySelectorAll(".replay-viz-coach-evidence small")].map(node => node.textContent ?? "").join(" ");
      if (!finding.evidence.length || !finding.evidence.every((e: any) => evidenceText.includes(e.label) && evidenceText.includes(e.detail)))
        throw new Error(gameId + "/" + finding.id + ": evidence references are missing from React UI");
      if (!finding.evidence.every((e: any) => e.seconds === finding.timestampSeconds))
        throw new Error(gameId + "/" + finding.id + ": evidence timestamp differs from finding timestamp");
      for (const evidence of finding.evidence) {
        if (evidence.frame !== null) {
          if (!evidenceText.includes("Frame " + evidence.frame) ||
              !result.actionReviews.some((action: any) => action.seconds === finding.timestampSeconds && action.frame === evidence.frame))
            throw new Error(gameId + "/" + finding.id + ": rendered evidence frame is not the exact recorded replay action frame");
        }
      }
      checked.push({ id: finding.id, timestampSeconds: finding.timestampSeconds, selectedTime, selectedFrame: selectedSample?.frame ?? null, evidenceCount: finding.evidence.length });
    }
    return { gameId, map: record?.info?.config?.gameMap, renderedCards: cards.length, timelineMarkers: events.length, checked };
  } finally { root.unmount(); container.remove(); }
}


async function verifyUnavailableReplayReactUi() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (samples: any[]) => flushSync(() => root.render(React.createElement(ReplayVisualization, {
    mapName: "Unavailable-data regression", durationSeconds: 30, samples, findings: [], events: [],
    selectedEventId: null, onSelectEvent: () => undefined, onOpenReplay: () => undefined,
  })));
  const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  try {
    render([]); await nextFrame(); await nextFrame();
    if (!container.querySelector(".replay-viz-no-findings") || container.querySelectorAll(".replay-viz-marker").length)
      throw new Error("Empty replay must show the no-findings state without timeline markers");
    if (!container.querySelector(".replay-viz-map-label") ||
        container.querySelector(".replay-viz-map-head span:last-child")?.textContent !== "Kein Engine-Snapshot")
      throw new Error("Empty replay must explicitly report that no engine snapshot is available");
    render([{
      tick: 50, frame: 999, territory: { width: 2, height: 2, ownerRuns: [1, 3] },
      unitMovements: [], players: [], totalUnits: 0, falloutTiles: 0,
    }]);
    await nextFrame(); await nextFrame();
    if (!container.querySelector(".replay-viz-map-label") ||
        container.querySelector(".replay-viz-territory") ||
        container.querySelector(".replay-viz-map-head span:last-child")?.textContent !== "Kein Engine-Snapshot")
      throw new Error("Malformed/incomplete territory must be rejected and shown as unavailable, not as a real frame");
    return { emptyReplay: "explicitly unavailable", malformedTerritory: "rejected without drawing or fabricated frame" };
  } finally { root.unmount(); container.remove(); }
}

window.__setBatchReplay = (gameId, record) => {
  batchTestRecords.set(gameId, record);
};

window.__runBatchReplayTest = async (gameIds) => {
  const items = gameIds.map(gameId => ({ gameId, record: batchTestRecords.get(gameId) }));
  const outcomes = new Map<string, any>();
  const controller = new AbortController();
  const summary = await runSequentialBatchAnalysis(items, {
    signal: controller.signal,
    getId: item => item.gameId,
    isCompatible: item => Boolean(item.record && assessReplayCompatibility(item.record).engineVersionCompatible),
    analyze: async (item, onProgress, signal) => {
      const record = item.record;
      const selectedPlayer = Array.isArray(record?.info?.players)
        ? record.info.players.find((player: any) => /oligenole/i.test(String(player?.displayName ?? player?.name ?? player?.username ?? "")))
        : null;
      if (!selectedPlayer?.clientID) throw new Error(`Profile player OligenOle missing from ${item.gameId} integration replay`);
      return simulateReplay(record, buildReplayEngineAssets(record), onProgress, 50, String(selectedPlayer.clientID), signal);
    },
    onStatus: async (item, status, result, error) => {
      const selectedClientId = status === "verified" && result?.playerReview?.clientID
        ? String(result.playerReview.clientID)
        : "";
      const report = selectedClientId && result
        ? buildProCoachReport(result.samples as any, result.actionReviews as any, selectedClientId, result.totalTicks / 10)
        : null;
      const repeatedReport = selectedClientId && result
        ? buildProCoachReport(result.samples as any, result.actionReviews as any, selectedClientId, result.totalTicks / 10)
        : null;
      if (report && ["Europe", "Levant"].includes(item.gameId)) {
        if (report.findings.length === 0 || report.findings.length > 3)
          throw new Error(item.gameId + ": expected one to three strategic coaching findings for OligenOle");
        if (JSON.stringify(report.findings.map(finding => finding.id)) !== JSON.stringify(repeatedReport?.findings.map(finding => finding.id)))
          throw new Error(item.gameId + ": strategic finding ranking must be deterministic");
        for (const finding of report.findings) {
          if (finding.seconds !== null && (!Number.isFinite(finding.seconds) || finding.seconds < 0) ||
              !finding.evidence.trim() || !finding.decision.trim() || !finding.consequence.trim() ||
              !finding.alternative.trim() || !finding.trainingRule.trim() || !finding.caveat.trim())
            throw new Error(item.gameId + "/" + finding.id + ": incomplete decision-to-lesson evidence chain");
        }
      }
      const coachingFindings = report && selectedClientId && result
        ? toReplayCoachFindings(report.findings, item.gameId, selectedClientId, result.actionReviews, result.samples)
        : [];
      const actionFrameConvention = status === "verified" && result && ["Europe", "Levant"].includes(item.gameId)
        ? verifyRecordedActionFrameConvention(item.gameId, result)
        : null;
      const timelineFrameChecks = status === "verified" && result && ["Europe", "Levant"].includes(item.gameId)
        ? verifyActualTimelineFrameMapping(item.gameId, result.samples)
        : [];
      const realReactUi = status === "verified" && result && ["Europe", "Levant"].includes(item.gameId)
        ? await verifyRealReplayReactUi(item.gameId, item.record, result, coachingFindings)
        : null;
      const unavailableReactUi = item.gameId === "Europe" ? await verifyUnavailableReplayReactUi() : null;
      outcomes.set(item.gameId, {
        gameId: item.gameId,
        status,
        coachingPlayerName: result?.playerReview?.playerName ?? null,
        detectedFindingCount: report?.findings.length ?? 0,
        coachingFindings: coachingFindings.map(finding => ({
          id: finding.id,
          matchId: finding.matchId,
          timestampSeconds: finding.timestampSeconds,
          priority: finding.priority,
          confidence: finding.confidence,
          evidenceReferences: finding.evidence.length,
          evidence: finding.evidence.map(reference => ({
            kind: reference.kind, seconds: reference.seconds, frame: reference.frame,
          })),
          uncertainty: finding.uncertainty,
          affectedOwnerIds: finding.affectedOwnerIds,
        })),
        timelineFrameChecks,
        actionFrameConvention,
        realReactUi,
        unavailableReactUi,
        verifiedHashes: result?.verifiedHashes ?? 0,
        recordedHashes: Array.isArray(item.record?.turns)
          ? item.record.turns.filter((turn: any) => turn?.hash !== null && turn?.hash !== undefined).length
          : 0,
        error,
      });
      if (status === "verified" || status === "unverified" || status === "unsupported" || status === "failed") {
        await saveImportedMatch("ci-batch-player", {
          game: {
            gameId: item.gameId,
            map: item.record?.info?.config?.gameMap ?? "Unknown",
            mode: item.record?.info?.config?.gameMode ?? "Free For All",
            type: item.record?.info?.config?.gameType ?? "Private",
          } as any,
          result: { record: item.record } as any,
          status: status === "unsupported" ? "engine-mismatch" : "loaded",
          analysisStatus: status,
          simulation: result as any,
          analysisError: error ?? (result as any)?.message,
        });
      }
    },
    onProgress: () => undefined,
  });
  return { summary, outcomes: [...outcomes.values()] };
};

window.__verifyBatchStoreTest = async () => {
  // The match index intentionally omits raw GameRecord payloads. Hydrate each
  // record from the dedicated replay-records store before testing JSON export.
  const index = await loadImportedMatches("ci-batch-player");
  const matches = await Promise.all(index.map(async item => ({
    item,
    hydrated: await loadImportedMatch("ci-batch-player", item.game.gameId),
  })));
  return matches.map(({ item, hydrated }) => ({
    gameId: item.game.gameId,
    status: item.status,
    analysisStatus: item.analysisStatus,
    simulationStatus: item.simulation?.status,
    sampleCount: item.simulation?.samples?.length ?? 0,
    jsonExportRestored: (() => {
      try {
        const record = hydrated?.result?.record;
        const recordGameId = String(record?.info?.gameID ?? record?.game?.info?.gameID ?? "");
        if (!recordGameId) return false;
        const raw = resolveReplayJsonExport(recordGameId, undefined, record, 750 * 1024 * 1024);
        const restored = JSON.parse(raw);
        return String(restored?.info?.gameID ?? restored?.game?.info?.gameID ?? "") === recordGameId;
      } catch { return false; }
    })(),
  }));
};

window.__testAbortBatchReplay = async (gameId) => {
  const record = batchTestRecords.get(gameId);
  if (!record) return { aborted: false };
  return window.__testAbort!(record);
};

window.__verifyPlayerIndexTest = async () => {
  await saveImportedMatch("ci-player-index-a", {
    game: { gameId: "index-a-1", map: "CI", mode: "Free For All", type: "Private" } as any,
    status: "loaded",
  });
  await saveImportedMatch("ci-player-index-a", {
    game: { gameId: "index-a-2", map: "CI", mode: "Free For All", type: "Private" } as any,
    status: "loaded",
  });
  await saveImportedMatch("ci-player-index-b", {
    game: { gameId: "index-b-1", map: "CI", mode: "Free For All", type: "Private" } as any,
    status: "loaded",
  });

  const [playerA, playerB, legacyPlayer] = await Promise.all([
    loadImportedMatches("ci-player-index-a"),
    loadImportedMatches("ci-player-index-b"),
    loadImportedMatches("legacy-index-player"),
  ]);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("openfront-replay-coach");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not inspect match-store indexes"));
  });
  const indexPresent = db.transaction("matches", "readonly")
    .objectStore("matches").indexNames.contains("by-player-id");
  db.close();
  return {
    indexPresent,
    playerAMatches: playerA.map(item => item.game.gameId).sort(),
    playerBMatches: playerB.map(item => item.game.gameId).sort(),
    legacyMatches: legacyPlayer.map(item => item.game.gameId).sort(),
  };
};

