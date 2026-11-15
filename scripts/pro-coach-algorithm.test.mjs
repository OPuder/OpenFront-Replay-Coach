import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProCoachReport } from '../src/main/decoder/ProCoachAlgorithm.ts';
import { buildEngineCoachInsights } from '../src/main/decoder/EngineCoachInsights.ts';
import { selectPrimaryCoachInsights } from '../src/main/decoder/CoachInsightSelection.ts';
import { buildReplayTimeline } from '../src/main/decoder/CoachTimeline.ts';

const player=(overrides={})=>({clientID:'p1',alive:true,tiles:100,gold:500,goldEarned:1000,troops:300,outgoingAttackDetails:[],incomingAttackDetails:[],allies:0,betrayals:0,unitCounts:{City:2},...overrides});
const sample=(tick,p)=>({tick,frame:tick,players:[player(p)]});
const action=(seconds,overrides={})=>({seconds,type:'attack',label:'Attack',targetName:'Target',delta10s:{tiles:1,gold:-10,troops:-5},delta30s:{tiles:2,gold:-20,troops:-30},targetDelta30s:{tiles:-3,gold:-5,troops:-10},ownFrontContextBefore:{activeTargetCount:0,outgoingAttackCount:0,outgoingAttackTroops:0,incomingAttackCount:0,incomingAttackTroops:0},targetPressureBefore:null,...overrides});

test('does not invent a match score or tactical finding without verified samples',()=>{
 const report=buildProCoachReport([],[], 'p1',600);
 assert.equal(report.matchScore,null);
 assert.equal(report.findings.length,0);
 assert.equal(report.metrics[0].value,'–');
});

test('calculates per-phase territory and gross income rates from the selected player only',()=>{
 const samples=[sample(0,{tiles:100,goldEarned:100}),sample(1700,{tiles:160,goldEarned:700}),sample(3000,{tiles:180,goldEarned:900}),sample(4100,{tiles:220,goldEarned:1300}),sample(5000,{tiles:230,goldEarned:1500}),sample(5900,{tiles:250,goldEarned:1700})];
 const report=buildProCoachReport(samples,[],'p1',600);
 assert.equal(report.phases.length,3);
 assert.ok(report.phases[0].territoryPerMinute!==null);
 assert.ok(report.phases[0].incomePerMinute!==null);
 assert.ok(report.phases.some(p=>p.momentumIndex===100));
 assert.equal(report.metrics[0].value,'+150');
});

test('ranks repeated attack windows with troop loss and no territorial response as a review cue',()=>{
 const samples=Array.from({length:15},(_,i)=>sample(i*500,{tiles:100+i,goldEarned:100+i*20}));
 const actions=Array.from({length:6},(_,i)=>action(30+i*40,{delta30s:{tiles:0,gold:-30,troops:-80},targetDelta30s:{tiles:0,gold:0,troops:0}}));
 const report=buildProCoachReport(samples,actions,'p1',700);
 assert.equal(report.findings[0].id,'attack-follow-through');
 assert.equal(report.findings[0].priority,'high');
 assert.match(report.findings[0].caveat,/kein vollständiger Kampfabschluss/);
});

test('front overload is distinguished from proof of a bad attack',()=>{
 const samples=Array.from({length:10},(_,i)=>sample(i*500));
 const actions=Array.from({length:3},(_,i)=>action(60+i*50,{ownFrontContextBefore:{activeTargetCount:2,outgoingAttackCount:2,outgoingAttackTroops:180,incomingAttackCount:1,incomingAttackTroops:40}}));
 const report=buildProCoachReport(samples,actions,'p1',500);
 assert.ok(report.findings.some(x=>x.id==='front-load'));
 assert.match(report.findings.find(x=>x.id==='front-load').caveat,/nicht zwingend getrennte geografische Fronten/);
});


test('phase labels use full replay duration after the selected player is eliminated',()=>{
 const samples=[
  sample(0,{tiles:100,goldEarned:100}),
  sample(1000,{tiles:120,goldEarned:150}),
  sample(1790,{tiles:140,goldEarned:200}),
  sample(3000,{tiles:160,goldEarned:280}),
  sample(4190,{tiles:180,goldEarned:360}),
  sample(5000,{alive:false,tiles:0,goldEarned:0}),
  sample(6000,{alive:false,tiles:0,goldEarned:0}),
 ];
 const report=buildProCoachReport(samples,[],'p1',600);
 const late=report.phases.find(phase=>phase.id==='late');
 assert.equal(report.phases.find(phase=>phase.id==='early')?.activeSamples,3);
 assert.equal(report.phases.find(phase=>phase.id==='mid')?.activeSamples,2);
 assert.equal(late?.fromSeconds,420);
 assert.equal(late?.toSeconds,600);
 assert.equal(late?.activeSamples,0);
 assert.equal(late?.territoryPerMinute,null);
 assert.equal(late?.incomePerMinute,null);
});

