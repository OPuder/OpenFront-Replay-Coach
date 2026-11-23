import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeApiGameRecord } from '../src/main/decoder/ApiTurnDecoder.ts';

const record = (turns) => ({
  gitCommit: '8b5d071eed95f07c701b32e4c64e95b03f8577c1',
  info: { gameID: 'decoder-regression', duration: 120, players: [] },
  turns,
});

test('decoder ignores negative, fractional, non-numeric and unsafe turn numbers', () => {
  const decoded = decodeApiGameRecord(record([
    { turnNumber: null, intents: [{ type: 'attack' }] },
    { turnNumber: '', intents: [{ type: 'attack' }] },
    { turnNumber: -1, intents: [{ type: 'attack' }] },
    { turnNumber: 1.5, intents: [{ type: 'attack' }] },
    { turnNumber: 'not-a-turn', intents: [{ type: 'attack' }] },
    { turnNumber: Number.MAX_SAFE_INTEGER + 1, intents: [{ type: 'attack' }] },
    { turnNumber: 20, intents: [{ type: 'build_unit' }] },
  ]));
  assert.equal(decoded.actionCount, 1);
  assert.equal(decoded.actions[0].turn, 20);
  assert.equal(Number.isFinite(decoded.actions[0].seconds), true);
});

test('decoder preserves duplicate valid turns without inventing a new order', () => {
  const decoded = decodeApiGameRecord(record([
    { turnNumber: 10, intents: [{ type: 'attack', clientID: 'p1' }] },
    { turnNumber: 10, intents: [{ type: 'boat', clientID: 'p2' }] },
    { turnNumber: 20, intents: [{ type: 'build_unit', clientID: 'p1' }] },
  ]));
  assert.deepEqual(decoded.actions.map(action => [action.turn, action.type, action.clientId]), [
    [10, 'attack', 'p1'],
    [10, 'boat', 'p2'],
    [20, 'build_unit', 'p1'],
  ]);
});

test('decoder ignores malformed intents but retains unknown well-formed intent types', () => {
  const decoded = decodeApiGameRecord(record([{
    turnNumber: 10,
    intents: [null, undefined, 7, 'attack', [], {}, { type: 0 }, { type: '' }, { type: '   ' }, { type: 'future_engine_intent' }],
  }]));
  assert.equal(decoded.actionCount, 1);
  assert.equal(decoded.actions[0].type, 'future_engine_intent');
  assert.equal(decoded.actions[0].seconds, 1);
});

test('decoder keeps supplied Europe and Levant replay timelines finite and ordered', {
  skip: !process.env.OPENFRONT_REPLAY_FIXTURE_DIR,
}, async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const fixtureDir = process.env.OPENFRONT_REPLAY_FIXTURE_DIR;
  const candidates = readdirSync(fixtureDir).filter(name =>
    name.includes('c2R2JHZgUi') || name.includes('dLNCLHCvMK'));
  assert.equal(candidates.length, 2, 'both supplied real replay fixtures must be present');
  for (const name of candidates) {
    const replay = JSON.parse(readFileSync(join(fixtureDir, name), 'utf8'));
    const decoded = decodeApiGameRecord(replay);
    assert.ok(decoded.turnCount > 0);
    assert.ok(decoded.actionCount > 0);
    assert.ok(decoded.actions.every(action => Number.isSafeInteger(action.turn) && action.turn >= 0 && Number.isFinite(action.seconds)));
    assert.ok(decoded.actions.every((action, index, all) => index === 0 || all[index - 1].turn <= action.turn));
  }
});

test('decoder orders out-of-order source turns by game time', () => {
  const decoded = decodeApiGameRecord(record([
    { turnNumber: 300, intents: [{ type: 'attack', targetID: 'late' }] },
    { turnNumber: 100, intents: [{ type: 'build_unit' }] },
    { turnNumber: 200, intents: [{ type: 'boat' }] },
  ]));
  assert.deepEqual(decoded.actions.map(action => action.turn), [100, 200, 300]);
  assert.deepEqual(decoded.actions.map(action => action.type), ['build_unit', 'boat', 'attack']);
});
