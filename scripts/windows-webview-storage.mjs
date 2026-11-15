import assert from "node:assert/strict";
import {
  UpgradeContextError, UpgradeDataLossError, isCoachRendererTarget,
} from "./windows-upgrade-storage-contract.mjs";
import { UPGRADE_FIXTURE, LOCAL_STORAGE_ENTRIES, assertFixtureRelationships } from "./windows-upgrade-fixture.mjs";

const mode = process.argv[2];
const port = Number(process.argv[3]);
const expectedInstallDirectory = process.argv[4];
if (!["seed", "snapshot", "update"].includes(mode) || !Number.isInteger(port) || port < 1 || !expectedInstallDirectory) {
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
  if(db.version!==3) throw new Error("DATA_LOSS_ERROR: unexpected application database version "+db.version);
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
  const databaseList=await indexedDB.databases();
  const metadata=databaseList.find(item=>item.name===${JSON.stringify(dbName)});
  if(!metadata) throw new Error("DATA_LOSS_ERROR: application IndexedDB database is missing");
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(${JSON.stringify(dbName)});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error("CONTEXT_ERROR: application IndexedDB is blocked"));
  });
  const names=Array.from(db.objectStoreNames).sort();
  if(!names.length) throw new Error("DATA_LOSS_ERROR: application IndexedDB has no object stores");
  const records={};
  const stores=[];
  const counts={};
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(names,"readonly");
    let pending=names.length;
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
      request.onsuccess=()=>{records[name]=request.result;counts[name]=request.result.length;if(--pending===0)resolve();};
      request.onerror=()=>reject(request.error);
    }
    tx.onabort=()=>reject(tx.error);
  });
  const localStorageValues=Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]));
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
if(!target) throw new UpgradeContextError("Expected packaged Coach DevTools target not found within 120 seconds. Expected install directory="+expectedInstallDirectory+"; observed="+JSON.stringify(observedTargets));

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
    renderer=await evaluate("({href:location.href,origin:location.origin,protocol:location.protocol,title:document.title,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??0})");
    if(renderer?.title==="OpenFront Replay Coach"&&renderer.readyState==="complete"&&renderer.rootChildren>0)break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(renderer?.title!=="OpenFront Replay Coach"||renderer.readyState!=="complete"||renderer.rootChildren<1){
    throw new UpgradeContextError("Packaged renderer did not finish initialization: "+JSON.stringify({target:target.url,renderer}));
  }
  let result;
  if(mode==="seed") result=await evaluate(seedExpression);
  else if(mode==="update") result=await evaluate(updateExpression);
  const snapshot=mode==="update"?null:await evaluate(snapshotExpression);
  if(snapshot) assertFixtureRelationships(snapshot);
  console.log(JSON.stringify({mode,targetUrl:target.url,renderer,result,snapshot}));
}catch(error){
  const message=String(error?.message??error);
  if(message.includes("DATA_LOSS_ERROR")) throw new UpgradeDataLossError(message.replace(/^.*DATA_LOSS_ERROR:\s*/,""));
  if(message.includes("CONTEXT_ERROR")) throw new UpgradeContextError(message.replace(/^.*CONTEXT_ERROR:\s*/,""));
  throw error;
}finally{
  ws.close();
}