test('phase momentum normalizes territory and gross income separately',()=>{
 const samples=Array.from({length:12},(_,i)=>sample(i*500,{tiles:100+i*10,goldEarned:100+i*20}));
 const report=buildProCoachReport(samples,[],'p1',600);
 assert.ok(report.phases.every(phase=>phase.momentumIndex===null||phase.momentumIndex>=0&&phase.momentumIndex<=100));
 assert.match(report.scoreExplanation,/70 %/);
 assert.ok(report.allFindings?.some(item=>item.id==='phase-focus'));
 assert.ok(!report.findings.some(item=>item.id==='phase-focus'),'Phase summaries must not displace decision-level Top-3 findings');
});

test('uses the observed sample interval for phase rates instead of the nominal phase length',()=>{
 const samples=[sample(0,{tiles:100,goldEarned:100}),sample(100,{tiles:120,goldEarned:160}),sample(200,{tiles:140,goldEarned:220}),sample(300,{tiles:160,goldEarned:280}),sample(400,{tiles:180,goldEarned:340}),sample(500,{tiles:200,goldEarned:400})];
 const report=buildProCoachReport(samples,[],'p1',1000);
 assert.equal(report.phases[0].territoryPerMinute,120);
});

test('does not treat a missing target observation as a failed attack window',()=>{
 const samples=Array.from({length:15},(_,i)=>sample(i*500,{tiles:100+i,goldEarned:100+i*20}));
 const actions=Array.from({length:6},(_,i)=>action(30+i*40,{
   delta30s:{tiles:0,gold:-30,troops:-80},
   targetDelta30s:i<4?{tiles:0,gold:0,troops:0}:null
 }));
 const report=buildProCoachReport(samples,actions,'p1',700);
 const finding=report.findings.find(x=>x.id==='attack-follow-through');
 assert.ok(finding);
 assert.match(finding.decision,/4 von 6 Angriffen/);
 assert.match(finding.consequence,/4 zeigten höhere eigene Truppenverluste ohne Gebietsreaktion/);
});


test('match coach exposes at most three high/medium engine reviews and keeps the rest as supporting evidence', () => {
  const insights = [
    { id: 'low-review', kind: 'review', priority: 'low', title: 'Low' },
    { id: 'medium-a', kind: 'review', priority: 'medium', title: 'Medium A' },
    { id: 'high-a', kind: 'review', priority: 'high', title: 'High A' },
    { id: 'observation', kind: 'observation', priority: 'high', title: 'Observation' },
    { id: 'high-b', kind: 'review', priority: 'high', title: 'High B' },
    { id: 'medium-b', kind: 'review', priority: 'medium', title: 'Medium B' },
    { id: 'medium-c', kind: 'review', priority: 'medium', title: 'Medium C' },
  ];
  const result = selectPrimaryCoachInsights(insights);
  assert.deepEqual(result.primary.map(item => item.id), ['high-a', 'high-b', 'medium-a']);
  assert.equal(result.primary.length, 3);
  assert.deepEqual(result.supporting.map(item => item.id), ['observation', 'medium-b', 'medium-c', 'low-review']);
  assert.equal(result.ordered.length, insights.length);
});

test('match coach ranks explicit decision evidence ahead of generic reviews at equal priority', () => {
  const result=selectPrimaryCoachInsights([
    {id:'generic',kind:'review',priority:'high',title:'Generic',summary:'',evidence:'',nextStep:'Review the timeline',seconds:null,limitation:'',confidence:'medium'},
    {id:'decision',kind:'review',priority:'high',title:'Decision',summary:'',evidence:'At 0:42',nextStep:'Compare the follow-up',seconds:42,limitation:'',confidence:'high',decision:'Attack opened a second target under incoming pressure',alternative:'Stabilize the threatened front first'},
  ]);
  assert.equal(result.primary[0].id,'decision');
});

