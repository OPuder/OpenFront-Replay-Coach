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
    match('latest',{playedAt:'2026-02-06T00:00:00Z'}),
    match('later',{playedAt:'2026-02-05T00:00:00Z'}),
    match('middle',{playedAt:'2026-02-04T00:00:00Z'}),
    match('earlier-2',{playedAt:'2026-02-02T00:00:00Z',simulation:makeSimulation({samples:makeSimulation().samples.map(sample=>({...sample,players:sample.players.map(player=>({...player,tiles:player.tiles*2,goldEarned:player.goldEarned*2}))}))})}),
    match('earlier-1',{playedAt:'2026-02-01T00:00:00Z',simulation:makeSimulation({samples:makeSimulation().samples.map(sample=>({...sample,players:sample.players.map(player=>({...player,tiles:player.tiles*2,goldEarned:player.goldEarned*2}))}))})}),
    match('ignored',{playedAt:'2026-02-07T00:00:00Z',analysisStatus:'unverified',simulation:makeSimulation({status:'unverified'})}),
  ]);
  assert.deepEqual(report.matchProgress.map(item=>item.gameId),['earlier-1','earlier-2','middle','later','latest']);
  assert.equal(report.matchProgress.length,5);
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
  const report=buildLongitudinalCoachReport([match('a',{playedAt:'2026-01-01',simulation}),match('b',{playedAt:'2026-01-02',simulation}),match('c',{playedAt:'2026-01-03',simulation}),match('d',{playedAt:'2026-01-04',simulation}),match('e',{playedAt:'2026-01-05',simulation}),match('f',{playedAt:'2026-01-06',simulation})]);
  assert.ok(Math.abs(report.matchProgress[0].attackFollowThroughPercent - 200/3) < 1e-9);
  assert.equal(report.matchProgress[0].attackFollowThroughSamples, 3);
  assert.equal(report.metricTrends.find(item=>item.id==='attack-follow-through')?.observations, 6);
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


test('malformed action records are excluded instead of being fabricated at time zero',()=>{
  const simulation=makeSimulation({actionReviews:[
    ...makeSimulation().actionReviews,
    {type:'attack',delta30s:{tiles:99,gold:0,troops:0},targetDelta30s:{tiles:-99}},
    {type:'attack',seconds:NaN,delta30s:{tiles:99,gold:0,troops:0},targetDelta30s:{tiles:-99}},
    {type:'',seconds:10,delta30s:{tiles:99,gold:0,troops:0},targetDelta30s:{tiles:-99}},
    null,
  ]});
  const report=buildLongitudinalCoachReport([match('malformed-a',{simulation})]);
  assert.equal(report.matchProgress[0].attackFollowThroughSamples,6);
});


test('malformed action records cannot crash recurring strength analysis',()=>{
  const simulation=makeSimulation({
    playerReview:{
      clientID:'p1',playerName:'Player',startTiles:100,endTiles:110,tilesGained:10,
      startGold:500,endGold:700,startTroops:300,endTroops:320,
      outgoingAttackSamples:0,longestNoExpansionSeconds:0,
    },
    actionReviews:[
      null,
      undefined,
      {type:'attack',delta30s:{tiles:99,gold:0,troops:0}},
      {type:'attack',seconds:NaN,delta30s:{tiles:99,gold:0,troops:0}},
      {type:'attack',seconds:10,delta30s:{tiles:1,gold:0,troops:0}},
    ],
  });
  const report=buildLongitudinalCoachReport([match('safe-a',{simulation})]);
  assert.equal(report.verifiedMatches,1);
  assert.equal(report.matchProgress[0].attackFollowThroughSamples,1);
  assert.equal(report.status,'insufficient-data');
});



test('training goals remain provisional until the comparable sample is large enough',()=>{
  const report=buildLongitudinalCoachReport([match('a'),match('b')]);
  const goal=report.trainingGoals.find(item=>item.id==='attack-follow-through');
  assert.ok(goal);
  assert.equal(goal.status,'provisional');
  assert.equal(goal.occurrences,2);
  assert.equal(goal.comparableMatches,2);
  assert.equal(goal.reviewWindow,'Nächste 3 vergleichbare Partien');
  assert.match(goal.target,/höchstens 1 der nächsten 3/);
  assert.ok(goal.examples.length>0);
});

test('repeated evidence activates a training goal in a sufficiently large comparable cohort',()=>{
  const report=buildLongitudinalCoachReport([match('a'),match('b'),match('c'),match('d')]);
  const goal=report.trainingGoals.find(item=>item.id==='attack-follow-through');
  assert.equal(goal?.status,'active');
  assert.equal(goal?.occurrences,4);
});

