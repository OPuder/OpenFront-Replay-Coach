interface EnginePlayerReview {
  playerName: string;
  clientID: string | null;
  startTiles: number;
  endTiles: number;
  tilesGained: number;
  startGold: number;
  endGold: number;
  startTroops: number;
  endTroops: number;
  outgoingAttackSamples: number;
  longestNoExpansionSeconds: number;
}

interface EngineStateDelta {
  tiles: number;
  gold: number;
  troops: number;
  goldEarned: number;
  tradeGold: number;
  trainGold: number;
  piracyGold: number;
}

interface EngineActiveAttackSummary {
  count: number;
  troops: number;
  retreatingCount: number;
}

interface EngineFrontContext {
  activeTargetCount: number;
  outgoingTargetIds: number[];
  outgoingAttackCount: number;
  outgoingAttackTroops: number;
  incomingAttackCount: number;
  incomingAttackTroops: number;
  incomingAttackerNames: string[];
}

interface EngineTargetPressure {
  incomingAttackCount: number;
  incomingAttackTroops: number;
  otherAttackCount: number;
  otherAttackTroops: number;
  otherAttackerCount: number;
  otherAttackerNames: string[];
  retreatingOtherAttackCount: number;
}

interface EngineActionReview {
  frame: number;
  turn: number;
  seconds: number;
  type: string;
  commandTroops: number | null;
  label: string;
  details: string;
  targetId: string | null;
  targetName: string | null;
  targetSmallID: number | null;
  before: EngineStateDelta | null;
  after: EngineStateDelta | null;
  delta: EngineStateDelta | null;
  delta5s: EngineStateDelta | null;
  delta10s: EngineStateDelta | null;
  delta30s: EngineStateDelta | null;
  targetDelta10s: EngineStateDelta | null;
  targetDelta30s: EngineStateDelta | null;
  targetAliveBefore: boolean | null;
  targetAliveAt10s: boolean | null;
  targetAliveAt30s: boolean | null;
  ownFrontContextBefore: EngineFrontContext | null;
  targetPressureBefore: EngineTargetPressure | null;
  activeAttack10s: EngineActiveAttackSummary | null;
  activeAttack30s: EngineActiveAttackSummary | null;
}

interface EngineSamplePlayer {
  id: number;
  name: string;
  clientID: string | null;
  alive: boolean;
  gold: number;
  goldEarned: number;
  tradeGold: number;
  trainGold: number;
  piracyGold: number;
  troops: number;
  tiles: number;
  units: number;
  unitCounts: Record<string, number>;
  unitTroops: Record<string, number>;
  unitsUnderConstruction: number;
  outgoingAttacks: number;
  incomingAttacks: number;
  outgoingAttackDetails: Array<{ id: string; targetID: number; troops: number; retreating: boolean }>;
  incomingAttackDetails: Array<{ id: string; attackerID: number; troops: number; retreating: boolean }>;
  attackTroops: number;
  allies: number;
  alliances: number;
  targets: number;
  betrayals: number;
  isTraitor: boolean;
  isDecaying: boolean;
  inDoomsdayClock: boolean;
}

interface EngineStateSample {
  tick: number;
  frame: number;
  players: EngineSamplePlayer[];
}

const clock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export type EngineCoachKind = "strength" | "review" | "observation";

export interface EngineCoachInsight {
  id: string;
  kind: EngineCoachKind;
  title: string;
  summary: string;
  evidence: string;
  nextStep: string;
  seconds: number | null;
  limitation: string;
  priority?: "high" | "medium" | "low";
  decision?: string;
  alternative?: string;
  confidence?: "high" | "medium";
}

/**
 * Converts reconstructed engine observations into cautious coaching prompts.
 * These are evidence-backed review points, not causal claims or a tactical
 * counterfactual engine.
 */
