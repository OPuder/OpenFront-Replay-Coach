import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeTileOwners, encodeTileOwners, selectTerritorySample, tileCoordinates } from "../src/renderer/ReplayTerritory.ts";

test("encodes exact owner IDs while ignoring fallout and defense flag bits", () => {
  const input = new Uint16Array([1, 1 | 8192, 2 | 16384, 2, 0, 0]);
  const encoded = encodeTileOwners(input, 3, 2);
  assert.deepEqual(encoded?.ownerRuns, [1, 2, 2, 2, 0, 2]);
  assert.ok(encoded);
  assert.deepEqual([...decodeTileOwners(encoded)], [1, 1, 2, 2, 0, 0]);
});

test("rejects tile buffers whose dimensions do not match", () => {
  assert.equal(encodeTileOwners(new Uint16Array([1, 2]), 2, 2), null);
});

test("rejects malformed or incomplete run data instead of drawing false territory", () => {
  assert.equal(decodeTileOwners({ width: 2, height: 2, ownerRuns: [1, 5] }), null);
  assert.equal(decodeTileOwners({ width: 2, height: 2, ownerRuns: [1] }), null);
  assert.equal(decodeTileOwners({ width: 2, height: 2, ownerRuns: [4096, 4] }), null);
});

test("selects the latest actual snapshot at or before the requested replay time", () => {
  const samples = [
    { tick: 0, territory: { width: 1, height: 1, ownerRuns: [1, 1] } },
    { tick: 100, territory: { width: 1, height: 1, ownerRuns: [2, 1] } },
    { tick: 200, territory: null },
  ];
  assert.equal(selectTerritorySample(samples, 15)?.tick, 100);
  assert.equal(selectTerritorySample(samples, 0)?.tick, 0);
  assert.equal(selectTerritorySample(samples, 30)?.tick, 100);
});

test("converts only valid map tile references to exact grid coordinates", () => {
  assert.deepEqual(tileCoordinates(11, 5, 3), { x: 1, y: 2 });
  assert.equal(tileCoordinates(-1, 5, 3), null);
  assert.equal(tileCoordinates(15, 5, 3), null);
});
