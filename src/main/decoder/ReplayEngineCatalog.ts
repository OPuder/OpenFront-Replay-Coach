export const PINNED_OPENFRONT_COMMIT = "bc3e3334c573c4959ec6a6745df6826d07233b4d";

export const REPLAY_ENGINE_CATALOG = [
  {
    commit: PINNED_OPENFRONT_COMMIT,
    source: "vendor/OpenFrontIO",
    bundleId: "bc3e3334c573",
  },
  {
    commit: "8b5d071eed95f07c701b32e4c64e95b03f8577c1",
    source: "vendor/OpenFrontIO-8b5d071eed95",
    bundleId: "8b5d071eed95",
  },
] as const;

export const SUPPORTED_OPENFRONT_COMMITS = REPLAY_ENGINE_CATALOG.map((engine) => engine.commit);
