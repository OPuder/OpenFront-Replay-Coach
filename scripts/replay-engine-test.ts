import { buildReplayEngineAssets, simulateReplay } from "../src/renderer/ReplaySimulation";
import { loadImportedMatch, loadImportedMatches, saveImportedMatch } from "../src/renderer/matchStore";
import { runSequentialBatchAnalysis } from "../src/renderer/BatchAnalysisRunner";
import { assessReplayCompatibility } from "../src/main/decoder/ReplayCompatibility";
import { resolveReplayJsonExport } from "../src/main/decoder/ReplayJsonExport";
import { buildProCoachReport } from "../src/main/decoder/ProCoachAlgorithm";
import { buildEngineCoachInsights } from "../src/main/decoder/EngineCoachInsights";
import { selectPrimaryCoachInsights } from "../src/main/decoder/CoachInsightSelection";
import { buildReplayTimeline } from "../src/main/decoder/CoachTimeline";
import { buildLongitudinalCoachReport } from "../src/main/decoder/LongitudinalCoach";

const batchTestRecords = new Map<string, any>();

declare global {
  interface Window {
    __setBatchReplay?: (gameId: string, record: unknown) => void;
    __runBatchReplayTest?: (gameIds: string[]) => Promise<{ summary: unknown; outcomes: Array<any>; coaching: Array<any>; longitudinal: any }>;
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

      const samples = simulation.samples.map((sample: any) => ({
        tick: sample.tick, frame: sample.frame, spawnPositions: (sample as any).spawnPositions,
        players: sample.players.map((player: any) => ({
          clientID: player.clientID, alive: player.alive, tiles: player.tiles,
          gold: player.gold, goldEarned: player.goldEarned, troops: player.troops,
          outgoingAttackDetails: player.outgoingAttackDetails, incomingAttackDetails: player.incomingAttackDetails,
          allies: player.allies, betrayals: player.betrayals, unitCounts: player.unitCounts,
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
      for (const action of simulation.actionReviews) {
        assert.equal(action.seconds, action.frame / 10, `Replay action timestamp does not match source turn in ${item.gameId}`);
      }
      for (const entry of timeline) {
        if (entry.id.startsWith("event-") && entry.turn !== null) assert.equal(entry.time, entry.turn / 10);
        if (entry.id.startsWith("coach-")) {
          assert.ok(entry.insight?.evidence?.trim(), `Coach evidence missing in ${item.gameId}`);
          assert.ok(entry.insight?.nextStep?.trim(), `Coach alternative missing in ${item.gameId}`);
          assert.ok(entry.insight?.limitation?.trim(), `Coach limitation missing in ${item.gameId}`);
          assert.ok(Number.isFinite(entry.time) && entry.time >= 0 && entry.time <= simulation.totalTicks / 10);
        }
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
      coaching.set(item.gameId, {
        selectedPlayer: selected.displayName ?? selected.name ?? selected.username, clientId,
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
  const coachingResults = [...coaching.entries()].map(([gameId, value]) => ({ gameId, ...value }));
  const longitudinal = buildLongitudinalCoachReport(coachingResults.map(item => item.longitudinalInput));
  return { summary, outcomes: [...outcomes.values()], coaching: coachingResults, longitudinal };
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

