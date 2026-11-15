import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = path => readFileSync(resolve(process.cwd(), path), "utf8");

const EUROPE = {
  gameId: "c2R2JHZgUi",
  engineCommit: "8b5d071eed95f07c701b32e4c64e95b03f8577c1",
};
const LEVANT = {
  gameId: "dLNCLHCvMK",
  engineCommit: "bc3e3334c573c4959ec6a6745df6826d07233b4d",
};

test("the exact Europe and Levant real-replay fixtures stay aligned across QA and coaching gates", () => {
  const compatibilityWorkflow = read(".github/workflows/replay-compatibility.yml");
  const packageJson = JSON.parse(read("package.json"));
  const coachingTests = read("scripts/pro-coach-algorithm.test.mjs");
  for (const fixture of [EUROPE, LEVANT]) {
    assert.ok(compatibilityWorkflow.includes(fixture.gameId), `compatibility workflow missing ${fixture.gameId}`);
    assert.ok(compatibilityWorkflow.includes(fixture.engineCommit), `compatibility workflow missing exact engine ${fixture.gameId}`);
  }
  assert.match(packageJson.scripts["test:coach"], /public-replay-compatibility\.test\.mjs/);
  assert.match(coachingTests, /buildProCoachReport/);
  assert.match(coachingTests, /buildReplayTimeline/);
});

test("replay import, exact-engine simulation, coaching evidence, and timeline share stable identifiers", () => {
  const compatibility = read("src/main/decoder/ReplayCompatibility.ts");
  const catalog = read("src/main/decoder/ReplayEngineCatalog.ts");
  const simulation = read("src/renderer/ReplaySimulation.ts");
  const proCoach = read("src/main/decoder/ProCoachAlgorithm.ts");
  const timeline = read("src/main/decoder/CoachTimeline.ts");
  assert.match(compatibility, /assessReplayCompatibility/);
  assert.match(catalog, /resolveSupportedEngineCommit/);
  assert.match(simulation, /resolveSupportedEngineCommit/);
  assert.match(simulation, /loadReplayEngineModule/);
  assert.match(proCoach, /export function buildProCoachReport/);
  assert.match(proCoach, /evidence:/);
  assert.match(proCoach, /seconds:/);
  assert.match(timeline, /insight\.seconds === null/);
  assert.match(timeline, /id: `coach-\$\{insight\.id\}`/);
  assert.match(timeline, /time: insight\.seconds/);
});

test("the match store persists summary and raw replay separately and can resume a full match", () => {
  const store = read("src/renderer/matchStore.ts");
  const batch = read("src/renderer/BatchAnalysisRunner.ts");
  const autoSync = read("src/renderer/AutoLibrarySync.ts");
  assert.match(store, /const DB_VERSION = 3/);
  assert.match(store, /const MATCH_STORE = "matches"/);
  assert.match(store, /const REPLAY_STORE = "replay-records"/);
  assert.match(store, /tx\.objectStore\(MATCH_STORE\)\.put\(stored\)/);
  assert.match(store, /tx\.objectStore\(REPLAY_STORE\)\.put\(\{ playerId, gameId: item\.game\.gameId, record \}\)/);
  assert.match(store, /export async function loadImportedMatch/);
  assert.match(store, /const replayRequest = tx\.objectStore\(REPLAY_STORE\)\.get/);
  assert.match(batch, /signal: AbortSignal/);
  assert.match(batch, /if \(signal\.aborted\)/);
  assert.match(batch, /summary\.cancelled = true/);
  assert.match(batch, /onStatus\(item, "failed"/);
  assert.match(autoSync, /selectGamesToAnalyze/);
  assert.match(autoSync, /analysisStatus === "pending"/);
});

test("longitudinal coaching consumes stored match identity and excludes unusable evidence", () => {
  const longitudinal = read("src/main/decoder/LongitudinalCoach.ts");
  assert.match(longitudinal, /export function buildLongitudinalCoachReport/);
  assert.match(longitudinal, /analysisStatus/);
  assert.match(longitudinal, /simulation\.status/);
  assert.match(longitudinal, /hash-verified|verified/i);
  assert.match(longitudinal, /clientId/);
});

test("timeline and primary coach cards consume the same prioritized engine insight", () => {
  const selection = read("src/main/decoder/CoachInsightSelection.ts");
  const timeline = read("src/main/decoder/CoachTimeline.ts");
  const renderer = read("src/renderer/main.tsx");
  assert.match(selection, /selectPrimaryCoachInsights/);
  assert.match(selection, /slice\(0, 3\)/);
  assert.match(timeline, /buildReplayTimeline/);
  assert.match(renderer, /buildReplayTimeline/);
  assert.match(renderer, /selectPrimaryCoachInsights/);
});

test("Windows and Android updates preserve the renderer's existing match database", () => {
  const updater = read("src/main/updater.ts");
  const android = read("android-updater-template/ApkUpdaterPlugin.java");
  const androidWorkflow = read(".github/workflows/update-validation.yml");
  const releaseWorkflow = read(".github/workflows/release-on-main.yml");
  const matchStore = read("src/renderer/matchStore.ts");
  assert.match(matchStore, /const DB_NAME = "openfront-replay-coach"/);
  assert.match(matchStore, /const DB_VERSION = 3/);
  assert.match(updater, /BackupVerified/);
  assert.match(updater, /restored|wiederhergestellt/i);
  assert.match(android, /FileProvider/);
  assert.match(android, /MessageDigest\.getInstance\("SHA-256"\)/);
  assert.match(androidWorkflow, /Test in-place Android update and preserve app data/);
  assert.match(releaseWorkflow, /Install previous published APK and upgrade to exact signed release APK/);
});

test("platform bridge keeps browser renderer isolated from native update implementation", () => {
  const preload = read("src/main/preload.ts");
  const main = read("src/main/main.ts");
  const updateCenter = read("src/renderer/UpdateCenter.tsx");
  assert.match(preload, /getUpdateStatus/);
  assert.match(preload, /installUpdate/);
  assert.match(main, /registerUpdaterIpc/);
  assert.match(updateCenter, /installDesktopUpdate/);
  assert.match(updateCenter, /installAndroidUpdate/);
});

test("integration report makes missing PR contracts explicit instead of silently accepting them", () => {
  const docs = read("docs/INTEGRATION_E2E.md");
  assert.match(docs, /PRs #145 and #147 were open/);
  assert.match(docs, /not main-branch behavior/);
  assert.match(docs, /must not pretend those paths already execute/);
  assert.match(docs, /Europe/);
  assert.match(docs, /Levant/);
});
