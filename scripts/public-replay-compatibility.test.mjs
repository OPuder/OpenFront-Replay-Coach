import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assessReplayCompatibility } from '../src/main/decoder/ReplayCompatibility.ts';

const gameId = process.env.OPENFRONT_REPLAY_ID;
test('the public Europe replay resolves to its exact bundled engine revision', { skip: !gameId }, async () => {
  const response = await fetch(`https://api.openfront.io/public/game/${encodeURIComponent(gameId)}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'OpenFront-Replay-Coach-CI/1.0' },
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, 'OpenFront public replay API must return the regression replay');
  const payload = await response.json();
  const record = payload?.game ?? payload?.data?.game ?? payload?.data ?? payload;
  const compatibility = assessReplayCompatibility(record);
  assert.equal(record?.info?.config?.gameMap, 'Europe');
  assert.equal(record?.info?.players?.length, 2);
  assert.equal(compatibility.replayCommit, '8b5d071eed95f07c701b32e4c64e95b03f8577c1');
  assert.equal(compatibility.engineVersionCompatible, true);
  assert.equal(compatibility.engineCommit, compatibility.replayCommit);
  assert.equal(compatibility.recordedHashCount, 1006);
  assert.ok(Array.isArray(record.turns) && record.turns.length === 1334);
});
