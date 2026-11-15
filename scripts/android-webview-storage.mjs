import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const mode = process.argv[2];
if (!["seed", "verify"].includes(mode)) throw new Error("Usage: node scripts/android-webview-storage.mjs <seed|verify>");

const adb = (...args) => execFileSync("adb", ["-s", "emulator-5554", ...args], { encoding: "utf8", timeout: 15000 }).trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const marker = "ofrc-android-upgrade-regression-v1";
const expression = mode === "seed" ? `
(async () => {
  const playerId = "upgrade-regression-player";
  const gameId = "upgrade-regression-game";
  localStorage.setItem("ofrc:last-player-id", playerId);
  localStorage.setItem("ofrc:update-regression-settings", JSON.stringify({ marker: "${marker}", theme: "dark", autoSyncEnabled: false }));
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("openfront-replay-coach", 3);
    request.onupgradeneeded = () => {
      const value = request.result;
      if (!value.objectStoreNames.contains("profiles")) value.createObjectStore("profiles", { keyPath: "playerId" });
      if (!value.objectStoreNames.contains("matches")) {
        const matches = value.createObjectStore("matches", { keyPath: ["playerId", "game.gameId"] });
        matches.createIndex("by-player-id", "playerId", { unique: false });
      } else if (!request.result.transaction.objectStore("matches").indexNames.contains("by-player-id")) {
        request.result.transaction.objectStore("matches").createIndex("by-player-id", "playerId", { unique: false });
      }
      if (!value.objectStoreNames.contains("replay-records")) value.createObjectStore("replay-records", { keyPath: ["playerId", "gameId"] });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["profiles", "matches", "replay-records"], "readwrite");
    tx.objectStore("profiles").put({ playerId, name: "Upgrade Regression Player", games: [], savedAt: 1770000000000 });
    tx.objectStore("matches").put({
      playerId, game: { gameId, map: "Regression Map", startedAt: 1770000000000 },
      result: { playerCount: 2, engineCompatibility: { engineVersionCompatible: true } },
      status: "loaded", analysisStatus: "verified",
      simulation: { status: "verified", summary: "upgrade-regression-analysis" }, updatedAt: 1770000000000
    });
    tx.objectStore("replay-records").put({ playerId, gameId, record: { marker: "${marker}", turns: [{ tick: 1, owner: 7, units: 123 }] } });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  return { seeded: true, playerId, gameId, stores: ["profiles", "matches", "replay-records"], settings: true };
})()
` : `
(async () => {
  const playerId = "upgrade-regression-player";
  const gameId = "upgrade-regression-game";
  const settings = JSON.parse(localStorage.getItem("ofrc:update-regression-settings") || "null");
  if (localStorage.getItem("ofrc:last-player-id") !== playerId) throw new Error("Last-player profile setting was lost");
  if (!settings || settings.marker !== "${marker}" || settings.theme !== "dark") throw new Error("Local settings were not preserved");
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("openfront-replay-coach", 3);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const values = await new Promise((resolve, reject) => {
    const tx = db.transaction(["profiles", "matches", "replay-records"], "readonly");
    const requests = [
      tx.objectStore("profiles").get(playerId),
      tx.objectStore("matches").get([playerId, gameId]),
      tx.objectStore("replay-records").get([playerId, gameId])
    ];
    const results = [];
    requests.forEach((request, index) => {
      request.onsuccess = () => { results[index] = request.result; if (results.filter(x => x !== undefined).length === 3) resolve(results); };
      request.onerror = () => reject(request.error);
    });
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  const [profile, match, replay] = values;
  if (!profile || profile.name !== "Upgrade Regression Player") throw new Error("Player profile record was not preserved");
  if (!match || match.analysisStatus !== "verified" || match.simulation?.summary !== "upgrade-regression-analysis") throw new Error("Replay match or analysis result was not preserved");
  if (!replay || replay.record?.marker !== "${marker}" || replay.record?.turns?.[0]?.units !== 123) throw new Error("Raw replay payload was not preserved");
  return { preserved: true, profile: true, replay: true, analysis: true, settings: true };
})()
`;

let socket = "";
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    socket = adb("shell", "cat", "/proc/net/unix").split("\\n").map(line => line.match(/(webview_devtools_remote_\\d+)/)?.[1]).filter(Boolean).at(-1) || "";
    if (socket) break;
  } catch {}
  await sleep(1000);
}
assert.ok(socket, "Debug WebView DevTools socket was not exposed; IndexedDB preservation cannot be verified.");
try { adb("forward", "tcp:9222", `localabstract:${socket}`); } catch {}
let target;
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    const response = await fetch("http://127.0.0.1:9222/json");
    const targets = await response.json();
    target = targets.find(item => item.type === "page" && item.webSocketDebuggerUrl);
    if (target) break;
  } catch {}
  await sleep(1000);
}
assert.ok(target, "Could not discover the running app WebView debugging target.");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", event => {
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else if (message.result?.exceptionDetails) reject(new Error(message.result.exceptionDetails.text || "WebView evaluation failed"));
  else resolve(message.result?.result?.value);
});
const result = await new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
});
ws.close();
console.log(JSON.stringify({ mode, result }));
