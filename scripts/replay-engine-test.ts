import { buildReplayEngineAssets, simulateReplay } from "../src/renderer/ReplaySimulation";
import { loadImportedMatch, loadImportedMatches, loadPlayerLibrary, saveImportedMatch, savePlayerLibrary } from "../src/renderer/matchStore";
import { runSequentialBatchAnalysis } from "../src/renderer/BatchAnalysisRunner";
import { assessReplayCompatibility } from "../src/main/decoder/ReplayCompatibility";
import { resolveReplayJsonExport } from "../src/main/decoder/ReplayJsonExport";
import { buildProCoachReport } from "../src/main/decoder/ProCoachAlgorithm";
import { buildEngineCoachInsights } from "../src/main/decoder/EngineCoachInsights";
import { selectPrimaryCoachInsights } from "../src/main/decoder/CoachInsightSelection";
import { buildReplayTimeline } from "../src/main/decoder/CoachTimeline";
import { buildLongitudinalCoachReport } from "../src/main/decoder/LongitudinalCoach";

const expect = {
  ok(condition: unknown, message = "Expected condition to be truthy"): void {
    if (!condition) throw new Error(message);
  },
  equal(actual: unknown, expected: unknown, message = "Values differ"): void {
    if (!Object.is(actual, expected)) {
      throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
    }
  },
};

const batchTestRecords = new Map<string, any>();

declare global {
  interface Window {
    __setBatchReplay?: (gameId: string, record: unknown) => void;
    __runBatchReplayTest?: (gameIds: string[]) => Promise<{ summary: unknown; outcomes: Array<any>; coaching: Array<any>; longitudinal: any }>;
    __verifyBatchStoreTest?: () => Promise<Array<any>>;
    __verifyPersistedProfileTest?: () => Promise<any>;
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
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(["matches", "profiles"], "readwrite");
        tx.objectStore("profiles").put({
          playerId: "migration-player",
          profile: { displayName: "OligenOle" },
          games: [],
          nextCursor: null,
        });
        tx.objectStore("matches").put({
          playerId: "migration-player",
          game: { gameId: "legacy-replay", map: "Europe", mode: "Free For All", type: "Private" },
          result: { record: { info: { gameID: "legacy-replay" }, turns: [{ turnNumber: 0, hash: "legacy-hash" }] } },
          status: "loaded",
          analysisStatus: "pending",
          updatedAt: 1,
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Could not seed IndexedDB v2 migration fixture")); };
        tx.onabort = () => { db.close(); reject(tx.error ?? new Error("IndexedDB v2 migration fixture was aborted")); };
      };
      request.onerror = () => reject(request.error ?? new Error("Could not create legacy IndexedDB v2"));
      request.onblocked = () => reject(new Error("Legacy IndexedDB database deletion was blocked"));
    };
    deletion.onerror = () => reject(deletion.error ?? new Error("Could not reset IndexedDB for migration test"));
    deletion.onblocked = () => reject(new Error("IndexedDB reset was blocked by another connection"));
  });
};