test('match coach can promote a verified strength without promoting generic observations', () => {
  const insights = [
    { id: 'strength', kind: 'strength', priority: 'high', title: 'Strength' },
    { id: 'observation', kind: 'observation', priority: 'medium', title: 'Observation' },
  ];
  const result = selectPrimaryCoachInsights(insights);
  assert.deepEqual(result.primary.map(item => item.id), ['strength']);
  assert.deepEqual(result.supporting.map(item => item.id), ['observation']);
});


test('replay timeline merges recorded events and prioritized coach moments in game-time order', () => {
  const events = [
    { time: 90, title: 'Build', detail: 'First build', kind: 'Bau', turn: 900 },
    { time: 10, title: 'Attack', detail: 'First attack', kind: 'Angriff', turn: 100 },
  ];
  const insights = [
    { id: 'review-1', kind: 'review', title: 'Front overload', summary: 'Too many fronts', evidence: '3 attacks', nextStep: 'Keep reserve', seconds: 30, limitation: 'Other events may contribute.' },
    { id: 'strength-1', kind: 'strength', title: 'Strong defense', summary: 'Held the line', evidence: 'No territory loss', nextStep: 'Repeat the setup', seconds: 20, limitation: 'Only observed during this window.' },
    { id: 'no-time', kind: 'observation', title: 'Overall result', summary: 'Net growth', evidence: 'Start/end', nextStep: 'Review phases', seconds: null, limitation: 'No exact moment.' },
  ];
  const timeline = buildReplayTimeline(events, insights);
  assert.deepEqual(timeline.map(item => item.id), [
    'event-1',
    'coach-strength-1',
    'coach-review-1',
    'event-0',
  ]);
  assert.equal(timeline[1].kind, 'Stärke');
  assert.equal(timeline[1].insight?.nextStep, 'Repeat the setup');
  assert.equal(timeline[2].kind, 'Coach');
  assert.equal(timeline[2].time, 30);
});

test('replay timeline keeps recorded moments before coach markers at the same timestamp', () => {
  const timeline = buildReplayTimeline(
    [{ time: 30, title: 'Recorded', detail: 'Recorded event', kind: 'Bau', turn: 300 }],
    [{ id: 'coach', kind: 'review', title: 'Coach', summary: 'Coach event', evidence: 'Evidence', nextStep: 'Action', seconds: 30, limitation: 'Limit' }],
  );
  assert.deepEqual(timeline.map(item => item.id), ['event-0', 'coach-coach']);
});



test('piracy coach reports cumulative piracy and trade income without claiming net profit',()=>{
 const base={id:1,name:'Player',clientID:'p1',alive:true,gold:100,goldEarned:100,tradeGold:20,trainGold:0,piracyGold:5,troops:100,tiles:50,units:0,unitCounts:{},unitTroops:{},unitsUnderConstruction:0,outgoingAttacks:0,incomingAttacks:0,outgoingAttackDetails:[],incomingAttackDetails:[],attackTroops:0,allies:1,alliances:1,targets:0,betrayals:0,isTraitor:false,isDecaying:false,inDoomsdayClock:false};
 const review={playerName:'Player',clientID:'p1',startTiles:50,endTiles:60,tilesGained:10,startGold:100,endGold:200,startTroops:100,endTroops:120,outgoingAttackSamples:0,longestNoExpansionSeconds:0};
 const insights=buildEngineCoachInsights(review,[],[{tick:0,frame:0,players:[base]},{tick:1000,frame:1000,players:[{...base,piracyGold:85,tradeGold:45}]}]);
 const piracy=insights.find(x=>x.id==='piracy-and-trade-income');
 assert.ok(piracy);
 assert.match(piracy.evidence,/Piraterie: \+80 Gold/);
 assert.match(piracy.limitation,/keine Nettorendite/);
});

