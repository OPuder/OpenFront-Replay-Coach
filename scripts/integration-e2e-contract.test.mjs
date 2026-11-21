import assert from "node:assert/strict";
import { test } from "node:test";
import { assessReplayCompatibility } from "../src/main/decoder/ReplayCompatibility.ts";
import { resolveSupportedEngineCommit } from "../src/main/decoder/ReplayEngineCatalog.ts";
import { buildProCoachReport } from "../src/main/decoder/ProCoachAlgorithm.ts";
import { buildEngineCoachInsights } from "../src/main/decoder/EngineCoachInsights.ts";
import { selectPrimaryCoachInsights } from "../src/main/decoder/CoachInsightSelection.ts";
import { buildReplayTimeline } from "../src/main/decoder/CoachTimeline.ts";
import { buildLongitudinalCoachReport } from "../src/main/decoder/LongitudinalCoach.ts";
import { selectGamesToImport, selectGamesToAnalyze } from "../src/renderer/AutoLibrarySync.ts";
import { runSequentialBatchAnalysis } from "../src/renderer/BatchAnalysisRunner.ts";

const EUROPE = {
  gameId: "c2R2JHZgUi",
  engineCommit: "8b5d071eed95f07c701b32e4c64e95b03f8577c1",
};
const LEVANT = {
  gameId: "dLNCLHCvMK",
  engineCommit: "bc3e3334c573c4959ec6a6745df6826d07233b4d",
};

const sample = (tick, overrides = {}) => ({
  tick,
  frame: tick,
  players: [{
    clientID: "oligenole-client",
    alive: true,
    tiles: 100 + Math.floor(tick / 100),
    gold: 500 + tick,
    goldEarned: 100 + tick,
    troops: 300 + Math.floor(tick / 20),
    outgoingAttackDetails: [],
    incomingAttackDetails: [],
    allies: 0,
    betrayals: 0,
    unitCounts: { City: 1 },
    ...overrides,
  }],
});

const review = {
  playerName: "OligenOle",
  clientID: "oligenole-client",
  startTiles: 100,
  endTiles: 180,
  tilesGained: 80,
  startGold: 500,
  endGold: 900,
  startTroops: 300,
  endTroops: 320,
  outgoingAttackSamples: 2,
  longestNoExpansionSeconds: 100,
};

const action = {
  frame: 120,
  turn: 120,
  seconds: 12,
  type: "attack",
  commandTroops: 100,
  label: "Angriff",
  details: "Recorded attack intent",
  targetId: "2",
  targetName: "Opponent",
  targetSmallID: 2,
  before: null,
  after: null,
  delta: null,
  delta5s: null,
  delta10s: { tiles: 1, gold: -10, troops: -20, goldEarned: 5, tradeGold: 0, trainGold: 0, piracyGold: 0 },
  delta30s: { tiles: 3, gold: -30, troops: -60, goldEarned: 20, tradeGold: 0, trainGold: 0, piracyGold: 0 },
  targetDelta10s: null,
  targetDelta30s: { tiles: -2, gold: -10, troops: -20, goldEarned: 0, tradeGold: 0, trainGold: 0, piracyGold: 0 },
  targetAliveBefore: true,
  targetAliveAt10s: true,
  targetAliveAt30s: true,
  ownFrontContextBefore: {
    activeTargetCount: 0, outgoingTargetIds: [], outgoingAttackCount: 0,
    outgoingAttackTroops: 0, incomingAttackCount: 0, incomingAttackTroops: 0,
    incomingAttackerNames: [],
  },
  targetPressureBefore: {
    incomingAttackCount: 0, incomingAttackTroops: 0, otherAttackCount: 0,
    otherAttackTroops: 0, otherAttackerCount: 0, otherAttackerNames: [],
    retreatingOtherAttackCount: 0,
  },
  activeAttack10s: null,
  activeAttack30s: null,
};

const samples = Array.from({ length: 16 }, (_, index) => sample(index * 100));
const actions = Array.from({ length: 4 }, (_, index) => ({
  seconds: 12 + index * 20,
  type: "attack",
  label: "Angriff",
  targetName: "Opponent",
  delta10s: { tiles: 1, gold: -10, troops: -20 },
  delta30s: { tiles: 3, gold: -30, troops: -60 },
  targetDelta30s: { tiles: -2, gold: -10, troops: -20 },
  ownFrontContextBefore: action.ownFrontContextBefore,
  targetPressureBefore: action.targetPressureBefore,
}));

function makeVerifiedMatch(gameId, tileOffset = 0) {
  const matchSamples = samples.map(entry => ({
    ...entry,
    players: entry.players.map(player => ({ ...player, tiles: player.tiles + tileOffset })),
  }));
  return {
    gameId,
    mapName: gameId === EUROPE.gameId ? "Europe" : "Levant",
    mode: "Free For All",
    type: "Private",
    durationSeconds: 160,
    analysisStatus: "verified",
    simulation: {
      status: "verified",
      totalTicks: 1600,
      verifiedHashes: 100,
      samples: matchSamples,
      playerReview: review,
      actionReviews: [action, ...actions],
    },
  };
}

test("Europe and Levant resolve to their exact historical engine commits", () => {
  for (const fixture of [EUROPE, LEVANT]) {
    assert.equal(resolveSupportedEngineCommit(fixture.engineCommit), fixture.engineCommit);
    const result = assessReplayCompatibility({
      gitCommit: fixture.engineCommit,
      turns: [{ turnNumber: 0, hash: "abc" }, { turnNumber: 1, hash: "def" }],
    });
    assert.equal(result.engineVersionCompatible, true);
    assert.equal(result.hashVerificationAvailable, true);
    assert.equal(result.recordedHashCount, 2);
    assert.equal(result.engineCommit, fixture.engineCommit);
  }
});

