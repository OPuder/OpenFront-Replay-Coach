import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseReplaySampleCadence, getTotalRecordedFrames, loadReplayTerrainData } from '../src/renderer/ReplaySimulation.ts';

test('loads the exact terrain binary whose manifest dimensions match the replay', async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  const terrainBytes = new Uint8Array([0x80, 0x20, 0x9f, 0x80]);
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url).endsWith('manifest.json')) {
      return new Response(JSON.stringify({
        map: { width: 4, height: 4 },
        map4x: { width: 2, height: 2 },
        map16x: { width: 1, height: 1 },
      }), { status: 200 });
    }
    if (String(url).endsWith('map4x.bin')) {
      return new Response(terrainBytes, { status: 200 });
    }
    throw new Error(`Unexpected asset request: ${url}`);
  };

  try {
    const result = await loadReplayTerrainData({
      manifest: {
        'maps/test/manifest.json': 'https://assets.test/maps/test/manifest.json',
        'maps/test/map.bin': 'https://assets.test/maps/test/map.bin',
        'maps/test/map4x.bin': 'https://assets.test/maps/test/map4x.bin',
        'maps/test/map16x.bin': 'https://assets.test/maps/test/map16x.bin',
      },
      cdnBase: '',
    }, 2, 2);

    assert.deepEqual([...result], [...terrainBytes]);
    assert.ok(requested.some((url) => url.endsWith('map4x.bin')));
    assert.equal(requested.some((url) => url.endsWith('map.bin')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns null rather than failing replay analysis when terrain assets are missing or malformed', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).endsWith('manifest.json')
    ? new Response(JSON.stringify({ map: { width: 4, height: 4 } }), { status: 200 })
    : new Response(new Uint8Array([0x80, 0x80]), { status: 200 });

  try {
    const assets = {
      manifest: {
        'maps/test/manifest.json': 'https://assets.test/maps/test/manifest.json',
        'maps/test/map.bin': 'https://assets.test/maps/test/map.bin',
      },
      cdnBase: '',
    };
    assert.equal(await loadReplayTerrainData(assets, 4, 4), null);
    assert.equal(await loadReplayTerrainData({ manifest: {}, cdnBase: '' }, 4, 4), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('counts very large replay frame arrays without argument spreading', () => {
  const turns = Array.from({ length: 150_000 }, (_, index) => ({ turnNumber: index + 1 }));
  assert.equal(getTotalRecordedFrames({ info: { num_turns: 10 }, turns }), 150_000);
});

test('uses declared frame count and ignores malformed one-based turn numbers', () => {
  assert.equal(getTotalRecordedFrames({ info: { num_turns: 250 }, turns: [
    { turnNumber: 10 }, { turnNumber: 0 }, { turnNumber: -1 }, { turnNumber: 'invalid' }, { turnNumber: null }, null, {},
  ] }), 250);
  assert.equal(getTotalRecordedFrames({ info: { num_turns: 'invalid' }, turns: [{ turnNumber: 4 }] }), 4);
  assert.equal(getTotalRecordedFrames({ info: { num_turns: true }, turns: [{ turnNumber: true }, { turnNumber: '8' }, { turnNumber: 4 }] }), 4);
  assert.equal(getTotalRecordedFrames({ info: { num_turns: -4 }, turns: [{ turnNumber: -1 }, { turnNumber: 3 }] }), 3);
  assert.equal(getTotalRecordedFrames(null), 0);
});


test('keeps normal replay sampling unchanged and bounds baseline map snapshots for long matches', () => {
  assert.equal(chooseReplaySampleCadence(1_334, 50), 50);
  assert.equal(chooseReplaySampleCadence(39_623, 50), 111);
  assert.equal(chooseReplaySampleCadence(100, 50), 50);
  assert.equal(chooseReplaySampleCadence(39_623, 50, 200), 199);
  assert.equal(chooseReplaySampleCadence(0, 50), 50);
  assert.equal(chooseReplaySampleCadence(39_623, 0), 111);
  assert.ok(Math.ceil(39_623 / chooseReplaySampleCadence(39_623, 50)) <= 360);
});
