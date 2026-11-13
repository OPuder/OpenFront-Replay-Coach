export interface ProCoachPlayerSample {
  tick: number;
  frame: number;
  players: Array<{
    clientID: string | null;
    alive: boolean;
    tiles: number;
    gold: number;
    goldEarned: number;
    troops: number;
    outgoingAttackDetails: Array<{ targetID: number; troops: number; retreating: boolean }>;
    incomingAttackDetails: Array<{ attackerID: number; troops: number; retreating: boolean }>;
    allies: number;
    betrayals: number;
    unitCounts: Record<string, number>;
  }>;
}
export interface ProCoachAction {
  seconds: number;
  type: string;
  label: string;
  targetName: string | null;
  delta10s: { tiles: number; gold: number; troops: number } | null;
  delta30s: { tiles: number; gold: number; troops: number } | null;
  targetDelta30s: { tiles: number; gold: number; troops: number } | null;
  ownFrontContextBefore: { activeTargetCount: number; outgoingAttackCount: number; outgoingAttackTroops: number; incomingAttackCount: number; incomingAttackTroops: number } | null;
  targetPressureBefore: { otherAttackerCount: number; otherAttackTroops: number } | null;
}
export type ProCoachConfidence = 'high' | 'medium' | 'low';
export interface ProCoachPhase {
  id: 'early' | 'mid' | 'late';
  label: string;
  fromSeconds: number;
  toSeconds: number;
  minutes: number;
  territoryPerMinute: number | null;
  incomePerMinute: number | null;
  troopChangePerMinute: number | null;
  attacks: number;
  activeSamples: number;
  momentumIndex: number | null;
}
export interface ProCoachFinding {
  id: string;
  priority: 'high' | 'medium' | 'low';
  confidence: ProCoachConfidence;
  title: string;
  decision: string;
  consequence: string;
  alternative: string;
  trainingRule: string;
  evidence: string;
  seconds: number | null;
  caveat: string;
}
export interface ProCoachReport {
  confidence: ProCoachConfidence;
  confidenceLabel: string;
  matchScore: number | null;
  scoreLabel: string;
  scoreExplanation: string;
  phases: ProCoachPhase[];
  findings: ProCoachFinding[];
  metrics: Array<{ label: string; value: string; note: string; confidence: ProCoachConfidence }>;
  trainingRule: string;
  dataCoverage: { samples: number; actions: number; durationMinutes: number };
}
const fmt = (n:number) => Math.round(n).toLocaleString('de-DE');
const clock = (s:number) => `${Math.floor(Math.max(0,s)/60)}:${String(Math.floor(Math.max(0,s)%60)).padStart(2,'0')}`;
const clamp = (n:number,min=0,max=100) => Math.max(min,Math.min(max,n));
const median = (values:number[]) => { const a=[...values].sort((x,y)=>x-y); return a.length ? a[Math.floor(a.length/2)] : 0; };
const confidenceFor = (samples:number, actions:number):ProCoachConfidence => samples>=12 && actions>=8 ? 'high' : samples>=6 && actions>=3 ? 'medium' : 'low';

/**
 * Evidence-first coaching model. Scores are relative execution/momentum indicators
 * within this match, never win probability or causal estimates of command quality.
 */
