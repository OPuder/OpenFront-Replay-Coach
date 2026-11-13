import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/main/decoder/ReplayCompatibility.ts', 'utf8');
const match = source.match(/PINNED_OPENFRONT_COMMIT\s*=\s*\n?\s*["']([0-9a-f]{40})["']/i);
assert.ok(match, 'ReplayCompatibility must declare one full 40-character pinned engine commit');

const checkout = execFileSync('git', ['-C', 'vendor/OpenFrontIO', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(
  checkout.toLowerCase(),
  match[1].toLowerCase(),
  'ReplayCompatibility pinned commit must exactly match the OpenFrontIO submodule checkout',
);
console.log(`Replay engine pin verified: ${checkout}`);
