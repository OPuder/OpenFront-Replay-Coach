import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unwrapGameRecord } from '../src/main/decoder/GameRecordShape.ts';

const game = { info: { players: [] }, turns: [{ turnNumber: 1, intents: [] }], gitCommit: 'abc' };

test('keeps a direct GameRecord unchanged', () => {
  assert.equal(unwrapGameRecord(game), game);
});

test('unwraps the game API envelope', () => {
  assert.equal(unwrapGameRecord({ game }), game);
});

test('unwraps data and result envelopes used by API transports', () => {
  assert.equal(unwrapGameRecord({ data: { game } }), game);
  assert.equal(unwrapGameRecord({ data: game }), game);
  assert.equal(unwrapGameRecord({ result: { game } }), game);
  assert.equal(unwrapGameRecord({ record: game }), game);
});

test('does not select arbitrary nested objects that are not GameRecords', () => {
  const value = { data: { message: 'not a replay' }, metadata: { info: 'not game info' } };
  assert.equal(unwrapGameRecord(value), value);
});
