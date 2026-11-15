export interface EncodedTerritory {
  width: number;
  height: number;
  ownerRuns: number[];
}

/** Pack the low 12 owner bits from OpenFront's R16UI tile-state buffer. */
export function encodeTileOwners(tileState: Uint16Array, width: number, height: number): EncodedTerritory | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      tileState.length !== width * height) return null;
  const ownerRuns: number[] = [];
  let owner = tileState[0] & 0x0fff;
  let count = 0;
  for (let index = 0; index < tileState.length; index++) {
    const next = tileState[index] & 0x0fff;
    if (next === owner) count++;
    else {
      ownerRuns.push(owner, count);
      owner = next;
      count = 1;
    }
  }
  if (count) ownerRuns.push(owner, count);
  return { width, height, ownerRuns };
}

export function isValidTerritorySnapshot(snapshot: EncodedTerritory | null | undefined): snapshot is EncodedTerritory {
  if (!snapshot || !Number.isInteger(snapshot.width) || !Number.isInteger(snapshot.height) ||
      snapshot.width < 1 || snapshot.height < 1 || !Array.isArray(snapshot.ownerRuns) ||
      snapshot.ownerRuns.length % 2 !== 0) return false;
  const expected = snapshot.width * snapshot.height;
  let offset = 0;
  for (let index = 0; index < snapshot.ownerRuns.length; index += 2) {
    const owner = snapshot.ownerRuns[index], count = snapshot.ownerRuns[index + 1];
    if (!Number.isInteger(owner) || owner < 0 || owner > 0x0fff ||
        !Number.isInteger(count) || count < 1 || offset + count > expected) return false;
    offset += count;
  }
  return offset === expected;
}

export function decodeTileOwners(snapshot: EncodedTerritory): Uint16Array | null {
  if (!isValidTerritorySnapshot(snapshot)) return null;
  const owners = new Uint16Array(snapshot.width * snapshot.height);
  let offset = 0;
  for (let index = 0; index < snapshot.ownerRuns.length; index += 2) {
    const owner = snapshot.ownerRuns[index];
    const count = snapshot.ownerRuns[index + 1];
    if (!Number.isInteger(owner) || owner < 0 || owner > 0x0fff ||
        !Number.isInteger(count) || count < 1 || offset + count > owners.length) return null;
    owners.fill(owner, offset, offset + count);
    offset += count;
  }
  return offset === owners.length ? owners : null;
}

export function selectTerritorySample<T extends { tick: number; territory?: EncodedTerritory | null }>(
  samples: readonly T[], seconds: number, ticksPerSecond = 10,
): T | null {
  if (!Number.isFinite(seconds) || !Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0) return null;
  const targetTick = Math.max(0, seconds) * ticksPerSecond;
  let selected: T | null = null;
  for (const sample of samples) {
    if (sample.tick <= targetTick && isValidTerritorySnapshot(sample.territory) && (!selected || sample.tick > selected.tick)) selected = sample;
  }
  return selected;
}

export function tileCoordinates(tile: number, width: number, height: number): { x: number; y: number } | null {
  if (!Number.isInteger(tile) || !Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || tile < 0 || tile >= width * height) return null;
  return { x: tile % width, y: Math.floor(tile / width) };
}
