import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { app, BrowserWindow } from 'electron';

const port=5187;
let server, window;
const wait=async url=>{for(let i=0;i<80;i++){try{const r=await fetch(url);if(r.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}throw new Error('Vite UI test server did not start');};
async function main(){
  app.commandLine.appendSwitch('no-sandbox');app.commandLine.appendSwitch('disable-gpu');await app.whenReady();
  server=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'});
  await wait('http://127.0.0.1:'+port+'/scripts/replay-visualization-ui-test.html');
  window=new BrowserWindow({show:true,width:375,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  await window.loadURL('http://127.0.0.1:'+port+'/scripts/replay-visualization-ui-test.html');
  window.show();
  window.focus();
  for(let i=0;i<80;i++){
    const ready=await window.webContents.executeJavaScript("typeof window.__uiTest==='function' && !!document.querySelector('canvas.replay-viz-territory')");
    if(ready)break;
    await new Promise(resolve=>setTimeout(resolve,100));
    if(i===79)throw new Error('Replay visualization did not render in the browser harness');
  }
  const results=[];
  for(const width of [320,375,768,1440]){
    window.setSize(width,900);
    await new Promise(resolve=>setTimeout(resolve,80));
    const state=await window.webContents.executeJavaScript('window.__uiTest()');
    assert.ok(state.scrollWidth<=state.width,'Horizontal overflow at '+width+'px: '+JSON.stringify(state));
    assert.ok(state.hasTerritory,'Territory overlay missing at '+width+'px');
    assert.ok(state.hasMovement,'Engine movement overlay missing at '+width+'px');
    assert.ok(state.hasTerritoryChanges,'Territory-change overlay missing at '+width+'px');
    assert.ok(state.hasPriorityCards,'Prioritized coaching card missing at '+width+'px');
    assert.ok(state.hasAffectedOverlay,'Affected-territory overlay missing at '+width+'px');
    assert.ok(state.buttons.every(button=>button.name.length>0),'Unlabelled button at '+width+'px');
    results.push({width,scrollWidth:state.scrollWidth,buttons:state.buttons.length,territory:state.hasTerritory,movement:state.hasMovement,territoryChanges:state.hasTerritoryChanges});
  }
  await window.webContents.executeJavaScript("document.querySelector('.replay-viz-priority-card').click()");
  const coached=await window.webContents.executeJavaScript('window.__uiTest()');
  assert.equal(coached.selectedTime,'00:10','Selecting a prioritized finding must synchronize the map/timeline playhead');
  assert.ok(coached.hasDecision,'Selected finding must expose its decision context');
  await window.webContents.executeJavaScript("document.querySelectorAll('.replay-viz-marker')[1].click()");
  const selected=await window.webContents.executeJavaScript("window.__uiTest()");
  assert.equal(selected.selectedTime,'00:15','Selecting a timeline marker must update the coaching time');
  assert.equal(selected.buttons.filter(button=>button.pressed==='true').length,1,'Exactly one timeline marker must be selected');
  window.show();
  window.focus();
  await new Promise(resolve=>setTimeout(resolve,100));
  await window.webContents.executeJavaScript("document.body.setAttribute('tabindex','-1'); document.body.focus()");
  await window.webContents.sendInputEvent({type:'keyDown',keyCode:'TAB'});
  await window.webContents.sendInputEvent({type:'keyUp',keyCode:'TAB'});
  const focus=await window.webContents.executeJavaScript("({tag:document.activeElement?.tagName,role:document.activeElement?.getAttribute('role'),label:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.trim()})");
  assert.equal(focus.tag,'BUTTON','Keyboard Tab must focus an interactive control');
  console.log(JSON.stringify({responsiveViewports:results,keyboardFocus:focus},null,2));
  window.destroy();server.kill();app.quit();
}
main().catch(error=>{console.error(error);if(window)window.destroy();if(server)server.kill();app.exit(1);});
