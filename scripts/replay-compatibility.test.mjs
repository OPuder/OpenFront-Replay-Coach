import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReplayEngineAssets } from '../src/renderer/ReplaySimulation.ts';
import { resolveSupportedEngineCommit } from '../src/main/decoder/ReplayEngineCatalog.ts';
import {
  assessReplayCompatibility,
  PINNED_OPENFRONT_COMMIT,
  SUPPORTED_OPENFRONT_COMMITS,
} from '../src/main/decoder/ReplayCompatibility.ts';

const matchingRecord = (overrides = {}) => ({
  gitCommit: PINNED_OPENFRONT_COMMIT,
  info: { players: [] },
  turns: [{ turnNumber: 0, hash: 123 }, { turnNumber: 1, hash: null }],
  ...overrides,
});

test('the exact bundled engine commit is eligible for deterministic simulation', () => {
  const result = assessReplayCompatibility(matchingRecord());
  assert.equal(result.status, 'version-compatible-hashes-available');
  assert.equal(result.engineVersionCompatible, true);
  assert.equal(result.hashVerificationAvailable, true);
  assert.equal(result.recordedHashCount, 1);
});

test('a different engine commit is always blocked, even when hashes exist', () => {
  const result = assessReplayCompatibility(matchingRecord({
    gitCommit: '0123456789abcdef0123456789abcdef01234567',
  }));
  assert.equal(result.status, 'engine-version-mismatch');
  assert.equal(result.engineVersionCompatible, false);
  assert.equal(result.hashVerificationAvailable, true);
  assert.match(result.message, /stimmt nicht/);
});

test('a replay without an engine commit is not simulated', () => {
  const result = assessReplayCompatibility(matchingRecord({ gitCommit: undefined }));
  assert.equal(result.status, 'missing-engine-version');
  assert.equal(result.engineVersionCompatible, false);
});

test('malformed commit identifiers are treated as missing engine metadata', () => {
  for (const gitCommit of ['', 'DEV', 'not-a-commit', '1234', null, 42]) {
    const result = assessReplayCompatibility(matchingRecord({ gitCommit }));
    assert.equal(result.status, 'missing-engine-version', String(gitCommit));
    assert.equal(result.engineVersionCompatible, false, String(gitCommit));
  }
});

test('matching engine without recorded hashes remains explicitly unverified', () => {
  const result = assessReplayCompatibility(matchingRecord({
    turns: [{ turnNumber: 0, hash: null }, { turnNumber: 1 }],
  }));
  assert.equal(result.status, 'version-compatible-no-hashes');
  assert.equal(result.engineVersionCompatible, true);
  assert.equal(result.hashVerificationAvailable, false);
  assert.equal(result.recordedHashCount, 0);
});

test('hash value zero is a real recorded checkpoint', () => {
  const result = assessReplayCompatibility(matchingRecord({
    turns: [{ turnNumber: 0, hash: 0 }],
  }));
  assert.equal(result.hashVerificationAvailable, true);
  assert.equal(result.recordedHashCount, 1);
});

test('wrapped API records use the nested record commit and hashes', () => {
  const record = matchingRecord();
  const result = assessReplayCompatibility({ data: { game: record } });
  assert.equal(result.replayCommit, PINNED_OPENFRONT_COMMIT);
  assert.equal(result.status, 'version-compatible-hashes-available');
});

test('invalid turn collections do not crash compatibility assessment', () => {
  const result = assessReplayCompatibility(matchingRecord({ turns: null }));
  assert.equal(result.recordedHashCount, 0);
  assert.equal(result.status, 'version-compatible-no-hashes');
});

test('the Europe replay commit has its own exact supported engine build', () => {
  const europeCommit = '8b5d071eed95f07c701b32e4c64e95b03f8577c1';
  assert.ok(SUPPORTED_OPENFRONT_COMMITS.includes(europeCommit));
  const result = assessReplayCompatibility({
    gitCommit: europeCommit,
    info: { players: [] },
    turns: [{ turnNumber: 0, hash: 0 }],
  });
  assert.equal(result.status, 'version-compatible-hashes-available');
  assert.equal(result.engineVersionCompatible, true);
  assert.equal(result.engineCommit, europeCommit);
});

test('an unknown third engine build stays blocked instead of falling back to a bundled engine', () => {
  const result = assessReplayCompatibility(matchingRecord({
    gitCommit: 'fedcba9876543210fedcba9876543210fedcba98',
  }));
  assert.equal(result.status, 'engine-version-mismatch');
  assert.equal(result.engineVersionCompatible, false);
});

test('a unique abbreviated engine commit resolves to its exact bundled revision', () => {
  const shortCommit = PINNED_OPENFRONT_COMMIT.slice(0, 10);
  assert.equal(resolveSupportedEngineCommit(shortCommit), PINNED_OPENFRONT_COMMIT);
  const result = assessReplayCompatibility(matchingRecord({ gitCommit: shortCommit }));
  assert.equal(result.status, 'version-compatible-hashes-available');
  assert.equal(result.engineVersionCompatible, true);
  assert.equal(result.replayCommit, PINNED_OPENFRONT_COMMIT);
  assert.equal(result.engineCommit, PINNED_OPENFRONT_COMMIT);
});

test('terrain asset URLs use the canonical full commit for abbreviated replay hashes', () => {
  const shortCommit = PINNED_OPENFRONT_COMMIT.slice(0, 10);
  const assets = buildReplayEngineAssets({
    gitCommit: shortCommit,
    info: { config: { gameMap: 'World' }, players: [] },
    turns: [],
  });
  assert.ok(Object.values(assets.manifest).every(url => url.includes('/' + PINNED_OPENFRONT_COMMIT + '/resources/maps/')));
});

test('an abbreviated hash that does not identify a bundled engine remains unsupported', () => {
  assert.equal(resolveSupportedEngineCommit('deadbee'), null);
  const result = assessReplayCompatibility(matchingRecord({ gitCommit: 'deadbee' }));
  assert.equal(result.status, 'engine-version-mismatch');
  assert.equal(result.engineVersionCompatible, false);
});