test('diplomacy insight reports recorded alliance intents without claiming acceptance',()=>{
 const base={id:1,name:'Player',clientID:'p1',alive:true,gold:100,goldEarned:100,tradeGold:20,trainGold:0,piracyGold:5,troops:100,tiles:50,units:0,unitCounts:{},unitTroops:{},unitsUnderConstruction:0,outgoingAttacks:0,incomingAttacks:0,outgoingAttackDetails:[],incomingAttackDetails:[],attackTroops:0,allies:1,alliances:1,targets:0,betrayals:0,isTraitor:false,isDecaying:false,inDoomsdayClock:false};
 const review={playerName:'Player',clientID:'p1',startTiles:50,endTiles:60,tilesGained:10,startGold:100,endGold:200,startTroops:100,endTroops:120,outgoingAttackSamples:0,longestNoExpansionSeconds:0};
 const action=(type,seconds)=>({frame:seconds*10,turn:seconds*10,seconds,type,commandTroops:null,label:type,details:'',targetId:'2',targetName:'Rival',targetSmallID:2,before:null,after:null,delta:null,delta5s:null,delta10s:null,delta30s:null,targetDelta10s:null,targetDelta30s:null,targetAliveBefore:null,targetAliveAt10s:null,targetAliveAt30s:null,ownFrontContextBefore:null,targetPressureBefore:null,activeAttack10s:null,activeAttack30s:null});
 const insights=buildEngineCoachInsights(review,[action('allianceRequest',30),action('breakAlliance',60)],[{tick:0,frame:0,players:[base]},{tick:1000,frame:1000,players:[base]}]);
 const diplomacy=insights.find(item=>item.id==='diplomacy-activity');
 assert.ok(diplomacy);
 assert.match(diplomacy.summary,/1 Bündnisanfragen, 0 Verlängerungen, 1 Bündnisbrüche/);
 assert.match(diplomacy.evidence,/0:30 · allianceRequest · Rival/);
 assert.match(diplomacy.limitation,/keine bestätigte Allianz/);
 assert.equal(diplomacy.kind,'observation');
});

test('opening assessment reports observed expansion but not unsupported best spawn location',()=>{
 const samples=[sample(0,{tiles:40,goldEarned:10,troops:100}),sample(300,{tiles:45,goldEarned:40,troops:95}),sample(900,{tiles:65,goldEarned:110,troops:90}),sample(1800,{tiles:90,goldEarned:220,troops:120})];
 const report=buildProCoachReport(samples,[],'p1',300);
 assert.equal(report.opening.firstExpansionSeconds,30);
 assert.equal(report.opening.territoryGainFirstThreeMinutes,50);
 assert.match(report.opening.limitation,/Startkarten-Geometrie/);
 assert.ok(report.allFindings?.some(x=>x.id==='opening-review'));
});

import { analyzeSpawnPositions } from '../src/renderer/SpawnPositionAnalysis.ts';

test('spawn analysis uses actual owner-grid adjacency and relative starting positions',()=>{
 const grid=new Uint16Array(25);
 grid[6]=1; grid[7]=2; grid[24]=3;
 const result=analyzeSpawnPositions(grid,5,5,[{id:1,clientID:'p1',name:'You'},{id:2,clientID:'p2',name:'Rival'},{id:3,clientID:'p3',name:'Far'}]);
 const you=result.find(x=>x.clientID==='p1');
 assert.equal(you.startTiles,1);
 assert.deepEqual(you.adjacentRivals,[2]);
 assert.equal(you.rivalBorderContacts,1);
 assert.equal(you.classification,'contested');
});


test('finding priority remains deterministic when evidence and coaching quality are tied',()=>{
 const samples=Array.from({length:15},(_,i)=>sample(i*500,{tiles:100+i,goldEarned:100+i*20}));
 const actions=Array.from({length:6},(_,i)=>action(30+i*40,{
   delta30s:{tiles:0,gold:-30,troops:-80},
   targetDelta30s:{tiles:0,gold:0,troops:0}
 }));
 const first=buildProCoachReport(samples,actions,'p1',700);
 const second=buildProCoachReport(samples,actions,'p1',700);
 assert.deepEqual(first.findings.map(item=>item.id),second.findings.map(item=>item.id));
 assert.ok(first.findings.length<=3);
});

test('match coach creates a spawn-position lesson from first-frame spatial evidence',()=>{
 const spawnPositions=[{id:1,clientID:'p1',name:'You',startTiles:12,centerX:24,centerY:31,adjacentRivals:[2],rivalBorderContacts:4,nearestRivalDistance:5.2,classification:'contested'}];
 const samples=[{...sample(0,{tiles:40,goldEarned:10,troops:100}),spawnPositions},sample(300,{tiles:45,goldEarned:40,troops:95}),sample(900,{tiles:65,goldEarned:110,troops:90}),sample(1800,{tiles:90,goldEarned:220,troops:120})];
 const report=buildProCoachReport(samples,[],'p1',300);
 assert.equal(report.opening.spawnPosition.classification,'contested');
 assert.ok(report.findings.some(x=>x.id==='spawn-position-review'));
 assert.match(report.opening.limitation,/Owner-Grid/);
});