export function buildProCoachReport(
  samples: readonly ProCoachPlayerSample[],
  actions: readonly ProCoachAction[],
  clientId: string,
  durationSeconds: number,
): ProCoachReport {
  const ordered = [...samples].filter(s=>Number.isFinite(s.tick)).sort((a,b)=>a.tick-b.tick);
  const own = ordered.map(s=>({sample:s,player:s.players.find(p=>p.clientID===clientId)}))
    .filter((x):x is {sample:ProCoachPlayerSample;player:NonNullable<ProCoachPlayerSample['players'][number]>}=>Boolean(x.player));
  const alive = own.filter(x=>x.player.alive);
  const safeDuration = Math.max(1,durationSeconds);
  const first = alive[0], last = alive.at(-1);
  const phaseDefs = [
    {id:'early' as const,label:'Early Game',from:0,to:.3},
    {id:'mid' as const,label:'Mid Game',from:.3,to:.7},
    {id:'late' as const,label:'Late Game',from:.7,to:1},
  ];
  const endSeconds = first && last ? Math.min(safeDuration,Math.max(0,(last.sample.tick-first.sample.tick)/10)) : safeDuration;
  const phasesBase = phaseDefs.map(def=>{
    const start=def.from*endSeconds, end=def.to*endSeconds;
    const subset=alive.filter(x=>{const sec=(x.sample.tick-(first?.sample.tick??0))/10;return sec>=start && sec<=end;});
    const a=subset[0],b=subset.at(-1);
    // Use the interval actually covered by observations, not the nominal phase length.
    const observedMinutes=a&&b?Math.max(0,(b.sample.tick-a.sample.tick)/600):0;
    const minutes=Math.max(0,(end-start)/60);
    const enoughObservedSpan=subset.length>=2&&observedMinutes>=1/6;
    const territoryPerMinute=enoughObservedSpan?(b!.player.tiles-a!.player.tiles)/observedMinutes:null;
    const incomePerMinute=enoughObservedSpan?(b!.player.goldEarned-a!.player.goldEarned)/observedMinutes:null;
    const troopChangePerMinute=enoughObservedSpan?(b!.player.troops-a!.player.troops)/observedMinutes:null;
    const attacks=actions.filter(x=>x.type==='attack'&&x.seconds>=start&&x.seconds<end).length;
    return {id:def.id,label:def.label,fromSeconds:start,toSeconds:end,minutes,territoryPerMinute,incomePerMinute,troopChangePerMinute,attacks,activeSamples:subset.length,momentumIndex:null as number|null};
  });
  const phaseMomentum=phasesBase.map(p=>p.territoryPerMinute===null?null:Math.max(0,p.territoryPerMinute)+Math.max(0,p.incomePerMinute??0)/1000).filter((x):x is number=>x!==null);
  const peak=Math.max(0,...phaseMomentum);
  const phases=phasesBase.map(p=>({...p,momentumIndex:p.territoryPerMinute===null||peak<=0?null:Math.round(clamp((Math.max(0,p.territoryPerMinute)+Math.max(0,p.incomePerMinute??0)/1000)/peak*100))}));
  const findings:ProCoachFinding[]=[];
  const attackActions=actions.filter(a=>a.type==='attack'&&a.delta30s);
  // Missing target observations are unknown, not a zero territorial response.
  const evaluatedAttackActions=attackActions.filter(a=>(a.delta30s?.tiles??0)>0||a.targetDelta30s!==null);
  const positiveWindows=evaluatedAttackActions.filter(a=>(a.delta30s?.tiles??0)>0||(a.targetDelta30s?.tiles??0)<0);
  const negativeWindows=evaluatedAttackActions.filter(a=>(a.delta30s?.troops??0)<0&&(a.delta30s?.tiles??0)<=0&&a.targetDelta30s!==null&&(a.targetDelta30s?.tiles??0)>=0);
  if(evaluatedAttackActions.length>=3){
    const ratio=positiveWindows.length/evaluatedAttackActions.length;
    const worst=negativeWindows[0]??evaluatedAttackActions.find(a=>(a.delta30s?.tiles??0)<=0);
    findings.push({
      id:'attack-follow-through',priority:negativeWindows.length>=Math.max(2,Math.ceil(evaluatedAttackActions.length*.35))?'high':'medium',
      confidence:confidenceFor(alive.length,evaluatedAttackActions.length),title:negativeWindows.length?'Angriffe mit hoher Truppenbindung prüfen':'Angriffe mit sichtbarer Gebietsreaktion',
      decision:`${evaluatedAttackActions.length} von ${attackActions.length} Angriffen hatten auswertbare 30-Sekunden-Gebietsdaten.`,
      consequence:`${positiveWindows.length} von ${evaluatedAttackActions.length} auswertbaren Fenstern zeigten eigenen Gebietszuwachs oder Gebietsverlust beim Ziel; ${negativeWindows.length} zeigten Truppenrückgang ohne entsprechende Gebietsreaktion.`,
      alternative:'Vor einem weiteren Befehl kurz Zielzustand, eigene aktive Angriffe und eingehenden Druck vergleichen. Bei hoher Bindung erst laufende Angriffe auswerten, statt automatisch ein weiteres Ziel zu öffnen.',
      trainingRule:'Vor jedem Folgeangriff: gebundene Truppen + eingehenden Druck prüfen und nur dann ein weiteres Ziel öffnen, wenn die Reserve danach noch tragfähig ist.',
      evidence:worst?`${clock(worst.seconds)} · ${worst.targetName??'Ziel nicht benannt'} · eigene Truppen ${fmt(worst.delta30s?.troops??0)} · eigenes Gebiet ${fmt(worst.delta30s?.tiles??0)} · Zielgebiet ${fmt(worst.targetDelta30s?.tiles??0)}`:`${fmt(ratio*100)} % der auswertbaren Folgefenster zeigten eine positive Gebietsreaktion.`,
      seconds:worst?.seconds??attackActions[0]?.seconds??null,
      caveat:'30 Sekunden sind ein Beobachtungsfenster, kein vollständiger Kampfabschluss. Andere Angriffe, passive Eroberungen und Reisezeiten wirken mit; daraus folgt keine sichere Kausalität.'
    });
  }
  const loadedFronts=actions.filter(a=>a.type==='attack'&&a.ownFrontContextBefore&&((a.ownFrontContextBefore.activeTargetCount>=2)||(a.ownFrontContextBefore.incomingAttackCount>=1)));
  if(loadedFronts.length>=2){
    const a=loadedFronts[0],ctx=a.ownFrontContextBefore!;
    findings.push({
      id:'front-load',priority:loadedFronts.length>=4?'high':'medium',confidence:confidenceFor(alive.length,loadedFronts.length),
      title:'Mehrere Fronten gleichzeitig belastet',
      decision:`Bei ${loadedFronts.length} Angriffsbefehlen war bereits Frontdruck dokumentiert.`,
      consequence:`Beim ersten markierten Befehl liefen ${ctx.activeTargetCount} eigene Zielbindungen und ${ctx.incomingAttackCount} eingehende Angriffe; ${fmt(ctx.outgoingAttackTroops)} eigene Truppen waren unterwegs.`,
      alternative:'Eine bestehende Front zuerst abschließen oder stabilisieren. Neue Ziele priorisieren, wenn sie einen klaren strategischen Vorteil bieten und nicht nur zusätzliche Bindung erzeugen.',
      trainingRule:'Halte die Zahl gleichzeitig offener Ziele bewusst niedrig, bis du erkennst, welche Angriffe tatsächlich Fortschritt bringen.',
      evidence:`${clock(a.seconds)} · ${ctx.outgoingAttackCount} aktive eigene Angriffe · ${ctx.incomingAttackCount} eingehende Angriffe · ${fmt(ctx.outgoingAttackTroops)} Truppen gebunden`,
      seconds:a.seconds,caveat:'Aktive Angriffsobjekte zeigen Bindung, aber nicht zwingend getrennte geografische Fronten oder Erreichbarkeit anderer Ziele.'
    });
  }
  const longPause=(()=>{let best:{from:number;to:number;seconds:number}|null=null;for(let i=1;i<alive.length;i++){const from=(alive[i-1].sample.tick-(first?.sample.tick??0))/10,to=(alive[i].sample.tick-(first?.sample.tick??0))/10;if(to-from>90&&(!best||to-from>best.seconds))best={from,to,seconds:to-from};}return best;})();
  if(longPause&&longPause.seconds>=120){
    findings.push({id:'expansion-rhythm',priority:longPause.seconds>=240?'medium':'low',confidence:confidenceFor(alive.length,actions.length),title:'Lange Lücke zwischen beobachteten Zuständen',
      decision:`Zwischen ${clock(longPause.from)} und ${clock(longPause.to)} liegen ${fmt(longPause.seconds)} Sekunden zwischen erfassten Zuständen.`,
      consequence:'In diesem Intervall ist aus den vorliegenden Stichproben kein kontinuierlicher Expansionsverlauf ableitbar.',
      alternative:'Replay an beiden Endpunkten prüfen: Truppen sammeln, Verteidigung, Transport und fehlende erreichbare Ziele können die Pause erklären.',
      trainingRule:'Wenn keine akute Verteidigung oder Transportphase läuft, nach einer sicheren nächsten Expansion oder einem sinnvollen Wirtschafts-Upgrade suchen.',
      evidence:`${clock(longPause.from)}–${clock(longPause.to)} · ${fmt(longPause.seconds)} s · ${alive.length} aktive Zustandsstichproben`,
      seconds:longPause.from,caveat:'Abstand zwischen gespeicherten Stichproben ist nicht gleich Leerlauf; passive Produktion und Bewegungen können weiterlaufen.'});
  }
  const weakest=phases.filter(p=>p.momentumIndex!==null&&p.activeSamples>=3).sort((a,b)=>(a.momentumIndex??0)-(b.momentumIndex??0))[0];
  if(weakest&&phases.filter(p=>p.momentumIndex!==null&&p.activeSamples>=3).length>=2){
    findings.push({id:'phase-focus',priority:'medium',confidence:confidenceFor(alive.length,actions.length),title:`${weakest.label}: geringster beobachteter Gebiet-/Einkommensimpuls`,
      decision:`In ${weakest.label} lag der kombinierte positive Gebiet-/Einkommensimpuls relativ zu deinen anderen Phasen am niedrigsten.`,
      consequence:`Gebiet ${weakest.territoryPerMinute===null?'–':fmt(weakest.territoryPerMinute)+' / Min.'} · Brutto-Gold ${weakest.incomePerMinute===null?'–':fmt(weakest.incomePerMinute)+' / Min.'}.`,
      alternative:'Vergleiche die Phase mit der stärksten Phase: Welche Bau-, Angriffs- oder Verteidigungsentscheidungen unterscheiden sich? Übertrage nur eine konkrete, wiederholbare Verhaltensweise.',
      trainingRule:`In der nächsten Partie ${weakest.label} gezielt beobachten und eine sichere Expansion oder einen begründeten Wirtschafts-/Verteidigungsschritt pro Leerlaufprüfung planen.`,
      evidence:`${weakest.label} · ${weakest.activeSamples} Zustände · ${weakest.attacks} Angriffe · ${weakest.minutes.toFixed(1)} Minuten`,
      seconds:weakest.fromSeconds,caveat:'Phasenlängen und Gegnerdruck unterscheiden sich. Das ist ein Vergleich innerhalb dieser Partie, kein allgemeiner Rang deiner Spielstärke.'});
  }
  const ranked=[...findings].sort((a,b)=>({high:0,medium:1,low:2}[a.priority]-({high:0,medium:1,low:2}[b.priority])||({high:0,medium:1,low:2}[b.confidence]-{high:0,medium:1,low:2}[a.confidence])));
  const strongest=phases.filter(p=>p.momentumIndex!==null).sort((a,b)=>(b.momentumIndex??0)-(a.momentumIndex??0))[0];
  const start=first?.player,end=last?.player;
  const territoryDelta=start&&end?end.tiles-start.tiles:null;
  const incomeDelta=start&&end?end.goldEarned-start.goldEarned:null;
  const durationMinutes=Math.max(0,endSeconds/60);
  const coverage=confidenceFor(alive.length,actions.length);
  const attackRatio=evaluatedAttackActions.length?positiveWindows.length/evaluatedAttackActions.length:null;
  const attackCommands=actions.filter(a=>a.type==='attack'&&a.ownFrontContextBefore);
  const loadedFrontCount=attackCommands.filter(a=>(a.ownFrontContextBefore?.activeTargetCount??0)>0||(a.ownFrontContextBefore?.incomingAttackCount??0)>0).length;
  const frontPressureRatio=attackCommands.length?loadedFrontCount/attackCommands.length:null;
  const troopChange=territoryDelta===null||!durationMinutes?null:(end?.troops??0)-(start?.troops??0);
  const metrics=[
    {label:'Gebiet netto',value:territoryDelta===null?'–':(territoryDelta>0?'+':'')+fmt(territoryDelta),note:'Start bis letzter aktiver Zustand',confidence:coverage},
    {label:'Brutto-Gold / Min.',value:incomeDelta===null||durationMinutes<=0?'–':fmt(incomeDelta/durationMinutes),note:'Kumulierte Einnahmen, keine Nettorendite',confidence:coverage},
    {label:'Angriffs-Folgefenster',value:attackRatio===null?'–':`${fmt(attackRatio*100)} %`,note:`${positiveWindows.length}/${evaluatedAttackActions.length} auswertbare Folgefenster mit positiver Gebietsreaktion binnen 30 s`,confidence:confidenceFor(alive.length,evaluatedAttackActions.length)},
    {label:'Truppenbilanz / Min.',value:troopChange===null?'–':`${troopChange>0?'+':''}${fmt(troopChange/durationMinutes)}`,note:'Nettoänderung im aktiven Beobachtungszeitraum',confidence:coverage},
    {label:'Frontdruck',value:frontPressureRatio===null?'–':`${fmt(frontPressureRatio*100)} %`,note:`${loadedFrontCount}/${attackCommands.length} Angriffe bei bereits aktiver Bindung oder eingehendem Druck`,confidence:confidenceFor(alive.length,attackCommands.length)},
    {label:'Stärkster Impuls',value:strongest?.label??'–',note:strongest?'Innerhalb dieser Partie':'Zu wenig vergleichbare Phasendaten',confidence:coverage}
  ];
  const validPhases=phases.filter(p=>p.momentumIndex!==null&&p.activeSamples>=3);
  const matchScore=validPhases.length>=2?Math.round(median(validPhases.map(p=>p.momentumIndex??0))*.7+Math.max(...validPhases.map(p=>p.momentumIndex??0))*.3):null;
  return {confidence:coverage,confidenceLabel:coverage==='high'?'Gute Datenbasis':coverage==='medium'?'Begrenzte Datenbasis':'Wenig Stichproben',matchScore,scoreLabel:'Match-Entwicklungsindex',scoreExplanation:'Relativer Gebiet-/Einkommensimpuls innerhalb dieser Partie. Kein Skill-Rating, keine Siegchance und keine Aussage über optimale Spielzüge.',phases,findings:ranked.slice(0,3),metrics,trainingRule:ranked[0]?.trainingRule??'Noch kein belastbares Trainingsziel. Prüfe die Zeitachse und sammle weitere verifizierte Partien.',dataCoverage:{samples:alive.length,actions:actions.length,durationMinutes}};
}
