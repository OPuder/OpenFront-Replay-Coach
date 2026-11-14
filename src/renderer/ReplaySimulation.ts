import { unwrapGameRecord } from "../main/decoder/GameRecordShape";
import { loadReplayEngineModule } from "./engineRegistry";
import { analyzeSpawnPositions, type SpawnPositionMetric } from "./SpawnPositionAnalysis";

export interface ReplayStateDelta {
  tiles: number;
  gold: number;
  troops: number;
  goldEarned: number;
  tradeGold: number;
  trainGold: number;
  piracyGold: number;
}

export interface ReplayActiveAttackSummary {
  count: number;
  troops: number;
  retreatingCount: number;
}

export interface ReplayStateSample {
  tick: number;
  frame: number;
  players: Array<{
    id: number;
    name: string;
    clientID: string | null;
    /** Exact OpenFront PlayerState.spawnTile selected during the spawn phase. */
    spawnTile: number | null;
    alive: boolean;
    gold: number;
    goldEarned: number;
    tradeGold: number;
    trainGold: number;
    piracyGold: number;
    troops: number;
    tiles: number;
    units: number;
    unitCounts: Record<string, number>;
    unitTroops: Record<string, number>;
    unitsUnderConstruction: number;
    outgoingAttacks: number;
    incomingAttacks: number;
    outgoingAttackDetails: Array<{ id: string; targetID: number; troops: number; retreating: boolean }>;
    incomingAttackDetails: Array<{ id: string; attackerID: number; troops: number; retreating: boolean }>;
    attackTroops: number;
    allies: number;
    alliances: number;
    targets: number;
    betrayals: number;
    isTraitor: boolean;
    isDecaying: boolean;
    inDoomsdayClock: boolean;
  }>;
  totalUnits: number;
  falloutTiles: number;
  spawnPositions?: SpawnPositionMetric[];
}

export interface ReplayFrontContext {
  activeTargetCount: number;
  outgoingTargetIds: number[];
  outgoingAttackCount: number;
  outgoingAttackTroops: number;
  incomingAttackCount: number;
  incomingAttackTroops: number;
  incomingAttackerNames: string[];
}

export interface ReplayTargetPressure {
  incomingAttackCount: number;
  incomingAttackTroops: number;
  otherAttackCount: number;
  otherAttackTroops: number;
  otherAttackerCount: number;
  otherAttackerNames: string[];
  retreatingOtherAttackCount: number;
}

export interface ReplayActionReview {
  frame: number;
  turn: number;
  seconds: number;
  type: string;
  commandTroops: number | null;
  label: string;
  details: string;
  targetId: string | null;
  targetName: string | null;
  targetSmallID: number | null;
  before: ReplayStateDelta | null;
  after: ReplayStateDelta | null;
  delta: ReplayStateDelta | null;
  delta5s: ReplayStateDelta | null;
  delta10s: ReplayStateDelta | null;
  delta30s: ReplayStateDelta | null;
  targetDelta10s: ReplayStateDelta | null;
  targetDelta30s: ReplayStateDelta | null;
  targetAliveBefore: boolean | null;
  targetAliveAt10s: boolean | null;
  targetAliveAt30s: boolean | null;
  ownFrontContextBefore: ReplayFrontContext | null;
  targetPressureBefore: ReplayTargetPressure | null;
  activeAttack10s: ReplayActiveAttackSummary | null;
  activeAttack30s: ReplayActiveAttackSummary | null;
}