test('strategic impact outranks confidence when the high-impact evidence is sparse',()=>{
 const samples=[sample(0,{tiles:100,goldEarned:100}),sample(500,{tiles:110,goldEarned:120})];
 const spawn={clientID:'p1',name:'Player',startTiles:100,centerX:1,centerY:1,adjacentRivals:[2],rivalBorderContacts:3,nearestRivalDistance:2,classification:'contested'};
 const withSpawn=samples.map((item,index)=>({...item,spawnPositions:index===0?[spawn]:[]}));
 const actions=Array.from({length:3},(_,i)=>action(5+i*10,{
   delta30s:{tiles:0,gold:-10,troops:-80},
   targetDelta30s:{tiles:0,gold:0,troops:0},
 }));
 const report=buildProCoachReport(withSpawn,actions,'p1',60);
 const attack=report.findings.find(item=>item.id==='attack-follow-through');
 const position=report.findings.find(item=>item.id==='spawn-position-review');
 assert.equal(attack?.priority,'high');
 assert.equal(attack?.confidence,'low');
 assert.equal(position?.priority,'medium');
 assert.equal(position?.confidence,'medium');
 assert.ok(report.findings.indexOf(attack)<report.findings.indexOf(position));
});

test('short sparse replays do not receive fabricated phase rates',()=>{
 const report=buildProCoachReport([
  sample(0,{tiles:100,goldEarned:100}),
  sample(20,{tiles:120,goldEarned:140}),
 ],[],'p1',600);
 assert.ok(report.phases.every(phase=>phase.territoryPerMinute===null));
 assert.equal(report.opening.confidence,'low');
});

test('troop attrition against the target is not mislabeled as a failed territorial attack',()=>{
 const samples=Array.from({length:15},(_,i)=>sample(i*500,{tiles:100+i,goldEarned:100+i*20}));
 const actions=Array.from({length:3},(_,i)=>action(30+i*40,{
   delta30s:{tiles:0,gold:-30,troops:-80},
   targetDelta30s:{tiles:0,gold:0,troops:-120},
 }));
 const report=buildProCoachReport(samples,actions,'p1',700);
 const finding=report.findings.find(item=>item.id==='attack-follow-through');
 assert.ok(finding);
 assert.match(finding.consequence,/3 weitere einen höheren beobachteten Truppenverlust beim Ziel als bei dir/);
 assert.match(finding.evidence,/beobachtete Verluste: du 80, Ziel 120/);
 assert.match(finding.title,/überwiegend günstig/);
 assert.equal(report.metrics.find(item=>item.label==='Angriffs-Folgefenster')?.value,'100 %');
 assert.match(report.metrics.find(item=>item.label==='Angriffs-Folgefenster')?.note??'',/günstigem Truppentausch/);
});

test('attack with worse own attrition is flagged only when target losses are lower and no territory is gained',()=>{
 const samples=Array.from({length:15},(_,i)=>sample(i*500,{tiles:100+i,goldEarned:100+i*20}));
 const actions=Array.from({length:3},(_,i)=>action(30+i*40,{
   delta30s:{tiles:0,gold:-30,troops:-120},
   targetDelta30s:{tiles:0,gold:0,troops:-60},
 }));
 const report=buildProCoachReport(samples,actions,'p1',700);
 const finding=report.findings.find(item=>item.id==='attack-follow-through');
 assert.ok(finding);
 assert.equal(finding.priority,'high');
 assert.match(finding.title,/ungünstigem Truppenverhältnis/);
 assert.match(finding.consequence,/3 zeigten höhere eigene Truppenverluste ohne Gebietsreaktion/);
 assert.match(finding.evidence,/beobachtete Verluste: du 120, Ziel 60/);
});

