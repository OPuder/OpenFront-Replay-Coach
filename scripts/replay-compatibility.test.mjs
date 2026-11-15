import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReplayEngineAssets } from '../src/renderer/ReplaySimulation.ts';
import { resolveSupportedEngineCommit } from '../src/main/decoder/ReplayEngineCatalog.ts';
import {
  assessReplayCompatibility,
  isReplayCompatibilityCurrent,
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

test('cached compatibility metadata avoids rescanning a large replay on startup', () => {
  const turns = new Proxy([], {
    get(target, property, receiver) {
      if (property === 'filter') throw new Error('hash checkpoints must not be rescanned');
      return Reflect.get(target, property, receiver);
    },
  });
  const record = { gitCommit: PINNED_OPENFRONT_COMMIT, info: {}, turns };
  const previous = {
    status: 'version-compatible-hashes-available',
    replayCommit: PINNED_OPENFRONT_COMMIT,
    engineCommit: PINNED_OPENFRONT_COMMIT,
    recordedHashCount: 1006,
    engineVersionCompatible: true,
    hashVerificationAvailable: true,
    message: 'cached',
  };
  assert.equal(isReplayCompatibilityCurrent(record, previous), true);
});

test('cached unsupported compatibility is invalidated when an exact engine is added', () => {
  const record = { gitCommit: '8b5d071eed95f07c701b32e4c64e95b03f8577c1', info: {}, turns: [] };
  const previous = {
    status: 'engine-version-mismatch',
    replayCommit: record.gitCommit,
    engineCommit: PINNED_OPENFRONT_COMMIT,
    recordedHashCount: 1,
    engineVersionCompatible: false,
    hashVerificationAvailable: true,
    message: 'old catalog',
  };
  assert.equal(isReplayCompatibilityCurrent(record, previous), false);
});

test('malformed turn entries and non-object checkpoints are ignored safely', () => {
  const result = assessReplayCompatibility(matchingRecord({
    turns: [null, undefined, 42, 'turn', [], {}, { hash: null }, { hash: 0 }, { hash: '' }],
  }));
  assert.equal(result.recordedHashCount, 2);
  assert.equal(result.hashVerificationAvailable, true);
});

test('empty and structurally invalid replay envelopes never throw', () => {
  for (const input of [null, undefined, 0, false, '', [], {}, { data: null }, { game: [] }, { result: 42 }]) {
    assert.doesNotThrow(() => assessReplayCompatibility(input));
    const result = assessReplayCompatibility(input);
    assert.equal(result.status, 'missing-engine-version');
    assert.equal(result.engineVersionCompatible, false);
  }
});

test('nested API envelopes resolve only a recognizable game record', () => {
  const record = matchingRecord();
  const wrapped = { result: { game: record } };
  const result = assessReplayCompatibility(wrapped);
  assert.equal(result.replayCommit, PINNED_OPENFRONT_COMMIT);
  assert.equal(result.recordedHashCount, 1);
});

test('malformed map identifiers are rejected before constructing terrain URLs', () => {
  for (const gameMap of ['', ' ', '!', 'x'.repeat(100)]) {
    assert.throws(() => buildReplayEngineAssets({
      gitCommit: PINNED_OPENFRONT_COMMIT,
      info: { config: { gameMap } },
      turns: [],
    }), /Karten-ID/);
  }
});

test('missing and malformed engine commit input cannot produce asset URLs', () => {
  for (const gitCommit of [undefined, null, '', 'not-a-commit', 'deadbee']) {
    assert.throws(() => buildReplayEngineAssets({
      gitCommit,
      info: { config: { gameMap: 'World' } },
      turns: [],
    }), /Original-Build/);
  }
});



test('missing and malformed hash checkpoints are counted as unavailable rather than valid hashes', () => {
  const result = assessReplayCompatibility(matchingRecord({
    turns: [
      { turnNumber: 0, hash: null },
      { turnNumber: 1 },
      { turnNumber: 2, hash: undefined },
      { turnNumber: 3, hash: 0 },
      { turnNumber: 4, hash: 123 },
    ],
  }));
  assert.equal(result.recordedHashCount, 2);
  assert.equal(result.hashVerificationAvailable, true);
});

test('a replay with only incomplete hash checkpoints remains explicitly unverified', () => {
  const result = assessReplayCompatibility(matchingRecord({
    turns: [{ turnNumber: 0, hash: null }, { turnNumber: 10 }, { turnNumber: 20, hash: undefined }],
  }));
  assert.equal(result.status, 'version-compatible-no-hashes');
  assert.equal(result.recordedHashCount, 0);
  assert.equal(result.hashVerificationAvailable, false);
});
