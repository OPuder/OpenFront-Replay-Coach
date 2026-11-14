import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLongitudinalCoachReport } from '../src/main/decoder/LongitudinalCoach.ts';

const makeSimulation = (overrides = {}) => ({
  status: 'verified',
  totalTicks: 7000,
  verifiedHashes: 100,
  samples: Array.from({ length: 15 }, (_, i) => ({
    tick: i * 500,
    frame: i * 500,
    players: [{
      clientID: 'p1',
      alive: true,
      tiles: 100 + i,
      gold: 500 + i * 10,
      goldEarned: 100 + i * 20,
      troops: 300 + i * 5,
      outgoingAttackDetails: [],
      incomingAttackDetails: [],
      allies: 0,
      betrayals: 0,
      unitCounts: { City: 2 },
    }],
  })),
  playerReview: { clientID: 'p1' },
  actionReviews: Array.from({ length: 6 }, (_, i) => ({
    seconds: 30 + i * 40,
    type: 'attack',
    label: 'Attack',
    targetName: 'Target',
    delta10s: { tiles: 0, gold: -10, troops: -20 },
    delta30s: { tiles: 0, gold: -30, troops: -80 },
    targetDelta30s: { tiles: 0, gold: 0, troops: 0 },
    ownFrontContextBefore: null,
    targetPressureBefore: null,
  })),
  ...overrides,
});

const match = (gameId, overrides = {}) => ({
  gameId,
  mapName: 'Europe',
  mode: 'Free For All',
  type: 'Private',
  durationSeconds: 700,
  analysisStatus: 'verified',
  simulation: makeSimulation(),
  ...overrides,
});

test('recurring findings use only fully verified matches in the same mode and type', () => {
  const report = buildLongitudinalCoachReport([
    match('a'),
    match('b', { mapName: 'Levant' }),
    match('c', { analysisStatus: 'unverified', simulation: makeSimulation({ status: 'unverified' }) }),
    match('d', { mode: 'Teams' }),
    match('e', { analysisStatus: 'unsupported', simulation: undefined }),
  ]);
  assert.equal(report.status, 'ready');
  assert.equal(report.importedMatches, 5);
  assert.equal(report.verifiedMatches, 3);
  assert.equal(report.excludedMatches, 3);
  assert.equal(report.comparableMatches, 2);
  assert.equal(report.comparableGroup, 'Free For All · Private');
  assert.ok(report.recurringFindings.some(finding => finding.id === 'attack-follow-through'));
  assert.equal(report.recurringFindings.find(finding => finding.id === 'attack-follow-through')?.occurrences, 2);
});

test('one verified match never becomes a recurring coaching claim', () => {
  const report = buildLongitudinalCoachReport([
    match('a'),
    match('b', { analysisStatus: 'failed', simulation: makeSimulation({ status: 'unverified' }) }),
  ]);
  assert.equal(report.status, 'insufficient-data');
  assert.equal(report.comparableMatches, 1);
  assert.equal(report.recurringFindings.length, 0);
});

test('unverified and unsupported matches cannot influence phase patterns', () => {
  const report = buildLongitudinalCoachReport([
    match('a'),
    match('b', { analysisStatus: 'unsupported', simulation: undefined }),
    match('c', { analysisStatus: 'unverified', simulation: makeSimulation({ status: 'unverified' }) }),
  ]);
  assert.equal(report.verifiedMatches, 1);
  assert.equal(report.excludedMatches, 2);
  assert.equal(report.phaseSummaries.reduce((sum, phase) => sum + phase.matchesWithData, 0), 3);
  assert.equal(report.recurringFindings.length, 0);
});

test('mixed modes are not combined into a misleading longitudinal cohort', () => {
  const report = buildLongitudinalCoachReport([
    match('a'),
    match('b', { mode: 'Teams' }),
    match('c', { mode: 'Teams' }),
  ]);
  assert.equal(report.verifiedMatches, 3);
  assert.equal(report.comparableMatches, 2);
  assert.equal(report.comparableGroup, 'Teams · Private');
});

