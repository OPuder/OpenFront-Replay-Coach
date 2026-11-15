import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const packageId = "de.openfront.replaycoach";
const outputPath = process.env.OPENFRONT_STORAGE_SNAPSHOT ?? process.argv[2] ?? "android-upgrade-storage-snapshot.json";
const adb = (...args) => execFileSync("adb", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const pid = adb("shell", "pidof", packageId).split(/\\s+/)[0];
if (!/^\\d+$/.test(pid ?? "")) throw new Error("The upgraded Android app is not running; cannot inspect its WebView.");
adb("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`);

const targets = await fetch("http://127.0.0.1:9222/json/list").then(response => {
  if (!response.ok) throw new Error(`WebView DevTools endpoint returned HTTP ${response.status}.`);
  return response.json();
});
const target = targets.find(item => item.type === "page" && item.webSocketDebuggerUrl);
if (!target) throw new Error("No inspectable WebView page was exposed by the test APK.");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", () => reject(new Error("Could not connect to the test APK WebView DevTools socket.")), { once: true });
});

let nextId = 1;
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = event => {
      let message;
      try { message = JSON.parse(typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8")); }
      catch { return; }
      if (message.id !== id) return;
      socket.removeEventListener("message", onMessage);
      if (message.error) reject(new Error(message.error.message ?? `CDP command ${method} failed.`));
      else resolve(message.result);
    };
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

try {
  await send("Runtime.enable");
  const evaluated = await send("Runtime.evaluate", {
    expression: "window.__OFRC_ANDROID_UPGRADE_TEST__ ? window.__OFRC_ANDROID_UPGRADE_TEST__.snapshot() : null",
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.text ?? "Storage snapshot threw an exception.");
  const snapshot = evaluated.result?.value;
  if (!snapshot || snapshot.schema !== "ofrc-android-upgrade-snapshot-v1") {
    throw new Error("The test-only storage inspector is missing. The installed APK may be a production build instead of the isolated test build.");
  }

  const stores = Object.fromEntries(snapshot.indexedDb.stores.map(store => [store.name, store]));
  const relationships = snapshot.indexedDb.relationships;
  const localEntries = snapshot.localStorage.entries;
  const playerId = localEntries.find(entry => entry.key === "ofrc:last-player-id")?.value;
  const trainingGoalEntry = localEntries.find(entry => entry.key === "openfront-coach-training-goal")?.value;
  const trainingGoal = trainingGoalEntry ? JSON.parse(trainingGoalEntry) : null;
  const matches = stores.matches?.records ?? [];
  const replays = stores["replay-records"]?.records ?? [];
  const profiles = stores.profiles?.records ?? [];
  const matchMetadata = matches.map(record => record.metadata ?? {});
  const replayMetadata = replays.map(record => record.metadata ?? {});
  const verifiedAnalyses = matchMetadata.filter(item => item.analysisStatus === "verified"
    && item.simulationStatus === "verified" && Number(item.sampleCount) > 0 && Number(item.actionReviewCount) > 0);
  const matchIds = new Set(matchMetadata.map(item => String(item.gameId ?? "")));
  if (playerId !== "5SVg4WbI") throw new Error("The actual UI-seeded player profile key is missing or does not match the archived profile.");
  if (!snapshot.indexedDb.relationships.profileIds.includes(playerId)
    || !snapshot.indexedDb.relationships.matchProfileIds.includes(playerId)) {
    throw new Error("The actual UI profile ID is not consistently linked across LocalStorage and IndexedDB.");
  }
  if (profiles.length < 1 || matches.length < 2 || replays.length < 2) {
    throw new Error(`Expected a real profile and at least two persisted full replays; found profiles=${profiles.length}, matches=${matches.length}, replayRecords=${replays.length}.`);
  }
  if (!verifiedAnalyses.length) throw new Error("No verified replay analysis result survived in the match records.");
  if (replayMetadata.some(item => !item.gameId || item.recordGameId !== item.gameId || !item.engineCommit)) {
    throw new Error("One or more full replay records lost their game identity or exact engine commit metadata.");
  }
  if (!trainingGoal || !matchIds.has(String(trainingGoal.gameId ?? ""))) {
    throw new Error("The actual UI-created training goal is missing or does not reference a persisted match.");
  }
  if (relationships.missingReplayRecords.length || relationships.orphanReplayRecords.length) {
    throw new Error(`IndexedDB match/replay relationships are inconsistent: ${JSON.stringify(relationships)}`);
  }

  writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));
  console.log(JSON.stringify({
    result: "PASS",
    appVersion: snapshot.appVersion,
    localStorageKeys: localEntries.map(entry => entry.key),
    verifiedAnalyses: verifiedAnalyses.length,
    fullReplayIdentityCount: replayMetadata.length,
    trainingGoalGameId: trainingGoal.gameId,
    indexedDb: snapshot.indexedDb.name,
    storeCounts: Object.fromEntries(snapshot.indexedDb.stores.map(store => [store.name, store.count])),
    profileIds: relationships.profileIds,
    matchProfileIds: relationships.matchProfileIds,
    missingReplayRecords: relationships.missingReplayRecords.length,
    orphanReplayRecords: relationships.orphanReplayRecords.length,
    snapshotFile: outputPath,
  }, null, 2));
} finally {
  socket.close();
  try { adb("forward", "--remove", "tcp:9222"); } catch {}
}
