import assert from "node:assert/strict";
import { test } from "node:test";
import { collectUnitSnapshotMetrics } from "../src/renderer/ReplaySimulation.ts";

test("unit snapshot aggregation counts troops and construction in one traversal", () => {
  let visited = 0;
  const units = (function* () {
    for (const unit of [
      { ownerID: 1, unitType: "City", troops: 0, underConstruction: false, pos: 5, targetTile: null },
      { ownerID: 1, unitType: "Boat", troops: 120, underConstruction: true, isActive: true, pos: 8, targetTile: 10 },
      { ownerID: 2, unitType: "Tank", troops: 50, underConstruction: false, isActive: true, pos: 12, targetTile: 12 },
      { ownerID: 2, unitType: "Tank", troops: 25, underConstruction: false, isActive: false, pos: 12, targetTile: 13 },
      { ownerID: 3, unitType: "Boat", troops: 20, underConstruction: true, isActive: true, pos: 20, targetTile: 101 },
    ]) {
      visited++;
      yield unit;
    }
  })();
  const result = collectUnitSnapshotMetrics(units, 100);
  assert.equal(visited, 5, "the iterable must only be consumed once");
  assert.deepEqual(result.unitCountsByOwner.get(1), { City: 1, Boat: 1 });
  assert.deepEqual(result.unitTroopsByOwner.get(1), { City: 0, Boat: 120 });
  assert.equal(result.unitsUnderConstructionByOwner.get(1), 1);
  assert.deepEqual(result.unitCountsByOwner.get(2), { Tank: 2 });
  assert.deepEqual(result.unitTroopsByOwner.get(2), { Tank: 75 });
  assert.equal(result.unitsUnderConstructionByOwner.has(2), false);
  assert.deepEqual(result.unitMovements, [
    { ownerID: 1, fromTile: 8, targetTile: 10, troops: 120, unitType: "Boat" },
  ]);
});