test("the production coach functions derive phase reports and evidence-backed engine insights", () => {
  const report = buildProCoachReport(samples, actions, "oligenole-client", 160);
  assert.deepEqual(report.phases.map(phase => phase.id), ["early", "mid", "late"]);
  assert.ok(report.dataCoverage.samples > 0);
  assert.ok(report.metrics.length > 0);
  const insights = buildEngineCoachInsights(review, [action], samples);
  assert.ok(insights.length > 0);
  for (const finding of insights) {
    assert.ok(finding.evidence.trim());
    assert.ok(finding.nextStep.trim());
    assert.ok(finding.limitation.trim());
  }
  const selected = selectPrimaryCoachInsights(insights);
  assert.ok(selected.primary.length <= 3);
  assert.ok(selected.primary.every(item => item.kind === "review" || item.kind === "strength"));
});

test("timeline uses source event seconds and omits untimed coaching observations", () => {
  const insights = buildEngineCoachInsights(review, [action], samples);
  const timeline = buildReplayTimeline([
    { time: action.frame / 10, title: action.label, detail: action.details, kind: action.type, turn: action.turn },
  ], insights);
  const recorded = timeline.find(event => event.id === "event-0");
  assert.equal(recorded?.time, action.turn / 10);
  assert.equal(timeline.some(event => event.id.startsWith("coach-") && event.insight?.seconds === null), false);
  for (const event of timeline.filter(item => item.id.startsWith("coach-"))) {
    assert.equal(event.time, event.insight?.seconds);
  }
});

test("longitudinal production analysis consumes verified match data and excludes incomplete evidence", () => {
  const verifiedA = makeVerifiedMatch("real-a");
  const verifiedB = makeVerifiedMatch("real-b", 10);
  const unverified = makeVerifiedMatch("unverified");
  unverified.analysisStatus = "unverified";
  unverified.simulation.status = "unverified";

  const report = buildLongitudinalCoachReport([verifiedA, verifiedB, unverified]);
  assert.equal(report.importedMatches, 3);
  assert.equal(report.verifiedMatches, 2);
  assert.equal(report.excludedMatches, 1);
  assert.equal(report.comparableMatches, 2);
  assert.equal(report.status, "ready");
  assert.deepEqual(report.matchProgress.map(match => match.gameId), ["real-a", "real-b"]);
  assert.ok(report.phaseSummaries.every(phase => Number.isInteger(phase.matchesWithData)));
  assert.ok(report.metricTrends.every(trend => trend.observations >= 0));

  const missingTime = makeVerifiedMatch("missing-time");
  missingTime.playedAt = "not-a-date";
  missingTime.simulation.actionReviews = [
    { type: "attack", seconds: 10, delta30s: { tiles: 0, gold: 0, troops: -20 }, targetDelta30s: null },
    { type: "attack", seconds: Number.NaN, delta30s: { tiles: 99 }, targetDelta30s: { tiles: -99 } },
    { type: "attack", delta30s: { tiles: 99 }, targetDelta30s: { tiles: -99 } },
    null,
  ];
  const incomplete = buildLongitudinalCoachReport([missingTime]);
  assert.equal(incomplete.verifiedMatches, 1);
  assert.equal(incomplete.matchProgress[0].attackFollowThroughSamples, 0);
  assert.equal(incomplete.metricTrends.find(item => item.id === "territory")?.direction, "insufficient-data");

  const ignored = buildLongitudinalCoachReport([unverified]);
  assert.equal(ignored.comparableMatches, 0);
  assert.equal(ignored.status, "insufficient-data");
});
test("automatic history sync imports missing matches and schedules pending analysis", () => {
  const games = [{ gameId: "new-game" }, { gameId: "existing-game" }];
  const existing = [{ game: { gameId: "existing-game" }, result: { record: {} }, status: "loaded" }];
  assert.deepEqual(selectGamesToImport(games, existing).map(game => game.gameId), ["new-game"]);
  const pending = [
    { game: { gameId: "one" }, result: {}, analysisStatus: "pending" },
    { game: { gameId: "two" }, result: {}, analysisStatus: "verified" },
  ];
  assert.deepEqual(selectGamesToAnalyze(pending).map(entry => entry.game.gameId), ["one"]);
});

test("batch runner deduplicates work, isolates unsupported engines, and honours cancellation", async () => {
  const statuses = [];
  const summary = await runSequentialBatchAnalysis(
    [{ id: "a", supported: true }, { id: "a", supported: true }, { id: "b", supported: false }],
    {
      signal: new AbortController().signal,
      getId: item => item.id,
      isCompatible: item => item.supported,
      analyze: async () => ({ status: "verified" }),
      onStatus: (item, status) => statuses.push([item.id, status]),
      onProgress: () => undefined,
    },
  );
  assert.deepEqual(summary, {
    total: 2, completed: 2, verified: 1, unverified: 0,
    unsupported: 1, failed: 0, cancelled: false,
  });
  assert.deepEqual(statuses, [["a", "queued"], ["b", "queued"], ["a", "running"], ["a", "verified"], ["b", "unsupported"]]);

  const controller = new AbortController();
  controller.abort();
  const cancelled = await runSequentialBatchAnalysis([{ id: "cancelled", supported: true }], {
    signal: controller.signal,
    getId: item => item.id,
    isCompatible: item => item.supported,
    analyze: async () => ({ status: "verified" }),
    onStatus: () => undefined,
    onProgress: () => undefined,
  });
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.completed, 0);
});