window.__verifyLegacyMigration = async () => {
  const profile = await loadPlayerLibrary("migration-player");
  const match = await loadImportedMatch("migration-player", "legacy-replay");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("openfront-replay-coach");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not read migrated database version"));
  });
  const version = db.version;
  db.close();
  return {
    version,
    profileName: profile?.profile?.displayName ?? null,
    matchStatus: match?.status ?? null,
    analysisStatus: match?.analysisStatus ?? null,
    replayId: (match?.result?.record as any)?.info?.gameID ?? null,
    replayHash: (match?.result?.record as any)?.turns?.[0]?.hash ?? null,
  };
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
  return {
    status: result.status,
    verifiedHashes: result.verifiedHashes,
    samples: result.samples.length,
    totalTicks: result.totalTicks,
    playerReview: result.playerReview,
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

window.__setBatchReplay = (gameId, record) => {
  batchTestRecords.set(gameId, record);
};

window.__runBatchReplayTest = async (gameIds) => {
  const items = gameIds.map(gameId => ({ gameId, record: batchTestRecords.get(gameId) }));
  const outcomes = new Map<string, any>();
  const coaching = new Map<string, any>();
  const controller = new AbortController();
  const summary = await runSequentialBatchAnalysis(items, {
    signal: controller.signal,
    getId: item => item.gameId,
    isCompatible: item => Boolean(item.record && assessReplayCompatibility(item.record).engineVersionCompatible),
    analyze: async (item, onProgress, signal) => {
      const record = item.record;
      const players = Array.isArray(record?.info?.players) ? record.info.players : [];
      const selected = players.find((player: any) =>
        /oligenole/i.test(String(player?.displayName ?? player?.name ?? player?.username ?? "")));
      if (!selected?.clientID) throw new Error(`Fixture ${item.gameId} does not contain the required OligenOle player`);
      const clientId = String(selected.clientID);
      const simulation = await simulateReplay(record, buildReplayEngineAssets(record), onProgress, 50, clientId, signal);
      if (simulation.status !== "verified") throw new Error(`Fixture ${item.gameId} has no hash-verified simulation`);
      if (simulation.playerReview?.clientID !== clientId) throw new Error(`Simulation selected a different player for ${item.gameId}`);
      if (!simulation.playerReview?.clientID) throw new Error(`No reconstructed player review for ${item.gameId}`);
      if (!/oligenole/i.test(String(simulation.playerReview.playerName ?? ""))) {
        throw new Error(`Original engine player review is not OligenOle for ${item.gameId}: ${simulation.playerReview.playerName}`);
      }


      const samples = simulation.samples.map((sample: any) => ({
        tick: sample.tick,
        frame: sample.frame,
        players: sample.players.map((player: any) => ({
          clientID: player.clientID,
          alive: player.alive,
          tiles: player.tiles,
          gold: player.gold,
          goldEarned: player.goldEarned,
          troops: player.troops,
          outgoingAttackDetails: player.outgoingAttackDetails,
          incomingAttackDetails: player.incomingAttackDetails,
          allies: player.allies,
          betrayals: player.betrayals,
          unitCounts: player.unitCounts,
        })),
      }));
      const actions = simulation.actionReviews.map((action: any) => ({
        seconds: action.seconds, type: action.type, label: action.label, targetName: action.targetName,
        delta10s: action.delta10s ? { tiles: action.delta10s.tiles, gold: action.delta10s.gold, troops: action.delta10s.troops } : null,
        delta30s: action.delta30s ? { tiles: action.delta30s.tiles, gold: action.delta30s.gold, troops: action.delta30s.troops } : null,
        targetDelta30s: action.targetDelta30s ? { tiles: action.targetDelta30s.tiles, gold: action.targetDelta30s.gold, troops: action.targetDelta30s.troops } : null,
        ownFrontContextBefore: action.ownFrontContextBefore, targetPressureBefore: action.targetPressureBefore,
      }));
      const proReport = buildProCoachReport(samples, actions, clientId, simulation.totalTicks / 10);
      const engineInsights = buildEngineCoachInsights(simulation.playerReview as any, simulation.actionReviews as any, simulation.samples as any);
      const selection = selectPrimaryCoachInsights(engineInsights);
      const recordedEvents = simulation.actionReviews.map((action: any) => ({
        time: action.seconds, title: action.label, detail: action.details, kind: action.type, turn: action.turn,
      }));
      const timeline = buildReplayTimeline(recordedEvents, engineInsights);
      const sourceTurns = new Set<number>();
      for (const turn of Array.isArray(record.turns) ? record.turns : []) {
        const sourceFrame = Number(turn?.turnNumber);
        if (Number.isInteger(sourceFrame)) sourceTurns.add(sourceFrame);
      }
      const sampledFrames = simulation.samples
        .map((sample: any) => Number(sample.frame))
        .filter((frame: number) => Number.isInteger(frame))
        .sort((left: number, right: number) => left - right);
      const intents = new Map<number, any[]>();
      for (const turn of Array.isArray(record.turns) ? record.turns : []) {
        const frame = Number(turn?.turnNumber);
        const playerIntents = (turn?.intents ?? []).filter((intent: any) => String(intent?.clientID ?? "") === clientId);
        intents.set(frame, playerIntents);
      }
      for (const action of simulation.actionReviews) {
        const sourceIntents = intents.get(action.frame) ?? [];
        expect.ok(sourceIntents.some((intent: any) => String(intent?.type ?? "unknown") === action.type),
          `Coach action ${action.type} at frame ${action.frame} has no matching original replay intent in ${item.gameId}`);
        expect.equal(action.turn, action.frame, `Replay timeline turn differs from source turn in ${item.gameId}`);
        expect.equal(action.seconds, Number(sourceIntents.length >= 0 ? action.turn : NaN) / 10,
          `Replay action seconds do not match original turnNumber / 10 in ${item.gameId}`);
      }
      for (const entry of timeline) {
        if (entry.id.startsWith("event-") && entry.turn !== null) {
          expect.equal(entry.time, entry.turn / 10);
          expect.ok(intents.has(entry.turn), `Timeline event ${entry.turn} has no source replay turn in ${item.gameId}`);
        }
        if (entry.id.startsWith("coach-")) {
          expect.ok(entry.insight?.evidence?.trim(), `Coach evidence missing in ${item.gameId}`);
          expect.ok(entry.insight?.nextStep?.trim(), `Coach alternative missing in ${item.gameId}`);
          expect.ok(entry.insight?.limitation?.trim(), `Coach limitation missing in ${item.gameId}`);
          expect.ok(Number.isFinite(entry.time) && entry.time >= 0 && entry.time <= simulation.totalTicks / 10);
          const secondsFrame = entry.time * 10;
          expect.ok(Number.isInteger(secondsFrame), `Timed coach marker is not aligned to an original 100ms game tick in ${item.gameId}`);
          const lowerSample = sampledFrames.filter((frame: number) => frame / 10 <= entry.time).at(-1);
          const upperSample = sampledFrames.find((frame: number) => frame / 10 >= entry.time);
          expect.ok(lowerSample !== undefined && upperSample !== undefined,
            `Timed coach marker at ${entry.time}s is outside the reconstructed replay sample range in ${item.gameId}`);
          // State-derived coaching markers may point at an observed reconstruction frame
          // between sparse persisted replay turns. Require the timestamp to be bracketed by
          // actual reconstructed samples; action reviews above remain bound to exact source intents.
          expect.ok(lowerSample <= secondsFrame && upperSample >= secondsFrame,
            `Timed coach marker at ${entry.time}s is not bracketed by original-engine samples in ${item.gameId}`);
          expect.equal(entry.insight?.seconds, entry.time,
            `Coach timeline marker time differs from its production evidence timestamp in ${item.gameId}`);
        }
      }
      // Run the identical immutable replay twice and compare stable coaching outputs.
      // This is intentionally per-replay; different maps/players are not expected to share scores.
      const repeated = await simulateReplay(record, buildReplayEngineAssets(record), () => undefined, 50, clientId, signal);
      if (repeated.status !== "verified" || repeated.verifiedHashes !== simulation.verifiedHashes) {
        throw new Error(`Repeated simulation verification differs for ${item.gameId}`);
      }
      const repeatedSamples = repeated.samples.map((sample: any) => ({
        tick: sample.tick,
        frame: sample.frame,
        players: sample.players.map((player: any) => ({
          clientID: player.clientID,
          alive: player.alive,
          tiles: player.tiles,
          gold: player.gold,
          goldEarned: player.goldEarned,
          troops: player.troops,
          outgoingAttackDetails: player.outgoingAttackDetails,
          incomingAttackDetails: player.incomingAttackDetails,
          allies: player.allies,
          betrayals: player.betrayals,
          unitCounts: player.unitCounts,
        })),
      }));
      const repeatedActions = repeated.actionReviews.map((action: any) => ({
        seconds: action.seconds, type: action.type, label: action.label, targetName: action.targetName,
        delta10s: action.delta10s ? { tiles: action.delta10s.tiles, gold: action.delta10s.gold, troops: action.delta10s.troops } : null,
        delta30s: action.delta30s ? { tiles: action.delta30s.tiles, gold: action.delta30s.gold, troops: action.delta30s.troops } : null,
        targetDelta30s: action.targetDelta30s ? { tiles: action.targetDelta30s.tiles, gold: action.targetDelta30s.gold, troops: action.targetDelta30s.troops } : null,
        ownFrontContextBefore: action.ownFrontContextBefore, targetPressureBefore: action.targetPressureBefore,
      }));
      const repeatedProReport = buildProCoachReport(repeatedSamples, repeatedActions, clientId, repeated.totalTicks / 10);
      const repeatedInsights = buildEngineCoachInsights(repeated.playerReview as any, repeated.actionReviews as any, repeated.samples as any);
      const repeatedTimeline = buildReplayTimeline(repeated.actionReviews.map((action: any) => ({
        time: action.seconds, title: action.label, detail: action.details, kind: action.type, turn: action.turn,
      })), repeatedInsights);
      const stableCoachProjection = (value: any) => ({
        confidence: value.confidence,
        phases: value.phases.map((phase: any) => ({
          id: phase.id, territoryPerMinute: phase.territoryPerMinute,
          incomePerMinute: phase.incomePerMinute, troopChangePerMinute: phase.troopChangePerMinute,
        })),
        findings: value.findings.map((finding: any) => ({
          id: finding.id, priority: finding.priority, decision: finding.decision,
          consequence: finding.consequence, alternative: finding.alternative,
          trainingRule: finding.trainingRule, evidence: finding.evidence, seconds: finding.seconds,
        })),
      });
      const stableInsightProjection = (value: any[]) => value.map(insight => ({
        id: insight.id, kind: insight.kind, title: insight.title,
        evidence: insight.evidence, seconds: insight.seconds, nextStep: insight.nextStep,
        limitation: insight.limitation,
      }));
      const stableTimelineProjection = (value: any[]) => value.map(event => ({
        id: event.id, time: event.time, title: event.title, kind: event.kind,
        turn: event.turn, evidence: event.insight?.evidence ?? null,
      }));
      if (JSON.stringify(stableCoachProjection(proReport)) !== JSON.stringify(stableCoachProjection(repeatedProReport))
        || JSON.stringify(stableInsightProjection(engineInsights)) !== JSON.stringify(stableInsightProjection(repeatedInsights))
        || JSON.stringify(stableTimelineProjection(timeline)) !== JSON.stringify(stableTimelineProjection(repeatedTimeline))) {
        throw new Error(`Replay-to-coaching output is not deterministic for ${item.gameId}`);
      }

      const longitudinalInput = {
        gameId: String(record.info?.gameID ?? record.gameId ?? item.gameId),
        mapName: String(record.info?.config?.gameMap ?? "Unknown"),
        mode: String(record.info?.config?.gameMode ?? "Free For All"),
        type: String(record.info?.config?.gameType ?? "Private"),
        playedAt: record.info?.started ?? record.info?.startDate ?? null,
        durationSeconds: simulation.totalTicks / 10,
        analysisStatus: "verified", simulation,
      };
      const longitudinalEvidence = {
        gameId: longitudinalInput.gameId,
        mode: longitudinalInput.mode,
        type: longitudinalInput.type,
        playerReviewClientId: simulation.playerReview?.clientID ?? null,
        sampleCount: Array.isArray(simulation.samples) ? simulation.samples.length : -1,
        actionCount: Array.isArray(simulation.actionReviews) ? simulation.actionReviews.length : -1,
        finiteActionCount: simulation.actionReviews.filter((action: any) =>
          action && typeof action === "object" && Number.isFinite(action.seconds) && action.seconds >= 0
          && typeof action.type === "string" && action.type.trim().length > 0).length,
      };
      coaching.set(item.gameId, {
        selectedPlayer: simulation.playerReview.playerName, selectedClientId: simulation.playerReview.clientID, clientId,
        verifiedHashes: simulation.verifiedHashes, totalTicks: simulation.totalTicks,
        sampleCount: simulation.samples.length, actionCount: simulation.actionReviews.length,
        proReport, engineInsights, selection, timeline, longitudinalInput,
      });
      return { ...simulation, __longitudinalInput: longitudinalInput } as any;
    },
    onStatus: async (item, status, result, error) => {
      outcomes.set(item.gameId, {
        gameId: item.gameId,
        status,
        verifiedHashes: result?.verifiedHashes ?? 0,
        recordedHashes: Array.isArray(item.record?.turns)
          ? item.record.turns.filter((turn: any) => turn?.hash !== null && turn?.hash !== undefined).length
          : 0,
        error: error ? String(error?.stack ?? error?.message ?? error) : null,
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

  await savePlayerLibrary({
    playerId: "ci-batch-player",
    profile: { displayName: "OligenOle", name: "OligenOle" },
    games: [],
    nextCursor: null,
  } as any);
  const coachingResults = [...coaching.entries()].map(([gameId, value]) => ({ gameId, ...value }));
  const longitudinal = buildLongitudinalCoachReport(coachingResults.map(item => item.longitudinalInput));
  return { summary, outcomes: [...outcomes.values()], coaching: coachingResults, longitudinal };
};

window.__verifyPersistedProfileTest = async () => {
  const stored = await loadPlayerLibrary("ci-batch-player");
  const matches = await loadImportedMatches("ci-batch-player");
  return {
    profilePresent: stored?.playerId === "ci-batch-player",
    profileName: stored?.profile?.displayName ?? stored?.profile?.name ?? null,
    gameIds: matches.map(item => item.game.gameId).sort(),
    verifiedGames: matches.filter(item => item.analysisStatus === "verified" && item.simulation?.status === "verified").map(item => item.game.gameId).sort(),
  };
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

