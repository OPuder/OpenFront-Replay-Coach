import assert from 'node:assert/strict';
import test from 'node:test';
import { compactBatchMatchForUi, mergeReplayPlayerCounts, preferReplayPlayerCount } from '../src/renderer/AutoLibrarySync.ts';

test('keeps full replay and simulation payloads out of the dashboard match list', () => {
  const entry = {
    game: { gameId: 'memory-budget-match' },
    result: {
      record: { info: { gameID: 'memory-budget-match' }, turns: [{ turnNumber: 1 }] },
      decodedActions: [{ type: 'attack', seconds: 1 }],
      actionAnalysis: { attackCount: 1 },
      engineCompatibility: { engineVersionCompatible: true },
    },
    simulation: {
      status: 'verified',
      totalTicks: 50,
      verifiedHashes: 1,
      samples: [{ tick: 50, players: [{ clientID: 'p1' }] }],
      playerReview: { playerName: 'Player 1', tilesGained: 20 },
      actionReviews: [{ actionType: 'attack', outcome: 'captured' }],
      spawnPositions: [{ clientId: 'p1', x: 10, y: 20 }],
      spawnAlternatives: [{ x: 11, y: 21, score: 5 }],
      message: 'Verified',
    },
    analysisStatus: 'verified',
  };

  const compact = compactBatchMatchForUi(entry);
  assert.notStrictEqual(compact, entry);
  assert.notStrictEqual(compact.result, entry.result);
  assert.notStrictEqual(compact.simulation, entry.simulation);
  assert.equal(compact.result.record, undefined);
  assert.equal(compact.result.decodedActions, undefined);
  assert.deepEqual(compact.simulation.samples, []);
  assert.deepEqual(compact.simulation.actionReviews, []);
  assert.equal(compact.simulation.status, 'verified');
  assert.equal(compact.simulation.totalTicks, 50);
  assert.deepEqual(compact.simulation.playerReview, entry.simulation.playerReview);
  assert.deepEqual(compact.simulation.spawnPositions, entry.simulation.spawnPositions);
  assert.equal(compact.simulation.spawnAlternatives, undefined);

  // Compaction is non-mutating; IndexedDB can retain the full payload.
  assert.equal(entry.result.record.turns.length, 1);
  assert.equal(entry.result.decodedActions.length, 1);
  assert.equal(entry.simulation.samples.length, 1);
  assert.equal(entry.simulation.actionReviews.length, 1);
  assert.equal(entry.simulation.spawnAlternatives.length, 1);
});

test('does not invent a simulation summary for imported but unanalyzed matches', () => {
  const entry = { game: { gameId: 'pending-match' }, result: { record: { turns: [] } }, analysisStatus: 'pending' };
  const compact = compactBatchMatchForUi(entry);
  assert.equal(compact.result.record, undefined);
  assert.equal(compact.simulation, undefined);
  assert.equal(compact.analysisStatus, 'pending');
});

test('uses replay player count when match history incorrectly reports zero', async () => {
  const page = {
    games: [
      { gameId: 'manifest-incomplete', totalPlayers: 0, result: 'incomplete' },
      { gameId: 'normal-match', totalPlayers: 4, result: 'victory' },
    ],
  };
  const entries = [
    { game: { gameId: 'manifest-incomplete', totalPlayers: 0 }, result: { playerCount: 1 } },
    { game: { gameId: 'normal-match', totalPlayers: 4 }, result: { playerCount: 0 } },
  ];
  const normalized = mergeReplayPlayerCounts(page, entries);
  assert.equal(normalized.games[0].totalPlayers, 1);
  assert.equal(normalized.games[0].result, 'incomplete');
  assert.equal(normalized.games[1].totalPlayers, 4);
  assert.equal(page.games[0].totalPlayers, 0);
  assert.equal(preferReplayPlayerCount(page.games[0], 0), page.games[0]);
});
