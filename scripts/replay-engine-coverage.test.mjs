import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReplayEngineCoverageReport } from "../src/renderer/ReplayEngineCoverage.ts";
import { PINNED_OPENFRONT_COMMIT } from "../src/main/decoder/ReplayEngineCatalog.ts";
test("coverage groups exact unsupported commits and counts supported engine builds",()=>{
 const report=buildReplayEngineCoverageReport([
  {gameId:"known-full",gitCommit:PINNED_OPENFRONT_COMMIT},
  {gameId:"known-short",gitCommit:PINNED_OPENFRONT_COMMIT.slice(0,10)},
  {gameId:"missing-a",gitCommit:"0123456789abcdef0123456789abcdef01234567"},
  {gameId:"missing-b",gitCommit:"0123456789abcdef0123456789abcdef01234567"},
  {gameId:"unknown-meta"},
 ]);
 assert.deepEqual({total:report.total,supported:report.supported,unsupported:report.unsupported,missingCommit:report.missingCommit},{total:5,supported:2,unsupported:2,missingCommit:1});
 assert.deepEqual(report.groups.map(g=>[g.commit,g.count]),[["0123456789abcdef0123456789abcdef01234567",2],[null,1]]);
 assert.deepEqual(report.groups[0].gameIds,["missing-a","missing-b"]);
});
test("duplicate IDs count once and malformed commits are missing metadata",()=>{
 const report=buildReplayEngineCoverageReport([{gameId:"same",gitCommit:"invalid"},{gameId:"same",gitCommit:PINNED_OPENFRONT_COMMIT},{gameId:"empty",gitCommit:""}]);
 assert.equal(report.total,2); assert.equal(report.supported,0); assert.equal(report.missingCommit,2); assert.equal(report.unsupported,0);
});
