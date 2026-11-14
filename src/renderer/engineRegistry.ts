import { REPLAY_ENGINE_CATALOG, resolveSupportedEngineCommit } from "../main/decoder/ReplayEngineCatalog";

type ReplayEngineModule = typeof import("./engine/replay-engine-bc3e3334c573.js");

const loaders: Record<string, () => Promise<ReplayEngineModule>> = {
  "bc3e3334c573c4959ec6a6745df6826d07233b4d": () =>
    import("./engine/replay-engine-bc3e3334c573.js"),
  "8b5d071eed95f07c701b32e4c64e95b03f8577c1": () =>
    import("./engine/replay-engine-8b5d071eed95.js"),
  "9f4a28f16fae951df0daf727e5e64b34ce8b77d1": () => import("./engine/replay-engine-9f4a28f16fae.js"),
  "0211f17b71efa762242b620b91ffa5d8439522e6": () => import("./engine/replay-engine-0211f17b71ef.js"),
  "7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de": () => import("./engine/replay-engine-7ee96860c717.js"),
  "1eec6bbceeecc01d98046c5c381758a23b46483e": () => import("./engine/replay-engine-1eec6bbceeec.js"),
  "09aa423bceb993cae9c7b4dd3643f55e150ba612": () => import("./engine/replay-engine-09aa423bceb9.js"),
  "c144d134d1503191b4c3fd9a866fc583b9ecea4a": () => import("./engine/replay-engine-c144d134d150.js"),
  "80bff198b68f02e18e986b5535835c0e3ff6cbba": () => import("./engine/replay-engine-80bff198b68f.js"),
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
