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
  nearbyPlainsTiles: number | null;
  nearbyImpassableTiles: number | null;
  nearbyHighlandTiles: number | null;
  nearbyMountainTiles: number | null;
  mapEdgeDistance: number | null;
  classification: "isolated" | "contested" | "mixed" | "unknown";
}

const OWNER_MASK = 0x0fff;
const LAND_BIT = 1 << 7;
const SHORELINE_BIT = 1 << 6;
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

function isCoastalLand(terrain: number): boolean {
  // Bit 6 is OpenFront's precomputed shoreline marker.
  return isLand(terrain) && (terrain & SHORELINE_BIT) !== 0;
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
    let nearbyPlainsTiles: number | null = null;
    let nearbyImpassableTiles: number | null = null;
    let nearbyHighlandTiles: number | null = null;
    let nearbyMountainTiles: number | null = null;
    let mapEdgeDistance: number | null = null;

    if (terrain && spawnX !== null && spawnY !== null) {
      let zoneLand = 0;
      let zoneTotal = 0;
      let neutralLand = 0;
      let coastalLand = 0;
      let plains = 0;
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
          if (magnitude < 10) plains++;
          if (magnitude >= 10 && magnitude < 20) highland++;
          if (magnitude >= 20 && magnitude < IMPASSABLE_MAGNITUDE) mountain++;
          if (isCoastalLand(tileTerrain)) coastalLand++;
        }
      }

      spawnZoneLandTiles = zoneLand;
      spawnZoneTotalTiles = zoneTotal;
      nearbyNeutralLandTiles = neutralLand;
      nearbyCoastalLandTiles = coastalLand;
      nearbyPlainsTiles = plains;
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
      classificationDistance: spawnDistances.length
        ? Math.min(...spawnDistances)
        : centroidDistances.length ? Math.min(...centroidDistances) : null,
      spawnTile,
      spawnX,
      spawnY,
      spawnZoneLandTiles,
      spawnZoneTotalTiles,
      nearbyNeutralLandTiles,
      nearbyCoastalLandTiles,
      nearbyPlainsTiles,
      nearbyImpassableTiles,
      nearbyHighlandTiles,
      nearbyMountainTiles,
      mapEdgeDistance,
    };
  });

  const humanNearest = raw
    .filter((entry) => entry.player.clientID !== null && entry.classificationDistance !== null)
    .map((entry) => entry.classificationDistance as number)
    .sort((a, b) => a - b);
  const middle = Math.floor(humanNearest.length / 2);
  const median = humanNearest.length
    ? humanNearest.length % 2 === 0
      ? (humanNearest[middle - 1] + humanNearest[middle]) / 2
      : humanNearest[middle]
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
    nearbyPlainsTiles: entry.nearbyPlainsTiles,
    nearbyImpassableTiles: entry.nearbyImpassableTiles,
    nearbyHighlandTiles: entry.nearbyHighlandTiles,
    nearbyMountainTiles: entry.nearbyMountainTiles,
    mapEdgeDistance: entry.mapEdgeDistance,
    classification: !entry.center || entry.classificationDistance === null
      ? "unknown"
      : entry.stat.adjacent.size > 0 && median !== null && entry.classificationDistance <= median
        ? "contested"
        : entry.stat.adjacent.size === 0 && median !== null && entry.classificationDistance > median
          ? "isolated"
          : "mixed",
  }));
}


export interface SpawnAlternativeMetric {
  x: number;
  y: number;
  nearbyNeutralLandTiles: number;
  nearbyCoastalLandTiles: number;
  nearestSpawnDistance: number | null;
  adjacentPlayerCount: number;
  mapEdgeDistance: number;
}

/**
 * Finds a small set of real, manually selectable land centers on the same map.
 * A center is valid for manual spawning when it is unowned land and therefore
 * contributes at least its own tile to OpenFront's radius-4 getSpawnTiles().
 * Ranking is deliberately descriptive (free land, spacing, border pressure),
 * not a win-probability score.
 */