test('progression is chronological and only includes verified matches', () => {
  const report=buildLongitudinalCoachReport([
    match('later',{playedAt:'2026-02-02T00:00:00Z'}),
    match('earlier',{playedAt:'2026-02-01T00:00:00Z',simulation:makeSimulation({samples:makeSimulation().samples.map(sample=>({...sample,players:sample.players.map(player=>({...player,tiles:player.tiles*2,goldEarned:player.goldEarned*2}))}))})}),
    match('ignored',{playedAt:'2026-02-03T00:00:00Z',analysisStatus:'unverified',simulation:makeSimulation({status:'unverified'})}),
  ]);
  assert.deepEqual(report.matchProgress.map(item=>item.gameId),['earlier','later']);
  assert.equal(report.matchProgress.length,2);
  assert.equal(report.metricTrends.length,3);
  assert.equal(report.metricTrends.find(item=>item.id==='territory')?.direction,'declined');
});
test('progression does not claim a trend from one match',()=>{
  const report=buildLongitudinalCoachReport([match('only')]);
  assert.equal(report.metricTrends.find(item=>item.id==='territory')?.direction,'insufficient-data');
});

test('attack follow-through compares only attacks with observed target outcomes',()=>{
  const simulation=makeSimulation({actionReviews:[
    {type:'attack',seconds:20,delta30s:{tiles:2,gold:0,troops:-10},targetDelta30s:{tiles:0,gold:0,troops:0}},
    {type:'attack',seconds:40,delta30s:{tiles:0,gold:0,troops:-20},targetDelta30s:{tiles:-3,gold:0,troops:-10}},
    {type:'attack',seconds:60,delta30s:{tiles:0,gold:0,troops:-30},targetDelta30s:{tiles:0,gold:0,troops:0}},
    {type:'attack',seconds:80,delta30s:{tiles:0,gold:0,troops:-30},targetDelta30s:null},
    {type:'build',seconds:90,delta30s:{tiles:0,gold:0,troops:0},targetDelta30s:{tiles:0,gold:0,troops:0}},
  ]});
  const report=buildLongitudinalCoachReport([match('a',{simulation}),match('b',{simulation})]);
  assert.ok(Math.abs(report.matchProgress[0].attackFollowThroughPercent - 200/3) < 1e-9);
  assert.equal(report.matchProgress[0].attackFollowThroughSamples, 3);
  assert.equal(report.metricTrends.find(item=>item.id==='attack-follow-through')?.observations, 2);
  assert.equal(report.metricTrends.find(item=>item.id==='attack-follow-through')?.direction,'stable');
});

test('attack follow-through keeps own territory gains when target observation is missing', () => {
  const simulation=makeSimulation({actionReviews:[
    {type:'attack',seconds:20,delta30s:{tiles:2,gold:0,troops:-10},targetDelta30s:null},
    {type:'attack',seconds:40,delta30s:{tiles:0,gold:0,troops:-20},targetDelta30s:null},
  ]});
  const report=buildLongitudinalCoachReport([match('a',{simulation})]);
  assert.equal(report.matchProgress[0].attackFollowThroughSamples, 1);
  assert.equal(report.matchProgress[0].attackFollowThroughPercent, 100);
});


test('recurring strengths are surfaced across multiple verified comparable matches',()=>{
  const strengthSimulation=makeSimulation({
    playerReview:{
      clientID:'p1',playerName:'Player',startTiles:100,endTiles:110,tilesGained:10,
      startGold:500,endGold:700,startTroops:300,endTroops:320,
      outgoingAttackSamples:0,longestNoExpansionSeconds:0,
    },
    samples:[
      {tick:0,frame:0,players:[{clientID:'p1',alive:true,tiles:100,gold:500,goldEarned:100,tradeGold:0,trainGold:0,piracyGold:0,troops:300,units:1,unitCounts:{City:1},unitsUnderConstruction:0,outgoingAttacks:0,incomingAttacks:1,incomingAttackDetails:[{attackerID:2,troops:200}],outgoingAttackDetails:[],allies:0,alliances:0,targets:0,betrayals:0,isTraitor:false,isDecaying:false,inDoomsdayClock:false}]},
      {tick:150,frame:150,players:[{clientID:'p1',alive:true,tiles:100,gold:510,goldEarned:110,tradeGold:0,trainGold:0,piracyGold:0,troops:290,units:1,unitCounts:{City:1},unitsUnderConstruction:0,outgoingAttacks:0,incomingAttacks:0,incomingAttackDetails:[],outgoingAttackDetails:[],allies:0,alliances:0,targets:0,betrayals:0,isTraitor:false,isDecaying:false,inDoomsdayClock:false}]},
    ],
    actionReviews:[],
  });
  const report=buildLongitudinalCoachReport([
    match('strength-a',{simulation:strengthSimulation}),
    match('strength-b',{simulation:strengthSimulation}),
  ]);
  const strength=report.recurringStrengths.find(item=>item.id==='defensive-resilience');
  assert.ok(strength);
  assert.equal(strength.occurrences,2);
  assert.equal(strength.comparableMatches,2);
});