export function buildEngineCoachInsights(
  review: EnginePlayerReview,
  actionReviews: EngineActionReview[],
  samples: EngineStateSample[] = [],
): EngineCoachInsight[] {
  const findings: EngineCoachInsight[] = [];
  const tileChange = review.tilesGained;
  findings.push({
    id: "territory-trajectory",
    kind: "observation",
    title: tileChange > 0 ? "Gebiet netto ausgebaut" : tileChange < 0 ? "Gebietsbestand netto gesunken" : "Gebietsbestand unverändert",
    summary: `Dein Gebietsbestand hat sich über die Partie um ${tileChange > 0 ? "+" : ""}${tileChange.toLocaleString("de-DE")} Felder verändert.`,
    evidence: `Start: ${review.startTiles.toLocaleString("de-DE")} Felder · Ende: ${review.endTiles.toLocaleString("de-DE")} Felder`,
    nextStep: tileChange > 0
      ? "Prüfe die Abschnitte mit dem stärksten Zuwachs: Welche Expansionen haben sichere Grenzen und neue Angriffsmöglichkeiten geschaffen?"
      : "Öffne die Phasen mit Gebietsverlust und vergleiche Frontverlauf, eingehende Angriffe und verfügbare Truppenreserven.",
    seconds: null,
    limitation: "Der Start-/Endvergleich zeigt das Nettoergebnis, nicht den Zeitpunkt oder die Ursache einzelner Gebietsänderungen.",
  });

  if (review.longestNoExpansionSeconds >= 90) {
    findings.push({
      id: "expansion-pause",
      kind: "review",
      title: "Längere Phase ohne beobachteten Gebietszuwachs",
      summary: `Der längste beobachtete Zeitraum ohne neuen Gebietsgewinn betrug etwa ${review.longestNoExpansionSeconds} Sekunden.`,
      evidence: `Aus den rekonstruierten Zustandsstichproben abgeleitet · ${review.longestNoExpansionSeconds} s`,
      nextStep: "Prüfe auf der Karte, ob du in dieser Phase Truppen gesammelt, eine Front verteidigt, auf Transporte gewartet oder eine erreichbare Expansion ausgelassen hast.",
      seconds: null,
      limitation: "Eine Pause beim Gebietszuwachs ist nicht automatisch Leerlauf oder ein Fehler; Bewegung, Aufbau und Verteidigung können sinnvoll sein.",
    });
  }

  const orderedSamples = [...samples].sort((a, b) => a.frame - b.frame);
  const firstOwnSample = orderedSamples.map(sample => sample.players.find(player => player.clientID === review.clientID)).find((player): player is EngineSamplePlayer => Boolean(player));
  const lastOwnSample = [...orderedSamples].reverse().map(sample => sample.players.find(player => player.clientID === review.clientID)).find((player): player is EngineSamplePlayer => Boolean(player));

  if (firstOwnSample && lastOwnSample) {
    const earned = lastOwnSample.goldEarned - firstOwnSample.goldEarned;
    const trade = lastOwnSample.tradeGold - firstOwnSample.tradeGold;
    const train = lastOwnSample.trainGold - firstOwnSample.trainGold;
    const piracy = lastOwnSample.piracyGold - firstOwnSample.piracyGold;
    const knownCommerce = trade + train + piracy;
    if (earned > 0 || knownCommerce > 0) {
      findings.push({
        id: "income-source-profile",
        kind: "observation",
        title: "Woher dein Goldeinkommen kam",
        summary: `Die Engine erfasste ${earned.toLocaleString("de-DE")} Gold Bruttoeinnahmen. Davon kamen ${knownCommerce.toLocaleString("de-DE")} aus den ausgewiesenen Handels-, Zug- und Pirateriequellen.`,
        evidence: `Gesamteinnahmen ${earned.toLocaleString("de-DE")} · Handel ${trade.toLocaleString("de-DE")} · Züge ${train.toLocaleString("de-DE")} · Piraterie ${piracy.toLocaleString("de-DE")}`,
        nextStep: "Vergleiche diese Einnahmen mit deinen Hafen-, Handels- und Zugbeständen. Prüfe, welche Infrastruktur tatsächlich Einnahmen erzeugt hat und wann sie aufgebaut wurde.",
        seconds: null,
        limitation: "GoldEarned ist ein kumulierter Bruttozufluss. Die Einzelquellen sind Teilbeträge davon; sie zeigen weder Nettogewinn noch die Kosten oder Rendite einer einzelnen Investition.",
      });
    }

    const trackedUnits = ["City", "Factory", "Port", "Warship", "TransportShip", "TradeShip", "DefensePost", "SAMLauncher", "MissileSilo", "Train"];
    const unitChanges = trackedUnits.map(type => ({
      type,
      start: firstOwnSample.unitCounts[type] ?? 0,
      end: lastOwnSample.unitCounts[type] ?? 0,
    })).filter(item => item.start > 0 || item.end > 0);
    if (unitChanges.length > 0) {
      const economy = unitChanges.filter(item => ["City", "Factory", "Port"].includes(item.type));
      const military = unitChanges.filter(item => ["Warship", "DefensePost", "SAMLauncher", "MissileSilo"].includes(item.type));
      const logistics = unitChanges.filter(item => ["TransportShip", "TradeShip", "Train"].includes(item.type));
      const fmtUnits = (items: typeof unitChanges) => items.map(item =>
        `${item.type} ${item.start}→${item.end}`
      ).join(" · ");
      findings.push({
        id: "unit-composition",
        kind: "observation",
        title: "Dein tatsächlicher Einheiten- und Gebäudebestand",
        summary: `Zum Spielende waren ${lastOwnSample.units} eigene Einheiten und Gebäude in den rekonstruierten Frames vorhanden; ${lastOwnSample.unitsUnderConstruction} davon befanden sich im Bau.`,
        evidence: [economy.length ? `Wirtschaft: ${fmtUnits(economy)}` : "", military.length ? `Militär: ${fmtUnits(military)}` : "", logistics.length ? `Logistik: ${fmtUnits(logistics)}` : ""].filter(Boolean).join(" · "),
        nextStep: "Vergleiche deinen Bestand mit den Einkommensquellen und den Abschnitten, in denen du angegriffen oder dich verteidigt hast. So lässt sich die Rolle deiner Infrastruktur besser einordnen.",
        seconds: null,
        limitation: "Das ist der Bestand in den erfassten Start- und Endframes. Er bewertet weder Baukosten noch die Effektivität oder Überlebensdauer einzelner Einheiten.",
      });
    }
  }

  const goldDelta = review.endGold - review.startGold;
  findings.push({
    id: "gold-trajectory",
    kind: "observation",
    title: goldDelta < 0 ? "Goldbestand am Ende niedriger" : goldDelta > 0 ? "Goldbestand am Ende höher" : "Goldbestand unverändert",
    summary: `Der Goldbestand veränderte sich netto um ${goldDelta > 0 ? "+" : ""}${goldDelta.toLocaleString("de-DE")}.`,
    evidence: `Start: ${review.startGold.toLocaleString("de-DE")} · Ende: ${review.endGold.toLocaleString("de-DE")}`,
    nextStep: "Vergleiche diese Entwicklung mit Zeitpunkten deiner Bau- und Upgrade-Aktionen sowie mit den Phasen, in denen du Truppen für Angriffe gebunden hast.",
    seconds: null,
    limitation: "Start und Ende zeigen weder die zwischenzeitliche Einkommensrate noch einzelne Baukosten. Daraus lässt sich keine Wirtschaftseffizienz berechnen.",
  });

  const troopDelta = review.endTroops - review.startTroops;
  findings.push({
    id: "troop-trajectory",
    kind: "observation",
    title: troopDelta < 0 ? "Truppenbestand am Ende niedriger" : troopDelta > 0 ? "Truppenbestand am Ende höher" : "Truppenbestand unverändert",
    summary: `Der Truppenbestand veränderte sich netto um ${troopDelta > 0 ? "+" : ""}${troopDelta.toLocaleString("de-DE")}.`,
    evidence: `Start: ${review.startTroops.toLocaleString("de-DE")} · Ende: ${review.endTroops.toLocaleString("de-DE")}`,
    nextStep: "Stelle Truppenentwicklung, Angriffszeitpunkte und eingehende Angriffe nebeneinander, um Phasen mit hoher Truppenbindung zu erkennen.",
    seconds: null,
    limitation: "Die Nettoänderung unterscheidet nicht zwischen Produktion, Verlusten, Transporten und Truppen, die weiterhin unterwegs waren.",
  });

  const attacks = actionReviews.filter((action) => action.type === "attack" && action.delta10s && action.delta30s);
  if (attacks.length > 0) {
    const territoryAt10s = attacks.filter((action) => action.delta10s!.tiles > 0).length;
    const territoryAt30s = attacks.filter((action) => action.delta30s!.tiles > 0).length;
    const troopDownNoTerritory = attacks.filter((action) => action.delta30s!.troops < 0 && action.delta30s!.tiles <= 0);
    findings.push({
      id: "attack-response-windows",
      kind: troopDownNoTerritory.length > 0 ? "review" : "observation",
      title: "Was nach deinen Angriffsbefehlen sichtbar wurde",
      summary: `Bei ${territoryAt10s} von ${attacks.length} Angriffen stieg dein Gebiet im 10-Sekunden-Fenster; nach 30 Sekunden war das bei ${territoryAt30s} Angriffen der Fall. Bei ${troopDownNoTerritory.length} Fenstern sanken die eigenen Truppen, ohne dass im selben Zeitraum eigener Gebietszuwachs sichtbar wurde.`,
      evidence: troopDownNoTerritory.slice(0, 4).map((action) =>
        `${clock(action.seconds)} · Gebiet ${action.delta30s!.tiles > 0 ? "+" : ""}${action.delta30s!.tiles.toLocaleString("de-DE")} · Truppen ${action.delta30s!.troops > 0 ? "+" : ""}${action.delta30s!.troops.toLocaleString("de-DE")}`
      ).join(" · ") || "Kein Angriff mit gleichzeitigem Truppenrückgang und ausbleibendem Gebietszuwachs im 30-Sekunden-Fenster erfasst.",
      nextStep: "Öffne zuerst die markierten Angriffe. Prüfe Zielverteidigung, Marsch-/Transportzeit und ob ein anderer Frontabschnitt im selben Zeitraum eigene Gebiete verändert hat.",
      seconds: troopDownNoTerritory[0]?.seconds ?? null,
      limitation: "Das sind Netto-Veränderungen bis 10 bzw. 30 Sekunden nach dem Befehl. Andere zeitgleiche Ereignisse wirken mit; ein Angriff kann später eintreffen und wird hier nicht automatisch als erfolgreich oder gescheitert bewertet.",
    });
  }

  const targetedAttackFrames = new Map<string, EngineActionReview>();
  for (const action of actionReviews) {
    if (action.type === "attack" && action.targetSmallID !== null && action.targetDelta30s) {
      targetedAttackFrames.set(`${action.frame}:${action.targetSmallID}`, action);
    }
  }
  const targetedAttacks = [...targetedAttackFrames.values()];
  if (targetedAttacks.length > 0) {
    const targetTerritoryLoss = targetedAttacks.filter(action => action.targetDelta30s!.tiles < 0);
    const targetTerritoryGain = targetedAttacks.filter(action => action.targetDelta30s!.tiles > 0);
    const ownTerritoryGain = targetedAttacks.filter(action => action.delta30s?.tiles !== undefined && action.delta30s.tiles > 0);
    const targetNoLongerAlive = targetedAttacks.filter(action => action.targetAliveBefore === true && action.targetAliveAt30s === false);
    const attackStillActive = targetedAttacks.filter(action => (action.activeAttack30s?.count ?? 0) > 0);
    const retreating = targetedAttacks.filter(action => (action.activeAttack30s?.retreatingCount ?? 0) > 0);
    findings.push({
      id: "targeted-attack-outcomes",
      kind: targetTerritoryLoss.length > 0 || targetNoLongerAlive.length > 0 ? "review" : "observation",
      title: "Was bei deinen Angriffszielen tatsächlich geschah",
      summary: `Innerhalb von 30 Sekunden sank das Gebiet bei ${targetTerritoryLoss.length} Zielen und stieg bei ${targetTerritoryGain.length}; dein eigener Gebietsbestand stieg bei ${ownTerritoryGain.length} Angriffen. ${targetNoLongerAlive.length} Ziele waren am Ende des Fensters ausgeschieden, ${attackStillActive.length} Angriffe liefen noch und ${retreating.length} davon waren im Rückzug.`,
      evidence: targetedAttacks.slice(0, 6).map(action => {
        const targetDelta = action.targetDelta30s!;
        const ownDelta = action.delta30s;
        const active = action.activeAttack30s;
        return `${clock(action.seconds)} → ${action.targetName ?? action.targetId}: Zielgebiet ${targetDelta.tiles > 0 ? "+" : ""}${targetDelta.tiles.toLocaleString("de-DE")}, Zieltruppen ${targetDelta.troops > 0 ? "+" : ""}${targetDelta.troops.toLocaleString("de-DE")}, Zielgold ${targetDelta.gold > 0 ? "+" : ""}${targetDelta.gold.toLocaleString("de-DE")}, eigenes Gebiet ${ownDelta ? `${ownDelta.tiles > 0 ? "+" : ""}${ownDelta.tiles.toLocaleString("de-DE")}` : "n/v"}, eigene Truppen ${ownDelta ? `${ownDelta.troops > 0 ? "+" : ""}${ownDelta.troops.toLocaleString("de-DE")}` : "n/v"}, ${action.targetAliveAt30s === false ? "Ziel ausgeschieden" : action.targetAliveAt30s === true ? "Ziel lebt" : "Zielstatus n/v"}, ${active?.count ? `${active.count} aktiv${active.retreatingCount ? ` / ${active.retreatingCount} Rückzug` : ""}` : "kein aktiver Angriff im Frame"}`;
      }).join(" · "),
      nextStep: "Prüfe die markierten Ziele im Replay. Achte darauf, ob das Ziel wirklich Gebiete verlor, ob du selbst Land gewonnen hast und ob der Angriff nach 30 Sekunden noch lief oder zurückgezogen wurde.",
      seconds: targetTerritoryLoss[0]?.seconds ?? targetedAttacks[0]?.seconds ?? null,
      limitation: "Die Werte vergleichen Ziel- und Eigenzustand bis 30 Sekunden nach dem Befehl. Andere Angriffe, passive Eroberungen oder zeitgleiche Ereignisse können mitwirken. Ein verschwundener Angriff ist für sich allein kein Erfolgsbeweis.",
    });
  }

  const attackCommands = actionReviews.filter(action => action.type === "attack" && action.ownFrontContextBefore);
  if (attackCommands.length > 0) {
    const attacksAgainstPressuredTargets = attackCommands.filter(action => (action.targetPressureBefore?.otherAttackerCount ?? 0) > 0);
    const attacksWithExistingTargets = attackCommands.filter(action => (action.ownFrontContextBefore?.activeTargetCount ?? 0) > 0);
    const attacksUnderIncomingPressure = attackCommands.filter(action => (action.ownFrontContextBefore?.incomingAttackCount ?? 0) > 0);
    const heavilyLoadedCommands = attackCommands.filter(action =>
      (action.ownFrontContextBefore?.activeTargetCount ?? 0) >= 2 ||
      (action.ownFrontContextBefore?.incomingAttackCount ?? 0) >= 2
    );
    const pressureEvidence = attacksAgainstPressuredTargets.slice(0, 4).map(action => {
      const pressure = action.targetPressureBefore!;
      return `${clock(action.seconds)} → ${action.targetName ?? action.targetId}: ${pressure.otherAttackerCount} andere Angreifer / ${pressure.otherAttackCount} Angriffe mit ${pressure.otherAttackTroops.toLocaleString("de-DE")} Truppen anderer Spieler bereits unterwegs`;
    });
    const frontEvidence = attacksWithExistingTargets.slice(0, 4).map(action => {
      const context = action.ownFrontContextBefore!;
      return `${clock(action.seconds)}: bereits ${context.activeTargetCount} andere Angriffsziel(e), ${context.outgoingAttackCount} Angriffe mit ${context.outgoingAttackTroops.toLocaleString("de-DE")} Truppen gebunden${context.incomingAttackCount ? ` · selbst unter ${context.incomingAttackCount} eingehenden Angriffen` : ""}`;
    });
    findings.push({
      id: "front-pressure-context",
      kind: heavilyLoadedCommands.length > 0 ? "review" : "observation",
      title: "Angriffe im Kontext deiner aktiven Fronten",
      summary: `Vor ${attacksAgainstPressuredTargets.length} von ${attackCommands.length} Angriffsbefehlen wurde das Ziel bereits von anderen Spielern angegriffen. Bei ${attacksWithExistingTargets.length} Befehlen hattest du schon andere Angriffziele aktiv; bei ${attacksUnderIncomingPressure.length} Befehlen kamen gleichzeitig Angriffe auf dich herein.`,
      evidence: [...pressureEvidence, ...frontEvidence].join(" · ") || "Für die erfassten Angriffsbefehle war kein zusätzlicher Frontdruck vor dem Befehl dokumentiert.",
      nextStep: "Prüfe diese Zeitpunkte zusammen mit dem Truppenbestand und den Zielveränderungen. Ein bereits bedrängter Gegner kann eine Gelegenheit sein; mehrere eigene Ziele oder eingehende Angriffe können zugleich deine verfügbaren Reserven binden.",
      seconds: heavilyLoadedCommands[0]?.seconds ?? attacksAgainstPressuredTargets[0]?.seconds ?? attacksWithExistingTargets[0]?.seconds ?? attacksUnderIncomingPressure[0]?.seconds ?? null,
      limitation: "Die Werte beschreiben aktive Angriffsobjekte unmittelbar vor deinem Befehl. Sie belegen weder räumlich getrennte Fronten noch Reichweite, Siegchance oder ob ein anderer Angreifer tatsächlich Gebiet erobert hat.",
    });
  }

  const builds = actionReviews.filter((action) => action.type === "build_unit" && action.delta30s);
  if (builds.length > 0) {
    const goldRecovered = builds.filter((action) => action.delta30s!.gold >= 0).length;
    const tileGrowth = builds.filter((action) => action.delta30s!.tiles > 0).length;
    findings.push({
      id: "build-recovery-windows",
      kind: "observation",
      title: "Gold- und Gebietsverlauf nach Bauentscheidungen",
      summary: `Bei ${goldRecovered} von ${builds.length} Bauentscheidungen lag dein Goldbestand 30 Sekunden später wieder mindestens auf dem Stand vor dem Bau; bei ${tileGrowth} Bau-Fenstern stieg zugleich dein Gebietsbestand.`,
      evidence: builds.slice(0, 5).map((action) =>
        `${clock(action.seconds)} · Gold ${action.delta30s!.gold > 0 ? "+" : ""}${action.delta30s!.gold.toLocaleString("de-DE")} · Gebiet ${action.delta30s!.tiles > 0 ? "+" : ""}${action.delta30s!.tiles.toLocaleString("de-DE")}`
      ).join(" · "),
      nextStep: "Vergleiche Städte, Fabriken, Häfen und Verteidigungsbauten getrennt. Achte darauf, ob du nach dem Bau noch genug Gold und Truppen für die nächste Expansion hattest.",
      seconds: builds[0]?.seconds ?? null,
      limitation: "Die 30-Sekunden-Änderung ist kein ROI und keine isolierte Baukostenmessung. Produktion, passive Einnahmen, Kämpfe und andere Aktionen beeinflussen den Goldbestand.",
    });
  }

  // Detect review windows where the selected player held a troop advantage
  // over the strongest living opponent, but had no active outgoing/incoming
  // engagement and no territory growth. This is a review cue, not proof that
  // an enemy or neutral target was reachable.
  if (review.clientID && samples.length > 2) {
    const ordered = [...samples].sort((a, b) => a.frame - b.frame);
    let windowStart: EngineStateSample | null = null;
    let lastQualifying: EngineStateSample | null = null;
    let lastFrame = -1;
    let ratioAtStart = 0;
    const reserveWindows: Array<{ from: number; to: number; seconds: number; ratio: number }> = [];
    const finishWindow = () => {
      if (!windowStart || !lastQualifying) return;
      const durationTicks = lastQualifying.frame - windowStart.frame;
      if (durationTicks >= 300) {
        reserveWindows.push({
          from: windowStart.frame / 10,
          to: lastQualifying.frame / 10,
          seconds: durationTicks / 10,
          ratio: ratioAtStart,
        });
      }
    };
    for (const sample of ordered) {
      const own = sample.players.find((player) => player.clientID === review.clientID);
      if (!own?.alive) {
        finishWindow();
        windowStart = null;
        lastQualifying = null;
        lastFrame = -1;
        continue;
      }
      const rivals = sample.players.filter((player) => player.clientID !== review.clientID && player.alive);
      const strongestRival = rivals.reduce((max, player) => Math.max(max, player.troops), 0);
      const troopAdvantage = strongestRival > 0 && own.troops >= strongestRival * 1.3;
      const noEngagement = own.outgoingAttacks === 0 && own.incomingAttacks === 0;
      const previousOwn = lastQualifying?.players.find((player) => player.clientID === review.clientID);
      const territoryStable = !previousOwn || own.tiles <= previousOwn.tiles;
      const qualifies = troopAdvantage && noEngagement && territoryStable;
      if (qualifies) {
        if (!windowStart || sample.frame - lastFrame > 100) {
          finishWindow();
          windowStart = sample;
          ratioAtStart = strongestRival > 0 ? own.troops / strongestRival : 0;
        }
        lastQualifying = sample;
        lastFrame = sample.frame;
      } else {
        finishWindow();
        windowStart = null;
        lastQualifying = null;
        lastFrame = -1;
      }
    }
    finishWindow();
    const topWindows = reserveWindows.sort((a, b) => b.seconds - a.seconds).slice(0, 3);
    if (topWindows.length) {
      findings.push({
        id: "troop-advantage-windows",
        kind: "review",
        title: "Truppenüberlegenheit ohne laufendes Gefecht",
        summary: `Die Engine zeigt ${topWindows.length} längere Beobachtungsfenster mit mindestens 30 % mehr Truppen als der stärkste lebende Gegner, ohne laufende eigene oder eingehende Angriffe und ohne beobachteten Gebietszuwachs.`,
        evidence: topWindows.map((window) =>
          `${clock(window.from)}–${clock(window.to)} · ca. ${Math.round(window.ratio * 100)} % der gegnerischen Truppenstärke`
        ).join(" · "),
        nextStep: "Prüfe auf der Karte, ob in diesen Phasen erreichbare neutrale Gebiete, schwächere Nachbarn oder offene Küstenziele vorhanden waren – oder ob die Reserve für Verteidigung nötig war.",
        seconds: topWindows[0].from,
        limitation: "Truppenstärke allein beweist keine erreichbare Angriffsgelegenheit. Entfernung, Barrieren, Diplomatie und gegnerische Verstärkungen sind in diesem Hinweis nicht vollständig bewertet.",
      });
    }
  }


  // Positive evidence: an own-territory increase and target-territory decrease
  // in the same short window, with no other attacker recorded before the order.
  // This is an observed outcome pattern, not a causal success claim.
  const cleanAttackGrowth = targetedAttacks.filter(action =>
    action.delta30s !== null &&
    action.targetDelta30s !== null &&
    action.delta30s.tiles > 0 &&
    action.targetDelta30s.tiles < 0 &&
    action.targetPressureBefore !== null &&
    action.targetPressureBefore.otherAttackerCount === 0
  );
  if (cleanAttackGrowth.length > 0) {
    findings.push({
      id: "attack-territory-conversion",
      kind: "strength",
      priority: "medium",
      title: "Gebietszuwachs bei eigenen Angriffen beobachtet",
      summary: `Bei ${cleanAttackGrowth.length} Angriffsfenstern stieg dein eigener Gebietsbestand, während das jeweilige Ziel innerhalb von 30 Sekunden Gebiet verlor. Vor diesen Befehlen war kein anderer Angreifer auf das Ziel erfasst.`,
      evidence: cleanAttackGrowth.slice(0, 4).map(action =>
        `${clock(action.seconds)} → ${action.targetName ?? action.targetId}: eigenes Gebiet +${action.delta30s!.tiles.toLocaleString("de-DE")} · Zielgebiet ${action.targetDelta30s!.tiles.toLocaleString("de-DE")} · eigener Truppenbestand ${action.delta30s!.troops > 0 ? "+" : ""}${action.delta30s!.troops.toLocaleString("de-DE")}`
      ).join(" · "),
      decision: cleanAttackGrowth[0].label + (cleanAttackGrowth[0].targetName ? ` auf ${cleanAttackGrowth[0].targetName}` : ""),
      alternative: "Vergleiche diese Ziele mit Angriffen ohne Gebietszuwachs: Welche Unterschiede bei Zielstärke, Timing und eigener Reserve waren sichtbar?",
      nextStep: "Markiere diese Situationen als positives Muster. Prüfe im Replay, welche Zielwahl und Truppenreserve dabei zusammenkamen, und teste dieselbe Vorbereitung in einer weiteren Partie.",
      seconds: cleanAttackGrowth[0].seconds,
      confidence: "medium",
      limitation: "Die Veränderungen liegen im selben 30-Sekunden-Fenster; andere zeitgleiche Ereignisse können mitwirken. Kein anderer Angreifer war vor dem Befehl erfasst, spätere Unterstützung oder passive Gebietsänderungen sind damit aber nicht ausgeschlossen.",
    });
  }

  // Positive defensive evidence: incoming attacks were recorded, and the
  // player's territory was stable or higher in a later 10–30 second sample.
  // This describes resilience in the observed state, not proven interception.
  if (review.clientID && samples.length > 1) {
    const ordered = [...samples].sort((a, b) => a.frame - b.frame);
    const defensiveWindows: Array<{
      seconds: number;
      durationSeconds: number;
      incomingAttacks: number;
      incomingTroops: number;
      territoryDelta: number;
      troopDelta: number;
    }> = [];
    let nextAllowedFrame = -1;

    for (let i = 0; i < ordered.length; i++) {
      const beforeSample = ordered[i];
      if (beforeSample.frame < nextAllowedFrame) continue;
      const ownBefore = beforeSample.players.find(player => player.clientID === review.clientID);
      if (!ownBefore?.alive || ownBefore.incomingAttacks <= 0) continue;

      let afterSample: EngineStateSample | null = null;
      for (let j = i + 1; j < ordered.length; j++) {
        const elapsedFrames = ordered[j].frame - beforeSample.frame;
        if (elapsedFrames > 300) break;
        if (elapsedFrames >= 100) {
          afterSample = ordered[j];
          break;
        }
      }
      if (!afterSample) continue;
      const ownAfter = afterSample.players.find(player => player.clientID === review.clientID);
      if (!ownAfter?.alive || ownAfter.tiles < ownBefore.tiles) continue;
      const incomingTroops = ownBefore.incomingAttackDetails.reduce((sum, attack) => sum + Math.max(0, attack.troops), 0);
      if (incomingTroops <= 0) continue;

      const durationFrames = afterSample.frame - beforeSample.frame;
      defensiveWindows.push({
        seconds: beforeSample.frame / 10,
        durationSeconds: Math.round(durationFrames / 10),
        incomingAttacks: ownBefore.incomingAttacks,
        incomingTroops,
        territoryDelta: ownAfter.tiles - ownBefore.tiles,
        troopDelta: ownAfter.troops - ownBefore.troops,
      });
      nextAllowedFrame = afterSample.frame;
    }

    if (defensiveWindows.length > 0) {
      findings.push({
        id: "defensive-resilience",
        kind: "strength",
        priority: "medium",
        title: "Gebiet trotz eingehendem Angriffsdruck gehalten",
        summary: `In ${defensiveWindows.length} überprüften Zeitfenstern waren eingehende Angriffe erfasst; dein Gebietsbestand blieb über mindestens 10 Sekunden stabil oder stieg.`,
        evidence: defensiveWindows.slice(0, 4).map(window =>
          `${clock(window.seconds)} · ${window.incomingAttacks} eingehende Angriffe / ${window.incomingTroops.toLocaleString("de-DE")} Truppen · Gebiet ${window.territoryDelta > 0 ? "+" : ""}${window.territoryDelta.toLocaleString("de-DE")} · Truppen ${window.troopDelta > 0 ? "+" : ""}${window.troopDelta.toLocaleString("de-DE")}`
        ).join(" · "),
        decision: "Dein Gebietsbestand blieb in diesen Fenstern trotz registrierter eingehender Angriffe stabil oder wuchs.",
        alternative: "Vergleiche diese Situationen mit späteren Gebietsverlusten: Waren deine Reserven, Frontverteilung oder Verbündeten-Unterstützung anders?",
        nextStep: "Prüfe diese Zeitpunkte auf der Karte und notiere, welche Positionierung oder Reserve du beibehalten solltest, wenn du erneut unter Druck gerätst.",
        seconds: defensiveWindows[0].seconds,
        confidence: "medium",
        limitation: "Eingehende Angriffsobjekte können noch unterwegs sein. Stabiler Gebietsbestand beweist nicht, dass du Angriffe selbst abgewehrt hast; Reisezeit, Gelände, Verbündete und andere Ereignisse wirken mit.",
      });
    }
  }

  // Decision-level coaching based on exact pre-command context and the new command size.
  // The detector only calls an attack a new front when that target was not already active.
  // A prompt is a review opportunity, never proof that the decision was wrong.
  const bestDecisionByType = new Map<string, { score: number; finding: EngineCoachInsight }>();
  const considerDecision = (type: string, score: number, finding: EngineCoachInsight) => {
    const current = bestDecisionByType.get(type);
    if (!current || score > current.score) bestDecisionByType.set(type, { score, finding });
  };

  const attackDecisions = actionReviews
    .filter(action => action.type === "attack" && action.ownFrontContextBefore && action.targetSmallID !== null)
    .sort((a, b) => a.seconds - b.seconds);

  for (const action of attackDecisions) {
    const front = action.ownFrontContextBefore!;
    const targetSmallID = action.targetSmallID!;
    const alreadyActiveTarget = front.outgoingTargetIds.includes(targetSmallID);
    const opensNewFront = !alreadyActiveTarget;
    if (!opensNewFront) continue;

    const availableBefore = Math.max(0, action.before?.troops ?? 0);
    const alreadyCommitted = Math.max(0, front.outgoingAttackTroops);
    const commandTroops = action.commandTroops === null ? null : Math.max(0, action.commandTroops);
    const totalArmyBefore = availableBefore + alreadyCommitted;
    const projectedCommitment = commandTroops !== null && totalArmyBefore > 0
      ? Math.min(1, (alreadyCommitted + commandTroops) / totalArmyBefore)
      : null;
    const reserveAfterCommand = commandTroops === null ? null : Math.max(0, availableBefore - commandTroops);

    const opensSecondOrLaterFront = front.activeTargetCount >= 1;
    const splitCommitment = opensSecondOrLaterFront && projectedCommitment !== null && projectedCommitment >= 0.55;
    const exposedReserve = front.incomingAttackCount > 0 && reserveAfterCommand !== null &&
      availableBefore > 0 && (
        reserveAfterCommand <= availableBefore * 0.35 ||
        (front.incomingAttackTroops > 0 && reserveAfterCommand < front.incomingAttackTroops)
      );
    const heavyCommitment = projectedCommitment !== null && projectedCommitment >= 0.8;
    const overloaded = splitCommitment || exposedReserve || heavyCommitment;

    const pressure = action.targetPressureBefore;
    const own30 = action.delta30s;
    const target30 = action.targetDelta30s;
    const attackStillActive = (action.activeAttack30s?.count ?? 0) > 0;

    if (overloaded) {
      const reasons = [
        front.activeTargetCount > 0 ? `${front.activeTargetCount} bereits aktive Zielfront(en)` : "",
        front.incomingAttackCount > 0 ? `${front.incomingAttackCount} eingehende Angriffe` : "",
        projectedCommitment !== null ? `nach dem Befehl ca. ${Math.round(projectedCommitment * 100)} % der Truppen gebunden` : "",
        reserveAfterCommand !== null ? `verbleibende Reserve ca. ${reserveAfterCommand.toLocaleString("de-DE")}` : "",
      ].filter(Boolean);
      const highPriority = projectedCommitment !== null && projectedCommitment >= 0.8 &&
        (front.activeTargetCount >= 1 || front.incomingAttackCount > 0);
      const score = (projectedCommitment ?? 0) * 100 +
        front.activeTargetCount * 15 + front.incomingAttackCount * 12 +
        (exposedReserve ? 20 : 0);

      considerDecision("front-load", score, {
        id: `decision-front-load-${action.frame}`, kind: "review",
        priority: highPriority ? "high" : "medium",
        title: "Neue Zielfront trotz bereits gebundener Truppen eröffnet",
        summary: `Bei ${clock(action.seconds)} hast du einen Angriff auf ein weiteres Spielerziel befohlen. Gleichzeitig bestanden ${reasons.join(", ") || "bereits laufende Truppenbindungen"}.`,
        evidence: `Vor dem Befehl: ${front.activeTargetCount} aktive Zielfront(en), ${front.outgoingAttackCount} Angriffe mit ${front.outgoingAttackTroops.toLocaleString("de-DE")} gebundenen Truppen und ${availableBefore.toLocaleString("de-DE")} verfügbare Truppen. Neuer Befehl: ${commandTroops === null ? "Truppenmenge nicht erfasst" : commandTroops.toLocaleString("de-DE") + " Truppen"}.${projectedCommitment !== null ? ` Rechnerischer Bindungsanteil danach: ca. ${Math.round(projectedCommitment * 100)} %.` : ""}${own30 ? ` Nach 30 s: Gebiet ${own30.tiles >= 0 ? "+" : ""}${own30.tiles}, Truppen ${own30.troops >= 0 ? "+" : ""}${own30.troops}.` : ""}`,
        decision: action.label + (action.targetName ? ` auf ${action.targetName}` : ""),
        alternative: "Vor einer zusätzlichen Zielfront zuerst prüfen, ob ein laufender Angriff abgeschlossen werden kann und welche Reserve nach dem neuen Befehl bleibt. Bei eingehendem Druck die Verteidigung und den Wert des neuen Ziels gegeneinander abwägen.",
        nextStep: `Trainingsregel für die nächste Partie: Eröffne ein weiteres Spielerziel nur, wenn nach dem Befehl mindestens 35 % deiner verfügbaren Truppen als Reserve bleiben. Kommt gleichzeitig ein Angriff herein, muss diese Reserve außerdem größer sein als die beobachtete eingehende Angriffsstärke. Teste die Regel in drei Partien und prüfe jeweils nach 60 Sekunden, ob du Gebiet gewonnen hast oder weiter Truppen binden musst. Das ist eine bewusst einfache Trainingsregel, kein universell optimaler Spielzug.`,
        seconds: action.seconds, confidence: "medium",
        limitation: "Der Replay-Zustand belegt aktive Angriffe und Truppenbindungen. Er bewertet nicht vollständig Zielentfernung, Gelände, Gegnerstärke, Sicht oder den taktischen Wert einer Ablenkung. Der Bindungsanteil ist eine Näherung aus verfügbarem und bereits gebundenem Heer.",
      });
    }

    if (overloaded && (pressure?.otherAttackerCount ?? 0) > 0) {
      const pressureScore = pressure!.otherAttackerCount * 100 + pressure!.otherAttackTroops / 100000;
      considerDecision("contested-target", pressureScore, {
        id: `decision-contested-target-${action.frame}`, kind: "review", priority: "medium",
        title: "Ziel stand bereits unter dem Druck anderer Spieler",
        summary: `Vor deinem Befehl um ${clock(action.seconds)} waren bereits ${pressure!.otherAttackerCount} andere Spieler mit ${pressure!.otherAttackTroops.toLocaleString("de-DE")} Truppen gegen dieses Ziel unterwegs.`,
        evidence: `${pressure!.otherAttackCount} fremde Angriffsobjekte.${target30 ? ` Nach 30 s: Zielgebiet ${target30.tiles >= 0 ? "+" : ""}${target30.tiles}; eigene Truppen ${own30?.troops ?? "n/v"}.` : " Kein vollständiges Zielfenster."}`,
        decision: action.label + (action.targetName ? ` auf ${action.targetName}` : ""),
        alternative: "Prüfe, ob dein zusätzlicher Angriff das Ziel schneller ausschalten konnte oder ob deine Truppen an einer weniger umkämpften Front mehr bewirkt hätten. Vergleiche den Zielzustand mit deiner eigenen Reserve.",
        nextStep: "Untersuche, ob dein Angriff einen zusätzlichen Beitrag leistete oder nur Truppen band, während andere Spieler das Ziel bereits bedrängten.",
        seconds: action.seconds, confidence: "medium",
        limitation: "Mehrere Angreifer können ein Ziel schneller besiegen. Die Beobachtung beweist weder verschwendete Truppen noch eine falsche Zielwahl.",
      });
    }

    if (own30 && own30.troops < 0 && own30.tiles <= 0 && attackStillActive) {
      const costScore = Math.abs(own30.troops) + Math.max(0, -own30.tiles) * 10000;
      considerDecision("cost-window", costScore, {
        id: `decision-cost-window-${action.frame}`, kind: "review", priority: "medium",
        title: "Truppen gebunden, nach 30 Sekunden noch kein eigener Gebietszuwachs",
        summary: `Nach dem Angriff um ${clock(action.seconds)} waren deine Truppen um ${Math.abs(own30.troops).toLocaleString("de-DE")} niedriger, ohne eigenen Gebietszuwachs. Der Angriff auf das Ziel war im 30-Sekunden-Frame noch aktiv.`,
        evidence: `30-Sekunden-Fenster: Gebiet ${own30.tiles}, Truppen ${own30.troops}, Gold ${own30.gold}; aktive Angriffe auf das Ziel: ${action.activeAttack30s?.count ?? 0}.`,
        decision: action.label + (action.targetName ? ` auf ${action.targetName}` : ""),
        alternative: "Nicht automatisch abbrechen: zuerst prüfen, ob der Angriff noch unterwegs ist oder auf Verteidigung trifft. Vor einem ähnlichen Befehl eine Mindestreserve und einen Prüfzeitpunkt festlegen.",
        nextStep: "Verfolge den Angriff über das 30-Sekunden-Fenster hinaus. Prüfe, ob später Gebiet gewonnen wurde oder ein Rückzug nötig war.",
        seconds: action.seconds, confidence: "medium",
        limitation: "30 Sekunden können bei langen Reisewegen zu kurz sein. Der Truppenrückgang ist kein sicherer Verlust und beweist kein Scheitern. Andere gleichzeitige Aktionen können die Zustandsänderung beeinflussen.",
      });
    }
  }

  // Retain only the strongest instance of each pattern instead of the earliest one.
  for (const candidate of [...bestDecisionByType.values()].sort((a, b) => b.score - a.score)) {
    findings.push(candidate.finding);
  }

  // Piracy is evaluated from the game's cumulative piracyGold counter, not inferred from ship count.
  const piracySamples = [...samples].sort((a, b) => a.tick - b.tick).map(sample => ({
    tick: sample.tick, player: sample.players.find(player => player.clientID === review.clientID),
  })).filter((entry): entry is { tick: number; player: EngineSamplePlayer } => Boolean(entry.player));
  if (piracySamples.length >= 2) {
    const firstPiracy = piracySamples[0].player.piracyGold;
    const lastPiracy = piracySamples[piracySamples.length - 1].player.piracyGold;
    const piracyGain = lastPiracy - firstPiracy;
    const tradeGain = piracySamples[piracySamples.length - 1].player.tradeGold - piracySamples[0].player.tradeGold;
    if (piracyGain > 0 || tradeGain > 0) {
      findings.push({
        id: "piracy-and-trade-income", kind: "observation", priority: piracyGain > 0 ? "medium" : "low",
        title: piracyGain > 0 ? "Piraterie hat messbar Gold beigetragen" : "Handel hat messbar Gold beigetragen",
        summary: `Kumulierte Piraterie-Einnahmen ${firstPiracy.toLocaleString("de-DE")} → ${lastPiracy.toLocaleString("de-DE")} Gold; Handels-Einnahmen änderten sich um ${tradeGain >= 0 ? "+" : ""}${tradeGain.toLocaleString("de-DE")} Gold.`,
        evidence: `Piraterie: +${piracyGain.toLocaleString("de-DE")} Gold · Handel: ${tradeGain >= 0 ? "+" : ""}${tradeGain.toLocaleString("de-DE")} Gold · ${piracySamples.length} Zustandsstichproben.`,
        nextStep: "Prüfe die Zeitpunkte mit deiner Flottenbindung und den damaligen Fronten. Vergleiche den Piraterie-Ertrag mit den Truppen und der Zeit, die dafür gebunden waren.",
        seconds: null, confidence: piracySamples.length >= 8 ? "high" : "medium",
        limitation: "Die kumulierte Einnahme zeigt einen beobachteten Ertrag, aber keine Nettorendite, verursachte Verluste oder verpasste Alternativen. Ohne räumliche und gegnerbezogene Daten lässt sich kein optimaler Piraterie-Zeitpunkt ableiten.",
      });
    }
  }

  return findings;
}
