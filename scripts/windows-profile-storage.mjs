import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
const [mode, executable, profile, runId, evidencePath] = process.argv.slice(2);
if (!["seed","verify"].includes(mode) || !executable || !profile || !runId || !evidencePath) throw new Error("Usage: windows-profile-storage.mjs <seed|verify> <exe> <profile> <run-id> <evidence-json>");
if (!fs.existsSync(executable)) throw new Error("Executable missing: " + executable);
const port=9300+(process.pid%1000);
const child=spawn(executable,["--no-sandbox","--disable-gpu","--user-data-dir="+profile,"--remote-debugging-port="+port,"--remote-allow-origins=*"],{stdio:["ignore","pipe","pipe"],windowsHide:true,env:process.env});
let output="",socket; child.stdout?.on("data",c=>output+=String(c)); child.stderr?.on("data",c=>output+=String(c));
const pending=new Map();let nextId=1;
try{
 let page;
 for(let i=0;i<120;i++){if(child.exitCode!==null)throw new Error("Electron exited before renderer startup: "+child.exitCode+" "+output.slice(-3000));try{const r=await fetch("http://127.0.0.1:"+port+"/json");page=(await r.json()).find(x=>x.type==="page"&&x.webSocketDebuggerUrl);if(page)break;}catch{}await delay(500);}
 if(!page)throw new Error("No Electron renderer CDP endpoint. "+output.slice(-3000));
 socket=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error("CDP open timeout")),15000);socket.addEventListener("open",()=>{clearTimeout(t);resolve();},{once:true});socket.addEventListener("error",()=>{clearTimeout(t);reject(new Error("CDP open failed"));},{once:true});});
 socket.addEventListener("message",e=>{const m=JSON.parse(e.data);if(!m.id||!pending.has(m.id))return;const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);});
 const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=nextId++,timer=setTimeout(()=>{pending.delete(id);reject(new Error("CDP timeout "+method));},25000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});
 await cmd("Runtime.enable");await cmd("Page.enable");
 let renderer;
 for(let i=0;i<100;i++){const r=await cmd("Runtime.evaluate",{expression:"({title:document.title,readyState:document.readyState,rootChildren:document.querySelector('#root')?.childElementCount??0,origin:location.origin})",returnByValue:true});renderer=r?.result?.value;if(renderer?.readyState==="complete"&&renderer.rootChildren>0)break;await delay(500);}
 if(!renderer||renderer.rootChildren<1||renderer.readyState!=="complete")throw new Error("Renderer not ready: "+JSON.stringify(renderer));
 const local={runId,marker:"openfront-rollback-local-storage"},record={id:"rollback-sentinel",runId,marker:"openfront-rollback-indexeddb"};
 const expression=mode==="seed"
 ? `(async()=>{localStorage.setItem("ofrc.rollback.localStorage",JSON.stringify(${JSON.stringify(local)}));const db=await new Promise((ok,no)=>{const r=indexedDB.open("ofrc-rollback-validation",1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains("evidence"))r.result.createObjectStore("evidence",{keyPath:"id"});};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});await new Promise((ok,no)=>{const tx=db.transaction("evidence","readwrite");tx.objectStore("evidence").put(${JSON.stringify(record)});tx.oncomplete=ok;tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error);});db.close();return {localStorage:JSON.parse(localStorage.getItem("ofrc.rollback.localStorage")),indexedDB:"write-committed"};})()`
 : `(async()=>{const local=JSON.parse(localStorage.getItem("ofrc.rollback.localStorage")||"null");const db=await new Promise((ok,no)=>{const r=indexedDB.open("ofrc-rollback-validation",1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});if(!db.objectStoreNames.contains("evidence"))throw new Error("IndexedDB store missing");const data=await new Promise((ok,no)=>{const tx=db.transaction("evidence","readonly");const r=tx.objectStore("evidence").get("rollback-sentinel");r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});db.close();return {localStorage:local,indexedDB:data};})()`;
 const result=await cmd("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
 if(result.exceptionDetails)throw new Error("Storage evaluation exception: "+result.exceptionDetails.text);
 const value=result.result?.value;
 if(value?.localStorage?.runId!==runId)throw new Error("LocalStorage mismatch: "+JSON.stringify(value));
 if(mode==="seed"&&value.indexedDB!=="write-committed")throw new Error("IndexedDB write not committed");
 if(mode==="verify"&&(value.indexedDB?.runId!==runId||value.indexedDB?.marker!==record.marker))throw new Error("IndexedDB mismatch: "+JSON.stringify(value));
 const evidence={mode,runId,profile,renderer,localStorage:value.localStorage,indexedDB:value.indexedDB,checkedAt:new Date().toISOString()};
 fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));console.log(mode==="seed"?"WINDOWS_WEB_STORAGE_SEEDED":"WINDOWS_WEB_STORAGE_VERIFIED",JSON.stringify(evidence));
}finally{try{socket?.close();}catch{}try{if(child.pid)execFileSync("taskkill",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});}catch{}}