test('engine insights do not call a troop-favorable exchange good when own territory was lost',()=>{
 const review={playerName:'Player',clientID:'p1',startTiles:100,endTiles:95,tilesGained:-5,startGold:500,endGold:480,startTroops:1000,endTroops:920,outgoingAttackSamples:1,longestNoExpansionSeconds:0};
 const actionReview={frame:100,turn:10,seconds:10,type:'attack',commandTroops:100,label:'Attack',details:'',targetId:'target',targetName:'Target',targetSmallID:1,
  before:null,after:null,delta:null,delta5s:null,
  delta10s:{tiles:0,gold:-10,troops:-20,goldEarned:0,tradeGold:0,trainGold:0,piracyGold:0},
  delta30s:{tiles:-5,gold:-20,troops:-80,goldEarned:0,tradeGold:0,trainGold:0,piracyGold:0},
  targetDelta10s:null,targetDelta30s:{tiles:0,gold:0,troops:-120,goldEarned:0,tradeGold:0,trainGold:0,piracyGold:0},
  targetAliveBefore:true,targetAliveAt10s:true,targetAliveAt30s:true,ownFrontContextBefore:null,targetPressureBefore:null,activeAttack10s:null,activeAttack30s:null};
 const insight=buildEngineCoachInsights(review,[actionReview]).find(item=>item.id==='attack-response-windows');
 assert.ok(insight);
 assert.match(insight.summary,/1 gemischte Tauschfenster mit eigenem Gebietsverlust/);
 assert.match(insight.summary,/0 günstige Truppentausche ohne eigenen Gebietsverlust/);
});

test('engine insights count a favorable troop exchange only when own territory is not lost',()=>{
 const review={playerName:'Player',clientID:'p1',startTiles:100,endTiles:100,tilesGained:0,startGold:500,endGold:480,startTroops:1000,endTroops:920,outgoingAttackSamples:1,longestNoExpansionSeconds:0};
 const actionReview={frame:100,turn:10,seconds:10,type:'attack',commandTroops:100,label:'Attack',details:'',targetId:'target',targetName:'Target',targetSmallID:1,
  before:null,after:null,delta:null,delta5s:null,
  delta10s:{tiles:0,gold:-10,troops:-20,goldEarned:0,tradeGold:0,trainGold:0,piracyGold:0},
  delta30s:{tiles:0,gold:-20,troops:-80,goldEarned:0,tradeGold:0,trainGold:0,piracyGold:0},
  targetDelta10s:null,targetDelta30s:{tiles:0,gold:0,troops:-120,goldEarned:0,tradeGold:0,trainGold:0,piracyGold:0},
  targetAliveBefore:true,targetAliveAt10s:true,targetAliveAt30s:true,ownFrontContextBefore:null,targetPressureBefore:null,activeAttack10s:null,activeAttack30s:null};
 const insight=buildEngineCoachInsights(review,[actionReview]).find(item=>item.id==='attack-response-windows');
 assert.ok(insight);
 assert.match(insight.summary,/1 günstige Truppentausche ohne eigenen Gebietsverlust/);
 assert.match(insight.summary,/0 gemischte Tauschfenster mit eigenem Gebietsverlust/);
});

test('one catastrophic attack is high impact even when it is not a repeated pattern',()=>{
 const samples=Array.from({length:15},(_,i)=>sample(i*500,{tiles:1000+i*5,goldEarned:100+i*20,troops:1000}));
 const actions=[
  action(30,{delta30s:{tiles:-120,gold:-30,troops:-350},targetDelta30s:{tiles:0,gold:0,troops:-20}}),
  action(70,{delta30s:{tiles:0,gold:-30,troops:-20},targetDelta30s:{tiles:0,gold:0,troops:-100}}),
  action(110,{delta30s:{tiles:0,gold:-30,troops:-20},targetDelta30s:{tiles:0,gold:0,troops:-100}}),
 ];
 const report=buildProCoachReport(samples,actions,'p1',700);
 const finding=report.findings.find(item=>item.id==='attack-follow-through');
 assert.ok(finding);
 assert.equal(finding.priority,'high');
 assert.match(finding.evidence,/35 % des vorher beobachteten eigenen Truppenbestands/);
});

test('equal troop attrition without territory change is reported as an even trade, not a failed attack',()=>{
 const samples=Array.from({length:15},(_,i)=>sample(i*500,{tiles:100+i,goldEarned:100+i*20}));
 const actions=Array.from({length:3},(_,i)=>action(30+i*40,{
   delta30s:{tiles:0,gold:-30,troops:-80},
   targetDelta30s:{tiles:0,gold:0,troops:-80},
 }));
 const report=buildProCoachReport(samples,actions,'p1',700);
 const finding=report.findings.find(item=>item.id==='attack-follow-through');
 assert.ok(finding);
 assert.match(finding.consequence,/3 waren ausgeglichen/);
 assert.match(finding.title,/sichtbarer Gebietsreaktion/);
});

