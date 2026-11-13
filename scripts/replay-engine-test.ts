import { buildReplayEngineAssets, simulateReplay } from "../src/renderer/ReplaySimulation";

declare global {
  interface Window {
    __runReplayTest?: (record: unknown) => Promise<{
      status: string;
      verifiedHashes: number;
      totalTicks: number;
      playerReview: unknown;
    }>;
  }
}

window.__runReplayTest = async (record) => {
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
  return {
    status: result.status,
    verifiedHashes: result.verifiedHashes,
    totalTicks: result.totalTicks,
    playerReview: result.playerReview,
  };
};
document.getElementById("status")!.textContent = "Replay engine test harness ready";
