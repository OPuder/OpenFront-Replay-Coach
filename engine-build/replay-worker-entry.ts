/**
 * Thin host entry for the pinned upstream replay pipeline.
 *
 * The simulation, hash verification, map decoding and replay encoding remain
 * in the upstream OpenFront source. This file only exposes both workers to
 * the Coach renderer.
 */
import EngineWorker from "../vendor/OpenFrontIO/packages/engine/src/worker/Worker.worker.ts?worker&inline";
import ReplayProcessorWorker from "../vendor/OpenFrontIO/src/client/replay/ReplayProcessor.worker.ts?worker&inline";

export function createReplayWorkers(): {
  engine: Worker;
  processor: Worker;
} {
  return {
    engine: new EngineWorker(),
    processor: new ReplayProcessorWorker(),
  };
}
