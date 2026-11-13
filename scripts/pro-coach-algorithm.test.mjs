import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProCoachReport } from '../src/main/decoder/ProCoachAlgorithm.ts';

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
 const actions=Array.from({length:4},(_,i)=>action(30+i*40,{
   delta30s:{tiles:0,gold:-30,troops:-80},
   targetDelta30s:i<2?{tiles:0,gold:0,troops:0}:null
 }));
 const report=buildProCoachReport(samples,actions,'p1',700);
 const finding=report.findings.find(x=>x.id==='attack-follow-through');
 assert.ok(finding);
 assert.match(finding.decision,/2 von 4 Angriffen/);
 assert.match(finding.consequence,/2 auswertbaren Fenstern/);
});
