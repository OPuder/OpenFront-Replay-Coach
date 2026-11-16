import assert from "node:assert/strict";
import {
  UpgradeContextError, UpgradeDataLossError, isCoachRendererTarget, assertCoachRendererTarget,
} from "./windows-upgrade-storage-contract.mjs";
import { UPGRADE_FIXTURE, LOCAL_STORAGE_ENTRIES } from "./windows-upgrade-fixture.mjs";

const mode = process.argv[2];
const port = Number(process.argv[3]);
const expectedInstallDirectory = process.argv[4];
if (!["seed", "snapshot", "update", "close"].includes(mode) || !Number.isInteger(port) || port < 1 || !expectedInstallDirectory) {
  throw new Error("Usage: node scripts/windows-webview-storage.mjs <seed|snapshot|update> <port> <install-directory>");
}

const fixture = JSON.stringify(UPGRADE_FIXTURE);
const localEntries = JSON.stringify(LOCAL_STORAGE_ENTRIES);
const dbName = "openfront-replay-coach";
const dbVersion = 3;
const seedExpression = `(async()=>{
  const fixture=${fixture};
  const localEntries=${localEntries};
  localStorage.clear();
  for(const [key,value] of Object.entries(localEntries)) localStorage.setItem(key,value);
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(${JSON.stringify(dbName)},${dbVersion});
    request.onupgradeneeded=()=>{
      const value=request.result;
      if(!value.objectStoreNames.contains("matches")){
        const matches=value.createObjectStore("matches",{keyPath:["playerId","game.gameId"]});
        matches.createIndex("by-player-id","playerId",{unique:false});
      } else {
        const matches=request.transaction.objectStore("matches");
        if(!matches.indexNames.contains("by-player-id")) matches.createIndex("by-player-id","playerId",{unique:false});
      }
      if(!value.objectStoreNames.contains("profiles")) value.createObjectStore("profiles",{keyPath:"playerId"});
      if(!value.objectStoreNames.contains("replay-records")) value.createObjectStore("replay-records",{keyPath:["playerId","gameId"]});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error("IndexedDB upgrade blocked by another renderer connection"));
  });
  if(db.version!==3) throw new Error("CONTEXT_ERROR: unexpected application database version "+db.version);
  const tx=db.transaction(["profiles","matches","replay-records"],"readwrite");
  tx.objectStore("profiles").put(fixture.profile);
  tx.objectStore("matches").put(fixture.match);
  tx.objectStore("replay-records").put(fixture.replay);
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  db.close();
  return {seeded:true};
})()`;
const updateExpression = `(async()=>{
  if(!window.replayAPI||typeof window.replayAPI.installUpdate!=="function") throw new Error("CONTEXT_ERROR: Windows update IPC bridge is unavailable in the packaged renderer");
  const result=await window.replayAPI.installUpdate();
  if(!result?.scheduled) throw new Error("CONTEXT_ERROR: Windows updater did not schedule the update: "+JSON.stringify(result));
  return result;
})()`;
const snapshotExpression = `(async()=>{
  let databaseList;
  try { databaseList=await indexedDB.databases(); }
  catch(error) { throw new Error("CONTEXT_ERROR: IndexedDB metadata is inaccessible in the selected renderer: "+String(error)); }
  const metadata=databaseList.find(item=>item.name===${JSON.stringify(dbName)});
  if(!metadata) {
    const otherDatabase=databaseList.find(item=>item.name);
    let localStorageValues;
    try { localStorageValues=Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])); }
    catch(error) { throw new Error("CONTEXT_ERROR: LocalStorage is inaccessible in the selected renderer: "+String(error)); }
    return {
      renderer:{href:location.href,origin:location.origin,protocol:location.protocol,title:document.title,readyState:document.readyState},
      localStorage:localStorageValues,
      indexedDB:{name:otherDatabase?.name??${JSON.stringify(dbName)},version:otherDatabase?.version??${3},stores:[],counts:{},records:{},missing:true},
    };
  }
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(${JSON.stringify(dbName)});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error("CONTEXT_ERROR: application IndexedDB cannot be opened: "+String(request.error)));
    request.onblocked=()=>reject(new Error("CONTEXT_ERROR: application IndexedDB is blocked"));
  });
  const names=Array.from(db.objectStoreNames).sort();
  if(!names.length) {
    let localStorageValues;
    try { localStorageValues=Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])); }
    catch(error) { throw new Error("CONTEXT_ERROR: LocalStorage is inaccessible in the selected renderer: "+String(error)); }
    const emptySnapshot={
      renderer:{href:location.href,origin:location.origin,protocol:location.protocol,title:document.title,readyState:document.readyState},
      localStorage:localStorageValues,
      indexedDB:{name:db.name,version:db.version,stores:[],counts:{},records:{}},
    };
    db.close();
    return emptySnapshot;
  }
  const records={};
  const stores=[];
  const counts={};
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(names,"readonly");
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(new Error("CONTEXT_ERROR: IndexedDB read transaction failed: "+String(tx.error)));
    tx.onabort=()=>reject(new Error("CONTEXT_ERROR: IndexedDB read transaction aborted: "+String(tx.error)));
    for(const name of names){
      const store=tx.objectStore(name);
      stores.push({
        name,
        keyPath:store.keyPath,
        autoIncrement:store.autoIncrement,
        indexes:Array.from(store.indexNames).sort().map(indexName=>{
          const index=store.index(indexName);
          return {name:index.name,keyPath:index.keyPath,unique:index.unique,multiEntry:index.multiEntry};
        }),
      });
      const request=store.getAll();
      request.onsuccess=()=>{records[name]=request.result;counts[name]=request.result.length;};
      request.onerror=()=>reject(new Error("CONTEXT_ERROR: IndexedDB store "+name+" could not be read: "+String(request.error)));
    }
  });
  let localStorageValues;
  try { localStorageValues=Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])); }
  catch(error) { throw new Error("CONTEXT_ERROR: LocalStorage is inaccessible in the selected renderer: "+String(error)); }
  const snapshot={
    renderer:{href:location.href,origin:location.origin,protocol:location.protocol,title:document.title,readyState:document.readyState},
    localStorage:localStorageValues,
    indexedDB:{name:db.name,version:db.version,stores,counts,records},
  };
  db.close();
  return snapshot;
})()`;

