import { buildReplayEngineAssets, simulateReplay } from "../src/renderer/ReplaySimulation";
import { loadImportedMatches, saveImportedMatch } from "../src/renderer/matchStore";

declare global {
  interface Window {
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