test('training goals mark a repeated pattern as improving only after two clean recent matches',()=>{
  const clean=makeSimulation({actionReviews:[]});
  const report=buildLongitudinalCoachReport([
    match('a',{playedAt:'2026-01-01'}),match('b',{playedAt:'2026-01-02'}),match('c',{playedAt:'2026-01-03'}),
    match('d',{playedAt:'2026-01-04',simulation:clean}),match('e',{playedAt:'2026-01-05',simulation:clean}),match('f',{playedAt:'2026-01-06',simulation:clean}),
  ]);
  const goal=report.trainingGoals.find(item=>item.id==='attack-follow-through');
  assert.equal(goal?.status,'improving');
});

test('training goals mark a repeated pattern as regressing only after two recent recurrences',()=>{
  const clean=makeSimulation({actionReviews:[]});
  const report=buildLongitudinalCoachReport([
    match('a',{playedAt:'2026-01-01',simulation:clean}),match('b',{playedAt:'2026-01-02',simulation:clean}),match('c',{playedAt:'2026-01-03',simulation:clean}),
    match('d',{playedAt:'2026-01-04'}),match('e',{playedAt:'2026-01-05'}),match('f',{playedAt:'2026-01-06'}),
  ]);
  const goal=report.trainingGoals.find(item=>item.id==='attack-follow-through');
  assert.equal(goal?.status,'regressing');
});

test('duplicate game IDs cannot inflate cohort confidence or recurring pattern counts',()=>{
  const report=buildLongitudinalCoachReport([match('same'),match('same'),match('same'),match('other')]);
  assert.equal(report.importedMatches,2);
  assert.equal(report.verifiedMatches,2);
  assert.equal(report.comparableMatches,2);
  const finding=report.recurringFindings.find(item=>item.id==='attack-follow-through');
  assert.equal(finding?.occurrences,2);
});

test('training status does not oscillate from a single recurrence in a three-match window',()=>{
  const clean=makeSimulation({actionReviews:[]});
  const report=buildLongitudinalCoachReport([
    match('a'),match('b'),match('c'),match('d',{simulation:clean}),match('e'),match('f',{simulation:clean}),
  ]);
  const goal=report.trainingGoals.find(item=>item.id==='attack-follow-through');
  assert.notEqual(goal?.status,'regressing');
});

test('trend compares medians of chronological three-match blocks and resists one outlier',()=>{
  const makeTiles=(multiplier)=>makeSimulation({
    samples:makeSimulation().samples.map(sample=>({...sample,players:sample.players.map(player=>({...player,tiles:player.tiles*multiplier}))})),
    actionReviews:[],
  });
  const report=buildLongitudinalCoachReport([
    match('a',{playedAt:'2026-01-01T00:00:00Z',simulation:makeTiles(1)}),
    match('b',{playedAt:'2026-01-02T00:00:00Z',simulation:makeTiles(1)}),
    match('c',{playedAt:'2026-01-03T00:00:00Z',simulation:makeTiles(1)}),
    match('d',{playedAt:'2026-01-04T00:00:00Z',simulation:makeTiles(1)}),
    match('e',{playedAt:'2026-01-05T00:00:00Z',simulation:makeTiles(1)}),
    match('f',{playedAt:'2026-01-06T00:00:00Z',simulation:makeTiles(20)}),
  ]);
  const trend=report.metricTrends.find(item=>item.id==='territory');
  assert.ok(trend);
  assert.equal(trend.observations,6);
  assert.equal(trend.direction,'stable');
});


test('missing timestamps remain visible but cannot manufacture a chronological trend',()=>{
  const matches=[
    ...Array.from({length:4},(_,i)=>match('dated-'+i,{playedAt:`2026-03-0${i+1}T00:00:00Z`})),
    match('undated-a',{playedAt:null}),
    match('undated-b',{playedAt:'not-a-date'}),
  ];
  const report=buildLongitudinalCoachReport(matches);
  const trend=report.metricTrends.find(item=>item.id==='territory');
  assert.equal(report.matchProgress.length,6);
  assert.equal(trend?.observations,4);
  assert.equal(trend?.direction,'insufficient-data');
  assert.equal(trend?.previous,null);
  assert.equal(trend?.latest,1.2);
});

