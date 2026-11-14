import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProCoachReport } from '../src/main/decoder/ProCoachAlgorithm.ts';
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
 const samples=[sample(0,{tiles:100,goldEarned:100}),sample(1800,{tiles:160,goldEarned:700}),sample(4200,{tiles:220,goldEarned:1300}),sample(6000,{tiles:250,goldEarned:1700})];
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
 assert.match(finding.consequence,/0 von 4 auswertbaren Fenstern/);
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

import { buildEngineCoachInsights } from '../src/main/decoder/EngineCoachInsights.ts';

test('piracy coach reports cumulative piracy and trade income without claiming net profit',()=>{
 const base={id:1,name:'Player',clientID:'p1',alive:true,gold:100,goldEarned:100,tradeGold:20,trainGold:0,piracyGold:5,troops:100,tiles:50,units:0,unitCounts:{},unitTroops:{},unitsUnderConstruction:0,outgoingAttacks:0,incomingAttacks:0,outgoingAttackDetails:[],incomingAttackDetails:[],attackTroops:0,allies:1,alliances:1,targets:0,betrayals:0,isTraitor:false,isDecaying:false,inDoomsdayClock:false};
 const review={playerName:'Player',clientID:'p1',startTiles:50,endTiles:60,tilesGained:10,startGold:100,endGold:200,startTroops:100,endTroops:120,outgoingAttackSamples:0,longestNoExpansionSeconds:0};
 const insights=buildEngineCoachInsights(review,[],[{tick:0,frame:0,players:[base]},{tick:1000,frame:1000,players:[{...base,piracyGold:85,tradeGold:45}]}]);
 const piracy=insights.find(x=>x.id==='piracy-and-trade-income');
 assert.ok(piracy);
 assert.match(piracy.evidence,/Piraterie: \+80 Gold/);
 assert.match(piracy.limitation,/keine Nettorendite/);
});
