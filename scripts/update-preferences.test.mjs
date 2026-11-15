import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const source = readFileSync(new URL('../src/renderer/updatePreferences.ts', import.meta.url), 'utf8');
const transpiled = source
  .replace(/export interface UpdatePreferenceStorage \{[\s\S]*?\n\}/, '')
  .replace(/: UpdatePreferenceStorage/g, '')
  .replace(/\?: UpdatePreferenceStorage/g, '')
  .replace(/: boolean/g, '')
  .replace(/: string \| null/g, '')
  .replace(/: Date/g, '')
  .replace(/: string/g, '')
  .replace(/: null/g, '');
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(transpiled).toString('base64');
const prefs = await import(moduleUrl);

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test('automatic update checks default to enabled and survive a renderer restart', () => {
  const storage = memoryStorage();
  assert.equal(prefs.readAutoUpdateEnabled(storage), true);
  assert.equal(prefs.writeAutoUpdateEnabled(false, storage), true);
  assert.equal(prefs.readAutoUpdateEnabled(storage), false);
  assert.equal(prefs.readAutoUpdateEnabled(storage), false);
  assert.equal(prefs.writeAutoUpdateEnabled(true, storage), true);
  assert.equal(prefs.readAutoUpdateEnabled(storage), true);
});

test('last successful check persists and invalid or failed checks do not overwrite it', () => {
  const storage = memoryStorage();
  const first = new Date('2026-11-15T10:00:00.000Z');
  assert.equal(prefs.readLastSuccessfulUpdateCheck(storage), null);
  assert.equal(prefs.writeLastSuccessfulUpdateCheck(first, storage), true);
  const saved = prefs.readLastSuccessfulUpdateCheck(storage);
  assert.equal(saved, first.toISOString());
  assert.equal(prefs.writeLastSuccessfulUpdateCheck(new Date(Number.NaN), storage), false);
  assert.equal(prefs.readLastSuccessfulUpdateCheck(storage), saved);
});

test('storage failures are reported and do not fabricate successful persistence', () => {
  const unavailable = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(prefs.readAutoUpdateEnabled(unavailable), true);
  assert.equal(prefs.writeAutoUpdateEnabled(false, unavailable), false);
  assert.equal(prefs.readLastSuccessfulUpdateCheck(unavailable), null);
  assert.equal(prefs.writeLastSuccessfulUpdateCheck(new Date(), unavailable), false);
});
