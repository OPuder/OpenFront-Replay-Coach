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
