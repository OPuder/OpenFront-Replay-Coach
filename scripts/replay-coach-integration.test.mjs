import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toReplayCoachFindings } from '../src/renderer/ReplayCoachIntegration.ts';

const finding = (overrides = {}) => ({
  id: 'front-load', priority: 'high', confidence: 'medium', title: 'Neue Front eröffnet',
  decision: 'Angriff auf Ziel', consequence: 'Reserve wurde gebunden.',
  alternative: 'Zuerst bestehende Front stabilisieren.', trainingRule: 'Reserve vor Folgeangriff prüfen.',
  evidence: '01:20 · 2 aktive Ziele', seconds: 80, caveat: '30-Sekunden-Fenster ist kein Kampfabschluss.',
  ...overrides,
});
const sample = (players) => ({ tick: 800, frame: 799, players, territory: null, unitMovements: [] });
const player = (id, name, clientID) => ({ id, name, clientID, color: null, tiles: 10 });

test('maps the actual ProCoachFinding fields and exact-time action evidence', () => {
  const action = { frame: 79, turn: 800, seconds: 80, type: 'attack', label: 'Angriff', details: 'Befehl auf Rival', targetName: 'Rival', targetSmallID: 777 };
  const result = toReplayCoachFindings([finding()], 'match-1', 'self-client', [action], [sample([
    player(1, 'Self', 'self-client'), player(2, 'Rival', 'rival-client'),
  ])]);
  assert.equal(result.length, 1);
  assert.equal(result[0].matchId, 'match-1');
  assert.equal(result[0].timestampSeconds, 80);
  assert.equal(result[0].evidence[0].kind, 'action');
  assert.equal(result[0].evidence[0].frame, 79);
  assert.deepEqual(result[0].affectedOwnerIds, [1, 2]);
  assert.equal(result[0].consequence, 'Reserve wurde gebunden.');
  assert.equal(result[0].alternative, 'Zuerst bestehende Front stabilisieren.');
  assert.equal(result[0].learningRule, 'Reserve vor Folgeangriff prüfen.');
});

test('does not infer a target player from ambiguous names or targetSmallID', () => {
  const action = { frame: 80, seconds: 80, label: 'Angriff', details: '', targetName: 'Rival', targetSmallID: 2 };
  const result = toReplayCoachFindings([finding()], 'match-1', 'self-client', [action], [sample([
    player(1, 'Self', 'self-client'), player(2, 'Rival', 'a'), player(3, 'Rival', 'b'),
  ])]);
  assert.deepEqual(result[0].affectedOwnerIds, [1]);
  assert.equal(result[0].affectedPlayers.some(item => item.role === 'target'), false);
});

test('keeps missing timestamps and unmatched evidence explicit without fabricating a replay jump', () => {
  const result = toReplayCoachFindings([finding({ seconds: null })], 'match-1', 'self-client', [], [sample([
    player(1, 'Self', 'self-client'),
  ])]);
  assert.equal(result[0].timestampSeconds, null);
  assert.equal(result[0].evidence[0].kind, 'summary');
  assert.equal(result[0].evidence[0].frame, null);
  assert.match(result[0].uncertainty, /Zeitstempel/);
});

test('does not promote low-priority observations into the three strategic decision cards', () => {
  const result = toReplayCoachFindings([finding({ priority: 'low' }), finding({ id: 'decision-2' })], 'match-1', 'self-client', [], []);
  assert.deepEqual(result.map(item => item.id), ['decision-2']);
});

test('rejects cross-match or unscoped output when match/player identity is missing', () => {
  assert.deepEqual(toReplayCoachFindings([finding()], '', 'self-client', [], []), []);
  assert.deepEqual(toReplayCoachFindings([finding()], 'match-1', '', [], []), []);
});
