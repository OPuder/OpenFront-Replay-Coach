/**
 * Runtime-configured host for the original OpenFront replay processor.
 * The simulation and hash checks are imported unchanged from the pinned
 * upstream source. Only bootstrap asset configuration is supplied at runtime.
 */
import { assetUrl } from "../vendor/OpenFrontIO/packages/shared/src/AssetUrls";
import { FetchGameMapLoader } from "../vendor/OpenFrontIO/packages/shared/src/FetchGameMapLoader";
import { gzipInBrowser } from "../vendor/OpenFrontIO/src/client/replay/BrowserGzip";
import { processGameRecord, ReplayDesyncError } from "../vendor/OpenFrontIO/src/client/replay/processor/ReplayProcessor";
import type { ProcessorRequest, ProcessorResponse } from "../vendor/OpenFrontIO/src/client/replay/ProcessorMessages";

type CoachProcessorRequest = ProcessorRequest & {
  assetManifest: Record<string, string>;
};

const ctx = self as unknown as Worker;
let mapLoader: FetchGameMapLoader | null = null;

function send(msg: ProcessorResponse, transfer: Transferable[] = []): void {
  ctx.postMessage(msg, transfer);
}

ctx.addEventListener("message", (e: MessageEvent<CoachProcessorRequest>) => {
  const { record, cdnBase, engine, assetManifest } = e.data;
  // OpenFront's assetUrl() reads these globals at request time.
  globalThis.__ASSET_MANIFEST__ = assetManifest;
  globalThis.__CDN_BASE__ = cdnBase;
  mapLoader ??= new FetchGameMapLoader((path) => assetUrl(`maps/${path}`));

  processGameRecord(record, {
    engine: (gameStart, map) => {
      // Lazy import keeps worker startup deterministic after runtime config.
      return import("../vendor/OpenFrontIO/src/client/replay/processor/WorkerReplayEngine")
        .then(({ startWorkerEngine }) => startWorkerEngine(engine, gameStart, map));
    },
    mapLoader,
    gzip: gzipInBrowser,
    onProgress: (p) => send({ type: "progress", percent: p.percent }),
    onStart: (base) => send({ type: "start", base }),
    onAppend: (append) => send({ type: "append", append }, append.chunks.map((c) => c.compressed.buffer)),
  }).then(
    () => send({ type: "done" }),
    (err) => send({
      type: "error",
      desync: err instanceof ReplayDesyncError,
      message: err instanceof Error ? err.message : String(err),
    }),
  );
});
