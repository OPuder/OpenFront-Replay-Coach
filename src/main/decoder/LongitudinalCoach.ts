import { buildProCoachReport, type ProCoachAction, type ProCoachConfidence, type ProCoachFinding, type ProCoachPhase, type ProCoachReport, type ProCoachPlayerSample, type ProCoachSpawnPosition } from "./ProCoachAlgorithm";
import { buildEngineCoachInsights, type EngineCoachInsight } from "./EngineCoachInsights";

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
    playerReview: { clientID: string | null; playerName?: string; startTiles?: number; endTiles?: number; tilesGained?: number; startGold?: number; endGold?: number; startTroops?: number; endTroops?: number; outgoingAttackSamples?: number; longestNoExpansionSeconds?: number } | null;
    actionReviews: unknown[];
    spawnPositions?: ProCoachSpawnPosition[] | null;
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

export interface LongitudinalMatchProgress { gameId:string; mapName:string; playedAt:string|null; territoryPerMinute:number|null; incomePerMinute:number|null; attackFollowThroughPercent:number|null; attackFollowThroughSamples:number; phaseMomentum:{early:number|null;mid:number|null;late:number|null}; reviewedFindings:number; }
export interface LongitudinalTrendExample { gameId:string; mapName:string; playedAt:string|null; value:number; }
export interface LongitudinalMetricTrend { id:"territory"|"income"|"attack-follow-through"; label:string; previous:number|null; latest:number|null; delta:number|null; observations:number; direction:"improved"|"declined"|"stable"|"insufficient-data"; unit:string; previousExamples:LongitudinalTrendExample[]; latestExamples:LongitudinalTrendExample[]; }
export interface LongitudinalTrainingGoal {
  id: string;
  title: string;
  status: "provisional" | "active" | "improving" | "regressing";
  occurrences: number;
  comparableMatches: number;
  frequency: number;
  trainingRule: string;
  reviewWindow: string;
  target: string;
  examples: Array<{ gameId: string; mapName: string; evidence: string }>;
}
export interface LongitudinalCohortOption { key: string; label: string; matches: number; }

export interface LongitudinalCoachReport {
  cohortOptions: LongitudinalCohortOption[];
  selectedCohortKey: string | null;
  status: "ready" | "insufficient-data";
  importedMatches: number;
  verifiedMatches: number;
  excludedMatches: number;
  comparableMatches: number;
  comparableGroup: string;
  confidence: ProCoachConfidence;
  phaseSummaries: LongitudinalPhaseSummary[];
  recurringFindings: LongitudinalFinding[];
  recurringStrengths: LongitudinalFinding[];
  trainingGoals: LongitudinalTrainingGoal[];
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
  strengths: EngineCoachInsight[];
  actions: ProCoachAction[];
};

const priorityRank = (value: ProCoachFinding["priority"]) =>
  value === "high" ? 0 : value === "medium" ? 1 : 2;

const strategicClassRank = (finding: ProCoachFinding) =>
  finding.strategicClass === "decision" ? 0
    : finding.strategicClass === "pattern" ? 1
      : finding.strategicClass === "context" ? 2 : 3;

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

