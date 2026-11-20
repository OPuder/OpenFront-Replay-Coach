import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { parseExpectedWebViewPid, expectedWebViewSocketName, assertWebViewSocketPid, selectCoachWebViewTarget } from "./android-webview-target.mjs";

const mode = process.argv[2];
if (!["seed", "verify", "snapshot"].includes(mode)) throw new Error("Usage: node scripts/android-webview-storage.mjs <seed|verify>");

const adb = (...args) => execFileSync("adb", ["-s", "emulator-5554", ...args], { encoding: "utf8", timeout: 30000 }).trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const marker = "ofrc-android-upgrade-regression-v1";
const expression = mode === "seed" ? `
(async () => {
  const playerId = "upgrade-regression-player";
  const gameId = "upgrade-regression-game";
  localStorage.setItem("ofrc:last-player-id", playerId);
  localStorage.setItem("openfront-coach-training-goal", JSON.stringify({ title: "Upgrade persistence goal", instruction: "Preserve real training focus", gameId, mapName: "Europe", createdAt: "2026-11-15T00:00:00.000Z", completed: false }));
  localStorage.setItem("openfront-replay-coach.phase-history.v1", JSON.stringify([{ key: gameId + ":7", gameId, playedAt: "2026-11-15T00:00:00.000Z", playerName: "Upgrade Regression Player", mapName: "Europe", phases: [{ id: "early", label: "Early", rating: "Starke Phase", territory: 12, income: 34, territoryRate: 1.2, incomeRate: 3.4 }] }]));
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
    tx.objectStore("profiles").put({ playerId, name: "Upgrade Regression Player", games: [{ gameId }], savedAt: 1770000000000 });
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
` : mode === "verify" ? `
(async () => {
  const playerId = "upgrade-regression-player";
  const gameId = "upgrade-regression-game";
  const goal = JSON.parse(localStorage.getItem("openfront-coach-training-goal") || "null");
  const phases = JSON.parse(localStorage.getItem("openfront-replay-coach.phase-history.v1") || "null");
  if (localStorage.getItem("ofrc:last-player-id") !== playerId) throw new Error("Last-player profile setting was lost");
  if (!goal || goal.gameId !== gameId || goal.title !== "Upgrade persistence goal") throw new Error("Persisted training goal was not preserved");
  if (!Array.isArray(phases) || phases[0]?.key !== gameId + ":7" || phases[0]?.phases?.[0]?.rating !== "Starke Phase") throw new Error("Persisted longitudinal phase history was not preserved");
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
    let completed = 0;
    requests.forEach((request, index) => {
      request.onsuccess = () => { results[index] = request.result; completed++; if (completed === requests.length) resolve(results); };
      request.onerror = () => reject(request.error);
    });
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  const [profile, match, replay] = values;
  if (!profile || profile.playerId !== playerId || profile.name !== "Upgrade Regression Player" || !profile.games?.some(game => game.gameId === gameId)) throw new Error("Player profile record or profile-to-match relationship was not preserved");
  if (!match || match.playerId !== playerId || match.game?.gameId !== gameId || match.analysisStatus !== "verified" || match.simulation?.summary !== "upgrade-regression-analysis") throw new Error("Replay match, profile relationship or analysis result was not preserved");
  if (!replay || replay.playerId !== playerId || replay.gameId !== match.game.gameId || replay.record?.marker !== "${marker}" || replay.record?.turns?.[0]?.units !== 123) throw new Error("Raw replay payload or match relationship was not preserved");
  return { preserved: true, profile: true, replay: true, analysis: true, trainingGoal: true, phaseHistory: true };
` : `
(async () => {
  const localStorageValues = Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]));
  const databaseMetadata = (await indexedDB.databases()).filter(item => item.name).sort((a, b) => a.name.localeCompare(b.name));
  const databases = [];
  for (const metadata of databaseMetadata) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(metadata.name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB snapshot open blocked: " + metadata.name));
    });
    const stores = [];
    for (const storeName of Array.from(db.objectStoreNames).sort()) {
      const storeInfo = await new Promise((resolve, reject) => {
        const tx = db.transaction([storeName], "readonly");
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve({
          name: storeName, keyPath: store.keyPath, autoIncrement: store.autoIncrement,
          indexes: Array.from(store.indexNames).sort().map(indexName => {
            const index = store.index(indexName);
            return { name: index.name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
          }),
          records: request.result
        });
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      });
      stores.push(storeInfo);
    }
    databases.push({ name: db.name, version: db.version, stores });
    db.close();
  }
  return { localStorage: localStorageValues, indexedDB: databases };
})()
`;