test('identical timestamps are not treated as an ordered pair for trend claims',()=>{
  const report=buildLongitudinalCoachReport([
    match('a',{playedAt:'2026-04-01T00:00:00Z'}),
    match('b',{playedAt:'2026-04-02T00:00:00Z'}),
    match('c',{playedAt:'2026-04-03T00:00:00Z'}),
    match('d',{playedAt:'2026-04-04T00:00:00Z'}),
    match('e',{playedAt:'2026-04-04T00:00:00Z'}),
    match('f',{playedAt:'2026-04-06T00:00:00Z'}),
  ]);
  const trend=report.metricTrends.find(item=>item.id==='territory');
  assert.equal(report.matchProgress.length,6);
  assert.equal(trend?.observations,4);
  assert.equal(trend?.direction,'insufficient-data');
});

test('trend examples identify the exact matches behind improvements and regressions',()=>{
  const makeTiles=(multiplier)=>makeSimulation({
    samples:makeSimulation().samples.map(sample=>({...sample,players:sample.players.map(player=>({...player,tiles:player.tiles*multiplier}))})),
    actionReviews:[],
  });
  const report=buildLongitudinalCoachReport([
    ...['a','b','c'].map((id,i)=>match(id,{playedAt:`2026-05-0${i+1}T00:00:00Z`,simulation:makeTiles(1)})),
    ...['d','e','f'].map((id,i)=>match(id,{playedAt:`2026-05-0${i+4}T00:00:00Z`,simulation:makeTiles(2)})),
  ]);
  const trend=report.metricTrends.find(item=>item.id==='territory');
  assert.equal(trend?.direction,'improved');
  assert.deepEqual(trend?.previousExamples.map(item=>item.gameId),['a','b','c']);
  assert.deepEqual(trend?.latestExamples.map(item=>item.gameId),['d','e','f']);
  assert.ok(trend?.latestExamples.every(item=>item.value>0));
});

test('duplicate IDs prefer a usable verified replay and never inflate recurring evidence',()=>{
  const incomplete=match('same',{simulation:makeSimulation({playerReview:null})});
  const complete=match('same');
  const report=buildLongitudinalCoachReport([
    incomplete,
    complete,
    match('other'),
  ]);
  assert.equal(report.importedMatches,2);
  assert.equal(report.verifiedMatches,2);
  assert.equal(report.comparableMatches,2);
  assert.equal(report.recurringFindings.find(item=>item.id==='attack-follow-through')?.occurrences,2);
});

test('missing or incomplete match records are excluded without fabricating progress',()=>{
  const report=buildLongitudinalCoachReport([
    match('valid-a'),
    match('missing-review',{simulation:makeSimulation({playerReview:null})}),
    {...match('missing-simulation'),simulation:null},
    {...match('missing-id'),gameId:'  '},
  ]);
  assert.equal(report.importedMatches,3);
  assert.equal(report.verifiedMatches,1);
  assert.equal(report.comparableMatches,1);
  assert.equal(report.status,'insufficient-data');
  assert.equal(report.matchProgress.length,1);
  assert.equal(report.recurringFindings.length,0);
});

test('different match durations compare per-minute rates without mixing raw match totals',()=>{
  const makeTimed=(durationSeconds,rate)=>makeSimulation({
    totalTicks:durationSeconds*10,
    samples:Array.from({length:15},(_,i)=>({
      tick:i*(durationSeconds*10/14),
      frame:i,
      players:[{...makeSimulation().samples[0].players[0],tiles:100+i*rate,goldEarned:100+i*rate*2}],
    })),
    actionReviews:[],
  });
  const report=buildLongitudinalCoachReport([
    match('short',{playedAt:'2026-06-01T00:00:00Z',durationSeconds:300,simulation:makeTimed(300,1)}),
    match('long',{playedAt:'2026-06-02T00:00:00Z',durationSeconds:900,simulation:makeTimed(900,3)}),
  ]);
  assert.ok(Math.abs(report.matchProgress[0].territoryPerMinute-report.matchProgress[1].territoryPerMinute)<1e-6);
  assert.ok(Math.abs(report.matchProgress[0].incomePerMinute-report.matchProgress[1].incomePerMinute)<1e-6);
});

test('early mid and late phase reviews require real samples in each observed phase',()=>{
  const simulation=makeSimulation({
    totalTicks:7200,
    samples:Array.from({length:15},(_,i)=>({
      tick:i*500,
      frame:i*500,
      players:[{...makeSimulation().samples[0].players[0],tiles:100+i*10,goldEarned:100+i*20}],
    })),
    actionReviews:[],
  });
  const report=buildLongitudinalCoachReport([match('phases',{durationSeconds:720,simulation})]);
  const phases=report.matchProgress[0].phaseMomentum;
  assert.ok(phases.early!==null);
  assert.ok(phases.mid!==null);
  assert.ok(phases.late!==null);
});


