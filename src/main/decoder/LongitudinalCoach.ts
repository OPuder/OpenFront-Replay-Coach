import { buildProCoachReport, type ProCoachAction, type ProCoachConfidence, type ProCoachFinding, type ProCoachPhase, type ProCoachReport, type ProCoachPlayerSample } from "./ProCoachAlgorithm";

export interface LongitudinalMatchInput {
  gameId: string;
  mapName: string;
  mode: string;
  type: string;
  playedAt?: string | null;
  durationSeconds?: number | null;
  analysisStatus?: string;
  simulation?: {
    status: "verified" | "unverified";
    totalTicks: number;
    verifiedHashes: number;
    samples: unknown[];
    playerReview: { clientID: string | null } | null;
    actionReviews: unknown[];
  } | null;
}

export interface LongitudinalPhaseSummary {
  id: "early" | "mid" | "late";
  label: string;
  matchesWithData: number;
  medianTerritoryPerMinute: number | null;
  medianIncomePerMinute: number | null;
  weakestCount: number;
  strongestCount: number;
}

export interface LongitudinalFinding {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  occurrences: number;
  comparableMatches: number;
  frequency: number;
  trainingRule: string;
  examples: Array<{ gameId: string; mapName: string; evidence: string }>;
}

export interface LongitudinalMatchProgress { gameId:string; mapName:string; playedAt:string|null; territoryPerMinute:number|null; incomePerMinute:number|null; attackFollowThroughPercent:number|null; phaseMomentum:{early:number|null;mid:number|null;late:number|null}; reviewedFindings:number; }
export interface LongitudinalMetricTrend { id:"territory"|"income"|"attack-follow-through"; label:string; previous:number|null; latest:number|null; delta:number|null; direction:"improved"|"declined"|"stable"|"insufficient-data"; unit:string; }
export interface LongitudinalCoachReport {
  status: "ready" | "insufficient-data";
  importedMatches: number;
  verifiedMatches: number;
  excludedMatches: number;
  comparableMatches: number;
  comparableGroup: string;
  confidence: ProCoachConfidence;
  phaseSummaries: LongitudinalPhaseSummary[];
  recurringFindings: LongitudinalFinding[];
  matchProgress: LongitudinalMatchProgress[];
  metricTrends: LongitudinalMetricTrend[];
  weakestPhase: { id: "early" | "mid" | "late"; label: string; occurrences: number } | null;
  strongestPhase: { id: "early" | "mid" | "late"; label: string; occurrences: number } | null;
  trainingFocus: string;
  message: string;
}

type NormalizedMatch = {
  input: LongitudinalMatchInput;
  report: ProCoachReport;
};

const priorityRank = (value: ProCoachFinding["priority"]) =>
  value === "high" ? 0 : value === "medium" ? 1 : 2;

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
};

const normalize = (value: string | null | undefined) =>
  String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ") || "unbekannt";

function comparableKey(match: LongitudinalMatchInput): string {
  return `${normalize(match.mode)}|${normalize(match.type)}`;
}

function comparableLabel(match: LongitudinalMatchInput): string {
  return [match.mode || "Modus unbekannt", match.type || "Spieltyp unbekannt"].join(" · ");
}

function buildMatchReport(input: LongitudinalMatchInput): ProCoachReport | null {
  const simulation = input.simulation;
  const clientId = simulation?.playerReview?.clientID;
  if (
    input.analysisStatus !== "verified" ||
    simulation?.status !== "verified" ||
    !clientId ||
    !Array.isArray(simulation.samples) ||
    !Array.isArray(simulation.actionReviews)
  ) return null;

  const actions = simulation.actionReviews.map((raw: any): ProCoachAction => ({
    seconds: Number(raw.seconds ?? 0),
    type: String(raw.type ?? ""),
    label: String(raw.label ?? ""),
    targetName: raw.targetName == null ? null : String(raw.targetName),
    delta10s: raw.delta10s ?? null,
    delta30s: raw.delta30s ?? null,
    targetDelta30s: raw.targetDelta30s ?? null,
    ownFrontContextBefore: raw.ownFrontContextBefore ?? null,
    targetPressureBefore: raw.targetPressureBefore ?? null,
  }));
  const duration = Number(input.durationSeconds);
  return buildProCoachReport(
    simulation.samples as ProCoachPlayerSample[],
    actions,
    clientId,
    Number.isFinite(duration) && duration > 0 ? duration : simulation.totalTicks / 10,
  );
}

