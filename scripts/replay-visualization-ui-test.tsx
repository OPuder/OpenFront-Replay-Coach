import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReplayVisualization } from '../src/renderer/ReplayVisualization';
import type { ReplayStateSample } from '../src/renderer/ReplaySimulation';

const sample: ReplayStateSample = {
  tick: 100, frame: 100,
  territory: { width: 4, height: 3, ownerRuns: [1,4,2,4,0,4] },
  unitMovements: [{ ownerID: 1, fromTile: 0, targetTile: 7, troops: 1500, unitType: 'Troop' }],
  players: [
    { id:1,name:'Alpha',color:'#e85b65',clientID:'a',spawnTile:0,alive:true,gold:100,goldEarned:100,tradeGold:0,trainGold:0,piracyGold:0,troops:1500,tiles:4,units:1,unitCounts:{Troop:1},unitTroops:{Troop:1500},unitsUnderConstruction:0,outgoingAttacks:1,incomingAttacks:0,outgoingAttackDetails:[{id:'atk-1',targetID:2,troops:1500,retreating:false}],incomingAttackDetails:[],attackTroops:1500,allies:0,alliances:0,targets:1,betrayals:0,isTraitor:false,isDecaying:false,inDoomsdayClock:false },
    { id:2,name:'Bravo',color:'#58a7d8',clientID:'b',spawnTile:3,alive:true,gold:80,goldEarned:80,tradeGold:0,trainGold:0,piracyGold:0,troops:900,tiles:4,units:1,unitCounts:{Troop:1},unitTroops:{Troop:900},unitsUnderConstruction:0,outgoingAttacks:0,incomingAttacks:1,outgoingAttackDetails:[],incomingAttackDetails:[{id:'atk-1',attackerID:1,troops:1500,retreating:false}],attackTroops:0,allies:0,alliances:0,targets:0,betrayals:0,isTraitor:false,isDecaying:false,inDoomsdayClock:false },
  ],
  totalUnits:2,falloutTiles:0,
};
const previousSample: ReplayStateSample = {
  ...sample,
  tick: 50,
  frame: 50,
  territory: { width: 4, height: 3, ownerRuns: [1,5,2,3,0,4] },
};
const findings=[{id:'finding-1',matchId:'test-match',timestampSeconds:10,title:'Neue Front trotz Druck',priority:'high' as const,confidence:'medium' as const,decision:'Zweites Ziel eröffnet',context:'Eine Front war bereits aktiv.',consequence:'Truppen wurden parallel gebunden.',alternative:'Zuerst bestehende Front stabilisieren.',learningRule:'Reserve vor Folgeangriff prüfen.',evidence:[{kind:'action' as const,seconds:10,frame:100,label:'Angriff',detail:'10:00 · Ziel Bravo'}],affectedPlayers:[{name:'Alpha',ownerId:1,role:'self' as const},{name:'Bravo',ownerId:2,role:'target' as const}],affectedOwnerIds:[1,2],uncertainty:'Zielspieler wurde über eindeutigen Namen aufgelöst.'}];
const events=[{id:'pro-finding-1',title:'Neue Front trotz Druck',kind:'Strategisches Coaching',detail:'Truppen wurden parallel gebunden.',time:10,isCoach:true},{id:'coach-1',title:'Expansion verzögert',kind:'Coach',detail:'Ein belegter Test-Hinweis.',time:10,isCoach:true},{id:'event-2',title:'Angriff gestartet',kind:'Angriff',detail:'Engine-Ereignis.',time:15,isCoach:false}];
function TestApp(){const [selected,setSelected]=React.useState('coach-1');return <ReplayVisualization mapName="Testmap" durationSeconds={30} events={events} findings={findings} samples={[previousSample,sample]} selectedEventId={selected} onSelectEvent={setSelected} onOpenReplay={()=>{}}/>;}
createRoot(document.getElementById('root')!).render(<TestApp/>);
(window as any).__uiTest=()=>({
  width:window.innerWidth,
  scrollWidth:document.documentElement.scrollWidth,
  buttons:[...document.querySelectorAll('button')].map(button=>({name:button.getAttribute('aria-label')||button.textContent?.trim()||'',pressed:button.getAttribute('aria-pressed')})),
  hasTerritory:!!document.querySelector('canvas.replay-viz-territory'),
  hasPriorityCards:document.querySelectorAll('.replay-viz-priority-card').length===1,
  hasAffectedOverlay:!!document.querySelector('canvas.replay-viz-territory-affected'),
  hasDecision:document.querySelector('.replay-viz-coach-detail')?.textContent?.includes('Zweites Ziel eröffnet')??false,
  hasTerritoryChanges:!!document.querySelector('canvas.replay-viz-territory-changes'),
  hasTerritoryTransfer:document.querySelector('.replay-viz-transfer-summary')?.textContent?.includes('Alpha') && document.querySelector('.replay-viz-transfer-summary')?.textContent?.includes('Bravo'),
  hasEvidenceSeparation:!!document.querySelector('.replay-viz-coach-evidence') && !!document.querySelector('.replay-viz-coach-assessment'),
  hasConsequence:document.querySelector('.replay-viz-priority-card')?.textContent?.includes('Truppen wurden parallel gebunden')??false,
  hasMovement:!!document.querySelector('.replay-viz-movements line'),
  selectedTime:document.querySelector('.replay-viz-focus-head b')?.textContent,
});
