import assert from "node:assert/strict";

const mode = process.argv[2];
const port = Number(process.argv[3]);
if (!["seed", "verify"].includes(mode) || !Number.isInteger(port) || port < 1) throw new Error("Usage: windows-webview-storage.mjs <seed|verify> <port>");

const playerId = "upgrade-regression-player";
const gameId = "upgrade-regression-game";
const marker = "ofrc-windows-upgrade-data-v1";
const expression = mode === "seed"
  ? `(async()=>{
    localStorage.setItem("ofrc:last-player-id", ${JSON.stringify(playerId)});
    localStorage.setItem("openfront-coach-training-goal", JSON.stringify({title:"Upgrade persistence goal",instruction:"Preserve real training focus",gameId:${JSON.stringify(gameId)},mapName:"Europe",createdAt:"2026-11-15T00:00:00.000Z",completed:false}));
    localStorage.setItem("openfront-replay-coach.phase-history.v1", JSON.stringify([{key:${JSON.stringify(gameId+":7")},gameId:${JSON.stringify(gameId)},playedAt:"2026-11-15T00:00:00.000Z",playerName:"Upgrade Regression Player",mapName:"Europe",phases:[{id:"early",label:"Early",rating:"Starke Phase",territory:12,income:34,territoryRate:1.2,incomeRate:3.4}]}]));
    const db = await new Promise((resolve,reject)=>{
      const request=indexedDB.open("openfront-replay-coach",3);
      request.onupgradeneeded=()=>{
        const d=request.result;
        const upgradeTransaction=request.transaction;
        if(!d.objectStoreNames.contains("profiles")) d.createObjectStore("profiles",{keyPath:"playerId"});
        if(!d.objectStoreNames.contains("matches")) {
          const store=d.createObjectStore("matches",{keyPath:["playerId","game.gameId"]});
          store.createIndex("by-player-id","playerId",{unique:false});
        } else if(!upgradeTransaction.objectStore("matches").indexNames.contains("by-player-id")) {
          upgradeTransaction.objectStore("matches").createIndex("by-player-id","playerId",{unique:false});
        }
        if(!d.objectStoreNames.contains("replay-records")) d.createObjectStore("replay-records",{keyPath:["playerId","gameId"]});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(["profiles","matches","replay-records"],"readwrite");
      tx.objectStore("profiles").put({playerId:${JSON.stringify(playerId)},name:"Upgrade Regression Player",games:[],savedAt:1770000000000});
      tx.objectStore("matches").put({playerId:${JSON.stringify(playerId)},game:{gameId:${JSON.stringify(gameId)},map:"Europe"},status:"loaded",analysisStatus:"verified",simulation:{status:"verified",summary:"upgrade-regression-analysis"},updatedAt:1770000000000});
      tx.objectStore("replay-records").put({playerId:${JSON.stringify(playerId)},gameId:${JSON.stringify(gameId)},record:{marker:${JSON.stringify(marker)},turns:[{tick:1,units:123}]}});
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error);
    });
    db.close();
    return {seeded:true};
  })()`
  : `(async()=>{
    const goal=JSON.parse(localStorage.getItem("openfront-coach-training-goal")||"null");
    const phases=JSON.parse(localStorage.getItem("openfront-replay-coach.phase-history.v1")||"null");
    if(localStorage.getItem("ofrc:last-player-id")!==${JSON.stringify(playerId)}||goal?.gameId!==${JSON.stringify(gameId)}||goal?.title!=="Upgrade persistence goal"||!Array.isArray(phases)||phases[0]?.key!==${JSON.stringify(gameId+":7")}||phases[0]?.phases?.[0]?.rating!=="Starke Phase") throw Error("Persisted profile/training goal/phase history lost");
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open("openfront-replay-coach",3);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    const values=await new Promise((resolve,reject)=>{
      const tx=db.transaction(["profiles","matches","replay-records"],"readonly");
      const requests=[
        tx.objectStore("profiles").get(${JSON.stringify(playerId)}),
        tx.objectStore("matches").get([${JSON.stringify(playerId)},${JSON.stringify(gameId)}]),
        tx.objectStore("replay-records").get([${JSON.stringify(playerId)},${JSON.stringify(gameId)}])
      ];
      const result=[];
      let remaining=requests.length;
      requests.forEach((request,index)=>{
        request.onsuccess=()=>{result[index]=request.result;if(--remaining===0)resolve(result);};
        request.onerror=()=>reject(request.error);
      });
      tx.onabort=()=>reject(tx.error);
    });
    const snapshot={
      href:location.href,
      origin:location.origin,
      title:document.title,
      readyState:document.readyState,
      localStorageKeys:Object.keys(localStorage).sort(),
      lastPlayerId:localStorage.getItem("ofrc:last-player-id"),
      trainingGoal:goal,
      phaseHistory:phases,
      indexedDB:{name:db.name,version:db.version,stores:Array.from(db.objectStoreNames).sort(),profile:values[0],match:values[1],replayRecord:values[2]}
    };
    db.close();
    if(snapshot.title!=="OpenFront Replay Coach"||snapshot.readyState!=="complete") throw Error("Unexpected renderer document while verifying persisted storage: "+JSON.stringify({href:snapshot.href,origin:snapshot.origin,title:snapshot.title,readyState:snapshot.readyState}));
    if(values[0]?.name!=="Upgrade Regression Player"||values[1]?.analysisStatus!=="verified"||values[1]?.simulation?.summary!=="upgrade-regression-analysis"||values[2]?.record?.marker!==${JSON.stringify(marker)}||values[2]?.record?.turns?.[0]?.units!==123) throw Error("Profile/replay/analysis data lost: "+JSON.stringify(snapshot));
    return {preserved:true,profile:true,lastSelectedProfile:true,replay:true,analysis:true,trainingGoal:true,phaseHistory:true,snapshot};
  })()`;