/**
 * Longitudinal coaching uses only fully hash-verified engine simulations.
 * Comparisons are restricted to the largest shared mode + game-type cohort.
 */
export function buildLongitudinalCoachReport(
  matches: readonly LongitudinalMatchInput[],
): LongitudinalCoachReport {
  const imported = matches.filter(match => Boolean(match.gameId));
  const verified = imported
    .map(input => ({ input, report: buildMatchReport(input) }))
    .filter((entry): entry is NormalizedMatch => entry.report !== null);

  const groups = new Map<string, NormalizedMatch[]>();
  for (const entry of verified) {
    const key = comparableKey(entry.input);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const selectedGroup = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  const comparable = selectedGroup?.[1] ?? [];
  const groupLabel = comparable[0] ? comparableLabel(comparable[0].input) : "Noch keine vergleichbare Gruppe";
  const phaseIds = [
    { id: "early" as const, label: "Early Game" },
    { id: "mid" as const, label: "Mid Game" },
    { id: "late" as const, label: "Late Game" },
  ];

  const chronological = [...comparable].sort((a,b) => {
    const left=a.input.playedAt?Date.parse(a.input.playedAt):Number.NaN, right=b.input.playedAt?Date.parse(b.input.playedAt):Number.NaN;
    if(Number.isFinite(left)&&Number.isFinite(right)&&left!==right)return left-right;
    if(Number.isFinite(left)!==Number.isFinite(right))return Number.isFinite(left)?-1:1;
    return a.input.gameId.localeCompare(b.input.gameId);
  });
  const matchProgress:LongitudinalMatchProgress[]=chronological.map(entry=>{
    const phase=(id:"early"|"mid"|"late")=>entry.report.phases.find(item=>item.id===id);
    const territory=entry.report.phases.filter(item=>item.territoryPerMinute!==null&&item.activeSamples>=3);
    const income=entry.report.phases.filter(item=>item.incomePerMinute!==null&&item.activeSamples>=3);
    const avg=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
    return {gameId:entry.input.gameId,mapName:entry.input.mapName,playedAt:entry.input.playedAt??null,
      territoryPerMinute:avg(territory.map(item=>item.territoryPerMinute!).filter(Number.isFinite)),
      incomePerMinute:avg(income.map(item=>item.incomePerMinute!).filter(Number.isFinite)),
      phaseMomentum:{early:phase("early")?.momentumIndex??null,mid:phase("mid")?.momentumIndex??null,late:phase("late")?.momentumIndex??null},
      attackFollowThroughPercent:(()=>{const evaluated=(entry.input.simulation?.actionReviews??[]).filter((raw:any)=>raw?.type==="attack"&&Number.isFinite(raw.delta30s?.tiles)&&Number.isFinite(raw.targetDelta30s?.tiles));if(!evaluated.length)return null;const productive=evaluated.filter((raw:any)=>Number(raw.delta30s.tiles)>0||Number(raw.targetDelta30s.tiles)<0).length;return productive/evaluated.length*100;})(),
      reviewedFindings:entry.report.findings.length};
  });
  const trend=(id:"territory"|"income"|"attack-follow-through",label:string,unit:string):LongitudinalMetricTrend=>{
    const values=matchProgress.map(item=>id==="territory"?item.territoryPerMinute:id==="income"?item.incomePerMinute:item.attackFollowThroughPercent).filter((value):value is number=>value!==null&&Number.isFinite(value));
    const previous=values.length>=2?values[values.length-2]:null,latest=values.length>=2?values[values.length-1]:null;
    const delta=previous!==null&&latest!==null?latest-previous:null,threshold=previous===null?0:Math.max(0.05,Math.abs(previous)*0.03);
    const direction=delta===null?"insufficient-data":delta>threshold?"improved":delta< -threshold?"declined":"stable";
    return {id,label,previous,latest,delta,direction,unit};
  };
  const metricTrends=[trend("territory","Gebietszuwachs","Gebiete/min"),trend("income","Einkommenszuwachs","Gold/min"),trend("attack-follow-through","Angriffs-Folge","%")];

  const phaseSummaries: LongitudinalPhaseSummary[] = phaseIds.map(phase => {
    const values = comparable.map(entry => entry.report.phases.find(item => item.id === phase.id))
      .filter((item): item is ProCoachPhase => Boolean(item && item.momentumIndex !== null && item.activeSamples >= 3));
    const weakestCount = comparable.filter(entry => {
      const usable = entry.report.phases.filter(item => item.momentumIndex !== null && item.activeSamples >= 3);
      return usable.length >= 2 && usable.sort((a, b) => (a.momentumIndex ?? 0) - (b.momentumIndex ?? 0))[0]?.id === phase.id;
    }).length;
    const strongestCount = comparable.filter(entry => {
      const usable = entry.report.phases.filter(item => item.momentumIndex !== null && item.activeSamples >= 3);
      return usable.length >= 2 && usable.sort((a, b) => (b.momentumIndex ?? 0) - (a.momentumIndex ?? 0))[0]?.id === phase.id;
    }).length;
    return {
      ...phase,
      matchesWithData: values.length,
      medianTerritoryPerMinute: median(values.map(item => item.territoryPerMinute).filter((value): value is number => value !== null)),
      medianIncomePerMinute: median(values.map(item => item.incomePerMinute).filter((value): value is number => value !== null)),
      weakestCount,
      strongestCount,
    };
  });

  const findingGroups = new Map<string, Array<{ input: LongitudinalMatchInput; finding: ProCoachFinding }>>();
  for (const entry of comparable) {
    for (const finding of entry.report.findings) {
      const values = findingGroups.get(finding.id) ?? [];
      if (!values.some(value => value.input.gameId === entry.input.gameId)) {
        values.push({ input: entry.input, finding });
        findingGroups.set(finding.id, values);
      }
    }
  }
  const recurringFindings: LongitudinalFinding[] = [...findingGroups.entries()]
    .filter(([, values]) => values.length >= 2)
    .map(([id, values]) => {
      const best = [...values].sort((a, b) => priorityRank(a.finding.priority) - priorityRank(b.finding.priority))[0].finding;
      return {
        id,
        title: best.title,
        priority: best.priority,
        occurrences: values.length,
        comparableMatches: comparable.length,
        frequency: values.length / Math.max(1, comparable.length),
        trainingRule: best.trainingRule,
        examples: values.slice(0, 3).map(({ input, finding }) => ({
          gameId: input.gameId,
          mapName: input.mapName,
          evidence: finding.evidence,
        })),
      };
    })
    .sort((a, b) => b.occurrences - a.occurrences || priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 3);

  const weakest = phaseSummaries.filter(item => item.weakestCount >= 2)
    .sort((a, b) => b.weakestCount - a.weakestCount)[0];
  const strongest = phaseSummaries.filter(item => item.strongestCount >= 2)
    .sort((a, b) => b.strongestCount - a.strongestCount)[0];
  const confidence: ProCoachConfidence = comparable.length >= 5 ? "high" : comparable.length >= 3 ? "medium" : "low";
  const status = comparable.length >= 2 ? "ready" : "insufficient-data";
  const trainingFocus = recurringFindings[0]?.trainingRule
    ?? (weakest ? `In ${weakest.label} gezielt die Entscheidungen und beobachteten Zustandswechsel vergleichen.` : "Weitere Partien desselben Modus und Spieltyps verifizieren, bevor wiederkehrende Muster bewertet werden.");
  const message = status === "ready"
    ? `${comparable.length} vollständig verifizierte Partien aus ${groupLabel} bilden die Vergleichsgrundlage. Nicht verifizierte oder andersartige Partien fließen nicht ein; Karten- und Spielerzahlen können variieren, deshalb sind Raten und wiederkehrende Muster keine direkte Siegprognose.`
    : `Für belastbare Langzeitmuster werden mindestens zwei vollständig hash-verifizierte Partien desselben Modus und Spieltyps benötigt. Aktuell vergleichbar: ${comparable.length}.`;

  return {
    status,
    importedMatches: imported.length,
    verifiedMatches: verified.length,
    excludedMatches: imported.length - comparable.length,
    comparableMatches: comparable.length,
    comparableGroup: groupLabel,
    confidence,
    phaseSummaries,
    recurringFindings,
    matchProgress,
    metricTrends,
    weakestPhase: weakest ? { id: weakest.id, label: weakest.label, occurrences: weakest.weakestCount } : null,
    strongestPhase: strongest ? { id: strongest.id, label: strongest.label, occurrences: strongest.strongestCount } : null,
    trainingFocus,
    message,
  };
}
