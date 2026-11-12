export type DecodedAction = {
  turn: number;
  seconds: number;
  type: string;
  category: "Wirtschaft" | "Militär" | "Diplomatie" | "Spielsteuerung" | "Sonstiges";
  label: string;
  details: string;
  clientId: string | null;
};

const LABELS: Record<string, { category: DecodedAction["category"]; label: string }> = {
  spawn: { category: "Sonstiges", label: "Startposition gewählt" },
  build_unit: { category: "Wirtschaft", label: "Gebäude / Einheit gebaut" },
  upgrade_structure: { category: "Wirtschaft", label: "Gebäude verbessert" },
  attack: { category: "Militär", label: "Angriff" },
  boat: { category: "Militär", label: "Truppentransport per Boot" },
  allianceRequest: { category: "Diplomatie", label: "Bündnis angefragt" },
  allianceExtension: { category: "Diplomatie", label: "Bündnis verlängert" },
  allianceReject: { category: "Diplomatie", label: "Bündnis abgelehnt" },
  toggle_pause: { category: "Spielsteuerung", label: "Spiel pausiert / fortgesetzt" },
};

function fmt(value: unknown): string {
  if (typeof value === "number") return value.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

export function decodeApiGameRecord(record: any) {
  const root = record?.game ?? record;
  const info = root?.info;
  const turns = root?.turns;
  if (!info || !Array.isArray(turns)) {
    throw new Error("Der API-Decoder erwartet einen GameRecord mit info und turns.");
  }

  const playerNames = new Map<string, string>();
  for (const player of info.players ?? []) {
    const id = player.clientID ?? player.clientId ?? player.id;
    const name = player.displayName ?? player.name ?? player.username;
    if (id && name) playerNames.set(String(id), String(name));
  }

  const actions: DecodedAction[] = [];
  for (const turn of turns) {
    const turnNumber = Number(turn?.turnNumber ?? 0);
    if (!Array.isArray(turn?.intents)) continue;
    for (const intent of turn.intents) {
      const type = String(intent?.type ?? "unknown");
      const meta = LABELS[type] ?? { category: "Sonstiges" as const, label: type };
      const detailParts: string[] = [];
      if (intent.unit) detailParts.push(`Typ: ${fmt(intent.unit)}`);
      if (intent.amount !== undefined) detailParts.push(`Menge: ${fmt(intent.amount)}`);
      if (intent.troops !== undefined) detailParts.push(`Truppen: ${fmt(intent.troops)}`);
      if (intent.tile !== undefined) detailParts.push(`Feld: ${fmt(intent.tile)}`);
      if (intent.dst !== undefined) detailParts.push(`Ziel-Feld: ${fmt(intent.dst)}`);
      if (intent.targetID !== undefined) detailParts.push(`Ziel-ID: ${fmt(intent.targetID)}`);
      if (intent.unitId !== undefined) detailParts.push(`Einheiten-ID: ${fmt(intent.unitId)}`);
      if (intent.recipient) detailParts.push(`Empfänger: ${playerNames.get(String(intent.recipient)) ?? fmt(intent.recipient)}`);
      if (intent.requestor) detailParts.push(`Anfragender: ${playerNames.get(String(intent.requestor)) ?? fmt(intent.requestor)}`);
      if (intent.paused !== undefined) detailParts.push(intent.paused ? "Pause aktiviert" : "Pause beendet");

      actions.push({
        turn: turnNumber,
        seconds: turnNumber / 10,
        type,
        category: meta.category,
        label: meta.label,
        details: detailParts.join(" · ") || "Keine weiteren Aktionsdaten",
        clientId: intent.clientID ? String(intent.clientID) : null,
      });
    }
  }
  actions.sort((a, b) => a.turn - b.turn);
  const counts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const action of actions) {
    counts[action.type] = (counts[action.type] ?? 0) + 1;
    categoryCounts[action.category] = (categoryCounts[action.category] ?? 0) + 1;
  }
  return {
    gameId: info.gameID ?? root.gameID ?? "unbekannt",
    gitCommit: record.gitCommit ?? null,
    durationSeconds: Number(info.duration ?? 0),
    turnCount: turns.length,
    actionCount: actions.length,
    counts,
    categoryCounts,
    actions,
  };
}
