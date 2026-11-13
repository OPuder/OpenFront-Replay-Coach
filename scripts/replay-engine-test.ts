import { simulateReplay } from "../src/renderer/ReplaySimulation";

declare global {
  interface Window {
    __runReplayTest?: (record: unknown, assets: { manifest: Record<string, string>; cdnBase: string }) => Promise<{
      status: string;
      verifiedHashes: number;
      totalTicks: number;
      playerReview: unknown;
    }>;
  }
}

window.__runReplayTest = async (record, assets) => {
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
