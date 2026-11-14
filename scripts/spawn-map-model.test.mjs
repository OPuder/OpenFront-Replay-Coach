import assert from "node:assert/strict";
import { test } from "node:test";
import { projectSpawnMapMarker } from "../src/renderer/SpawnMapModel.ts";

test("projects actual map corners to exact visual edges", () => {
  assert.deepEqual(projectSpawnMapMarker(0, 0, 100, 50), { leftPercent: 0, topPercent: 0 });
  assert.deepEqual(projectSpawnMapMarker(99, 49, 100, 50), { leftPercent: 100, topPercent: 100 });
});

test("projects the map center without changing coordinate orientation", () => {
  const marker = projectSpawnMapMarker(49.5, 24.5, 100, 50);
  assert.ok(marker);
  assert.equal(marker.leftPercent, 50);
  assert.equal(marker.topPercent, 50);
});

test("rejects missing dimensions and out-of-map coordinates", () => {
  assert.equal(projectSpawnMapMarker(0, 0, null, 20), null);
  assert.equal(projectSpawnMapMarker(-1, 0, 20, 20), null);
  assert.equal(projectSpawnMapMarker(20, 0, 20, 20), null);
  assert.equal(projectSpawnMapMarker(0, NaN, 20, 20), null);
});
