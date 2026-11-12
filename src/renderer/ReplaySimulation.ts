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
    outgoingAttacks: number;
    incomingAttacks: number;
    attackTroops: number;
    allies: number;
  }>;
  totalUnits: number;
  falloutTiles: number;
}

export interface ReplaySimulationResult {
  status: "verified" | "unverified";
  totalTicks: number;
  verifiedHashes: number;
  samples: ReplayStateSample[];
  playerReview: null | { playerName: string; startTiles: number; endTiles: number; tilesGained: number; startGold: number; endGold: number; startTroops: number; endTroops: number; outgoingAttackSamples: number; longestNoExpansionSeconds: number };
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
  preferredClientId: string | null = null,
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
            const playerMeta = new Map(reader.header.players.map((p: any) => [p.smallID, p]));
            const players = [...state.players.entries()].map(([id, p]: [number, any]) => {
              const meta: any = playerMeta.get(id) ?? {};
              const outgoingAttacks = Array.isArray(p.outgoingAttacks) ? p.outgoingAttacks : [];
              const incomingAttacks = Array.isArray(p.incomingAttacks) ? p.incomingAttacks : [];
              return ({
              id,
              name: String(meta.displayName ?? meta.name ?? meta.username ?? `Spieler ${id}`),
              clientID: meta.clientID == null ? null : String(meta.clientID),
              alive: Boolean(p.isAlive),
              gold: Number(p.gold ?? 0),
              troops: Number(p.troops ?? 0),
              tiles: Number(p.tilesOwned ?? 0),
              units: unitsByOwner.get(id) ?? 0,
              outgoingAttacks: outgoingAttacks.length,
              incomingAttacks: incomingAttacks.length,
              attackTroops: outgoingAttacks.reduce((sum: number, attack: any) => sum + Number(attack.troops ?? 0), 0),
              allies: Array.isArray(p.allies) ? p.allies.length : 0
            });
            });
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
          const finalFrame = totalTicks - 1;
          if (readerRef.current && finalFrame >= 0 && lastSampledFrame !== finalFrame) {
            const reader = readerRef.current;
            await reader.load(reader.chunkOf(finalFrame));
            const state = reader.seek(finalFrame);
            const unitsByOwner = new Map<number, number>();
            for (const unit of state.units.values() as Iterable<any>) unitsByOwner.set(Number(unit.ownerID), (unitsByOwner.get(Number(unit.ownerID)) ?? 0) + 1);
            const playerMeta = new Map(reader.header.players.map((p: any) => [p.smallID, p]));
            const players = [...state.players.entries()].map(([id, p]: [number, any]) => {
              const meta: any = playerMeta.get(id) ?? {};
              const outgoingAttacks = Array.isArray(p.outgoingAttacks) ? p.outgoingAttacks : [];
              const incomingAttacks = Array.isArray(p.incomingAttacks) ? p.incomingAttacks : [];
              return {
                id, name: String(meta.displayName ?? meta.name ?? meta.username ?? `Spieler ${id}`),
                clientID: meta.clientID == null ? null : String(meta.clientID),
                alive: Boolean(p.isAlive), gold: Number(p.gold ?? 0), troops: Number(p.troops ?? 0),
                tiles: Number(p.tilesOwned ?? 0), units: unitsByOwner.get(id) ?? 0,
                outgoingAttacks: outgoingAttacks.length, incomingAttacks: incomingAttacks.length,
                attackTroops: outgoingAttacks.reduce((sum: number, attack: any) => sum + Number(attack.troops ?? 0), 0),
                allies: Array.isArray(p.allies) ? p.allies.length : 0
              };
            });
            samples.push({tick:state.tick,frame:finalFrame,players,totalUnits:state.units.size,falloutTiles:state.falloutTiles});
            lastSampledFrame = finalFrame;
          }
          cleanup();
          const staticPlayers = readerRef.current?.header.players ?? [];
          const target = staticPlayers.find((p: any) => preferredClientId && p.clientID === preferredClientId)
            ?? staticPlayers.find((p: any) => /oligenole/i.test(String(p.displayName ?? p.name ?? p.username ?? "")));
          const playerObservations = target ? samples.map(sample => ({tick:sample.tick, player:sample.players.find(p => p.id === target.smallID)})).filter((x): x is {tick:number;player:NonNullable<typeof x.player>} => Boolean(x.player)) : [];
          const playerSeries = playerObservations.map(x => x.player);
          let longestNoExpansionTicks = 0;
          let flatStartTick = playerObservations[0]?.tick ?? 0;
          for (let i = 1; i < playerObservations.length; i++) {
            if (playerSeries[i].tiles <= playerSeries[i-1].tiles) {
              longestNoExpansionTicks = Math.max(longestNoExpansionTicks, playerObservations[i].tick - flatStartTick);
            } else {
              flatStartTick = playerObservations[i].tick;
            }
          }
          const firstPlayer = playerSeries[0];
          const lastPlayer = playerSeries[playerSeries.length - 1];
          if (playerObservations.length > 1) longestNoExpansionTicks = Math.max(longestNoExpansionTicks, playerObservations[playerObservations.length-1].tick - flatStartTick);
          const playerReview = firstPlayer && lastPlayer ? {
            playerName: target.displayName ?? target.name ?? target.username ?? "Dein Spieler",
            startTiles: firstPlayer.tiles,
            endTiles: lastPlayer.tiles,
            tilesGained: lastPlayer.tiles - firstPlayer.tiles,
            startGold: firstPlayer.gold,
            endGold: lastPlayer.gold,
            startTroops: firstPlayer.troops,
            endTroops: lastPlayer.troops,
            outgoingAttackSamples: playerSeries.reduce((sum, p) => sum + p.outgoingAttacks, 0),
            longestNoExpansionSeconds: Math.round(longestNoExpansionTicks / 10)
          } : null;
          resolve({
            status: recordedHashCount > 0 ? "verified" : "unverified",
            totalTicks,
            verifiedHashes: recordedHashCount,
            samples,
            playerReview,
            message: recordedHashCount > 0 ? "Simulation abgeschlossen; alle gespeicherten Hash-Prüfpunkte wurden ohne Abweichung abgeglichen." : "Simulation abgeschlossen, aber es waren keine Hash-Prüfpunkte im Replay vorhanden."
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
