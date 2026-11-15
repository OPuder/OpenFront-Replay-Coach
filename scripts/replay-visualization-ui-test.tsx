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
const events=[{id:'coach-1',title:'Expansion verzögert',kind:'Coach',detail:'Ein belegter Test-Hinweis.',time:10,isCoach:true},{id:'event-2',title:'Angriff gestartet',kind:'Angriff',detail:'Engine-Ereignis.',time:15,isCoach:false}];
function TestApp(){const [selected,setSelected]=React.useState('coach-1');return <ReplayVisualization mapName="Testmap" durationSeconds={30} events={events} samples={[sample]} selectedEventId={selected} onSelectEvent={setSelected} onOpenReplay={()=>{}}/>;}
createRoot(document.getElementById('root')!).render(<TestApp/>);
(window as any).__uiTest=()=>({
  width:window.innerWidth,
  scrollWidth:document.documentElement.scrollWidth,
  buttons:[...document.querySelectorAll('button')].map(button=>({name:button.getAttribute('aria-label')||button.textContent?.trim()||'',pressed:button.getAttribute('aria-pressed')})),
  hasTerritory:!!document.querySelector('canvas.replay-viz-territory'),
  hasMovement:!!document.querySelector('.replay-viz-movements line'),
  selectedTime:document.querySelector('.replay-viz-focus-head b')?.textContent,
});
