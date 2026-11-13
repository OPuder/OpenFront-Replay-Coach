import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessReplayCompatibility } from '../src/main/decoder/ReplayCompatibility.ts';

const gameId = process.env.OPENFRONT_REPLAY_ID;
const expectedCommit = process.env.OPENFRONT_REPLAY_EXPECTED_COMMIT ?? '8b5d071eed95f07c701b32e4c64e95b03f8577c1';
const expectedMap = process.env.OPENFRONT_REPLAY_EXPECTED_MAP ?? 'Europe';
const expectedPlayers = process.env.OPENFRONT_REPLAY_EXPECTED_PLAYERS;
const expectedTurns = process.env.OPENFRONT_REPLAY_EXPECTED_TURNS;
const expectedHashes = process.env.OPENFRONT_REPLAY_EXPECTED_HASHES;

test(`public ${expectedMap} replay resolves to its exact bundled engine revision`, { skip: !gameId }, async () => {
  const response = await fetch(`https://api.openfront.io/public/game/${encodeURIComponent(gameId)}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'OpenFront-Replay-Coach-CI/1.0' },
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, 'OpenFront public replay API must return the regression replay');
  const payload = await response.json();
  const record = payload?.game ?? payload?.data?.game ?? payload?.data ?? payload;
  const compatibility = assessReplayCompatibility(record);
  const hashCount = Array.isArray(record?.turns)
    ? record.turns.filter((turn) => turn?.hash !== null && turn?.hash !== undefined).length
    : 0;
  assert.equal(record?.info?.config?.gameMap, expectedMap);
  assert.equal(compatibility.replayCommit, expectedCommit);
  assert.equal(compatibility.engineVersionCompatible, true);
  assert.equal(compatibility.engineCommit, compatibility.replayCommit);
  assert.ok(hashCount > 0, 'Replay must contain recorded hash checkpoints');
  if (expectedPlayers) assert.equal(record?.info?.players?.length, Number(expectedPlayers));
  if (expectedTurns) assert.equal(record?.turns?.length, Number(expectedTurns));
  if (expectedHashes) assert.equal(hashCount, Number(expectedHashes));
  console.log(`Verified ${expectedMap} replay ${gameId}: ${record.turns.length} turns, ${hashCount} hashes, engine ${expectedCommit}`);
});
