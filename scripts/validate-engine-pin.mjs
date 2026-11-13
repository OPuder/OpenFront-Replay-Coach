import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const engines = JSON.parse(readFileSync('engine-build/engines.json', 'utf8'));
assert.ok(Array.isArray(engines) && engines.length >= 2, 'At least two replay engine revisions must be registered');

const compatibility = readFileSync('src/main/decoder/ReplayCompatibility.ts', 'utf8');
const catalog = readFileSync('src/main/decoder/ReplayEngineCatalog.ts', 'utf8');
const registry = readFileSync('src/renderer/engineRegistry.ts', 'utf8');
const seenCommits = new Set();

for (const engine of engines) {
  assert.match(engine.commit, /^[0-9a-f]{40}$/, `Invalid engine commit: ${engine.commit}`);
  assert.match(engine.bundleId, /^[0-9a-f]{12}$/, `Invalid bundle id: ${engine.bundleId}`);
  assert.ok(!seenCommits.has(engine.commit), `Duplicate engine commit: ${engine.commit}`);
  seenCommits.add(engine.commit);

  const checkout = execFileSync('git', ['-C', engine.source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(checkout, engine.commit, `Submodule ${engine.source} must be exactly ${engine.commit}`);
  assert.ok(catalog.includes(engine.commit), `Shared TypeScript catalog is missing ${engine.commit}`);
  assert.ok(catalog.includes(engine.bundleId), `Shared TypeScript catalog is missing ${engine.bundleId}`);
  assert.ok(registry.includes(engine.commit), `Runtime registry is missing ${engine.commit}`);
  assert.ok(registry.includes(`replay-engine-${engine.bundleId}.js`), `Runtime bundle mapping is missing ${engine.bundleId}`);
}

assert.ok(compatibility.includes('engine-build/engines.json'), 'Compatibility gate must use the engine catalog');
console.log(`Verified ${engines.length} exact replay engine revisions and runtime mappings.`);
