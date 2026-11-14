import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeAlternativeSpawnPositions, analyzeSpawnPositions } from '../src/renderer/SpawnPositionAnalysis.ts';

const makeFixture = () => {
  const width = 30;
  const height = 20;
  const owner = new Uint16Array(width * height);
  const terrain = new Uint8Array(width * height).fill(0x80);
  const ref = (x, y) => y * width + x;

  for (const [x, y] of [[5, 5], [6, 5], [5, 6], [6, 6]]) owner[ref(x, y)] = 1;
  for (const [x, y] of [[20, 5], [21, 5], [20, 6], [21, 6]]) owner[ref(x, y)] = 2;

  terrain[ref(8, 7)] = 0x20;
  terrain[ref(9, 8)] = 0x80 | 31;
  terrain[ref(7, 6)] = 0x80 | 12;
  terrain[ref(7, 7)] = 0x80 | 0x40 | 22;

  const players = [
    { id: 1, clientID: 'human-1', name: 'Player 1', spawnTile: ref(5, 5) },
    { id: 2, clientID: 'human-2', name: 'Player 2', spawnTile: ref(20, 5) },
  ];
  return { width, height, owner, terrain, players, ref };
};

test('uses the exact spawn tile and pinned terrain for start-zone coaching', () => {
  const { width, height, owner, terrain, players, ref } = makeFixture();
  const result = analyzeSpawnPositions(owner, width, height, players, terrain);
  const first = result.find((item) => item.id === 1);

  assert.ok(first);
  assert.equal(first.spawnTile, ref(5, 5));
  assert.equal(first.spawnX, 5);
  assert.equal(first.spawnY, 5);
  assert.equal(first.nearestSpawnDistance, 15);
  assert.ok(first.spawnZoneLandTiles > 0);
  assert.ok(first.spawnZoneTotalTiles >= first.spawnZoneLandTiles);
  assert.ok(first.nearbyNeutralLandTiles > 0);
  assert.ok(first.nearbyCoastalLandTiles > 0);
  assert.ok(first.nearbyPlainsTiles > 0);
  assert.ok(first.nearbyImpassableTiles > 0);
  assert.ok(first.nearbyHighlandTiles > 0);
  assert.ok(first.nearbyMountainTiles > 0);
  assert.equal(first.mapEdgeDistance, 5);
});

test('retains exact spawn coordinates when map terrain is unavailable', () => {
  const { width, height, owner, players, ref } = makeFixture();
  const result = analyzeSpawnPositions(owner, width, height, players);
  const first = result.find((item) => item.id === 1);

  assert.ok(first);
  assert.equal(first.spawnTile, ref(5, 5));
  assert.equal(first.spawnX, 5);
  assert.equal(first.spawnY, 5);
  assert.equal(first.nearestSpawnDistance, 15);
  assert.equal(first.nearbyNeutralLandTiles, null);
  assert.equal(first.spawnZoneLandTiles, null);
});

test('rejects malformed owner grids without throwing', () => {
  const { width, height, players } = makeFixture();
  assert.deepEqual(analyzeSpawnPositions(new Uint16Array(3), width, height, players), []);
});

test('ignores invalid spawn TileRefs instead of reading outside the map', () => {
  const { width, height, owner, terrain, players } = makeFixture();
  const result = analyzeSpawnPositions(owner, width, height, [
    { ...players[0], spawnTile: width * height + 10 },
  ], terrain);
  assert.equal(result[0].spawnTile, null);
  assert.equal(result[0].spawnX, null);
  assert.equal(result[0].nearbyNeutralLandTiles, null);
});


test('returns diverse unowned land centers for alternative manual starts', () => {
  const width = 60;
  const height = 40;
  const owner = new Uint16Array(width * height);
  const terrain = new Uint8Array(width * height).fill(0x80);
  const ref = (x, y) => y * width + x;
  for (const [x, y] of [[5, 5], [6, 5], [5, 6], [6, 6]]) owner[ref(x, y)] = 1;
  for (const [x, y] of [[50, 5], [51, 5], [50, 6], [51, 6]]) owner[ref(x, y)] = 2;
  const players = [
    { id: 1, clientID: 'human-1', name: 'Player 1', spawnTile: ref(5, 5) },
    { id: 2, clientID: 'human-2', name: 'Player 2', spawnTile: ref(50, 5) },
  ];

  const alternatives = analyzeAlternativeSpawnPositions(owner, width, height, players, terrain, 1, 3);
  assert.equal(alternatives.length, 3);
  for (const candidate of alternatives) {
    const tile = ref(candidate.x, candidate.y);
    assert.equal(owner[tile] & 0x0fff, 0);
    assert.equal((terrain[tile] & 0x80) !== 0, true);
    assert.ok(candidate.nearbyNeutralLandTiles > 0);
    assert.ok(candidate.nearestSpawnDistance !== null);
    assert.ok(Math.abs(candidate.x - 5) + Math.abs(candidate.y - 5) >= 20);
  }
  for (let i = 0; i < alternatives.length; i++) {
    for (let j = i + 1; j < alternatives.length; j++) {
      assert.ok(Math.abs(alternatives[i].x - alternatives[j].x) + Math.abs(alternatives[i].y - alternatives[j].y) >= 18);
    }
  }
});

test('does not invent alternative spawn coordinates without a valid map grid', () => {
  const width = 10;
  const height = 10;
  const owner = new Uint16Array(width * height);
  const terrain = new Uint8Array(3);
  const players = [{ id: 1, clientID: 'human-1', name: 'Player 1', spawnTile: 55 }];
  assert.deepEqual(analyzeAlternativeSpawnPositions(owner, width, height, players, terrain, 1), []);
});
