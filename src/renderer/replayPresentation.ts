export type ReplayDisplayKind = "queued" | "running" | "failed" | "engine-missing" | "verified" | "unverified" | "saved";

export interface ReplayDisplayState {
  kind: ReplayDisplayKind;
  label: string;
  detail: string;
}

/**
 * One source of truth for the replay state shown in cards and import history.
 * Import success, exact-engine availability and hash verification are separate
 * facts and must never be collapsed into one ambiguous "engine unavailable" tag.
 */
export function getReplayDisplayState(entry: {
  status: string;
  analysisStatus?: string;
  result?: unknown;
  simulation?: { status?: string } | null;
}): ReplayDisplayState {
  if (entry.status === "queued") {
    return { kind: "queued", label: "Wartet", detail: "Replay wartet auf den Import." };
  }
  if (entry.status === "running") {
    return { kind: "running", label: "Import läuft", detail: "Replay wird geladen." };
  }
  if (entry.status === "failed" || !entry.result) {
    return { kind: "failed", label: "Import fehlgeschlagen", detail: "Replay konnte nicht gespeichert werden." };
  }
  if (entry.status === "engine-mismatch" || entry.analysisStatus === "unsupported") {
    return {
      kind: "engine-missing",
      label: "Engine-Version fehlt",
      detail: "Replay ist gespeichert. Protokollierte Aktionen bleiben verfügbar; für die sichere Zustandsrekonstruktion fehlt die exakt passende Original-Engine.",
    };
  }
  if (entry.analysisStatus === "verified" && entry.simulation?.status === "verified") {
    return { kind: "verified", label: "Hash-verifiziert", detail: "Die Original-Engine hat die Replay-Hashes bestätigt." };
  }
  if (entry.analysisStatus === "unverified" || entry.simulation?.status === "unverified") {
    return { kind: "unverified", label: "Nicht verifiziert", detail: "Eine Simulation liegt vor, konnte aber nicht vollständig bestätigt werden." };
  }
  if (entry.analysisStatus === "failed") {
    return { kind: "failed", label: "Analyse fehlgeschlagen", detail: "Das Replay ist gespeichert, die Analyse konnte nicht abgeschlossen werden." };
  }
  if (entry.analysisStatus === "running") {
    return { kind: "running", label: "Analyse läuft", detail: "Die Original-Engine rekonstruiert das Spiel." };
  }
  if (entry.analysisStatus === "queued") {
    return { kind: "queued", label: "Wartet auf Analyse", detail: "Das Replay ist gespeichert und wartet auf die Analyse." };
  }
  return { kind: "saved", label: "Bereit zur Analyse", detail: "Replay ist lokal gespeichert und kann analysiert werden." };
}