test('duplicate IDs cannot manufacture extra trend observations or alter their examples',()=>{
  const makeTiles=(multiplier)=>makeSimulation({
    samples:makeSimulation().samples.map(sample=>({...sample,players:sample.players.map(player=>({...player,tiles:player.tiles*multiplier}))})),
    actionReviews:[],
  });
  const unique=[
    ...['a','b','c'].map((id,i)=>match(id,{playedAt:`2026-07-0${i+1}T00:00:00Z`,simulation:makeTiles(1)})),
    ...['d','e','f'].map((id,i)=>match(id,{playedAt:`2026-07-0${i+4}T00:00:00Z`,simulation:makeTiles(2)})),
  ];
  const duplicated=[...unique,...Array.from({length:8},()=>match('f',{playedAt:'2026-07-06T00:00:00Z',simulation:makeTiles(2)}))];
  const baseline=buildLongitudinalCoachReport(unique);
  const report=buildLongitudinalCoachReport(duplicated);
  const baseTrend=baseline.metricTrends.find(item=>item.id==='territory');
  const trend=report.metricTrends.find(item=>item.id==='territory');
  assert.equal(report.importedMatches,6);
  assert.equal(trend?.observations,baseTrend?.observations);
  assert.equal(trend?.direction,baseTrend?.direction);
  assert.deepEqual(trend?.previousExamples,baseTrend?.previousExamples);
  assert.deepEqual(trend?.latestExamples,baseTrend?.latestExamples);
});

test('corrupt and partial sample rows are ignored without crashing verified match history',()=>{
  const broken=makeSimulation({
    samples:[null,{tick:NaN,players:[]},{tick:10,players:[null]},{tick:20,players:[{clientID:'p1',alive:true,tiles:1}]}],
    playerReview:{clientID:'p1'},
  });
  const report=buildLongitudinalCoachReport([
    match('broken',{simulation:broken}),
    match('valid'),
  ]);
  assert.equal(report.importedMatches,2);
  assert.equal(report.verifiedMatches,1);
  assert.equal(report.comparableMatches,1);
  assert.equal(report.matchProgress.length,1);
});


test('missing metric values do not shift later matches into earlier trend windows',()=>{
  const sparse=makeSimulation({
    samples:makeSimulation().samples.slice(0,2),
    actionReviews:[],
  });
  const report=buildLongitudinalCoachReport([
    ...['a','b','c'].map((id,i)=>match(id,{playedAt:`2026-08-0${i+1}T00:00:00Z`})),
    ...['d','e','f'].map((id,i)=>match(id,{playedAt:`2026-08-0${i+4}T00:00:00Z`,simulation:sparse})),
  ]);
  const trend=report.metricTrends.find(item=>item.id==='territory');
  assert.equal(trend?.observations,3);
  assert.equal(trend?.previous, 1.2);
  assert.equal(trend?.latest, null);
  assert.equal(trend?.direction,'insufficient-data');
  assert.equal(trend?.previousExamples.length,3);
  assert.equal(trend?.latestExamples.length,0);
});

test('undated or tied recent matches cannot mark a training goal improving or regressing',()=>{
  const clean=makeSimulation({actionReviews:[]});
  const improvingWithAmbiguousRecent=[
    match('a',{playedAt:'2026-09-01'}),match('b',{playedAt:'2026-09-02'}),match('c',{playedAt:'2026-09-03'}),
    match('d',{playedAt:null,simulation:clean}),match('e',{playedAt:null,simulation:clean}),match('f',{playedAt:null,simulation:clean}),
  ];
  const regressingWithAmbiguousRecent=[
    match('a',{playedAt:'2026-09-01',simulation:clean}),match('b',{playedAt:'2026-09-02',simulation:clean}),match('c',{playedAt:'2026-09-03',simulation:clean}),
    match('d',{playedAt:'2026-09-04'}),match('e',{playedAt:'2026-09-04'}),match('f',{playedAt:'2026-09-04'}),
  ];
  for (const matches of [improvingWithAmbiguousRecent,regressingWithAmbiguousRecent]) {
    const report=buildLongitudinalCoachReport(matches);
    const goal=report.trainingGoals.find(item=>item.id==='attack-follow-through');
    assert.ok(goal);
    assert.notEqual(goal.status,'improving');
    assert.notEqual(goal.status,'regressing');
  }
});
