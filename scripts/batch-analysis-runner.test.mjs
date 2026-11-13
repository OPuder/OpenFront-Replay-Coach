import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runSequentialBatchAnalysis } from '../src/renderer/BatchAnalysisRunner.ts';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('batch analysis is sequential, isolates failures and records each independent status', async () => {
  const active = { count: 0, max: 0 };
  const events = [];
  const progress = [];
  const controller = new AbortController();
  const items = [
    { id: 'a', compatible: true },
    { id: 'b', compatible: false },
    { id: 'c', compatible: true, fail: true },
    { id: 'd', compatible: true, verified: false },
  ];
  const summary = await runSequentialBatchAnalysis(items, {
    signal: controller.signal,
    getId: item => item.id,
    isCompatible: item => item.compatible,
    analyze: async (item, onProgress) => {
      active.count++;
      active.max = Math.max(active.max, active.count);
      onProgress(25, 'worker');
      await delay(5);
      active.count--;
      if (item.fail) throw new Error('synthetic engine failure');
      return { status: item.verified === false ? 'unverified' : 'verified', gameId: item.id };
    },
    onStatus: (item, status, result, error) => events.push({ id: item.id, status, result, error }),
    onProgress: value => progress.push(value),
  });

  assert.equal(active.max, 1, 'only one engine may run at a time');
  assert.deepEqual(summary, {
    total: 4, completed: 4, verified: 1, unverified: 1,
    unsupported: 1, failed: 1, cancelled: false,
  });
  assert.ok(events.some(event => event.id === 'b' && event.status === 'unsupported'));
  assert.ok(events.some(event => event.id === 'c' && event.status === 'failed' && event.error === 'synthetic engine failure'));
  assert.ok(events.some(event => event.id === 'd' && event.status === 'unverified'));
  assert.ok(progress.length >= 4);
});

test('cancellation stops the active simulation and never starts later matches', async () => {
  const controller = new AbortController();
  const started = [];
  const events = [];
  const items = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];
  const summary = await runSequentialBatchAnalysis(items, {
    signal: controller.signal,
    getId: item => item.id,
    isCompatible: () => true,
    analyze: async item => {
      started.push(item.id);
      controller.abort();
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    },
    onStatus: (item, status) => events.push([item.id, status]),
    onProgress: () => undefined,
  });

  assert.equal(summary.cancelled, true);
  assert.deepEqual(started, ['first']);
  assert.equal(events.some(([id, status]) => id === 'second' && status === 'running'), false);
  assert.equal(events.some(([id, status]) => id === 'third' && status === 'running'), false);
});

test('empty batch returns a clean zero-count summary', async () => {
  const controller = new AbortController();
  const summary = await runSequentialBatchAnalysis([], {
    signal: controller.signal,
    getId: item => item.id,
    isCompatible: () => true,
    analyze: async () => ({ status: 'verified' }),
    onStatus: () => undefined,
    onProgress: () => undefined,
  });
  assert.equal(summary.total, 0);
  assert.equal(summary.completed, 0);
  assert.equal(summary.cancelled, false);
});