let socket = "";
let target;
let observedSockets = [];
let observedTargets = [];
const expectedAppPid = parseExpectedWebViewPid(process.env.ANDROID_WEBVIEW_PID);
const expectedSocketName = expectedWebViewSocketName(expectedAppPid);
for (let attempt = 0; attempt < 120 && !target; attempt++) {
  try {
    const sockets = [...new Set(adb("shell", "cat", "/proc/net/unix").split(/\r?\n/).map(line => line.match(/(webview_devtools_remote_\d+)/)?.[1]).filter(Boolean))];
    observedSockets = sockets;
    // Fail closed: never forward or inspect a WebView belonging to another PID.
    const candidateSocket = sockets.find(value => value === expectedSocketName);
    if (!candidateSocket) {
      await sleep(1000);
      continue;
    }
    const socketPid = assertWebViewSocketPid(candidateSocket, expectedAppPid);
    try { adb("forward", "--remove", "tcp:9222"); } catch {}
    adb("forward", "tcp:9222", "localabstract:" + candidateSocket);
    for (const endpoint of ["/json/list", "/json"]) {
      try {
        const response = await fetch("http://127.0.0.1:9222" + endpoint, { signal: AbortSignal.timeout(3000) });
        if (!response.ok) continue;
        const targets = await response.json();
        if (!Array.isArray(targets)) continue;
        observedTargets = targets.map(item => ({ type: item.type, url: item.url, title: item.title }));
        target = selectCoachWebViewTarget(targets, candidateSocket, expectedAppPid);
        if (target) { socket = candidateSocket; break; }
      } catch {}
    }
    if (target) {
      assertWebViewSocketPid(socket, expectedAppPid);
      if (socketPid !== expectedAppPid) throw new Error("CONTEXT_ERROR: WebView socket PID changed during target selection.");
    }
  } catch (error) {
    if (String(error?.message ?? error).includes("CONTEXT_ERROR")) throw error;
  }
  if (!target) await sleep(1000);
}
if (!target) {
  throw new Error("CONTEXT_ERROR: No application WebView target was exposed by the exact foreground PID " + expectedAppPid +
    ". Required socket=" + expectedSocketName + "; observed sockets=" + JSON.stringify(observedSockets) +
    "; targets=" + JSON.stringify(observedTargets));
}
console.log("ANDROID_WEBVIEW_TARGET " + JSON.stringify({
  expectedAppPid,
  adbDeviceState: adb("get-state"),
  process: adb("shell", "ps", "-A").split(/\r?\n/).filter(line => line.includes(expectedAppPid)).slice(0, 5),
  socket: socket,
  socketPid: assertWebViewSocketPid(socket, expectedAppPid),
  target: { type: target.type, title: target.title ?? null, url: target.url, hasWebSocketDebuggerUrl: Boolean(target.webSocketDebuggerUrl) },
}));
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
const evaluate = source => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression: source, awaitPromise: true, returnByValue: true } }));
});
let renderer;
for (let attempt = 0; attempt < 60; attempt++) {
  renderer = await evaluate("({href:location.href,origin:location.origin,title:document.title,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??0})");
  if (renderer?.title === "OpenFront Replay Coach" && renderer.readyState === "complete" && renderer.rootChildren > 0) break;
  await sleep(1000);
}
if (renderer?.title !== "OpenFront Replay Coach" || renderer.readyState !== "complete" || renderer.rootChildren < 1) {
  ws.close();
  throw new Error("CONTEXT_ERROR: DevTools connected to a WebView that is not the initialized Coach renderer: " + JSON.stringify({target: target.url, renderer}));
}
const result = await evaluate(expression);
ws.close();
console.log(JSON.stringify({ mode, expectedAppPid, socket, socketPid: assertWebViewSocketPid(socket, expectedAppPid), targetUrl: target.url, renderer, result }));
