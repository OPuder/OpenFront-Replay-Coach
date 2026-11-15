import assert from 'node:assert/strict';
import test from 'node:test';
import { compactBatchMatchForUi } from '../src/renderer/AutoLibrarySync.ts';

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

  // Compaction is non-mutating; IndexedDB can retain the full payload.
  assert.equal(entry.result.record.turns.length, 1);
  assert.equal(entry.result.decodedActions.length, 1);
  assert.equal(entry.simulation.samples.length, 1);
  assert.equal(entry.simulation.actionReviews.length, 1);
});

test('does not invent a simulation summary for imported but unanalyzed matches', () => {
  const entry = { game: { gameId: 'pending-match' }, result: { record: { turns: [] } }, analysisStatus: 'pending' };
  const compact = compactBatchMatchForUi(entry);
  assert.equal(compact.result.record, undefined);
  assert.equal(compact.simulation, undefined);
  assert.equal(compact.analysisStatus, 'pending');
});