function buildMatchReport(input: LongitudinalMatchInput): NormalizedMatch | null {
  const simulation = input.simulation;
  const clientId = simulation?.playerReview?.clientID;
  if (
    input.analysisStatus !== "verified" ||
    simulation?.status !== "verified" ||
    !clientId ||
    !Array.isArray(simulation.samples) ||
    !Array.isArray(simulation.actionReviews)
  ) return null;

  // Keep only structurally usable samples for this selected player. Real engine
  // output is complete, but persisted/corrupt partial records must not crash review
  // generation or be mistaken for evidence.
  const samples = simulation.samples.flatMap((raw: any) => {
    if (!raw || typeof raw !== "object" || !Number.isFinite(raw.tick) || !Array.isArray(raw.players)) return [];
    const players = raw.players.filter((player: any) => player && typeof player === "object");
    const player = players.find((candidate: any) => String(candidate.clientID ?? "") === clientId);
    if (!player || typeof player.alive !== "boolean"
      || ![player.tiles, player.gold, player.goldEarned, player.troops, player.allies, player.betrayals].every(Number.isFinite)
      || !Array.isArray(player.outgoingAttackDetails) || !Array.isArray(player.incomingAttackDetails)
      || !player.unitCounts || typeof player.unitCounts !== "object") return [];
    return [{ ...raw, players }];
  }) as ProCoachPlayerSample[];
  if (samples.length < 2) return null;

  // Malformed or incomplete action records must not be silently assigned time 0.
  // That would fabricate an opening action and could distort longitudinal attack rates.
  const actions = simulation.actionReviews
    .filter((raw: any) => raw && typeof raw === "object"
      && typeof raw.seconds === "number" && Number.isFinite(raw.seconds) && raw.seconds >= 0
      && typeof raw.type === "string" && raw.type.trim().length > 0)
    .map((raw: any): ProCoachAction => ({
      seconds: raw.seconds,
      type: raw.type,
      label: typeof raw.label === "string" ? raw.label : "",
      targetName: raw.targetName == null ? null : String(raw.targetName),
      delta10s: raw.delta10s ?? null,
      delta30s: raw.delta30s ?? null,
      targetDelta30s: raw.targetDelta30s ?? null,
      ownFrontContextBefore: raw.ownFrontContextBefore ?? null,
      targetPressureBefore: raw.targetPressureBefore ?? null,
    }));
  const duration = Number(input.durationSeconds);
  const totalTicks = Number(simulation.totalTicks);
  const observedTicks = samples[samples.length - 1].tick - samples[0].tick;
  const safeDuration = Number.isFinite(duration) && duration > 0
    ? duration
    : Number.isFinite(totalTicks) && totalTicks > 0
      ? totalTicks / 10
      : Number.isFinite(observedTicks) && observedTicks > 0 ? observedTicks / 10 : 1;
  const report = buildProCoachReport(samples, actions, clientId, safeDuration, simulation.spawnPositions ?? []);
  const playerReview = simulation.playerReview as Parameters<typeof buildEngineCoachInsights>[0];
  const hasCompleteReview = [
    playerReview.startTiles, playerReview.endTiles, playerReview.tilesGained,
    playerReview.startGold, playerReview.endGold, playerReview.startTroops,
    playerReview.endTroops, playerReview.outgoingAttackSamples,
    playerReview.longestNoExpansionSeconds,
  ].every(value => Number.isFinite(value));
  const validEngineActions = simulation.actionReviews.filter((raw: any) =>
    raw && typeof raw === "object"
    && typeof raw.seconds === "number" && Number.isFinite(raw.seconds) && raw.seconds >= 0
    && typeof raw.type === "string" && raw.type.trim().length > 0
  );
  const strengths = hasCompleteReview
    ? buildEngineCoachInsights(
        playerReview,
        validEngineActions as Parameters<typeof buildEngineCoachInsights>[1],
        samples as Parameters<typeof buildEngineCoachInsights>[2],
      ).filter(insight => insight.kind === "strength")
    : [];
  return { input, report, strengths, actions };
}

/**
 * Longitudinal coaching uses only fully hash-verified engine simulations.
 * Comparisons are restricted to the largest shared mode + game-type cohort.
 */
