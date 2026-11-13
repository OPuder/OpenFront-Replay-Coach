import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const sourceDir = process.env.OPENFRONT_ENGINE_SOURCE;
if (!sourceDir) throw new Error("OPENFRONT_ENGINE_SOURCE is required");
const engineId = process.env.OPENFRONT_ENGINE_ID;
if (!engineId || !/^[0-9a-f]{12}$/.test(engineId)) throw new Error("OPENFRONT_ENGINE_ID must be a 12-character commit prefix");
const upstream = path.resolve(root, sourceDir);

const aliases = Object.fromEntries(
  ["engine-api", "engine-lib", "engine", "shared", "zbin"].map((name) => [
    `@openfront/${name}`,
    path.join(upstream, "packages", name, "src"),
  ]),
);

export default {
  root,
  configFile: false,
  resolve: {
    alias: [{ find: "@openfront-source", replacement: upstream }, ...Object.entries(aliases).map(([find, replacement]) => ({ find, replacement }))],
    dedupe: [],
  },
  define: {
    __ASSET_MANIFEST__: "{}",
    "process.env.WEBSOCKET_URL": JSON.stringify(""),
    "process.env.GAME_ENV": JSON.stringify("prod"),
    "process.env.API_DOMAIN": JSON.stringify("api.openfront.io"),
  },
  build: {
    outDir: path.join(root, "src", "renderer", "engine"),
    emptyOutDir: true,
    sourcemap: false,
    minify: "esbuild",
    target: "es2022",
    lib: {
      entry: path.join(here, "replay-worker-entry.ts"),
      formats: ["es"],
      fileName: () => `replay-engine-${engineId}.js`,
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  worker: {
    format: "iife",
    plugins: [],
  },
};
