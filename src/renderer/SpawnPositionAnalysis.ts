export interface SpawnPlayerRef {
  id: number;
  clientID: string | null;
  name: string;
  /** Exact TileRef selected by the player in OpenFront's spawn phase. */
  spawnTile?: number | null;
}

export interface SpawnPositionMetric {
  id: number;
  clientID: string | null;
  name: string;
  startTiles: number;
  /** Territory centroid; not the selected spawn coordinate. */
  centerX: number;
  centerY: number;
  /** Exact spawn TileRef and map coordinates, when present in the replay. */
  spawnTile: number | null;
  spawnX: number | null;
  spawnY: number | null;
  adjacentRivals: number[];
  rivalBorderContacts: number;
  nearestRivalDistance: number | null;
  /** Manhattan distance to the nearest other recorded spawn, matching the engine's spawn-spacing metric. */
  nearestSpawnDistance: number | null;
  /** Metrics below are null when the exact map terrain could not be loaded. */
  spawnZoneLandTiles: number | null;
  spawnZoneTotalTiles: number | null;
  nearbyNeutralLandTiles: number | null;
  nearbyCoastalLandTiles: number | null;
  nearbyImpassableTiles: number | null;
  nearbyHighlandTiles: number | null;
  nearbyMountainTiles: number | null;
  mapEdgeDistance: number | null;
  classification: "isolated" | "contested" | "mixed" | "unknown";
}

const OWNER_MASK = 0x0fff;
const LAND_BIT = 1 << 7;
const OCEAN_BIT = 1 << 5;
const MAGNITUDE_MASK = 0x1f;
const IMPASSABLE_MAGNITUDE = 31;
const SPAWN_RADIUS = 4;
const CONTEXT_RADIUS = 12;

function isLand(terrain: number): boolean {
  return (terrain & LAND_BIT) !== 0;
}

function isImpassable(terrain: number): boolean {
  return isLand(terrain) && (terrain & MAGNITUDE_MASK) === IMPASSABLE_MAGNITUDE;
}

function hasOceanNeighbor(terrain: Uint8Array, ref: number, width: number, height: number): boolean {
  const x = ref % width;
  const y = Math.floor(ref / width);
  return (
    (y > 0 && (terrain[ref - width] & OCEAN_BIT) !== 0) ||
    (y + 1 < height && (terrain[ref + width] & OCEAN_BIT) !== 0) ||
    (x > 0 && (terrain[ref - 1] & OCEAN_BIT) !== 0) ||
    (x + 1 < width && (terrain[ref + 1] & OCEAN_BIT) !== 0)
  );
}

/**
 * Uses the actual owner grid and, when supplied, the exact map terrain bytes
 * from the replay's pinned OpenFront engine commit. Spawn coordinates are read
 * from PlayerState.spawnTile; territory centroids are never presented as the
 * player's actual click position.
 */
