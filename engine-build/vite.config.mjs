import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const upstream = path.join(root, "vendor", "OpenFrontIO");

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
    alias: aliases,
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
      fileName: () => "replay-engine.js",
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