export interface ReplaySimulationResult {
  status: "verified" | "unverified";
  totalTicks: number;
  verifiedHashes: number;
  samples: ReplayStateSample[];
  playerReview: null | { playerName: string; clientID: string | null; startTiles: number; endTiles: number; tilesGained: number; startGold: number; endGold: number; startTroops: number; endTroops: number; outgoingAttackSamples: number; longestNoExpansionSeconds: number };
  actionReviews: ReplayActionReview[];
  /** Spawn analysis captured at/after the recorded end of the spawn phase. */
  spawnPositions?: SpawnPositionMetric[] | null;
  spawnPhaseEndTick?: number | null;
  spawnSnapshotTick?: number | null;
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
export interface EngineAssets { manifest: Record<string,string>; cdnBase: string }

/**
 * Loads the terrain binary matching the replay's exact map dimensions from the
 * pinned engine commit. The manifest is used to distinguish normal, compact
 * and mini-map binaries; no current/live map data is consulted.
 */
export async function loadReplayTerrainData(
  assets: EngineAssets,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<Uint8Array | null> {
  if (typeof fetch !== "function") return null;
  const manifestKey = Object.keys(assets.manifest).find((key) => key.endsWith("/manifest.json"));
  if (!manifestKey) return null;
  const manifestUrl = assets.manifest[manifestKey];
  const folder = manifestKey.slice(0, manifestKey.lastIndexOf("/") + 1);
  try {
    const manifestResponse = await fetch(manifestUrl, signal ? { signal } : undefined);
    if (!manifestResponse.ok) return null;
    const manifest = await manifestResponse.json() as Record<string, any>;
    const variants = [
      { key: "map", file: "map.bin" },
      { key: "map4x", file: "map4x.bin" },
      { key: "map16x", file: "map16x.bin" },
    ];
    const match = variants.find(({ key }) =>
      Number(manifest[key]?.width) === width && Number(manifest[key]?.height) === height
    );
    if (!match) return null;
    const terrainUrl = assets.manifest[`${folder}${match.file}`];
    if (!terrainUrl) return null;
    const terrainResponse = await fetch(terrainUrl, signal ? { signal } : undefined);
    if (!terrainResponse.ok) return null;
    const terrain = new Uint8Array(await terrainResponse.arrayBuffer());
    return terrain.length === width * height ? terrain : null;
  } catch {
    // Terrain enriches spawn coaching but must never block a verified replay.
    return null;
  }
}

function replayMapAssetId(value: unknown): string {
  const aliases: Record<string, string> = {
    "tourney 2 teams": "tourney1",
    "tourney 3 teams": "tourney2",
    "tourney 4 teams": "tourney3",
    "tourney 8 teams": "tourney4",
    "amazon river": "amazonriver",
    "bab el-mandeb strait": "babelmandebstrait",
    "world inverted": "worldinverted",
    "southeast asia": "southeastasia",
  };
  const key = String(value ?? "").trim().toLowerCase();
  return aliases[key] ?? key.replace(/[\s.()]+/g, "").replace(/[^a-z0-9_-]/g, "");
}

/**
 * Resolve map assets from the exact public source commit that produced this
 * replay. This avoids depending on the live game's mutable bootstrap manifest.
 */
export function buildReplayEngineAssets(input: unknown): EngineAssets {
  const record = unwrapGameRecord(input);
  const commit = typeof record.gitCommit === "string" ? record.gitCommit.toLowerCase() : "";
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error("Das Replay enthält keine vollständige OpenFront-Engine-Commit-ID.");
  }
  const mapId = replayMapAssetId(record.info?.config?.gameMap ?? record.config?.gameMap);
  if (!/^[a-z0-9_-]{2,80}$/.test(mapId)) {
    throw new Error("Die Karten-ID im Replay kann nicht sicher aufgelöst werden.");
  }
  const base = `https://raw.githubusercontent.com/openfrontio/OpenFrontIO/${commit}/resources/maps/${mapId}/`;
  const manifest: Record<string, string> = {};
  for (const file of ["map.bin", "map4x.bin", "map16x.bin", "manifest.json", "thumbnail.webp"]) {
    manifest[`maps/${mapId}/${file}`] = base + file;
  }
  return { manifest, cdnBase: "" };
}

export async function simulateReplay(
  record: any,
  assets: EngineAssets,
  onProgress: (percent: number, phase: string) => void,
  sampleEvery = 50,
  preferredClientId: string | null = null,
  signal?: AbortSignal,
): Promise<ReplaySimulationResult> {
  record = unwrapGameRecord(record);
  const engineModule = await loadReplayEngineModule(String(record.gitCommit ?? ""));
  if (signal?.aborted) {
    const error = new Error("Replay-Analyse abgebrochen.");
    error.name = "AbortError";
    throw error;
  }
  const { createReplayWorkers, ReplayReader, gunzipInBrowser } = engineModule;
  const workers = createReplayWorkers();
  const channel = new MessageChannel();
  workers.engine.postMessage({ type: "connect", port: channel.port1 }, [channel.port1]);
  const readerRef: { current: InstanceType<typeof ReplayReader> | null } = { current: null };
  const samples: ReplayStateSample[] = [];
  let spawnPositions: SpawnPositionMetric[] | null = null;
  let spawnPhaseEndTick: number | null = null;
  let spawnSnapshotTick: number | null = null;
  let lastSampledFrame = -1;
  const turns: any[] = Array.isArray(record.turns) ? record.turns : [];
  const recordedHashCount = turns.filter((turn: any) => turn.hash !== null && turn.hash !== undefined).length;
  // Keep the regular overview cadence, but also capture the frames immediately
  // before and after every action by the selected player. A 50-frame-only
  // sample can otherwise miss the state change that matters for coaching.
  const sampleFrames = new Set<number>();
  const replayPlayers = Array.isArray(record?.info?.players) ? record.info.players : [];
  const selectedPlayerMeta = preferredClientId
    ? replayPlayers.find((player: any) => String(player?.clientID ?? "") === preferredClientId)
    : replayPlayers.find((player: any) => /oligenole/i.test(String(player?.displayName ?? player?.name ?? player?.username ?? "")));
  const selectedClientId = selectedPlayerMeta?.clientID == null ? null : String(selectedPlayerMeta.clientID);
  const cadence = Math.max(1, Math.floor(sampleEvery));
  // OpenFront decompresses sparse records by inserting empty turns for every
  // omitted game tick. ReplayProcessor then emits one frame per decompressed
  // turn, so frame index equals the original turnNumber (not array position).
  const totalRecordedFrames = Math.max(
    Number(record?.info?.num_turns ?? 0),
    ...turns.map((turn: any) => Number(turn?.turnNumber ?? -1) + 1),
    0,
  );
  for (let frame = 0; frame < totalRecordedFrames; frame += cadence) sampleFrames.add(frame);
  if (selectedClientId) {
    turns.forEach((turn: any) => {
      const frame = Number(turn?.turnNumber);
      if (Number.isInteger(frame) && frame >= 0 &&
          (turn?.intents ?? []).some((intent: any) => String(intent?.clientID ?? "") === selectedClientId)) {
        sampleFrames.add(Math.max(0, frame - 1));
        sampleFrames.add(frame);
        sampleFrames.add(Math.min(totalRecordedFrames - 1, frame + 1));
        // Capture delayed outcome windows as well as the immediate state.
        // 10 game ticks per second: +50/+100/+300 frames = +5/+10/+30 sec.
        for (const offset of [50, 100, 300]) {
          if (frame + offset < totalRecordedFrames) sampleFrames.add(frame + offset);
        }
      }
    });
  }
  const orderedSampleFrames = [...sampleFrames].filter(frame => frame >= 0 && frame < totalRecordedFrames).sort((a,b) => a-b);
  let nextSampleIndex = 0;
  let appendQueue = Promise.resolve();

  const captureSample = async (
    reader: InstanceType<typeof ReplayReader>,
    frame: number,
  ): Promise<ReplayStateSample> => {
    await reader.load(reader.chunkOf(frame));
    const state = reader.seek(frame);
    const unitCountsByOwner = new Map<number, Record<string, number>>();
    const unitTroopsByOwner = new Map<number, Record<string, number>>();
    const unitsUnderConstructionByOwner = new Map<number, number>();
    for (const unit of state.units.values() as Iterable<any>) {
      const ownerID = Number(unit.ownerID);
      const type = String(unit.unitType ?? "unknown");
      const counts = unitCountsByOwner.get(ownerID) ?? {};
      counts[type] = (counts[type] ?? 0) + 1;
      unitCountsByOwner.set(ownerID, counts);
      const troops = unitTroopsByOwner.get(ownerID) ?? {};
      troops[type] = (troops[type] ?? 0) + Number(unit.troops ?? 0);
      unitTroopsByOwner.set(ownerID, troops);
      if (unit.underConstruction) {
        unitsUnderConstructionByOwner.set(ownerID, (unitsUnderConstructionByOwner.get(ownerID) ?? 0) + 1);
      }
    }
    const playerMeta = new Map(reader.header.players.map((p: any) => [p.smallID, p]));
    const players = [...state.players.entries()].map(([id, p]: [number, any]) => {
      const meta: any = playerMeta.get(id) ?? {};
      const outgoingAttacks = Array.isArray(p.outgoingAttacks) ? p.outgoingAttacks : [];
      const incomingAttacks = Array.isArray(p.incomingAttacks) ? p.incomingAttacks : [];
      return {
        id,
        name: String(meta.displayName ?? meta.name ?? meta.username ?? `Spieler ${id}`),
        clientID: meta.clientID == null ? null : String(meta.clientID),
        spawnTile: Number.isInteger(p.spawnTile) ? Number(p.spawnTile) : null,
        alive: Boolean(p.isAlive),
        gold: Number(p.gold ?? 0),
        goldEarned: Number(p.goldEarned ?? 0),
        tradeGold: Number(p.tradeGold ?? 0),
        trainGold: Number(p.trainGold ?? 0),
        piracyGold: Number(p.piracyGold ?? 0),
        troops: Number(p.troops ?? 0),
        tiles: Number(p.tilesOwned ?? 0),
        units: Object.values(unitCountsByOwner.get(id) ?? {}).reduce((sum, value) => sum + value, 0),
        unitCounts: unitCountsByOwner.get(id) ?? {},
        unitTroops: unitTroopsByOwner.get(id) ?? {},
        unitsUnderConstruction: unitsUnderConstructionByOwner.get(id) ?? 0,
        outgoingAttacks: outgoingAttacks.length,
        incomingAttacks: incomingAttacks.length,
        outgoingAttackDetails: outgoingAttacks.map((attack: any) => ({
          id: String(attack.id ?? ""),
          targetID: Number(attack.targetID),
          troops: Number(attack.troops ?? 0),
          retreating: Boolean(attack.retreating),
        })),
        incomingAttackDetails: incomingAttacks.map((attack: any) => ({
          id: String(attack.id ?? ""),
          attackerID: Number(attack.attackerID),
          troops: Number(attack.troops ?? 0),
          retreating: Boolean(attack.retreating),
        })),
        attackTroops: outgoingAttacks.reduce((sum: number, attack: any) => sum + Number(attack.troops ?? 0), 0),
        allies: Array.isArray(p.allies) ? p.allies.length : 0,
        alliances: Array.isArray(p.alliances) ? p.alliances.length : 0,
        targets: Array.isArray(p.targets) ? p.targets.length : 0,
        betrayals: Number(p.betrayals ?? 0),
        isTraitor: Boolean(p.isTraitor),
        isDecaying: Boolean(p.isDecaying),
        inDoomsdayClock: Boolean(p.inDoomsdayClock),
      };
    });
    const spatialState = state as unknown as { tileState?: Uint16Array; terrain?: ReadonlyMap<number, number> };
    const spatialHeader = reader.header as unknown as {
      mapWidth?: number;
      mapHeight?: number;
      spawnPhaseEnd?: { tick: number; startTick: number } | null;
    };
    const recordedSpawnEnd = spatialHeader.spawnPhaseEnd?.tick ?? null;
    const hasRecordedSpawn = players.some((player) => player.spawnTile !== null);
    const isSpawnSnapshot = !spawnPositions &&
      Boolean(spatialState.tileState && spatialHeader.mapWidth && spatialHeader.mapHeight) &&
      hasRecordedSpawn &&
      (recordedSpawnEnd !== null
        ? Number(state.tick) >= recordedSpawnEnd
        : frame === orderedSampleFrames[orderedSampleFrames.length - 1]);
    let spawnPositionsAtSample: SpawnPositionMetric[] | undefined;
    if (isSpawnSnapshot && spatialState.tileState && spatialHeader.mapWidth && spatialHeader.mapHeight) {
      let terrain = await loadReplayTerrainData(assets, spatialHeader.mapWidth, spatialHeader.mapHeight, signal);
      if (terrain && spatialState.terrain) {
        terrain = terrain.slice();
        for (const [ref, byte] of spatialState.terrain) {
          if (Number.isInteger(ref) && ref >= 0 && ref < terrain.length) terrain[ref] = byte;
        }
      }
      spawnPositionsAtSample = analyzeSpawnPositions(
        spatialState.tileState,
        spatialHeader.mapWidth,
        spatialHeader.mapHeight,
        players,
        terrain ?? undefined,
      );
      spawnPositions = spawnPositionsAtSample;
      spawnPhaseEndTick = recordedSpawnEnd;
      spawnSnapshotTick = Number(state.tick);
    }
    return {
      tick: state.tick,
      frame,
      players,
      totalUnits: state.units.size,
      falloutTiles: state.falloutTiles,
      ...(spawnPositionsAtSample ? { spawnPositions: spawnPositionsAtSample } : {}),
    };
  };

  const completion = new Promise<ReplaySimulationResult>((resolve, reject) => {
    let settled = false;
    let abortHandler: (() => void) | null = null;
    const cleanup = () => {
      if (abortHandler) signal?.removeEventListener("abort", abortHandler);
      workers.engine.terminate();
      workers.processor.terminate();
      channel.port2.close();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true; cleanup(); reject(error);
    };
    abortHandler = () => {
      const error = new Error("Replay-Analyse abgebrochen.");
      error.name = "AbortError";
      fail(error);
    };
    signal?.addEventListener("abort", abortHandler, { once: true });
    if (signal?.aborted) {
      abortHandler();
      return;
    }
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
          while (nextSampleIndex < orderedSampleFrames.length && orderedSampleFrames[nextSampleIndex] <= target) {
            const frame = orderedSampleFrames[nextSampleIndex++];
            if (frame <= lastSampledFrame) continue;
            samples.push(await captureSample(reader, frame));
            lastSampledFrame = frame;
          }
          onProgress(Math.min(99, Math.round((reader.header.totalFrames / Math.max(1, totalRecordedFrames)) * 100)), "Spielzustände werden aus Original-Frames rekonstruiert");
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
            samples.push(await captureSample(reader, finalFrame));
            lastSampledFrame = finalFrame;
          }
          cleanup();
          const staticPlayers = readerRef.current?.header.players ?? [];
          const target = selectedClientId
            ? staticPlayers.find((p: any) => String(p.clientID ?? "") === selectedClientId)
            : staticPlayers.find((p: any) => /oligenole/i.test(String(p.displayName ?? p.name ?? p.username ?? "")));
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
            clientID: target.clientID == null ? null : String(target.clientID),
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
          const sampleByFrame = new Map(samples.map(sample => [sample.frame, sample]));
          const replayPlayerMetadata = readerRef.current?.header.players ?? [];
          const metrics = (player: ReplayStateSample["players"][number]) => ({
            tiles: player.tiles,
            gold: player.gold,
            troops: player.troops,
            goldEarned: player.goldEarned,
            tradeGold: player.tradeGold,
            trainGold: player.trainGold,
            piracyGold: player.piracyGold,
          });
          const summarizeFrontContext = (player: ReplayStateSample["players"][number] | undefined): ReplayFrontContext | null => {
            if (!player) return null;
            const activeTargets = new Set(player.outgoingAttackDetails.map(attack => attack.targetID));
            const incomingAttackerIDs = new Set(player.incomingAttackDetails.map(attack => attack.attackerID));
            const nameBySmallID = new Map<number, string>(replayPlayerMetadata.map((meta: any): [number, string] => [Number(meta.smallID), String(meta.displayName ?? meta.name ?? `Spieler ${meta.smallID}`)]));
            return {
              activeTargetCount: activeTargets.size,
              outgoingTargetIds: [...activeTargets],
              outgoingAttackCount: player.outgoingAttackDetails.length,
              outgoingAttackTroops: player.outgoingAttackDetails.reduce((sum, attack) => sum + attack.troops, 0),
              incomingAttackCount: player.incomingAttackDetails.length,
              incomingAttackTroops: player.incomingAttackDetails.reduce((sum, attack) => sum + attack.troops, 0),
              incomingAttackerNames: [...incomingAttackerIDs].map(id => nameBySmallID.get(id) ?? `Spieler ${id}`),
            };
          };
          const summarizeTargetPressure = (
            targetPlayer: ReplayStateSample["players"][number] | null,
            selectedSmallID: number,
          ): ReplayTargetPressure | null => {
            if (!targetPlayer) return null;
            const attacks = targetPlayer.incomingAttackDetails;
            const otherAttacks = attacks.filter(attack => attack.attackerID !== selectedSmallID);
            const otherAttackerIDs = new Set(otherAttacks.map(attack => attack.attackerID));
            const nameBySmallID = new Map<number, string>(replayPlayerMetadata.map((meta: any): [number, string] => [Number(meta.smallID), String(meta.displayName ?? meta.name ?? `Spieler ${meta.smallID}`)]));
            return {
              incomingAttackCount: attacks.length,
              incomingAttackTroops: attacks.reduce((sum, attack) => sum + attack.troops, 0),
              otherAttackCount: otherAttacks.length,
              otherAttackTroops: otherAttacks.reduce((sum, attack) => sum + attack.troops, 0),
              otherAttackerCount: otherAttackerIDs.size,
              otherAttackerNames: [...otherAttackerIDs].map(id => nameBySmallID.get(id) ?? `Spieler ${id}`),
              retreatingOtherAttackCount: otherAttacks.filter(attack => attack.retreating).length,
            };
          };
          const difference = (current: ReturnType<typeof metrics>, before: ReturnType<typeof metrics>) => ({
            tiles: current.tiles - before.tiles,
            gold: current.gold - before.gold,
            troops: current.troops - before.troops,
            goldEarned: current.goldEarned - before.goldEarned,
            tradeGold: current.tradeGold - before.tradeGold,
            trainGold: current.trainGold - before.trainGold,
            piracyGold: current.piracyGold - before.piracyGold,
          });
          const summarizeActiveAttack = (baseFrame: number, offset: number, targetSmallID: number | null): ReplayActiveAttackSummary | null => {
            if (targetSmallID === null || baseFrame + offset >= totalTicks) return null;
            const sample = sampleByFrame.get(baseFrame + offset);
            const actor = sample?.players.find(p => p.id === target.smallID);
            if (!actor) return null;
            const attacks = actor.outgoingAttackDetails.filter(attack => attack.targetID === targetSmallID);
            return {
              count: attacks.length,
              troops: attacks.reduce((sum, attack) => sum + attack.troops, 0),
              retreatingCount: attacks.filter(attack => attack.retreating).length,
            };
          };
          const actionReviews: ReplayActionReview[] = target ? turns.flatMap((turn: any) => {
            const frame = Number(turn?.turnNumber);
            if (!Number.isInteger(frame) || frame < 0 || frame >= totalTicks) return [];
            return (turn?.intents ?? [])
              .filter((intent: any) => String(intent?.clientID ?? "") === String(target.clientID ?? preferredClientId ?? ""))
              .map((intent: any) => {
                const beforeSample = sampleByFrame.get(Math.max(0, frame - 1));
                const afterSample = sampleByFrame.get(Math.min(totalTicks - 1, frame + 1));
                const beforePlayer = beforeSample?.players.find(p => p.id === target.smallID);
                const afterPlayer = afterSample?.players.find(p => p.id === target.smallID);
                const before = beforePlayer ? metrics(beforePlayer) : null;
                const after = afterPlayer ? metrics(afterPlayer) : null;
                const targetId = intent?.type === "attack" && intent?.targetID != null ? String(intent.targetID) : null;
                const targetMeta: any = targetId === null ? null : replayPlayerMetadata.find((player: any) => String(player.id) === targetId);
                const targetSmallID = targetMeta?.smallID == null ? null : Number(targetMeta.smallID);
                const targetName = targetMeta?.displayName ?? targetMeta?.name ?? null;
                const targetBeforePlayer = targetSmallID === null ? null : beforeSample?.players.find(p => p.id === targetSmallID) ?? null;
                const targetDeltaToFrame = (offset: number) => {
                  if (!targetBeforePlayer || frame + offset >= totalTicks) return null;
                  const sample = sampleByFrame.get(frame + offset);
                  const targetAtFrame = sample?.players.find(p => p.id === targetSmallID);
                  if (!targetAtFrame) return null;
                  return difference(metrics(targetAtFrame), metrics(targetBeforePlayer));
                };
                const targetAliveAt = (offset: number): boolean | null => {
                  if (targetSmallID === null || frame + offset >= totalTicks) return null;
                  const sample = sampleByFrame.get(frame + offset);
                  const targetAtFrame = sample?.players.find(p => p.id === targetSmallID);
                  return targetAtFrame ? targetAtFrame.alive : null;
                };
                const deltaToFrame = (offset: number) => {
                  if (!beforePlayer || frame + offset >= totalTicks) return null;
                  const sample = sampleByFrame.get(frame + offset);
                  const player = sample?.players.find(p => p.id === target.smallID);
                  if (!player) return null;
                  return difference(metrics(player), metrics(beforePlayer));
                };
                const type = String(intent?.type ?? "unknown");
                const labels: Record<string, string> = {
                  attack: "Angriff",
                  boat: "Bootstransport",
                  build_unit: "Bauentscheidung",
                  upgrade_structure: "Gebäude verbessert",
                  cancel_attack: "Angriff abgebrochen",
                  cancel_boat: "Bootstransport abgebrochen",
                  delete_unit: "Einheit entfernt",
                  target_player: "Gegner fokussiert",
                  donate_gold: "Gold gespendet",
                  donate_troops: "Truppen gespendet",
                };
                return {
                  frame,
                  turn: Number(turn?.turnNumber ?? frame),
                  seconds: Number(turn?.turnNumber ?? frame) / 10,
                  type,
                  commandTroops: intent?.troops != null && Number.isFinite(Number(intent.troops)) ? Number(intent.troops) : null,
                  label: labels[type] ?? type,
                  targetId,
                  targetName,
                  targetSmallID,
                  details: [
                    intent?.unit ? `Typ: ${intent.unit}` : "",
                    intent?.troops != null ? `Truppen: ${Math.round(Number(intent.troops)).toLocaleString("de-DE")}` : "",
                    targetName ? `Ziel: ${targetName}` : targetId ? `Ziel-ID: ${targetId}` : "",
                    intent?.dst != null ? `Ziel-Feld: ${intent.dst}` : "",
                    intent?.amount != null ? `Menge: ${intent.amount}` : "",
                  ].filter(Boolean).join(" · "),
                  before,
                  after,
                  delta: before && after ? difference(after, before) : null,
                  delta5s: deltaToFrame(50),
                  delta10s: deltaToFrame(100),
                  delta30s: deltaToFrame(300),
                  targetDelta10s: targetDeltaToFrame(100),
                  targetDelta30s: targetDeltaToFrame(300),
                  targetAliveBefore: targetBeforePlayer?.alive ?? null,
                  ownFrontContextBefore: summarizeFrontContext(beforePlayer),
                  targetPressureBefore: summarizeTargetPressure(targetBeforePlayer, target.smallID),
                  targetAliveAt10s: targetAliveAt(100),
                  targetAliveAt30s: targetAliveAt(300),
                  activeAttack10s: summarizeActiveAttack(frame, 100, targetSmallID),
                  activeAttack30s: summarizeActiveAttack(frame, 300, targetSmallID),
                };
              });
          }) : [];
          resolve({
            // processGameRecord resolves only after every recorded hash has been
            // compared. Its first mismatch rejects with ReplayDesyncError.
            status: recordedHashCount > 0 ? "verified" : "unverified",
            totalTicks,
            verifiedHashes: recordedHashCount,
            samples,
            playerReview,
            actionReviews,
            spawnPositions,
            spawnPhaseEndTick,
            spawnSnapshotTick,
            message: recordedHashCount > 0
              ? `Simulation abgeschlossen: Alle ${recordedHashCount.toLocaleString("de-DE")} gespeicherten Hash-Prüfpunkte wurden von der Original-Engine erfolgreich abgeglichen.`
              : "Simulation abgeschlossen, aber das Replay enthält keine Hash-Prüfpunkte. Die Spielzustände wurden rekonstruiert, sind jedoch nicht anhand gespeicherter Hashes verifiziert."
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

  if (signal?.aborted) return completion;
  workers.processor.postMessage({
    record,
    cdnBase: assets.cdnBase,
    assetManifest: assets.manifest,
    engine: channel.port2
  }, [channel.port2]);
  onProgress(0, "Replay wird vorbereitet");
  return completion;
}