export function analyzeSpawnPositions(
  tileState: Uint16Array,
  width: number,
  height: number,
  players: readonly SpawnPlayerRef[],
  terrainState?: Uint8Array,
): SpawnPositionMetric[] {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    tileState.length !== width * height
  ) {
    return [];
  }

  const terrain = terrainState?.length === width * height ? terrainState : null;
  const stats = new Map<number, { count: number; x: number; y: number; adjacent: Set<number>; contacts: number }>();
  for (const player of players) {
    stats.set(player.id, { count: 0, x: 0, y: 0, adjacent: new Set(), contacts: 0 });
  }

  for (let ref = 0; ref < tileState.length; ref++) {
    const owner = tileState[ref] & OWNER_MASK;
    const stat = stats.get(owner);
    if (!owner || !stat) continue;
    const x = ref % width;
    const y = Math.floor(ref / width);
    stat.count++;
    stat.x += x;
    stat.y += y;
    const neighbors = [
      y > 0 ? ref - width : -1,
      y + 1 < height ? ref + width : -1,
      x > 0 ? ref - 1 : -1,
      x + 1 < width ? ref + 1 : -1,
    ];
    for (const next of neighbors) {
      if (next < 0) continue;
      const other = tileState[next] & OWNER_MASK;
      if (other && other !== owner && stats.has(other)) {
        stat.adjacent.add(other);
        stat.contacts++;
      }
    }
  }

  const centers = new Map<number, { x: number; y: number }>();
  for (const [id, stat] of stats) {
    if (stat.count) centers.set(id, { x: stat.x / stat.count, y: stat.y / stat.count });
  }

  const raw = players.map((player) => {
    const stat = stats.get(player.id)!;
    const center = centers.get(player.id) ?? null;
    const spawnTile = Number.isInteger(player.spawnTile) &&
      (player.spawnTile as number) >= 0 &&
      (player.spawnTile as number) < tileState.length
      ? player.spawnTile as number
      : null;
    const spawnX = spawnTile === null ? null : spawnTile % width;
    const spawnY = spawnTile === null ? null : Math.floor(spawnTile / width);
    const centroidDistances = center
      ? players
          .filter((other) => other.id !== player.id && centers.has(other.id))
          .map((other) => {
            const otherCenter = centers.get(other.id)!;
            return Math.hypot(center.x - otherCenter.x, center.y - otherCenter.y);
          })
      : [];
    const spawnDistances = spawnTile === null
      ? []
      : players
          .filter((other) => other.id !== player.id && Number.isInteger(other.spawnTile))
          .map((other) => {
            const otherTile = other.spawnTile as number;
            if (otherTile < 0 || otherTile >= tileState.length) return Infinity;
            const otherX = otherTile % width;
            const otherY = Math.floor(otherTile / width);
            return Math.abs((spawnX as number) - otherX) + Math.abs((spawnY as number) - otherY);
          })
          .filter(Number.isFinite);

    let spawnZoneLandTiles: number | null = null;
    let spawnZoneTotalTiles: number | null = null;
    let nearbyNeutralLandTiles: number | null = null;
    let nearbyCoastalLandTiles: number | null = null;
    let nearbyImpassableTiles: number | null = null;
    let nearbyHighlandTiles: number | null = null;
    let nearbyMountainTiles: number | null = null;
    let mapEdgeDistance: number | null = null;

    if (terrain && spawnX !== null && spawnY !== null) {
      let zoneLand = 0;
      let zoneTotal = 0;
      let neutralLand = 0;
      let coastalLand = 0;
      let impassable = 0;
      let highland = 0;
      let mountain = 0;
      const minX = Math.max(0, spawnX - CONTEXT_RADIUS);
      const maxX = Math.min(width - 1, spawnX + CONTEXT_RADIUS);
      const minY = Math.max(0, spawnY - CONTEXT_RADIUS);
      const maxY = Math.min(height - 1, spawnY + CONTEXT_RADIUS);

      for (let y = Math.max(0, spawnY - SPAWN_RADIUS - 1); y <= Math.min(height - 1, spawnY + SPAWN_RADIUS); y++) {
        for (let x = Math.max(0, spawnX - SPAWN_RADIUS - 1); x <= Math.min(width - 1, spawnX + SPAWN_RADIUS); x++) {
          // OpenFront's getSpawnTiles uses a radius-4 Euclidean search whose
          // center is shifted by -0.5 on both axes.
          const dx = x - (spawnX - 0.5);
          const dy = y - (spawnY - 0.5);
          if (dx * dx + dy * dy > SPAWN_RADIUS * SPAWN_RADIUS) continue;
          const ref = y * width + x;
          zoneTotal++;
          const tileTerrain = terrain[ref];
          const owner = tileState[ref] & OWNER_MASK;
          if (isLand(tileTerrain) && !isImpassable(tileTerrain) && (owner === 0 || owner === player.id)) {
            zoneLand++;
          }
        }
      }

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = x - spawnX;
          const dy = y - spawnY;
          if (dx * dx + dy * dy > CONTEXT_RADIUS * CONTEXT_RADIUS) continue;
          const ref = y * width + x;
          const tileTerrain = terrain[ref];
          if (isImpassable(tileTerrain)) {
            impassable++;
            continue;
          }
          if (!isLand(tileTerrain) || (tileState[ref] & OWNER_MASK) !== 0) continue;
          neutralLand++;
          const magnitude = tileTerrain & MAGNITUDE_MASK;
          if (magnitude >= 10 && magnitude < 20) highland++;
          if (magnitude >= 20 && magnitude < IMPASSABLE_MAGNITUDE) mountain++;
          if (hasOceanNeighbor(terrain, ref, width, height)) coastalLand++;
        }
      }

      spawnZoneLandTiles = zoneLand;
      spawnZoneTotalTiles = zoneTotal;
      nearbyNeutralLandTiles = neutralLand;
      nearbyCoastalLandTiles = coastalLand;
      nearbyImpassableTiles = impassable;
      nearbyHighlandTiles = highland;
      nearbyMountainTiles = mountain;
      mapEdgeDistance = Math.min(spawnX, spawnY, width - 1 - spawnX, height - 1 - spawnY);
    }

    return {
      player,
      stat,
      center,
      nearest: centroidDistances.length ? Math.min(...centroidDistances) : null,
      nearestSpawn: spawnDistances.length ? Math.min(...spawnDistances) : null,
      spawnTile,
      spawnX,
      spawnY,
      spawnZoneLandTiles,
      spawnZoneTotalTiles,
      nearbyNeutralLandTiles,
      nearbyCoastalLandTiles,
      nearbyImpassableTiles,
      nearbyHighlandTiles,
      nearbyMountainTiles,
      mapEdgeDistance,
    };
  });

  const humanNearest = raw
    .filter((entry) => entry.player.clientID !== null && entry.nearest !== null)
    .map((entry) => entry.nearest as number)
    .sort((a, b) => a - b);
  const median = humanNearest.length
    ? humanNearest[Math.floor(humanNearest.length / 2)]
    : null;

  return raw.map((entry) => ({
    id: entry.player.id,
    clientID: entry.player.clientID,
    name: entry.player.name,
    startTiles: entry.stat.count,
    centerX: entry.center ? Number(entry.center.x.toFixed(1)) : 0,
    centerY: entry.center ? Number(entry.center.y.toFixed(1)) : 0,
    spawnTile: entry.spawnTile,
    spawnX: entry.spawnX,
    spawnY: entry.spawnY,
    adjacentRivals: [...entry.stat.adjacent],
    rivalBorderContacts: entry.stat.contacts,
    nearestRivalDistance: entry.nearest === null ? null : Number(entry.nearest.toFixed(1)),
    nearestSpawnDistance: entry.nearestSpawn,
    spawnZoneLandTiles: entry.spawnZoneLandTiles,
    spawnZoneTotalTiles: entry.spawnZoneTotalTiles,
    nearbyNeutralLandTiles: entry.nearbyNeutralLandTiles,
    nearbyCoastalLandTiles: entry.nearbyCoastalLandTiles,
    nearbyImpassableTiles: entry.nearbyImpassableTiles,
    nearbyHighlandTiles: entry.nearbyHighlandTiles,
    nearbyMountainTiles: entry.nearbyMountainTiles,
    mapEdgeDistance: entry.mapEdgeDistance,
    classification: !entry.center || entry.nearest === null
      ? "unknown"
      : entry.stat.adjacent.size > 0 && median !== null && entry.nearest <= median
        ? "contested"
        : entry.stat.adjacent.size === 0 && median !== null && entry.nearest > median
          ? "isolated"
          : "mixed",
  }));
}
