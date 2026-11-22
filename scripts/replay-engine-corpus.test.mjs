import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { REPLAY_ENGINE_CATALOG, resolveSupportedEngineCommit } from "../src/main/decoder/ReplayEngineCatalog.ts";

const expectedCommits = [
  "9f4a28f16fae951df0daf727e5e64b34ce8b77d1",
  "0211f17b71efa762242b620b91ffa5d8439522e6",
  "7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de",
  "1eec6bbceeecc01d98046c5c381758a23b46483e",
  "bc3e3334c573c4959ec6a6745df6826d07233b4d",
  "09aa423bceb993cae9c7b4dd3643f55e150ba612",
  "c144d134d1503191b4c3fd9a866fc583b9ecea4a",
  "8b5d071eed95f07c701b32e4c64e95b03f8577c1",
  "80bff198b68f02e18e986b5535835c0e3ff6cbba",
  "7f34e15908286d490715c6e4af8c47df5b1b3fcc",
  "445721718207b6e0f068258cd8ff2eccd13d198e",
];

test("all replay engine commits discovered in the supplied corpus are pinned exactly", () => {
  const manifest = JSON.parse(readFileSync("engine-build/engines.json", "utf8"));
  const registry = readFileSync("src/renderer/engineRegistry.ts", "utf8");
  assert.ok(manifest.length >= expectedCommits.length);
  assert.ok(REPLAY_ENGINE_CATALOG.length >= expectedCommits.length);
  for (const commit of expectedCommits) {
    const engine = manifest.find(item => item.commit === commit);
    assert.ok(engine, `missing exact engine ${commit}`);
    assert.equal(resolveSupportedEngineCommit(commit), commit);
    assert.ok(registry.includes(commit), `runtime loader missing ${commit}`);
    assert.ok(registry.includes(`replay-engine-${engine.bundleId}.js`), `bundle loader missing ${engine.bundleId}`);
  }
});

test("historical engine catalog has unique commits, bundle IDs and source paths", () => {
  assert.equal(new Set(REPLAY_ENGINE_CATALOG.map(engine => engine.commit)).size, REPLAY_ENGINE_CATALOG.length);
  assert.equal(new Set(REPLAY_ENGINE_CATALOG.map(engine => engine.bundleId)).size, REPLAY_ENGINE_CATALOG.length);
  assert.equal(new Set(REPLAY_ENGINE_CATALOG.map(engine => engine.source)).size, REPLAY_ENGINE_CATALOG.length);
});
