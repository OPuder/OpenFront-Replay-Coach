declare module "*replay-engine-bc3e3334c573.js" {
  export function createReplayWorkers(): { engine: Worker; processor: Worker };
  export class ReplayReader {
    constructor(base: any, inflate: (data: Uint8Array) => Uint8Array | Promise<Uint8Array>);
    readonly header: { totalFrames: number; keyframeInterval: number; players: any[] };
    append(more: any): void;
    chunkOf(frame: number): number;
    load(index: number): Promise<void>;
    seek(frame: number): {
      frame: number;
      tick: number;
      players: ReadonlyMap<number, any>;
      units: ReadonlyMap<number, any>;
      falloutTiles: number;
    };
  }
  export function gunzipInBrowser(data: Uint8Array): Promise<Uint8Array>;
}

declare module "*replay-engine-8b5d071eed95.js" {
  export function createReplayWorkers(): { engine: Worker; processor: Worker };
  export class ReplayReader {
    constructor(base: any, inflate: (data: Uint8Array) => Uint8Array | Promise<Uint8Array>);
    readonly header: { totalFrames: number; keyframeInterval: number; players: any[] };
    append(more: any): void;
    chunkOf(frame: number): number;
    load(index: number): Promise<void>;
    seek(frame: number): {
      frame: number;
      tick: number;
      players: ReadonlyMap<number, any>;
      units: ReadonlyMap<number, any>;
      falloutTiles: number;
    };
  }
  export function gunzipInBrowser(data: Uint8Array): Promise<Uint8Array>;
}