const isCoachRenderer = url => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "file:" && decodeURIComponent(parsed.pathname).toLowerCase().endsWith("/resources/app.asar/dist/index.html");
  } catch {
    return false;
  }
};

let target;
let observedTargets = [];
const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  try {
    const response = await fetch("http://127.0.0.1:" + port + "/json");
    if (response.ok) {
      const targets = await response.json();
      observedTargets = targets.map(item => ({ type: item.type, url: item.url }));
      target = targets.find(item => item.type === "page" && item.webSocketDebuggerUrl && isCoachRenderer(item.url));
      if (target) break;
    }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.ok(target, "The actual packaged Coach renderer did not expose DevTools within 120 seconds. Observed targets: " + JSON.stringify(observedTargets));

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("DevTools WebSocket timeout")), 30000);
  ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
  ws.addEventListener("error", reject, { once: true });
});
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", event => {
  const message = JSON.parse(String(event.data));
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error || message.result?.exceptionDetails) waiter.reject(new Error(message.error?.message ?? message.result.exceptionDetails.text));
  else waiter.resolve(message.result?.result?.value);
});
function evaluate(source) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression: source, awaitPromise: true, returnByValue: true } }));
  });
}

try {
  let ready;
  const readyDeadline = Date.now() + 60000;
  while (Date.now() < readyDeadline) {
    ready = await evaluate("({href:location.href,origin:location.origin,title:document.title,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??0})");
    if (ready?.title === "OpenFront Replay Coach" && ready.readyState === "complete" && ready.rootChildren > 0) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready?.title === "OpenFront Replay Coach" && ready.readyState === "complete" && ready.rootChildren > 0,
    "Packaged renderer did not finish initializing before storage inspection: " + JSON.stringify({targetUrl:target.url,ready}));

  const actual = await evaluate(expression);
  console.log(JSON.stringify({ mode, targetUrl: target.url, renderer: ready, result: actual }));
} finally {
  ws.close();
}