test('engine attack-response insight compares own and target troop losses',()=>{
 const player={id:1,name:'Player',clientID:'p1',alive:true,gold:100,goldEarned:100,tradeGold:0,trainGold:0,piracyGold:0,troops:1000,tiles:100,units:0,unitCounts:{},unitTroops:{},unitsUnderConstruction:0,outgoingAttacks:0,incomingAttacks:0,outgoingAttackDetails:[],incomingAttackDetails:[],attackTroops:0,allies:0,alliances:0,targets:0,betrayals:0,isTraitor:false,isDecaying:false,inDoomsdayClock:false};
 const review={playerName:'Player',clientID:'p1',startTiles:100,endTiles:100,tilesGained:0,startGold:100,endGold:100,startTroops:1000,endTroops:900,outgoingAttackSamples:3,longestNoExpansionSeconds:0};
 const actions=[{
   frame:100,turn:100,seconds:10,type:'attack',commandTroops:100,label:'Attack',details:'',targetId:'2',targetName:'Rival',targetSmallID:2,
   before:null,after:null,delta:null,delta5s:null,
   delta10s:{tiles:0,gold:0,troops:-80,goldEarned:0,tradeGold:0,trainGold:0,piracyGold:0},
   delta30s:{tiles:0,gold:0,troops:-80,goldEarned:0,tradeGold:0,trainGold:0,piracyGold:0},
   targetDelta10s:null,targetDelta30s:{tiles:0,gold:0,troops:-120,goldEarned:0,tradeGold:0,trainGold:0,piracyGold:0},
   targetAliveBefore:true,targetAliveAt10s:true,targetAliveAt30s:true,ownFrontContextBefore:null,targetPressureBefore:null,activeAttack10s:null,activeAttack30s:null,
 }];
 const insights=buildEngineCoachInsights(review,actions,[{tick:0,frame:0,players:[player]},{tick:1000,frame:1000,players:[player]}]);
 const attack=insights.find(item=>item.id==='attack-response-windows');
 assert.ok(attack);
 assert.match(attack.title,/Günstige Truppentausche/);
 assert.match(attack.summary,/1 günstige Truppentausche/);
 assert.match(attack.evidence,/eigene Truppen -80.*Zielgebiet 0.*Zieltruppen -120/);
});

test('missing target troop delta stays unknown in engine attack-response insight',()=>{
 const player={id:1,name:'Player',clientID:'p1',alive:true,gold:100,goldEarned:100,tradeGold:0,trainGold:0,piracyGold:0,troops:1000,tiles:100,units:0,unitCounts:{},unitTroops:{},unitsUnderConstruction:0,outgoingAttacks:0,incomingAttacks:0,outgoingAttackDetails:[],incomingAttackDetails:[],attackTroops:0,allies:0,alliances:0,targets:0,betrayals:0,isTraitor:false,isDecaying:false,inDoomsdayClock:false};
 const review={playerName:'Player',clientID:'p1',startTiles:100,endTiles:100,tilesGained:0,startGold:100,endGold:100,startTroops:1000,endTroops:900,outgoingAttackSamples:1,longestNoExpansionSeconds:0};
 const action={frame:100,turn:100,seconds:10,type:'attack',commandTroops:100,label:'Attack',details:'',targetId:'2',targetName:'Rival',targetSmallID:null,before:null,after:null,delta:null,delta5s:null,delta10s:{tiles:0,gold:0,troops:-80,goldEarned:0,tradeGold:0,trainGold:0,piracyGold:0},delta30s:{tiles:0,gold:0,troops:-80,goldEarned:0,tradeGold:0,trainGold:0,piracyGold:0},targetDelta10s:null,ownFrontContextBefore:null,targetPressureBefore:null,activeAttack10s:null,activeAttack30s:null};
 const insights=buildEngineCoachInsights(review,[action],[{tick:0,frame:0,players:[player]},{tick:1000,frame:1000,players:[player]}]);
 const attack=insights.find(item=>item.id==='attack-response-windows');
 assert.ok(attack);
 assert.match(attack.summary,/0 ungünstige beobachtete Truppenverhältnisse/);
 assert.doesNotMatch(attack.title,/ungünstigem Truppenverhältnis/);
});
