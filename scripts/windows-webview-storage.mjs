import assert from "node:assert/strict";

const mode = process.argv[2];
const port = Number(process.argv[3]);
if (!["seed", "verify"].includes(mode) || !Number.isInteger(port) || port < 1) throw new Error("Usage: windows-webview-storage.mjs <seed|verify> <port>");
const playerId = "upgrade-regression-player";
const gameId = "upgrade-regression-game";
const marker = "ofrc-windows-upgrade-data-v1";
const expression = mode === "seed"
  ? "(async()=>{" +
    "localStorage.setItem('ofrc:last-player-id','" + playerId + "');" +
    "localStorage.setItem('openfront-coach-training-goal',JSON.stringify({title:'Upgrade persistence goal',instruction:'Preserve real training focus',gameId:'" + gameId + "',mapName:'Europe',createdAt:'2026-11-15T00:00:00.000Z',completed:false}));" +"localStorage.setItem('openfront-replay-coach.phase-history.v1',JSON.stringify([{key:'" + gameId + ":7',gameId:'" + gameId + "',playedAt:'2026-11-15T00:00:00.000Z',playerName:'Upgrade Regression Player',mapName:'Europe',phases:[{id:'early',label:'Early',rating:'Starke Phase',territory:12,income:34,territoryRate:1.2,incomeRate:3.4}]}]));" +
    "const db=await new Promise((r,j)=>{const q=indexedDB.open('openfront-replay-coach',3);q.onupgradeneeded=()=>{const d=q.result;if(!d.objectStoreNames.contains('profiles'))d.createObjectStore('profiles',{keyPath:'playerId'});if(!d.objectStoreNames.contains('matches')){const s=d.createObjectStore('matches',{keyPath:['playerId','game.gameId']});s.createIndex('by-player-id','playerId',{unique:false})}if(!d.objectStoreNames.contains('replay-records'))d.createObjectStore('replay-records',{keyPath:['playerId','gameId']})};q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});" +
    "await new Promise((r,j)=>{const t=db.transaction(['profiles','matches','replay-records'],'readwrite');t.objectStore('profiles').put({playerId:'" + playerId + "',name:'Upgrade Regression Player',games:[],savedAt:1770000000000});t.objectStore('matches').put({playerId:'" + playerId + "',game:{gameId:'" + gameId + "',map:'Europe'},status:'loaded',analysisStatus:'verified',simulation:{status:'verified',summary:'upgrade-regression-analysis'},updatedAt:1770000000000});t.objectStore('replay-records').put({playerId:'" + playerId + "',gameId:'" + gameId + "',record:{marker:'" + marker + "',turns:[{tick:1,units:123}]}});t.oncomplete=r;t.onerror=()=>j(t.error)});db.close();return{seeded:true}})()"
  : "(async()=>{" +
    "const goal=JSON.parse(localStorage.getItem('openfront-coach-training-goal')||'null');const phases=JSON.parse(localStorage.getItem('openfront-replay-coach.phase-history.v1')||'null');if(localStorage.getItem('ofrc:last-player-id')!=='" + playerId + "'||goal?.gameId!=='" + gameId + "'||goal?.title!=='Upgrade persistence goal'||!Array.isArray(phases)||phases[0]?.key!=='" + gameId + ":7'||phases[0]?.phases?.[0]?.rating!=='Starke Phase')throw Error('Persisted profile/training goal/phase history lost');" +
    "const db=await new Promise((r,j)=>{const q=indexedDB.open('openfront-replay-coach',3);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});" +
    "const v=await new Promise((r,j)=>{const t=db.transaction(['profiles','matches','replay-records'],'readonly');const q=[t.objectStore('profiles').get('" + playerId + "'),t.objectStore('matches').get(['" + playerId + "','" + gameId + "']),t.objectStore('replay-records').get(['" + playerId + "','" + gameId + "'])];const a=[];let n=0;q.forEach((x,i)=>{x.onsuccess=()=>{a[i]=x.result;if(++n===3)r(a)};x.onerror=()=>j(x.error)});t.onerror=()=>j(t.error)});db.close();if(v[0]?.name!=='Upgrade Regression Player'||v[1]?.analysisStatus!=='verified'||v[1]?.simulation?.summary!=='upgrade-regression-analysis'||v[2]?.record?.marker!=='" + marker + "'||v[2]?.record?.turns?.[0]?.units!==123)throw Error('Profile/replay/analysis data lost');return{preserved:true,profile:true,lastSelectedProfile:true,replay:true,analysis:true,trainingGoal:true,phaseHistory:true}})()";

let target;
const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  try {
    const response = await fetch("http://127.0.0.1:" + port + "/json");
    if (response.ok) {
      target = (await response.json()).find(item => item.type === "page" && item.webSocketDebuggerUrl);
      if (target) break;
    }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.ok(target, "Electron renderer did not expose DevTools within 120 seconds.");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("DevTools WebSocket timeout")), 30000);
  ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
  ws.addEventListener("error", reject, { once: true });
});
const result = await new Promise((resolve, reject) => {
  ws.addEventListener("message", event => {
    const message = JSON.parse(String(event.data));
    if (message.id !== 1) return;
    if (message.error || message.result?.exceptionDetails) reject(new Error(message.error?.message ?? message.result.exceptionDetails.text));
    else resolve(message.result?.result?.value);
  });
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
});
ws.close();
console.log(JSON.stringify({ mode, result }));
