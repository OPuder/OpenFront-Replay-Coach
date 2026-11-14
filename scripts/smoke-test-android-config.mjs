import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const config = readFileSync(path.join(root, "capacitor.config.ts"), "utf8");
const adapter = readFileSync(path.join(root, "src/renderer/platform/BrowserReplayAPI.ts"), "utf8");
const renderer = readFileSync(path.join(root, "src/renderer/main.tsx"), "utf8");
const versionScript = readFileSync(path.join(root, "scripts/set-android-version.mjs"), "utf8");
const updaterPlugin = readFileSync(path.join(root, "android-updater-template/ApkUpdaterPlugin.java"), "utf8");
const updaterInstaller = readFileSync(path.join(root, "scripts/install-android-updater-plugin.mjs"), "utf8");
const nativeIcon = path.join(root, "assets/icon.svg");

for (const name of ["@capacitor/core", "@capacitor/android", "@capacitor/browser", "@capacitor/filesystem", "@capacitor/share"]) {
  const version = packageJson.dependencies?.[name];
  assert.ok(version?.startsWith("8."), "Missing or incompatible Capacitor dependency: " + name);
}
assert.ok(packageJson.devDependencies?.["@capacitor/cli"]?.startsWith("8."), "Capacitor CLI major version must match Android runtime");
assert.equal(packageJson.devDependencies?.["@capacitor/assets"], "4.0.0", "Capacitor brand asset generator is missing");
assert.ok(readFileSync(nativeIcon, "utf8").includes("<svg"), "Branded Android icon SVG is missing");
assert.ok(config.includes("CapacitorHttp:") && config.includes("enabled: true"), "Native HTTP integration must be enabled");
assert.ok(config.includes('appId: "de.openfront.replaycoach"'), "Android package ID is incorrect");
assert.ok(adapter.includes("Capacitor.isNativePlatform()") && adapter.includes('Capacitor.getPlatform() === "android"'), "Native Android platform detection is missing");
assert.ok(adapter.includes('const API_BASE = IS_NATIVE_ANDROID ? "https://api.openfront.io/public" : "/api/openfront/public";'), "Android API and browser proxy routes are not separated");
assert.ok(adapter.includes("https://openfront.io/"), "Native Android engine manifest request is missing");
assert.ok(adapter.includes("Filesystem.writeFile") && adapter.includes("Directory.Cache"), "Native Android replay file export is missing");
assert.ok(adapter.includes("Share.share") && adapter.includes("Browser.open"), "Native Android share/browser integration is missing");
assert.ok(renderer.includes("!Capacitor.isNativePlatform()") && renderer.includes("navigator.serviceWorker.register"), "PWA service worker must stay disabled inside native Android app");
assert.ok(versionScript.includes("versionCode") && versionScript.includes("versionName"), "Android versionCode/versionName logic is missing");
assert.ok(updaterPlugin.includes("MessageDigest.getInstance(\"SHA-256\")") && updaterPlugin.includes("FileProvider.getUriForFile"), "Secure Android APK updater plugin is missing");
assert.ok(updaterInstaller.includes("registerPlugin(ApkUpdaterPlugin.class)") && updaterInstaller.includes("updater-fileprovider"), "Android updater plugin registration is missing");

console.log("Android configuration smoke test passed: Capacitor HTTP, public OpenFront API, native exports and app versioning are configured.");
