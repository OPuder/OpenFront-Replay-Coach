import assert from "node:assert/strict";
import { test } from "node:test";
import { getReplayDisplayState } from "../src/renderer/replayPresentation.ts";

const imported = { status: "loaded", result: { gameId: "abc123" } };

test("an unsupported engine is shown once as an imported replay with a clear limitation", () => {
  const state = getReplayDisplayState({ ...imported, status: "engine-mismatch", analysisStatus: "unsupported" });
  assert.equal(state.kind, "engine-missing");
  assert.equal(state.label, "Engine-Version fehlt");
  assert.match(state.detail, /Replay ist gespeichert/);
  assert.match(state.detail, /Aktionen bleiben verfügbar/);
});

test("a hash-verified replay is not confused with a merely compatible engine", () => {
  const state = getReplayDisplayState({ ...imported, analysisStatus: "verified", simulation: { status: "verified" } });
  assert.equal(state.kind, "verified");
  assert.equal(state.label, "Hash-verifiziert");
});

test("engine compatibility without completed analysis remains pending", () => {
  const state = getReplayDisplayState(imported);
  assert.equal(state.kind, "saved");
  assert.equal(state.label, "Bereit zur Analyse");
});

test("a non-verified simulation remains explicitly unverified", () => {
  const state = getReplayDisplayState({ ...imported, analysisStatus: "unverified", simulation: { status: "unverified" } });
  assert.equal(state.kind, "unverified");
  assert.equal(state.label, "Nicht verifiziert");
});

test("an import failure is distinct from an engine mismatch", () => {
  const state = getReplayDisplayState({ status: "failed", error: "network" });
  assert.equal(state.kind, "failed");
  assert.equal(state.label, "Import fehlgeschlagen");
});

test("queued and running work have concise progress states", () => {
  assert.equal(getReplayDisplayState({ status: "queued" }).kind, "queued");
  assert.equal(getReplayDisplayState({ status: "running" }).kind, "running");
});
