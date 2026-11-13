import { unwrapGameRecord } from "./GameRecordShape";
import engineVersions from "../../../engine-build/engines.json";
/**
 * Replay/engine compatibility gate.
 *
 * Matching commits and recorded hashes make a replay eligible for a real
 * deterministic run. They do not prove that the simulation has passed.
 */
export const PINNED_OPENFRONT_COMMIT =
  "bc3e3334c573c4959ec6a6745df6826d07233b4d";

export const SUPPORTED_OPENFRONT_COMMITS = engineVersions.map((engine) => engine.commit);

export type ReplayCompatibilityStatus =
  | "version-compatible-hashes-available"
  | "version-compatible-no-hashes"
  | "engine-version-mismatch"
  | "missing-engine-version";

export interface ReplayCompatibility {
  status: ReplayCompatibilityStatus;
  replayCommit: string | null;
  engineCommit: string;
  recordedHashCount: number;
  engineVersionCompatible: boolean;
  hashVerificationAvailable: boolean;
  message: string;
}

/** Accepts an unknown API object; never assumes a malformed record is valid. */
export function assessReplayCompatibility(
  record: unknown,
  engineCommit?: string,
): ReplayCompatibility {
  const obj = unwrapGameRecord(record);
  const replayCommit =
    typeof obj.gitCommit === "string" && /^[0-9a-f]{7,40}$/i.test(obj.gitCommit)
      ? obj.gitCommit.toLowerCase()
      : null;
  const selectedEngineCommit = engineCommit ?? (replayCommit && SUPPORTED_OPENFRONT_COMMITS.includes(replayCommit) ? replayCommit : PINNED_OPENFRONT_COMMIT);
  const turns = Array.isArray(obj.turns) ? obj.turns : [];
  const recordedHashCount = turns.filter((turn) => {
    if (!turn || typeof turn !== "object") return false;
    const hash = (turn as Record<string, unknown>).hash;
    return hash !== null && hash !== undefined;
  }).length;
  const hashVerificationAvailable = recordedHashCount > 0;

  if (!replayCommit) {
    return {
      status: "missing-engine-version",
      replayCommit: null,
      engineCommit: selectedEngineCommit,
      recordedHashCount,
      engineVersionCompatible: false,
      hashVerificationAvailable,
      message:
        "Im Replay fehlt eine gültige Engine-Commit-ID. Eine Wiedergabe kann deshalb nicht sicher derselben Spielversion zugeordnet werden.",
    };
  }

  if (replayCommit !== selectedEngineCommit) {
    return {
      status: "engine-version-mismatch",
      replayCommit,
      engineCommit: selectedEngineCommit,
      recordedHashCount,
      engineVersionCompatible: false,
      hashVerificationAvailable,
      message:
        "Die Replay-Version stimmt nicht mit der eingebundenen Engine überein. Eine Simulation mit dieser Engine wäre nicht verlässlich.",
    };
  }

  if (!hashVerificationAvailable) {
    return {
      status: "version-compatible-no-hashes",
      replayCommit,
      engineCommit: selectedEngineCommit,
      recordedHashCount,
      engineVersionCompatible: true,
      hashVerificationAvailable: false,
      message:
        "Die Engine-Version passt, aber das Replay enthält keine Hash-Prüfpunkte. Eine Simulation wäre damit nicht anhand des Originals verifizierbar.",
    };
  }

  return {
    status: "version-compatible-hashes-available",
    replayCommit,
    engineCommit,
    recordedHashCount,
    engineVersionCompatible: true,
    hashVerificationAvailable: true,
    message:
      "Engine-Version stimmt überein und Hash-Prüfpunkte sind vorhanden. Ob die Simulation korrekt ist, steht erst nach dem tatsächlichen Abgleich aller Hashes fest.",
  };
}
