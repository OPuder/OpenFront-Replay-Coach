/**
 * Host entry for the pinned upstream replay pipeline and state reader.
 * Simulation, hash verification, map decoding and frame reconstruction are
 * imported unchanged from the pinned OpenFront source.
 */
import EngineWorker from "@openfront-source/packages/engine/src/worker/Worker.worker.ts?worker&inline";
import ReplayProcessorWorker from "./ReplayProcessor.worker.ts?worker&inline";
export { ReplayReader } from "@openfront-source/src/client/replay/codec/decode/ReplayReader";
export { gunzipInBrowser } from "@openfront-source/src/client/replay/BrowserGzip";

export function createReplayWorkers(): { engine: Worker; processor: Worker } {
  return { engine: new EngineWorker(), processor: new ReplayProcessorWorker() };
}