export function buildLongitudinalCoachReport(
  matches: readonly LongitudinalMatchInput[],
  selectedCohortKey?: string | null,
): LongitudinalCoachReport {
  // De-duplicate stable game IDs before calculating confidence and patterns.
  // Duplicate imports must never manufacture recurring evidence.
  const importedByGame = new Map<string, NormalizedMatch | null>();
  for (const match of matches) {
    const gameId = String(match.gameId ?? "").trim();
    if (!gameId) continue;
    const candidate = buildMatchReport(match);
    if (!importedByGame.has(gameId)) {
      importedByGame.set(gameId, candidate);
      continue;
    }
    const existing = importedByGame.get(gameId) ?? null;
    // Prefer a genuinely usable verified report, not just status flags. A partial
    // duplicate may carry "verified" metadata while lacking the selected player.
    if (candidate && (!existing ||
      candidate.report.dataCoverage.samples + candidate.report.dataCoverage.actions >
      existing.report.dataCoverage.samples + existing.report.dataCoverage.actions)) {
      importedByGame.set(gameId, candidate);
    }
  }
  const imported = [...importedByGame.keys()];
  const verified = [...importedByGame.values()]
    .filter((entry): entry is NormalizedMatch => entry !== null);

  const groups = new Map<string, NormalizedMatch[]>();
  for (const entry of verified) {
    const key = comparableKey(entry.input);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  const orderedGroups = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const cohortOptions = orderedGroups.map(([key, entries]) => ({
    key,
    label: comparableLabel(entries[0].input),
    matches: entries.length,
  }));
  // Preserve a chosen comparison group as new matches arrive; fall back to the
  // largest verified cohort if the selected group is no longer available.
  const selectedGroup = orderedGroups.find(([key]) => key === selectedCohortKey) ?? orderedGroups[0];
  const effectiveCohortKey = selectedGroup?.[0] ?? null;
  const comparable = selectedGroup?.[1] ?? [];
  const groupLabel = comparable[0] ? comparableLabel(comparable[0].input) : "Noch keine vergleichbare Gruppe";
  const phaseIds = [
    { id: "early" as const, label: "Early Game" },
    { id: "mid" as const, label: "Mid Game" },
    { id: "late" as const, label: "Late Game" },
  ];

  // Preserve caller order for missing/equal timestamps. A game ID is not a
  // substitute for chronology: it is deterministic, but says nothing about time.
  const chronological = comparable.map((entry, index) => ({ entry, index, timestamp:
    typeof entry.input.playedAt === "string" && entry.input.playedAt.trim()
      ? Date.parse(entry.input.playedAt) : Number.NaN,
  })).sort((a, b) => {
    const aValid = Number.isFinite(a.timestamp), bValid = Number.isFinite(b.timestamp);
    if (aValid && bValid && a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (aValid !== bValid) return aValid ? -1 : 1;
    return a.index - b.index;
  }).map(item => item.entry);
  const timestampCounts = new Map<number, number>();
  for (const entry of comparable) {
    const value = typeof entry.input.playedAt === "string" ? Date.parse(entry.input.playedAt) : Number.NaN;
    if (Number.isFinite(value)) timestampCounts.set(value, (timestampCounts.get(value) ?? 0) + 1);
  }
  // Only unique, parseable timestamps can support a directional trend. Missing or
  // tied timestamps remain visible in match history and recurrence evidence.
  const trendChronological = chronological.filter(entry => {
    const value = typeof entry.input.playedAt === "string" ? Date.parse(entry.input.playedAt) : Number.NaN;
    return Number.isFinite(value) && timestampCounts.get(value) === 1;
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
      attackFollowThroughPercent:(()=>{const evaluated=entry.actions.filter(raw=>raw.type==="attack"&&Number.isFinite(raw.delta30s?.tiles)&&((raw.delta30s?.tiles??0)>0||Number.isFinite(raw.targetDelta30s?.tiles)));if(!evaluated.length)return null;const productive=evaluated.filter(raw=>{const ownLoss=Math.max(0,-(raw.delta30s?.troops??0));const targetLoss=Math.max(0,-(raw.targetDelta30s?.troops??0));return (raw.delta30s?.tiles??0)>0||(Number.isFinite(raw.targetDelta30s?.tiles)&&Number(raw.targetDelta30s!.tiles)<0)||(ownLoss>0&&targetLoss>ownLoss&&(raw.delta30s?.tiles??0)>=0&&(raw.targetDelta30s?.tiles??0)>=0);}).length;return productive/evaluated.length*100;})(),
      attackFollowThroughSamples:entry.actions.filter(raw=>raw.type==="attack"&&Number.isFinite(raw.delta30s?.tiles)&&(Number(raw.delta30s!.tiles)>0||Number.isFinite(raw.targetDelta30s?.tiles))).length,
      reviewedFindings:entry.report.findings.length};
  });
  const trend=(id:"territory"|"income"|"attack-follow-through",label:string,unit:string):LongitudinalMetricTrend=>{
    const valueFor=(item:LongitudinalMatchProgress)=>id==="territory"?item.territoryPerMinute:id==="income"?item.incomePerMinute:item.attackFollowThroughPercent;
    const progressByGame=new Map(matchProgress.map(item=>[item.gameId,item]));
    const toExamples=(entries:NormalizedMatch[])=>entries.flatMap(entry=>{
      const progress=progressByGame.get(entry.input.gameId);
      const value=progress?valueFor(progress):null;
      return progress&&value!==null&&Number.isFinite(value)
        ?[{gameId:progress.gameId,mapName:progress.mapName,playedAt:progress.playedAt,value}]
        :[];
    });
    // Keep the two windows anchored to six consecutive, uniquely dated matches.
    // A match with no usable metric remains a gap; it must not shift later matches
    // into an earlier window and manufacture an improvement/regression.
    const blockSize=3;
    const previousMatches=trendChronological.slice(-blockSize*2,-blockSize);
    const latestMatches=trendChronological.slice(-blockSize);
    const previousBlock=toExamples(previousMatches);
    const latestBlock=toExamples(latestMatches);
    const previous=previousBlock.length===blockSize?median(previousBlock.map(item=>item.value)):null;
    const latest=latestBlock.length===blockSize?median(latestBlock.map(item=>item.value)):null;
    const delta=previous!==null&&latest!==null?latest-previous:null;
    const threshold=previous===null?0:Math.max(0.05,Math.abs(previous)*0.03);
    const direction=delta===null?"insufficient-data":delta>threshold?"improved":delta< -threshold?"declined":"stable";
    const observations=trendChronological.filter(entry=>{
      const progress=progressByGame.get(entry.input.gameId);
      const value=progress?valueFor(progress):null;
      return value!==null&&Number.isFinite(value);
    }).length;
    return {id,label,previous,latest,delta,observations,direction,unit,
      previousExamples:previousBlock.map(({gameId,mapName,playedAt,value})=>({gameId,mapName,playedAt,value})),
      latestExamples:latestBlock.map(({gameId,mapName,playedAt,value})=>({gameId,mapName,playedAt,value})),
    };
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
    for (const finding of (entry.report.allFindings ?? entry.report.findings)) {
      if (finding.priority === "low") continue;
      const values = findingGroups.get(finding.id) ?? [];
      if (!values.some(value => value.input.gameId === entry.input.gameId)) {
        values.push({ input: entry.input, finding });
        findingGroups.set(finding.id, values);
      }
    }
  }
  const trainingGoals: LongitudinalTrainingGoal[] = [...findingGroups.entries()]
    .filter(([, values]) => values.length >= 2)
    .map(([id, values]) => {
      const best = [...values].sort((a, b) => priorityRank(a.finding.priority) - priorityRank(b.finding.priority) || strategicClassRank(a.finding) - strategicClassRank(b.finding))[0].finding;
      const frequency = values.length / Math.max(1, comparable.length);
      const hasFinding = (entry: NormalizedMatch) => (entry.report.allFindings ?? entry.report.findings).some(finding => finding.id === id && finding.priority !== "low");
      // Directional training status requires trustworthy chronology. Missing or
      // tied timestamps remain in recurrence counts, but cannot define "recent".
      const recent = trendChronological.slice(-3);
      const previous = trendChronological.slice(-6, -3);
      const recentOccurrences = recent.filter(hasFinding).length;
      const previousOccurrences = previous.filter(hasFinding).length;
      const improving = previous.length === 3 && previousOccurrences >= 2 && recent.length === 3 && recentOccurrences === 0;
      const regressing = previous.length === 3 && previousOccurrences === 0 && recent.length === 3 && recentOccurrences >= 2;
      const status: LongitudinalTrainingGoal["status"] = improving
        ? "improving"
        : regressing
          ? "regressing"
          : comparable.length >= 4 && frequency >= 0.4
            ? "active"
            : "provisional";
      return {
        id, title: best.title, status, occurrences: values.length,
        comparableMatches: comparable.length, frequency,
        trainingRule: best.trainingRule,
        reviewWindow: "Nächste 3 vergleichbare Partien",
        target: "Dieses Muster in höchstens 1 der nächsten 3 vergleichbaren Partien beobachten.",
        examples: values.slice(0, 3).map(({ input, finding }) => ({
          gameId: input.gameId, mapName: input.mapName, evidence: finding.evidence,
        })),
      };
    })
    .sort((a, b) => {
      const rank = (status: LongitudinalTrainingGoal["status"]) =>
        status === "regressing" ? 0 : status === "active" ? 1 : status === "provisional" ? 2 : 3;
      return rank(a.status) - rank(b.status) || b.occurrences - a.occurrences;
    })
    .slice(0, 3);

  const recurringClassRank = (id: string) => {
    const finding = findingGroups.get(id)?.[0]?.finding;
    return finding ? strategicClassRank(finding) : 3;
  };
  const recurringFindings: LongitudinalFinding[] = [...findingGroups.entries()]
    .filter(([, values]) => values.length >= 2)
    .map(([id, values]) => {
      const best = [...values].sort((a, b) => priorityRank(a.finding.priority) - priorityRank(b.finding.priority) || strategicClassRank(a.finding) - strategicClassRank(b.finding))[0].finding;
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
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)
      || recurringClassRank(a.id) - recurringClassRank(b.id)
      || b.occurrences - a.occurrences)
    .slice(0, 3);

  const strengthGroups = new Map<string, Array<{ input: LongitudinalMatchInput; finding: EngineCoachInsight }>>();
  for (const entry of comparable) {
    for (const finding of entry.strengths) {
      const values = strengthGroups.get(finding.id) ?? [];
      if (!values.some(value => value.input.gameId === entry.input.gameId)) {
        values.push({ input: entry.input, finding });
        strengthGroups.set(finding.id, values);
      }
    }
  }
  const recurringStrengths: LongitudinalFinding[] = [...strengthGroups.entries()]
    .filter(([, values]) => values.length >= 2)
    .map(([id, values]) => {
      const best = values[0].finding;
      return {
        id,
        title: best.title,
        priority: best.priority ?? "medium",
        occurrences: values.length,
        comparableMatches: comparable.length,
        frequency: values.length / Math.max(1, comparable.length),
        trainingRule: best.nextStep,
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
    cohortOptions,
    selectedCohortKey: effectiveCohortKey,
    status,
    importedMatches: imported.length,
    verifiedMatches: verified.length,
    excludedMatches: imported.length - comparable.length,
    comparableMatches: comparable.length,
    comparableGroup: groupLabel,
    confidence,
    phaseSummaries,
    recurringFindings,
    recurringStrengths,
    trainingGoals,
    matchProgress,
    metricTrends,
    weakestPhase: weakest ? { id: weakest.id, label: weakest.label, occurrences: weakest.weakestCount } : null,
    strongestPhase: strongest ? { id: strongest.id, label: strongest.label, occurrences: strongest.strongestCount } : null,
    trainingFocus,
    message,
  };
}
