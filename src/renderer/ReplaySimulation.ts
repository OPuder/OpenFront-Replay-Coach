import { createReplayWorkers, ReplayReader, gunzipInBrowser } from "./engine/replay-engine.js";

export interface ReplayStateSample {
  tick: number;
  frame: number;
  players: Array<{
    id: number;
    name: string;
    clientID: string | null;
    alive: boolean;
    gold: number;
    troops: number;
    tiles: number;
    units: number;
  }>;
  totalUnits: number;
  falloutTiles: number;
}

export interface ReplaySimulationResult {
  status: "verified" | "unverified";
  totalTicks: number;
  verifiedHashes: number;
  samples: ReplayStateSample[];
  message: string;
}

interface ProcessorResponse {
  type: "progress" | "start" | "append" | "done" | "error";
  percent?: number;
  base?: any;
  append?: any;
  desync?: boolean;
  message?: string;
}
interface EngineAssets { manifest: Record<string,string>; cdnBase: string }

export async function simulateReplay(
  record: any,
  assets: EngineAssets,
  onProgress: (percent: number, phase: string) => void,
  sampleEvery = 50,
): Promise<ReplaySimulationResult> {
  const workers = createReplayWorkers();
  const channel = new MessageChannel();
  workers.engine.postMessage({ type: "connect", port: channel.port1 }, [channel.port1]);
  const readerRef: { current: InstanceType<typeof ReplayReader> | null } = { current: null };
  const samples: ReplayStateSample[] = [];
  let lastSampledFrame = -1;
  const recordedHashCount = (record.turns ?? []).filter((turn: any) => turn.hash !== null && turn.hash !== undefined).length;
  let appendQueue = Promise.resolve();

  const completion = new Promise<ReplaySimulationResult>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      workers.engine.terminate();
      workers.processor.terminate();
      channel.port2.close();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true; cleanup(); reject(error);
    };
    workers.processor.addEventListener("error", (e: ErrorEvent) => fail(new Error(e.message || "Replay-Prozessor fehlgeschlagen")));
    workers.engine.addEventListener("error", (e: ErrorEvent) => fail(new Error(e.message || "OpenFront-Engine fehlgeschlagen")));
    workers.processor.addEventListener("message", async (event: MessageEvent<ProcessorResponse>) => {
      if (settled) return;
      const msg = event.data;
      try {
        if (msg.type === "progress") {
          onProgress(msg.percent ?? 0, "Original-Engine simuliert Spielzüge und prüft Hashes");
        } else if (msg.type === "start" && msg.base) {
          readerRef.current = new ReplayReader(msg.base, gunzipInBrowser);
        } else if (msg.type === "append" && msg.append) {
          appendQueue = appendQueue.then(async () => {
          if (!readerRef.current) throw new Error("Replay-Header fehlt vor dem ersten Frame-Append");
          const reader = readerRef.current;
          reader.append(msg.append);
          const target = reader.header.totalFrames - 1;
          for (let frame = lastSampledFrame < 0 ? 0 : lastSampledFrame + sampleEvery; frame <= target; frame += sampleEvery) {
            await reader.load(reader.chunkOf(frame));
            const state = reader.seek(frame);
            const unitsByOwner = new Map<number, number>();
            for (const unit of state.units.values() as Iterable<any>) unitsByOwner.set(Number(unit.ownerID), (unitsByOwner.get(Number(unit.ownerID)) ?? 0) + 1);
            const players = [...state.players.entries()].map(([id, p]: [number, any]) => ({
              id,
              name: String(p.displayName ?? p.name ?? p.clientID ?? `Spieler ${id}`),
              clientID: p.clientID == null ? null : String(p.clientID),
              alive: Boolean(p.isAlive),
              gold: Number(p.gold ?? 0),
              troops: Number(p.troops ?? 0),
              tiles: Number(p.tilesOwned ?? 0),
              units: unitsByOwner.get(id) ?? 0
            }));
            samples.push({ tick: state.tick, frame, players, totalUnits: state.units.size, falloutTiles: state.falloutTiles });
            lastSampledFrame = frame;
          }
          onProgress(Math.min(99, Math.round((reader.header.totalFrames / Math.max(1, record.turns?.length ?? reader.header.totalFrames)) * 100)), "Spielzustände werden aus Original-Frames rekonstruiert");
          });
          appendQueue.catch(error => fail(error instanceof Error ? error : new Error(String(error))));
        } else if (msg.type === "done") {
          await appendQueue;
          if (settled) return;
          settled = true;
          const totalTicks = readerRef.current?.header.totalFrames ?? 0;
          cleanup();
          resolve({
            status: recordedHashCount > 0 ? "verified" : "unverified",
            totalTicks,
            verifiedHashes: recordedHashCount,
            samples,
            message: recordedHashCount > 0 ? "Simulation abgeschlossen; Hash-Prüfpunkte wurden vom Original-Prozessor abgeglichen." : "Simulation abgeschlossen, aber es waren keine Hash-Prüfpunkte im Replay vorhanden."
          });
        } else if (msg.type === "error") {
          const detail = msg.message ?? "Unbekannter Replay-Fehler";
          fail(new Error(msg.desync ? `Replay-Hash-Abweichung: ${detail}` : detail));
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });

  workers.processor.postMessage({
    record,
    cdnBase: assets.cdnBase,
    assetManifest: assets.manifest,
    engine: channel.port2
  }, [channel.port2]);
  onProgress(0, "Replay wird vorbereitet");
  return completion;
}
