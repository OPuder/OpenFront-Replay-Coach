import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2] ?? "";
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("Expected a stable semantic version such as 2.2.5.");
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const lockJson = JSON.parse(readFileSync("package-lock.json", "utf8"));

packageJson.version = version;
lockJson.version = version;
if (lockJson.packages?.[""]) lockJson.packages[""].version = version;

writeFileSync("package.json", JSON.stringify(packageJson, null, 2) + "\n");
writeFileSync("package-lock.json", JSON.stringify(lockJson, null, 2) + "\n");

const startPath = "START_HERE.txt";
const startFile = readFileSync(startPath, "utf8");
writeFileSync(startPath, startFile.replace(/^OPENFRONT REPLAY COACH \d+\.\d+\.\d+/m, "OPENFRONT REPLAY COACH " + version));

const rendererPath = "src/renderer/main.tsx";
const renderer = readFileSync(rendererPath, "utf8");
const updatedRenderer = renderer.replace(/OpenFront Replay Coach · \d+\.\d+\.\d+/g, "OpenFront Replay Coach · " + version);
if (updatedRenderer !== renderer) writeFileSync(rendererPath, updatedRenderer);

const serviceWorkerPath = "public/sw.js";
const serviceWorker = readFileSync(serviceWorkerPath, "utf8");
const updatedServiceWorker = serviceWorker.replace(
  /^const CACHE_NAME = "openfront-replay-coach-shell-[^"]+";/m,
  'const CACHE_NAME = "openfront-replay-coach-shell-v' + version + '";',
);
if (updatedServiceWorker === serviceWorker) {
  throw new Error("The PWA service-worker cache version could not be updated.");
}
writeFileSync(serviceWorkerPath, updatedServiceWorker);

console.log("Release version set to " + version + ".");
