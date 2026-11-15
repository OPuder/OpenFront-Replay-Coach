export const PINNED_OPENFRONT_COMMIT = "7f34e15908286d490715c6e4af8c47df5b1b3fcc";

export const REPLAY_ENGINE_CATALOG = [
  {
    commit: "bc3e3334c573c4959ec6a6745df6826d07233b4d",
    source: "vendor/OpenFrontIO",
    bundleId: "bc3e3334c573",
  },
  {
    commit: "8b5d071eed95f07c701b32e4c64e95b03f8577c1",
    source: "vendor/OpenFrontIO-8b5d071eed95",
    bundleId: "8b5d071eed95",
  },
  {
    commit: "9f4a28f16fae951df0daf727e5e64b34ce8b77d1",
    source: "vendor/OpenFrontIO-9f4a28f16fae",
    bundleId: "9f4a28f16fae",
  },
  {
    commit: "0211f17b71efa762242b620b91ffa5d8439522e6",
    source: "vendor/OpenFrontIO-0211f17b71ef",
    bundleId: "0211f17b71ef",
  },
  {
    commit: "7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de",
    source: "vendor/OpenFrontIO-7ee96860c717",
    bundleId: "7ee96860c717",
  },
  {
    commit: "1eec6bbceeecc01d98046c5c381758a23b46483e",
    source: "vendor/OpenFrontIO-1eec6bbceeec",
    bundleId: "1eec6bbceeec",
  },
  {
    commit: "09aa423bceb993cae9c7b4dd3643f55e150ba612",
    source: "vendor/OpenFrontIO-09aa423bceb9",
    bundleId: "09aa423bceb9",
  },
  {
    commit: "c144d134d1503191b4c3fd9a866fc583b9ecea4a",
    source: "vendor/OpenFrontIO-c144d134d150",
    bundleId: "c144d134d150",
  },
  {
    commit: "80bff198b68f02e18e986b5535835c0e3ff6cbba",
    source: "vendor/OpenFrontIO-80bff198b68f",
    bundleId: "80bff198b68f",
  },
  { commit: "7f34e15908286d490715c6e4af8c47df5b1b3fcc", source: "vendor/OpenFrontIO-7f34e1590828", bundleId: "7f34e1590828" },
  { commit: "445721718207b6e0f068258cd8ff2eccd13d198e", source: "vendor/OpenFrontIO-445721718207", bundleId: "445721718207" },
] as const;

export const SUPPORTED_OPENFRONT_COMMITS = REPLAY_ENGINE_CATALOG.map((engine) => engine.commit);

/**
 * Resolve a recorded full or abbreviated git SHA to exactly one bundled engine.
 * Prefixes are accepted only when they identify one unique catalog entry.
 */
export function resolveSupportedEngineCommit(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const commit = value.trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(commit)) return null;
  const matches = REPLAY_ENGINE_CATALOG.filter(engine => engine.commit.startsWith(commit));
  return matches.length === 1 ? matches[0].commit : null;
}
