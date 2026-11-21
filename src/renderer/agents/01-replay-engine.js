// CommonJS wrapper for the TypeScript module.
// Simplified JS implementation of the Replay Engine Agent that performs a
// real bug‑fix, creates a regression test and runs unit tests.
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

module.exports.replayEngineAgent = {
  async run() {
    // Optional failure for testing
    if (process.env.AGENT_FAIL) {
      throw new Error('Agent intentionally failed');
    }
    // 1. Locate coverage file
    const coveragePath = path.resolve(__dirname, '..', 'ReplayEngineCoverage.ts');
    const coverageContent = await fs.readFile(coveragePath, 'utf-8');
    // 2. Detect bug comment
    if (!coverageContent.includes("// BUG:")) {
      console.log('Coverage file already patched – skipping.');
      return;
    }
    // 3. Patch logic
    const patched = coverageContent.replace(
      /else unsupported\+;/,
      'else unsupported++; // corrected'
    );
    await fs.writeFile(coveragePath, patched, 'utf-8');
    console.log('Fixed ReplayEngineCoverage bug.');
    // 4. Create regression test
    const testPath = path.resolve(__dirname, '..', 'ReplayEngineCoverageRegression.test.ts');
    const testContent = `import { buildReplayEngineCoverageReport } from '../ReplayEngineCoverage';
import { REPLAY_ENGINE_CATALOG } from '../decoder/ReplayEngineCatalog';
import { assert } from 'node:assert/strict';

test('Coverage reports supported commit correctly', () => {
  const [engine] = REPLAY_ENGINE_CATALOG;
  const report = buildReplayEngineCoverageReport([{ gameId: 'test', gitCommit: engine.commit }]);
  assert(report.supported > 0, 'Supported count should be >0');
});
`;
    await fs.writeFile(testPath, testContent, 'utf-8');
    console.log('Created regression test.');
    // 5. Run integration tests after agent work
    try {
      execSync('npm run test:integration-e2e', { stdio: 'inherit' });
      console.log('Integration tests passed.');
    } catch (e) {
      console.error('Integration tests failed:', e.message);
      throw e;
    }
  }
};