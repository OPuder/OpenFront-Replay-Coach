import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const [mode, executable, profile, runId, evidencePath] = process.argv.slice(2);
if (!["seed", "verify"].includes(mode) || !executable || !profile || !runId || !evidencePath) {
  throw new Error("Usage: windows-profile-storage.mjs <seed|verify> <exe> <profile> <run-id> <evidence-json>");
}
if (!fs.existsSync(executable)) throw new Error("Executable missing: " + executable);

const port = 9300 + (process.pid % 1000);
const child = spawn(executable, [
  "--no-sandbox", "--disable-gpu", "--user-data-dir=" + profile,
  "--remote-debugging-port=" + port, "--remote-allow-origins=*",
], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: process.env });
let output = "";
let socket;
const pending = new Map();
let nextId = 1;
child.stdout?.on("data", chunk => output += String(chunk));
child.stderr?.on("data", chunk => output += String(chunk));

const local = {
  runId,
  marker: "openfront-rollback-local-storage",
  preferences: { theme: "dark", language: "de", enabled: true, sequence: [3, 1, 4, 1, 5] },
  payload: "local-storage-integrity-".repeat(512),
};
const records = [
  { id: "payload", runId, payload: "indexeddb-integrity-".repeat(512) },
  { id: "preferences", runId, theme: "dark", flags: ["map", "timeline", "coach"] },
  { id: "rollback-sentinel", runId, marker: "openfront-rollback-indexeddb" },
];

try {
  let page;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error("Electron exited before renderer startup: " + child.exitCode + " " + output.slice(-3000));
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json");
      page = (await response.json()).find(item => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) break;
    } catch {}
    await delay(500);
  }
  if (!page) throw new Error("No Electron renderer CDP endpoint. " + output.slice(-3000));

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("CDP open timeout")), 15000);
    socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP open failed")); }, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });

  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout " + method)); }, 25000);
    pending.set(id, {
      resolve: value => { clearTimeout(timeout); resolve(value); },
      reject: error => { clearTimeout(timeout); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await command("Runtime.enable");
  await command("Page.enable");
  let renderer;
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await command("Runtime.evaluate", {
      expression: "({title:document.title,readyState:document.readyState,rootChildren:document.querySelector('#root')?.childElementCount??0,origin:location.origin})",
      returnByValue: true,
    });
    renderer = result?.result?.value;
    if (renderer?.readyState === "complete" && renderer.rootChildren > 0) break;
    await delay(500);
  }
  if (!renderer || renderer.rootChildren < 1 || renderer.readyState !== "complete") {
    throw new Error("Renderer not ready: " + JSON.stringify(renderer));
  }

  if (mode === "seed") {
    const seedExpression = "(async () => {" +
      "localStorage.setItem('ofrc.rollback.localStorage'," + JSON.stringify(JSON.stringify(local)) + ");" +
      "localStorage.setItem('ofrc.rollback.preferences'," + JSON.stringify(JSON.stringify(local.preferences)) + ");" +
      "localStorage.setItem('ofrc.rollback.large-value'," + JSON.stringify(local.payload) + ");" +
      "const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ofrc-rollback-validation',1);" +
      "r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('evidence'))r.result.createObjectStore('evidence',{keyPath:'id'});};" +
      "r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});" +
      "await new Promise((resolve,reject)=>{const tx=db.transaction('evidence','readwrite');" +
      "for(const record of " + JSON.stringify(records) + ")tx.objectStore('evidence').put(record);" +
      "tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});" +
      "db.close();return true;})()";
    const seeded = await command("Runtime.evaluate", { expression: seedExpression, returnByValue: true, awaitPromise: true });
    if (seeded.exceptionDetails || seeded.result?.value !== true) throw new Error("Could not seed LocalStorage and IndexedDB test data");
  }

  const snapshotExpression = "(async () => {" +
    "const localStorage={};for(let i=0;i<window.localStorage.length;i++){const k=window.localStorage.key(i);localStorage[k]=window.localStorage.getItem(k);}" +
    "const infos=(await indexedDB.databases()).filter(x=>x.name).sort((a,b)=>a.name.localeCompare(b.name));const indexedDBSnapshot=[];" +
    "for(const info of infos){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(info.name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});" +
    "const stores=[];for(const name of [...db.objectStoreNames].sort()){const records=await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly');const r=tx.objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});stores.push({name,records});}" +
    "indexedDBSnapshot.push({name:db.name,version:db.version,stores});db.close();}" +
    "return {localStorage,indexedDB:indexedDBSnapshot};})()";
  const result = await command("Runtime.evaluate", { expression: snapshotExpression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error("Storage snapshot failed: " + result.exceptionDetails.text);
  const value = result.result?.value;
  if (!value || !value.localStorage || !Array.isArray(value.indexedDB)) throw new Error("Storage snapshot is incomplete");

  if (mode === "seed") {
    const baseline = {
      runId, profile, renderer,
      localStorage: value.localStorage,
      indexedDB: value.indexedDB,
      checkedAt: new Date().toISOString(),
    };
    fs.writeFileSync(evidencePath + ".baseline.json", JSON.stringify(baseline, null, 2));
    if (value.localStorage["ofrc.rollback.localStorage"] !== JSON.stringify(local) ||
        value.localStorage["ofrc.rollback.preferences"] !== JSON.stringify(local.preferences) ||
        value.localStorage["ofrc.rollback.large-value"] !== local.payload ||
        JSON.stringify(value.indexedDB.find(db => db.name === "ofrc-rollback-validation")?.stores.find(store => store.name === "evidence")?.records) !== JSON.stringify(records)) {
      throw new Error("Seeded storage does not exactly match expected complete test data");
    }
    console.log("WINDOWS_WEB_STORAGE_SEEDED", JSON.stringify({ runId, localStorageKeys: Object.keys(value.localStorage).length, indexedDBRecords: value.indexedDB.length }));
  } else {
    const baselinePath = evidencePath + ".baseline.json";
    if (!fs.existsSync(baselinePath)) throw new Error("Storage baseline evidence missing: " + baselinePath);
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    if (baseline.runId !== runId) throw new Error("Storage baseline belongs to a different test run");
    if (JSON.stringify(value.localStorage) !== JSON.stringify(baseline.localStorage) ||
        JSON.stringify(value.indexedDB) !== JSON.stringify(baseline.indexedDB)) {
      fs.writeFileSync(evidencePath, JSON.stringify({ mode, runId, profile, baseline, actual: value, renderer, checkedAt: new Date().toISOString() }, null, 2));
      throw new Error("Complete LocalStorage/IndexedDB snapshot differs from seeded baseline");
    }
    const evidence = { mode, runId, profile, renderer, localStorage: value.localStorage, indexedDB: value.indexedDB, exactSnapshotMatch: true, checkedAt: new Date().toISOString() };
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    console.log("WINDOWS_WEB_STORAGE_VERIFIED", JSON.stringify({ runId, localStorageKeys: Object.keys(value.localStorage).length, indexedDBRecords: value.indexedDB.length, exactSnapshotMatch: true }));
  }
} finally {
  try { socket?.close(); } catch {}
  if (child.pid) {
    try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
    if (child.exitCode === null) {
      await Promise.race([
        new Promise(resolve => child.once("exit", resolve)),
        delay(10000).then(() => { throw new Error("Electron process tree did not exit after taskkill"); }),
      ]);
    }
  }
}
