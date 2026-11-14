import test from "node:test";
import assert from "node:assert/strict";
import { resolveReplayJsonExport } from "../src/main/decoder/ReplayJsonExport.ts";

const record = { info: { gameID: "cUXZaQWePi" }, turns: [{ turnNumber: 1, hash: "abc" }] };

test("uses cached original JSON unchanged", () => {
  const raw = '{ "info": { "gameID": "cUXZaQWePi" }, "turns": [] }';
  assert.equal(resolveReplayJsonExport("cUXZaQWePi", raw, record, 1024), raw);
});

test("rebuilds JSON from a persisted match after process restart", () => {
  const raw = resolveReplayJsonExport("cUXZaQWePi", undefined, record, 1024);
  assert.deepEqual(JSON.parse(raw), record);
});

test("rejects records belonging to another match", () => {
  assert.throws(() => resolveReplayJsonExport("other-game", undefined, record, 1024), /andere Partie/);
});

test("rejects missing persisted source data", () => {
  assert.throws(() => resolveReplayJsonExport("cUXZaQWePi", undefined, undefined, 1024), /nicht mehr verfügbar/);
});

test("rejects invalid JSON and enforces the export size limit", () => {
  assert.throws(() => resolveReplayJsonExport("cUXZaQWePi", "{", undefined, 1024), /keine gültige JSON-Datei/);
  assert.throws(() => resolveReplayJsonExport("cUXZaQWePi", undefined, record, 8), /Exportlimit/);
});
