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

interface EngineActionReview {
  frame: number;
  turn: number;
  seconds: number;
  type: string;
  label: string;
  details: string;
  before: { tiles: number; gold: number; troops: number } | null;
  after: { tiles: number; gold: number; troops: number } | null;
  delta: { tiles: number; gold: number; troops: number } | null;
  delta5s: { tiles: number; gold: number; troops: number } | null;
  delta10s: { tiles: number; gold: number; troops: number } | null;
  delta30s: { tiles: number; gold: number; troops: number } | null;
}

interface EngineSamplePlayer {
  name: string;
  clientID: string | null;
  alive: boolean;
  gold: number;
  troops: number;
  tiles: number;
  outgoingAttacks: number;
  incomingAttacks: number;
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
    let lastFrame = -1;
    let reserveWindows: Array<{ from: number; to: number; seconds: number; ratio: number }> = [];
    for (const sample of ordered) {
      const own = sample.players.find((player) => player.clientID === review.clientID);
      if (!own?.alive) { windowStart = null; lastFrame = -1; continue; }
      const rivals = sample.players.filter((player) => player.clientID !== review.clientID && player.alive);
      const strongestRival = rivals.reduce((max, player) => Math.max(max, player.troops), 0);
      const troopAdvantage = strongestRival > 0 && own.troops >= strongestRival * 1.3;
      const noEngagement = own.outgoingAttacks === 0 && own.incomingAttacks === 0;
      const previous = windowStart?.players.find((player) => player.clientID === review.clientID);
      const territoryStable = !previous || own.tiles <= previous.tiles;
      const qualifies = troopAdvantage && noEngagement && territoryStable;
      if (qualifies) {
        if (!windowStart || sample.frame - lastFrame > 100) windowStart = sample;
        lastFrame = sample.frame;
        const startPlayer = windowStart.players.find((player) => player.clientID === review.clientID);
        const duration = sample.frame - windowStart.frame;
        if (startPlayer && duration >= 300) {
          reserveWindows.push({ from: windowStart.frame / 10, to: sample.frame / 10, seconds: duration / 10, ratio: strongestRival > 0 ? startPlayer.troops / strongestRival : 0 });
        }
      } else {
        windowStart = null;
        lastFrame = -1;
      }
    }
    reserveWindows = reserveWindows.sort((a, b) => b.seconds - a.seconds).slice(0, 3);
    if (reserveWindows.length) {
      findings.push({
        id: "troop-advantage-windows",
        kind: "review",
        title: "Truppenüberlegenheit ohne laufendes Gefecht",
        summary: `Die Engine zeigt ${reserveWindows.length} längere Beobachtungsfenster mit mindestens 30 % mehr Truppen als der stärkste lebende Gegner, ohne laufende eigene oder eingehende Angriffe und ohne beobachteten Gebietszuwachs.`,
        evidence: reserveWindows.map((window) =>
          `${clock(window.from)}–${clock(window.to)} · ca. ${Math.round(window.ratio * 100)} % der gegnerischen Truppenstärke`
        ).join(" · "),
        nextStep: "Prüfe auf der Karte, ob in diesen Phasen erreichbare neutrale Gebiete, schwächere Nachbarn oder offene Küstenziele vorhanden waren – oder ob die Reserve für Verteidigung nötig war.",
        seconds: reserveWindows[0].from,
        limitation: "Truppenstärke allein beweist keine erreichbare Angriffsgelegenheit. Entfernung, Barrieren, Diplomatie und gegnerische Verstärkungen sind in diesem Hinweis nicht vollständig bewertet.",
      });
    }
  }

  return findings;
}
