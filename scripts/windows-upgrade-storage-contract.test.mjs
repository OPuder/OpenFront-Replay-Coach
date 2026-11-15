import test from "node:test";
import assert from "node:assert/strict";
import {
  UpgradeContextError, UpgradeDataLossError, isCoachRendererTarget, assertCoachRendererTarget,
  assertUpgradeSnapshotsEqual,
} from "./windows-upgrade-storage-contract.mjs";
import { UPGRADE_FIXTURE, assertFixtureRelationships } from "./windows-upgrade-fixture.mjs";

const install = "C:\\CI\\OpenFront Replay Coach";
const target = {
  type: "page",
  url: "file:///C:/CI/OpenFront%20Replay%20Coach/resources/app.asar/dist/index.html",
  webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/1",
};
const snapshot = () => ({
  renderer: {
    href: "file:///C:/CI/OpenFront%20Replay%20Coach/resources/app.asar/dist/index.html",
    origin: "null", protocol: "file:", title: "OpenFront Replay Coach", readyState: "complete",
  },
  electron: { userDataPath: "C:\\CI\\AppData\\Roaming\\openfront-replay-coach", appDataPath: "C:\\CI\\AppData\\Roaming" },
  profileIdentity: "C:\\CI\\AppData\\Roaming\\openfront-replay-coach",
  localStorage: { "ofrc:last-player-id": "player-1", "openfront-coach-training-goal": "{\"title\":\"goal\"}" },
  indexedDB: {
    name: "openfront-replay-coach", version: 3,
    stores: [{ name: "profiles", keyPath: "playerId", indexes: [] }, { name: "matches", keyPath: ["playerId", "game.gameId"], indexes: [{ name: "by-player-id", keyPath: "playerId", unique: false }] }, { name: "replay-records", keyPath: ["playerId", "gameId"], indexes: [] }],
    counts: { profiles: 1, matches: 1, "replay-records": 1 },
    records: {
      profiles: [{ playerId: "player-1", games: [{ gameId: "game-1" }] }],
      matches: [{ playerId: "player-1", game: { gameId: "game-1" }, simulation: { status: "verified", samples: [{ tick: 1 }] } }],
      "replay-records": [{ playerId: "player-1", gameId: "game-1", record: { info: { gameID: "game-1" }, turns: [{ turnNumber: 0 }] } }],
    },
  },
});

test("selects only the actual packaged Coach renderer", () => {
  assert.equal(isCoachRendererTarget(target, install), true);
  assert.equal(isCoachRendererTarget({ ...target, url: "file:///C:/CI/other.html" }, install), false);
  assert.equal(isCoachRendererTarget({ ...target, type: "worker" }, install), false);
  assert.equal(isCoachRendererTarget({ ...target, url: "http://localhost:5173/" }, install), false);
  assert.throws(() => assertCoachRendererTarget({ ...target, url: "file:///C:/CI/other.html" }, install), UpgradeContextError);
});

test("classifies a wrong DevTools target and an incomplete renderer as context errors", () => {
  const before = snapshot(), after = snapshot();
  after.renderer.title = "Other page";
  assert.throws(() => assertUpgradeSnapshotsEqual(before, after), UpgradeContextError);
});

test("classifies a changed renderer origin as a context error, not data loss", () => {
  const before = snapshot(), after = snapshot();
  after.renderer.origin = "https://example.invalid";
  assert.throws(() => assertUpgradeSnapshotsEqual(before, after), UpgradeContextError);
});

test("classifies a different Electron userData profile as a context error", () => {
  const before = snapshot(), after = snapshot();
  after.electron.userDataPath = "C:\\CI\\OtherProfile";
  assert.throws(() => assertUpgradeSnapshotsEqual(before, after), UpgradeContextError);
});

test("classifies a changed IndexedDB database identity as a context error", () => {
  const before = snapshot(), after = snapshot();
  after.indexedDB.name = "other-database";
  assert.throws(() => assertUpgradeSnapshotsEqual(before, after), UpgradeContextError);
  const versionChanged = snapshot();
  versionChanged.indexedDB.version = 4;
  assert.throws(() => assertUpgradeSnapshotsEqual(before, versionChanged), UpgradeContextError);
});

test("detects a missing or modified IndexedDB record as data loss", () => {
  const before = snapshot(), after = snapshot();
  after.indexedDB.records.matches[0].simulation.samples = [];
  assert.throws(() => assertUpgradeSnapshotsEqual(before, after), UpgradeDataLossError);
  const missing = snapshot();
  missing.indexedDB.records["replay-records"] = [];
  assert.throws(() => assertUpgradeSnapshotsEqual(before, missing), UpgradeDataLossError);
});

test("detects a missing or modified LocalStorage value as data loss", () => {
  const before = snapshot(), after = snapshot();
  delete after.localStorage["ofrc:last-player-id"];
  assert.throws(() => assertUpgradeSnapshotsEqual(before, after), UpgradeDataLossError);
  const changed = snapshot();
  changed.localStorage["openfront-coach-training-goal"] = "{\"title\":\"changed\"}";
  assert.throws(() => assertUpgradeSnapshotsEqual(before, changed), UpgradeDataLossError);
});

test("accepts complete structured equality including relationships and records", () => {
  assert.equal(assertUpgradeSnapshotsEqual(snapshot(), snapshot()), true);
});


test("validates the complete application fixture and distinguishes baseline setup from post-update data loss", () => {
  const fixtureSnapshot = () => ({
    indexedDB: {
      name: "openfront-replay-coach",
      version: 3,
      stores: [
        { name: "matches", keyPath: ["playerId", "game.gameId"], autoIncrement: false, indexes: [{ name: "by-player-id", keyPath: "playerId", unique: false, multiEntry: false }] },
        { name: "profiles", keyPath: "playerId", autoIncrement: false, indexes: [] },
        { name: "replay-records", keyPath: ["playerId", "gameId"], autoIncrement: false, indexes: [] },
      ],
      counts: { matches: 1, profiles: 1, "replay-records": 1 },
      records: {
        profiles: [UPGRADE_FIXTURE.profile],
        matches: [UPGRADE_FIXTURE.match],
        "replay-records": [UPGRADE_FIXTURE.replay],
      },
    },
  });
  assert.equal(assertFixtureRelationships(fixtureSnapshot(), "baseline"), true);
  const missing = {
    indexedDB: {
      name: "openfront-replay-coach", version: 3, stores: [], counts: {}, records: {}, missing: true,
    },
  };
  assert.throws(() => assertFixtureRelationships(missing, "baseline"), /WINDOWS_UPGRADE_FIXTURE_ERROR/);
  assert.throws(() => assertFixtureRelationships(missing, "updated"), /DATA_LOSS_ERROR/);
});

test("allows additive LocalStorage keys without losing existing user values", () => {
  const before = snapshot(), after = snapshot();
  after.localStorage["new-app-default"] = "created-during-startup";
  assert.equal(assertUpgradeSnapshotsEqual(before, after), true);
});
