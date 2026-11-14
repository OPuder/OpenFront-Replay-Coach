import { REPLAY_ENGINE_CATALOG, resolveSupportedEngineCommit } from "../main/decoder/ReplayEngineCatalog";

type ReplayEngineModule = typeof import("./engine/replay-engine-bc3e3334c573.js");

const loaders: Record<string, () => Promise<ReplayEngineModule>> = {
  "bc3e3334c573c4959ec6a6745df6826d07233b4d": () =>
    import("./engine/replay-engine-bc3e3334c573.js"),
  "8b5d071eed95f07c701b32e4c64e95b03f8577c1": () =>
    import("./engine/replay-engine-8b5d071eed95.js"),
};

export async function loadReplayEngineModule(commit: string): Promise<ReplayEngineModule> {
  const resolvedCommit = resolveSupportedEngineCommit(commit);
  const definition = resolvedCommit
    ? REPLAY_ENGINE_CATALOG.find((engine) => engine.commit === resolvedCommit)
    : undefined;
  const load = resolvedCommit ? loaders[resolvedCommit] : undefined;
  if (!definition || !load) {
    throw new Error(
      `Für Replay-Engine ${commit || "(unbekannt)"} ist kein eindeutig passender Engine-Build enthalten. Die Partie wird nicht mit einer anderen Version simuliert.`,
    );
  }
  return load();
}
