import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReplayEngineCoverageReport } from '../ReplayEngineCoverage';
import { REPLAY_ENGINE_CATALOG } from '../decoder/ReplayEngineCatalog';

test('Coverage reports supported commit correctly', () => {
  const [engine] = REPLAY_ENGINE_CATALOG;
  const report = buildReplayEngineCoverageReport([{ gameId: 'test', gitCommit: engine.commit }]);
  assert.ok(report.supported > 0, 'Supported count should be >0');
});
