// @ts-nocheck
import { buildReplayEngineCoverageReport } from '../ReplayEngineCoverage';
import { REPLAY_ENGINE_CATALOG } from '../decoder/ReplayEngineCatalog';
import { assert } from 'node:assert/strict';

test('Coverage reports supported commit correctly', () => {
  const [engine] = REPLAY_ENGINE_CATALOG;
  const report = buildReplayEngineCoverageReport([{ gameId: 'test', gitCommit: engine.commit }]);
  assert(report.supported > 0, 'Supported count should be >0');
});
