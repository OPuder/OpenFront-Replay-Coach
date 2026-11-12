import type { DecodedAction } from "./ApiTurnDecoder";

export type InsightKind = "strength" | "review" | "neutral";
export interface CoachInsight {
  id: string;
  kind: InsightKind;
  title: string;
  summary: string;
  evidence: string;
  why: string;
  nextStep: string;
  confidence: "high" | "medium";
  seconds: number | null;
  priority?: number;
  decision?: string;
  alternative?: string;
  limitation?: string;
}

const clock = (n:number) => `${Math.floor(Math.round(Math.max(0,n))/60)}:${String(Math.round(Math.max(0,n))%60).padStart(2,"0")}`;
const field = (details:string, name:string) => {
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const m=details.match(new RegExp(`(?:^| · )${escaped}: ([^·]+)`));
  return m?.[1]?.trim() ?? null;
};
const numeric = (v:string|null) => {
  if(!v) return null;
  const n=Number(v.replace(/\./g,"").replace(",","."));
  return Number.isFinite(n)?n:null;
};

export function buildCoachInsights(actions:DecodedAction[], durationSeconds:number):CoachInsight[] {
  const ordered=[...actions].sort((a,b)=>a.seconds-b.seconds);
  if(!ordered.length) return [{
    id:"no-actions",kind:"neutral",title:"Keine auswertbaren Aktionen",
    summary:"Für diese Partie liegt kein dekodiertes Aktionsprotokoll vor.",
    evidence:"0 dekodierte Aktionen",why:"Ohne Aktionen kann der Coach keine Entscheidungen zeitlich einordnen.",
    nextStep:"Replay-Daten erneut laden und prüfen, ob Spielzüge und Intents enthalten sind.",
    confidence:"high",seconds:null
  }];
  const out:CoachInsight[]=[];
  const firstAttack=ordered.find(a=>a.type==="attack");
  const firstBuild=ordered.find(a=>a.type==="build_unit");
  const firstBoat=ordered.find(a=>a.type==="boat");
  const attackActions=ordered.filter(a=>a.type==="attack");
  const buildActions=ordered.filter(a=>a.type==="build_unit");
  const boatActions=ordered.filter(a=>a.type==="boat");
  const targetCounts=new Map<string,number>();
  for(const a of attackActions){const t=field(a.details,"Ziel-ID")??field(a.details,"Ziel-Feld");if(t)targetCounts.set(t,(targetCounts.get(t)??0)+1);}
  const repeated=[...targetCounts.entries()].sort((a,b)=>b[1]-a[1])[0];
  const firstMilitary=[firstAttack,firstBoat].filter(Boolean).sort((a,b)=>a!.seconds-b!.seconds)[0];
  if(firstBuild && firstMilitary){
    const gap=firstMilitary.seconds-firstBuild.seconds;
    const militaryLabel=firstMilitary.type==="boat"?"erster Bootstransport":"erster Angriff";
    out.push({
      id:"opening-order",kind:"neutral",title:gap>=0?"Erster Bau vor Militäreinsatz":"Militäreinsatz vor erstem Bau",
      summary:gap>=0?`Der erste Bau liegt ${clock(Math.abs(gap))} vor dem ${militaryLabel} (laut Aktionsprotokoll).`:`Der ${militaryLabel} liegt ${clock(Math.abs(gap))} vor dem ersten Bau (laut Aktionsprotokoll).`,
      evidence:`Erster Bau ${clock(firstBuild.seconds)} (Spielzug ${firstBuild.turn}) · ${militaryLabel} ${clock(firstMilitary.seconds)} (Spielzug ${firstMilitary.turn})`,
      why:"Angriff und Bootstransport sind unterschiedliche Aktionen. Diese Aussage vergleicht nur das zeitlich erste militärische Ereignis mit dem ersten Bau; sie bewertet nicht dessen Erfolg.",
      nextStep:"Vergleiche die Situation direkt vor dem Ereignis: verfügbare Ziele, Gold, Truppenreserve und gegnerische Stärke.",
      confidence:"high",seconds:Math.min(firstBuild.seconds,firstMilitary.seconds)
    });
  }
  if(firstBoat){
    out.push({
      id:"first-boat",kind:"review",title:"Ersten Bootstransport separat prüfen",
      summary:`Der erste Bootsbefehl wurde bei ${clock(firstBoat.seconds)} protokolliert.`,
      evidence:`Spielzug ${firstBoat.turn} · ${firstBoat.details}`,
      why:"Ein Bootstransport ist nicht dasselbe wie ein normaler Angriff. Er kann eine Insel- oder Küstenlandung vorbereiten; der Befehl allein bestätigt aber weder Ankunft noch Eroberung.",
      nextStep:"Öffne genau diesen Zeitpunkt im Replay und prüfe Startküste, Zielküste, Truppenmenge sowie ob und wann die Truppen tatsächlich landen.",
      confidence:"high",seconds:firstBoat.seconds
    });
  }
  if(firstAttack){
    const troops=numeric(field(firstAttack.details,"Truppen"));
    out.push({
      id:"first-attack",kind:"review",title:"Ersten Angriff auf Risiko und Ertrag prüfen",
      summary:`Der erste Angriffsbefehl erfolgte bei ${clock(firstAttack.seconds)}${troops!==null?` mit ${Math.round(troops).toLocaleString("de-DE")} Truppen`:""}.`,
      evidence:`Spielzug ${firstAttack.turn} · ${firstAttack.details}`,
      why:"Ein Angriff kann Expansion beschleunigen, aber auch Truppen binden. Das Protokoll enthält den Befehl, nicht den Ausgang oder die Verluste.",
      nextStep:"Prüfe direkt davor und danach: Zielgröße, eigene Reserve, gegnerische Verteidigung und tatsächlich eroberte Felder.",
      confidence:"high",seconds:firstAttack.seconds
    });
  }
  if(firstBuild){
    const unit=field(firstBuild.details,"Typ")??"Gebäude/Einheit";
    out.push({
      id:"first-build",kind:"review",title:"Erste Investition im Kontext prüfen",
      summary:`Der erste Bau (${unit}) ist bei ${clock(firstBuild.seconds)} protokolliert.`,
      evidence:`Spielzug ${firstBuild.turn} · ${firstBuild.details}`,
      why:"Der Gebäudetyp allein beweist weder eine gute noch eine schlechte Investition. Entscheidend sind damaliges Gold, Einkommen und Bedrohung.",
      nextStep:"Vergleiche Gold und Produktionsrate vor dem Bau mit dem nächsten Ausbau- oder Verteidigungsbedarf.",
      confidence:"high",seconds:firstBuild.seconds
    });
  }
  if(repeated && repeated[1]>=3){
    out.push({
      id:"target-concentration",kind:"review",title:"Mehrere Angriffe auf dasselbe Ziel",
      summary:`Mindestens ${repeated[1]} Angriffsbefehle beziehen sich auf Ziel ${repeated[0]}.`,
      evidence:`${repeated[1]} protokollierte Angriffe mit derselben Zielkennung`,
      why:"Das kann eine konsequente Fokussierung oder ein verlustreicher Angriff sein. Ohne Zustandsänderungen lässt sich das nicht unterscheiden.",
      nextStep:"Im Replay prüfen, ob jeder Folgeangriff neue Gebiete brachte oder ob Truppen wiederholt in dieselbe Verteidigung liefen.",
      confidence:"medium",seconds:attackActions.find(a=>(field(a.details,"Ziel-ID")??field(a.details,"Ziel-Feld"))===repeated[0])?.seconds??null
    });
  }
  if(boatActions.length){
    out.push({
      id:"naval-operations",kind:"neutral",title:"Weitere Marineaktionen und Transportwege prüfen",
      summary:`${boatActions.length} Bootsaktionen wurden protokolliert. Der erste Bootsbefehl ist oben separat mit seinem Spielzug aufgeführt.`,
      evidence:`${boatActions.length} boat-Intents`,
      why:"Transporte können Inseln sichern oder Fronten verlagern. Die Zahl sagt nichts darüber aus, ob Truppen ankamen oder sinnvoll eingesetzt wurden.",
      nextStep:"Kontrolliere Ankunft, Zielgebiet und ob der Transport eine neue Front oder nur einen Umweg erzeugte.",
      confidence:"high",seconds:firstBoat?.seconds??null
    });
  }
  const attackShare=attackActions.length/ordered.length;
  if(attackShare>=0.55 && buildActions.length>0){
    out.push({
      id:"action-balance",kind:"review",title:"Hoher Anteil an Angriffsbefehlen",
      summary:`${Math.round(attackShare*100)} % aller protokollierten Aktionen waren Angriffe (${attackActions.length} von ${ordered.length}).`,
      evidence:`${attackActions.length} Angriffe · ${buildActions.length} Bauaktionen · ${boatActions.length} Bootsaktionen`,
      why:"Das zeigt einen offensiven Aktionsschwerpunkt, nicht automatisch Überaggressivität. Dafür müssen Expansionsertrag, Verluste und Wirtschaft gegenübergestellt werden.",
      nextStep:"Vergleiche die Phasen mit hoher Angriffsaktivität mit Gebietsgewinn, Truppenbestand und Einkommen.",
      confidence:"high",seconds:null
    });
  }
  if(durationSeconds>0){
    const late=ordered.filter(a=>a.seconds>=durationSeconds*0.8);
    const early=ordered.filter(a=>a.seconds<=durationSeconds*0.2);
    if(early.length && late.length){
      out.push({
        id:"match-phases",kind:"neutral",title:"Früh- und Spätphase getrennt betrachten",
        summary:`${early.length} Aktionen in den ersten 20 % und ${late.length} in den letzten 20 % der Partie.`,
        evidence:`Frühphase 0:00–${clock(durationSeconds*.2)} · Spätphase ${clock(durationSeconds*.8)}–${clock(durationSeconds)}`,
        why:"Eine gute Strategie verändert sich mit Kartenkontrolle, Gegnern und Ressourcen. Gesamtzahlen verdecken solche Phasenwechsel.",
        nextStep:"Prüfe, ob sich dein Schwerpunkt passend zur Spielsituation von Expansion zu Absicherung oder Endkampf verändert hat.",
        confidence:"high",seconds:durationSeconds*.8
      });
    }
  }
  return out.slice(0,8);
}
