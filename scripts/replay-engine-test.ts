import { buildReplayEngineAssets, simulateReplay } from "../src/renderer/ReplaySimulation";
import { loadImportedMatch, loadImportedMatches, saveImportedMatch } from "../src/renderer/matchStore";
import { runSequentialBatchAnalysis } from "../src/renderer/BatchAnalysisRunner";
import { assessReplayCompatibility } from "../src/main/decoder/ReplayCompatibility";
import { resolveReplayJsonExport } from "../src/main/decoder/ReplayJsonExport";

const batchTestRecords = new Map<string, any>();

declare global {
  interface Window {
    __setBatchReplay?: (gameId: string, record: unknown) => void;
    __runBatchReplayTest?: (gameIds: string[]) => Promise<{ summary: unknown; outcomes: Array<any> }>;
    __verifyBatchStoreTest?: () => Promise<Array<any>>;
    __verifyPlayerIndexTest?: () => Promise<{ indexPresent: boolean; playerAMatches: string[]; playerBMatches: string[] }>;
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
  const controller = new AbortController();
  const summary = await runSequentialBatchAnalysis(items, {
    signal: controller.signal,
    getId: item => item.gameId,
    isCompatible: item => Boolean(item.record && assessReplayCompatibility(item.record).engineVersionCompatible),
    analyze: async (item, onProgress, signal) => {
      const record = item.record;
      const clientId = Array.isArray(record?.info?.players)
        ? String(record.info.players.find((player: any) => player?.clientID)?.clientID ?? "") || null
        : null;
      return simulateReplay(record, buildReplayEngineAssets(record), onProgress, 50, clientId, signal);
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

  const [playerA, playerB] = await Promise.all([
    loadImportedMatches("ci-player-index-a"),
    loadImportedMatches("ci-player-index-b"),
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
  };
};

