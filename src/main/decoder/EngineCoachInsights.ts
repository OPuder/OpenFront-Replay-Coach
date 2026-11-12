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

  return findings;
}
