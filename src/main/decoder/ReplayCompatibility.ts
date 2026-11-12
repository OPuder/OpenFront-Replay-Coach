/**
 * Replay/engine compatibility gate.
 *
 * This is intentionally separate from action decoding: a decoded action log
 * is not proof that the original game state can be reproduced.
 */
export const PINNED_OPENFRONT_COMMIT =
  "bc3e3334c573c4959ec6a6745df6826d07233b4d";

export type ReplayCompatibilityStatus =
  | "verified-compatible"
  | "compatible-unverified"
  | "engine-version-mismatch"
  | "missing-engine-version";

export interface ReplayCompatibility {
  status: ReplayCompatibilityStatus;
  replayCommit: string | null;
  engineCommit: string;
  recordedHashCount: number;
  deterministicReplayAllowed: boolean;
  hashVerificationAvailable: boolean;
  message: string;
}

/** Accepts an unknown API object; never assumes a malformed record is valid. */
export function assessReplayCompatibility(
  record: unknown,
  engineCommit = PINNED_OPENFRONT_COMMIT,
): ReplayCompatibility {
  const root =
    record && typeof record === "object" && "game" in record
      ? (record as { game?: unknown }).game
      : record;
  const obj = root && typeof root === "object"
    ? (root as Record<string, unknown>)
    : {};
  const replayCommit =
    typeof obj.gitCommit === "string" && obj.gitCommit.length > 0
      ? obj.gitCommit
      : null;
  const turns = Array.isArray(obj.turns) ? obj.turns : [];
  const recordedHashCount = turns.filter((turn) => {
    if (!turn || typeof turn !== "object") return false;
    const hash = (turn as Record<string, unknown>).hash;
    return hash !== null && hash !== undefined;
  }).length;

  if (!replayCommit) {
    return {
      status: "missing-engine-version",
      replayCommit: null,
      engineCommit,
      recordedHashCount,
      deterministicReplayAllowed: false,
      hashVerificationAvailable: recordedHashCount > 0,
      message:
        "Im Replay fehlt die Engine-Commit-ID. Eine deterministische Wiedergabe darf nicht als kompatibel angenommen werden.",
    };
  }

  if (replayCommit !== engineCommit) {
    return {
      status: "engine-version-mismatch",
      replayCommit,
      engineCommit,
      recordedHashCount,
      deterministicReplayAllowed: false,
      hashVerificationAvailable: recordedHashCount > 0,
      message:
        "Die Replay-Version stimmt nicht mit der eingebundenen Engine überein. Eine Simulation mit dieser Engine wäre nicht verlässlich.",
    };
  }

  if (recordedHashCount === 0) {
    return {
      status: "compatible-unverified",
      replayCommit,
      engineCommit,
      recordedHashCount,
      deterministicReplayAllowed: true,
      hashVerificationAvailable: false,
      message:
        "Die Engine-Version passt, aber das Replay enthält keine Hash-Prüfpunkte. Die Wiedergabe wäre nicht anhand des Originals verifizierbar.",
    };
  }

  return {
    status: "verified-compatible",
    replayCommit,
    engineCommit,
    recordedHashCount,
    deterministicReplayAllowed: true,
    hashVerificationAvailable: true,
    message:
      "Engine-Version stimmt überein und Hash-Prüfpunkte sind vorhanden. Die Simulation muss diese Hashes trotzdem noch tatsächlich bestehen.",
  };
}
