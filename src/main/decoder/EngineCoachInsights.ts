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
}

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
): EngineCoachInsight[] {
  const findings: EngineCoachInsight[] = [];
  const tileChange = review.tilesGained;
  findings.push({
    id: "territory-trajectory",
    kind: tileChange > 0 ? "strength" : tileChange < 0 ? "review" : "observation",
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

  const attacks = actionReviews.filter((action) => action.type === "attack" && action.delta);
  const attackWindowsWithTileChange = attacks.filter((action) => action.delta!.tiles !== 0);
  if (attacks.length > 0) {
    findings.push({
      id: "attack-state-windows",
      kind: attackWindowsWithTileChange.length > 0 ? "review" : "observation",
      title: "Angriffe mit direktem Zustandsfenster",
      summary: `Bei ${attackWindowsWithTileChange.length} von ${attacks.length} erfassten Angriffen änderte sich der eigene Gebietsbestand zwischen dem Frame direkt vor und nach dem Befehls-Tick.`,
      evidence: attackWindowsWithTileChange.slice(0, 4).map((action) =>
        `${Math.floor(action.seconds / 60)}:${String(Math.floor(action.seconds % 60)).padStart(2, "0")} · Gebiet ${action.delta!.tiles > 0 ? "+" : ""}${action.delta!.tiles.toLocaleString("de-DE")}`
      ).join(" · ") || "In den unmittelbaren Zustandsfenstern wurde keine Gebietsänderung erfasst.",
      nextStep: "Nutze diese Zeitpunkte als Einstieg und verfolge im Replay auch die Folgesekunden: Ein Angriff kann erst später Gebiete erreichen oder verlieren.",
      seconds: attackWindowsWithTileChange[0]?.seconds ?? null,
      limitation: "Die Veränderung liegt zeitlich am Aktions-Tick, ist aber nicht automatisch allein durch diesen Befehl verursacht. Spätere Angriffsfolgen sind im unmittelbaren Fenster nicht enthalten.",
    });
  }

  return findings;
}