export function analyzeAlternativeSpawnPositions(
  tileState: Uint16Array,
  width: number,
  height: number,
  players: readonly SpawnPlayerRef[],
  terrainState: Uint8Array,
  playerId: number,
  limit = 3,
): SpawnAlternativeMetric[] {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    tileState.length !== width * height ||
    terrainState.length !== width * height ||
    !players.some((player) => player.id === playerId)
  ) {
    return [];
  }

  const stride = width + 1;
  const prefixLength = stride * (height + 1);
  const landPrefix = new Uint32Array(prefixLength);

  for (let y = 0; y < height; y++) {
    let landRow = 0;
    for (let x = 0; x < width; x++) {
      const ref = y * width + x;
      const owner = tileState[ref] & OWNER_MASK;
      const terrain = terrainState[ref];
      if (owner === 0 && isLand(terrain) && !isImpassable(terrain)) {
        landRow++;
      }
      const prefixRef = (y + 1) * stride + x + 1;
      landPrefix[prefixRef] = landPrefix[prefixRef - stride] + landRow;
    }
  }

  const rectangleSum = (prefix: Uint32Array, x0: number, y0: number, x1: number, y1: number) => {
    const left = Math.max(0, x0);
    const top = Math.max(0, y0);
    const right = Math.min(width - 1, x1);
    const bottom = Math.min(height - 1, y1);
    if (left > right || top > bottom) return 0;
    const a = top * stride + left;
    const b = top * stride + right + 1;
    const c = (bottom + 1) * stride + left;
    const d = (bottom + 1) * stride + right + 1;
    return prefix[d] - prefix[b] - prefix[c] + prefix[a];
  };

  const selectedPlayer = players.find((player) => player.id === playerId)!;
  const actualSpawnTile = Number.isInteger(selectedPlayer.spawnTile)
    ? selectedPlayer.spawnTile as number
    : null;
  const otherSpawnTiles = players
    .filter((player) => player.id !== playerId && Number.isInteger(player.spawnTile))
    .map((player) => player.spawnTile as number)
    .filter((tile) => tile >= 0 && tile < tileState.length);
  const step = width * height > 2_000_000 ? 4 : width * height > 500_000 ? 2 : 1;
  const regionColumns = 4;
  const regionRows = 4;
  const regionWidth = Math.ceil(width / regionColumns);
  const regionHeight = Math.ceil(height / regionRows);
  const regionalPools = new Map<number, SpawnAlternativeMetric[]>();

  const isBetter = (a: SpawnAlternativeMetric, b: SpawnAlternativeMetric) => {
    if (a.nearbyNeutralLandTiles !== b.nearbyNeutralLandTiles) {
      return a.nearbyNeutralLandTiles > b.nearbyNeutralLandTiles;
    }
    const aDistance = a.nearestSpawnDistance ?? -1;
    const bDistance = b.nearestSpawnDistance ?? -1;
    if (aDistance !== bDistance) return aDistance > bDistance;
    if (a.adjacentPlayerCount !== b.adjacentPlayerCount) {
      return a.adjacentPlayerCount < b.adjacentPlayerCount;
    }
    if (a.nearbyCoastalLandTiles !== b.nearbyCoastalLandTiles) {
      return a.nearbyCoastalLandTiles > b.nearbyCoastalLandTiles;
    }
    return a.mapEdgeDistance > b.mapEdgeDistance;
  };

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const ref = y * width + x;
      const terrain = terrainState[ref];
      if ((tileState[ref] & OWNER_MASK) !== 0 || !isLand(terrain) || isImpassable(terrain)) continue;

      if (actualSpawnTile !== null) {
        const ownX = actualSpawnTile % width;
        const ownY = Math.floor(actualSpawnTile / width);
        if (Math.abs(x - ownX) + Math.abs(y - ownY) < 20) continue;
      }

      let adjacentPlayerCount = 0;
      const neighbors = [
        y > 0 ? ref - width : -1,
        y + 1 < height ? ref + width : -1,
        x > 0 ? ref - 1 : -1,
        x + 1 < width ? ref + 1 : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0) continue;
        const owner = tileState[neighbor] & OWNER_MASK;
        if (owner !== 0 && owner !== playerId) adjacentPlayerCount++;
      }

      let nearestSpawnDistance: number | null = null;
      if (otherSpawnTiles.length) {
        nearestSpawnDistance = Infinity;
        for (const otherTile of otherSpawnTiles) {
          const otherX = otherTile % width;
          const otherY = Math.floor(otherTile / width);
          nearestSpawnDistance = Math.min(
            nearestSpawnDistance,
            Math.abs(x - otherX) + Math.abs(y - otherY),
          );
        }
      }

      const candidate: SpawnAlternativeMetric = {
        x,
        y,
        nearbyNeutralLandTiles: rectangleSum(landPrefix, x - CONTEXT_RADIUS, y - CONTEXT_RADIUS, x + CONTEXT_RADIUS, y + CONTEXT_RADIUS),
        nearbyCoastalLandTiles: 0,
        nearestSpawnDistance,
        adjacentPlayerCount,
        mapEdgeDistance: Math.min(x, y, width - 1 - x, height - 1 - y),
      };

      const regionId = Math.min(regionRows - 1, Math.floor(y / regionHeight)) * regionColumns +
        Math.min(regionColumns - 1, Math.floor(x / regionWidth));
      const regionPool = regionalPools.get(regionId) ?? [];
      const insertAt = regionPool.findIndex((existing) => isBetter(candidate, existing));
      if (insertAt < 0) {
        if (regionPool.length < 3) regionPool.push(candidate);
      } else {
        regionPool.splice(insertAt, 0, candidate);
        if (regionPool.length > 3) regionPool.pop();
      }
      regionalPools.set(regionId, regionPool);
    }
  }

  // Retaining a few candidates per map region prevents all recommendations
  // from clustering around one unusually large open plain.
  const pool = [...regionalPools.values()].flat();

  // Coastline is only a tie-breaker. Count it for the small retained pool
  // instead of allocating a second full-map prefix buffer (important on mobile).
  for (const candidate of pool) {
    let coastal = 0;
    for (let y = Math.max(0, candidate.y - CONTEXT_RADIUS); y <= Math.min(height - 1, candidate.y + CONTEXT_RADIUS); y++) {
      for (let x = Math.max(0, candidate.x - CONTEXT_RADIUS); x <= Math.min(width - 1, candidate.x + CONTEXT_RADIUS); x++) {
        const ref = y * width + x;
        if ((tileState[ref] & OWNER_MASK) !== 0 || !isLand(terrainState[ref]) || isImpassable(terrainState[ref])) continue;
        if (isCoastalLand(terrainState[ref])) coastal++;
      }
    }
    candidate.nearbyCoastalLandTiles = coastal;
  }
  pool.sort((a,b)=>isBetter(a,b)?-1:isBetter(b,a)?1:0);

  const selected: SpawnAlternativeMetric[] = [];
  for (const candidate of pool) {
    const separated = selected.every((existing) =>
      Math.abs(existing.x - candidate.x) + Math.abs(existing.y - candidate.y) >= 18
    );
    if (separated) selected.push(candidate);
    if (selected.length >= Math.max(1, Math.min(5, Math.floor(limit)))) break;
  }
  return selected;
}
