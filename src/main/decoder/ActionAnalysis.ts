import type { DecodedAction } from './ApiTurnDecoder';

export interface CoachFinding { level: 'info' | 'warning' | 'success'; title: string; text: string; evidence: string; }
export interface ActionAnalysis {
  durationSeconds: number;
  totalActions: number;
  actionsPerMinute: number;
  firstActionSeconds: number | null;
  longestGapSeconds: number;
  longestGapFrom: number | null;
  longestGapTo: number | null;
  categoryCounts: Record<string, number>;
  typeCounts: Record<string, number>;
  attackCount: number;
  boatCount: number;
  buildCount: number;
  upgradeCount: number;
  findings: CoachFinding[];
}

export function analyzeActions(actions: DecodedAction[], durationSeconds: number): ActionAnalysis {
  const ordered = [...actions].sort((a,b)=>a.seconds-b.seconds);
  const categoryCounts: Record<string,number> = {};
  const typeCounts: Record<string,number> = {};
  for (const a of ordered) { categoryCounts[a.category]=(categoryCounts[a.category]??0)+1; typeCounts[a.type]=(typeCounts[a.type]??0)+1; }
  let longestGapSeconds=0, longestGapFrom:number|null=null, longestGapTo:number|null=null;
  for(let i=1;i<ordered.length;i++) { const gap=ordered[i].seconds-ordered[i-1].seconds; if(gap>longestGapSeconds){longestGapSeconds=gap;longestGapFrom=ordered[i-1].seconds;longestGapTo=ordered[i].seconds;} }
  const attackCount=typeCounts.attack??0, boatCount=typeCounts.boat??0, buildCount=typeCounts.build_unit??0, upgradeCount=typeCounts.upgrade_structure??0;
  const findings:CoachFinding[]=[];
  const firstBuild=ordered.find(a=>a.type==='build_unit');
  if(firstBuild) findings.push({level:firstBuild.seconds>180?'warning':'info',title:'Erster Bauzeitpunkt',text:firstBuild.seconds>180?'Der erste Bau ist relativ spät im protokollierten Verlauf erfolgt. Prüfe im Replay, ob vorher sichere Expansion oder Wirtschaft möglich gewesen wäre.':'Der erste Bau erfolgte früh im Verlauf. Prüfe, ob er deine Expansion unterstützt oder kurzfristig Truppenproduktion verdrängt hat.',evidence:`Erster build_unit-Eintrag bei ${clock(firstBuild.seconds)}.`});
  if(longestGapSeconds>=180) findings.push({level:'warning',title:'Längere Aktionspause',text:'Zwischen zwei protokollierten Aktionen liegt eine längere Lücke. Das ist nicht automatisch Leerlauf – passive Produktion und Bewegung können weiterlaufen. Prüfe diese Stelle im Replay.',evidence:`${clock(longestGapFrom??0)} bis ${clock(longestGapTo??0)} (${Math.round(longestGapSeconds)} Sekunden).`});
  if(boatCount>0) findings.push({level:'info',title:'Marineinsatz',text:'Es wurden Transportaktionen per Boot protokolliert. Bewerte im Replay, ob die Transporte schnell Land, wichtige Inseln oder strategische Positionen gesichert haben.',evidence:`${boatCount} boat-Aktionen.`});
  if(attackCount>0) findings.push({level:'info',title:'Angriffsaktivität',text:'Das Protokoll enthält Angriffe. Die reine Anzahl sagt nichts über Erfolg, Verluste oder Effizienz aus; dafür müssen Ziel- und Zustandsverläufe rekonstruiert werden.',evidence:`${attackCount} attack-Aktionen.`});
  if(buildCount>0 && attackCount>0) findings.push({level:'info',title:'Wirtschaft und Militär',text:'Bau- und Angriffsaktionen kamen beide vor. Entscheidend ist ihr Timing: Wirtschaft muss den nächsten Expansions- oder Verteidigungsschritt ermöglichen, darf aber keine akute Gelegenheit verpassen.',evidence:`${buildCount} Bauaktionen gegenüber ${attackCount} Angriffen.`});
  if(!findings.length) findings.push({level:'info',title:'Noch zu wenig Aktionsdaten',text:'Aus den vorhandenen Aktionen lässt sich noch keine belastbare taktische Empfehlung ableiten.',evidence:`${ordered.length} Aktionen.`});
  return {durationSeconds,totalActions:ordered.length,actionsPerMinute:durationSeconds>0?ordered.length/(durationSeconds/60):0,firstActionSeconds:ordered[0]?.seconds??null,longestGapSeconds,longestGapFrom,longestGapTo,categoryCounts,typeCounts,attackCount,boatCount,buildCount,upgradeCount,findings};
}
export function clock(seconds:number){const s=Math.max(0,Math.floor(seconds));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