let target;
let observedTargets=[];
const deadline=Date.now()+120000;
while(Date.now()<deadline){
  try{
    const response=await fetch("http://127.0.0.1:"+port+"/json");
    if(response.ok){
      const targets=await response.json();
      observedTargets=targets.map(item=>({type:item.type,url:item.url}));
      target=targets.find(item=>isCoachRendererTarget(item,expectedInstallDirectory));
      if(target) break;
    }
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
}
if(!target) {
  try { assertCoachRendererTarget(observedTargets.find(item=>item.type==="page") ?? null, expectedInstallDirectory); }
  catch { throw new UpgradeContextError("Expected packaged Coach DevTools target not found within 120 seconds. Expected install directory="+expectedInstallDirectory+"; observed="+JSON.stringify(observedTargets)); }
}

const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new UpgradeContextError("DevTools WebSocket did not open within 30 seconds")),30000);
  ws.addEventListener("open",()=>{clearTimeout(timer);resolve();},{once:true});
  ws.addEventListener("error",reject,{once:true});
});
let nextId=0;
const pending=new Map();
ws.addEventListener("message",event=>{
  const message=JSON.parse(String(event.data));
  const waiter=pending.get(message.id);
  if(!waiter)return;
  pending.delete(message.id);
  if(message.error||message.result?.exceptionDetails){
    const detail=message.error?.message??message.result.exceptionDetails.text;
    waiter.reject(new Error(String(detail)));
  }else waiter.resolve(message.result?.result?.value);
});
function evaluate(expression){
  const id=++nextId;
  return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});
    ws.send(JSON.stringify({id,method:"Runtime.evaluate",params:{expression,awaitPromise:true,returnByValue:true}}));
  });
}
try{
  let renderer;
  const readyDeadline=Date.now()+60000;
  while(Date.now()<readyDeadline){
    renderer=await evaluate("({href:location.href,origin:location.origin,protocol:location.protocol,title:document.title,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??0,restoreMarkerAvailable:window.__OFRC_LOCAL_LIBRARY_RESTORE_COMPLETE__!==undefined,restoreComplete:window.__OFRC_LOCAL_LIBRARY_RESTORE_COMPLETE__===true,restoreError:window.__OFRC_LOCAL_LIBRARY_RESTORE_ERROR__??null,restoreResult:window.__OFRC_LOCAL_LIBRARY_RESTORE_RESULT__??null})");
    if(renderer?.title==="OpenFront Replay Coach"&&renderer.readyState==="complete"&&renderer.rootChildren>0&&(!renderer.restoreMarkerAvailable||renderer.restoreComplete))break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(renderer?.title!=="OpenFront Replay Coach"||renderer.readyState!=="complete"||renderer.rootChildren<1||(renderer.restoreMarkerAvailable&&!renderer.restoreComplete)){
    throw new UpgradeContextError("Packaged renderer did not finish initialization: "+JSON.stringify({target:target.url,renderer}));
  }
  // The published v2.2.51 renderer may run its Update Center check once on startup.
  // Let that check settle before seeding, then diagnostics mode disables future checks.
  await new Promise(resolve=>setTimeout(resolve,1500));
  let updateCheckReady=false;
  const updateCheckDeadline=Date.now()+20000;
  while(Date.now()<updateCheckDeadline) {
    updateCheckReady=await evaluate("!document.querySelector('.update-center-trigger')?.textContent?.includes('Prüfe')");
    if(updateCheckReady) break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!updateCheckReady) throw new UpgradeContextError("Update Center startup check did not settle before storage inspection.");
  if(renderer?.restoreError) throw new UpgradeContextError("Application local-library restore failed before storage inspection: " + renderer.restoreError);
  if(mode==="snapshot" && renderer.restoreMarkerAvailable) {
    const restored=renderer.restoreResult;
    if(restored?.playerId!==UPGRADE_FIXTURE.playerId || restored?.profileLoaded!==true || restored?.profilePublicId!==UPGRADE_FIXTURE.profile.profile.publicID || !restored.matchIds?.includes(UPGRADE_FIXTURE.match.game.gameId)) {
      throw new UpgradeContextError("Application completed startup without restoring the persisted player profile and linked match: " + JSON.stringify(restored));
    }
  }
  if(mode==="close") {
    // Browser.close performs an orderly Chromium shutdown. Force-killing the
    // published baseline after CDP writes can leave LocalStorage's LevelDB
    // buffers unflushed, making a valid persisted player ID disappear on the
    // next launch and invalidating the in-place-upgrade test itself.
    const closed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new UpgradeContextError("Chromium did not close cleanly after Browser.close.")), 15000);
      ws.addEventListener("close", () => { clearTimeout(timer); resolve(true); }, { once: true });
    });
    ws.send(JSON.stringify({ id: ++nextId, method: "Browser.close", params: {} }));
    await closed;
    console.log(JSON.stringify({mode,targetUrl:target.url,renderer,closed:true}));
  } else {
    let result;
    if(mode==="seed") result=await evaluate(seedExpression);
    else if(mode==="update") result=await evaluate(updateExpression);
    const snapshot=mode==="update"?null:await evaluate(snapshotExpression);
    console.log(JSON.stringify({mode,targetUrl:target.url,renderer,result,snapshot}));
  }
}catch(error){
  const message=String(error?.message??error);
  if(message.includes("DATA_LOSS_ERROR")) throw new UpgradeDataLossError(message.replace(/^.*DATA_LOSS_ERROR:\s*/,""));
  if(message.includes("CONTEXT_ERROR")) throw new UpgradeContextError(message.replace(/^.*CONTEXT_ERROR:\s*/,""));
  throw error;
}finally{
  ws.close();
}
