import { unwrapGameRecord } from "./GameRecordShape";
import {
  PINNED_OPENFRONT_COMMIT,
  resolveSupportedEngineCommit,
} from "./ReplayEngineCatalog";

export { PINNED_OPENFRONT_COMMIT, SUPPORTED_OPENFRONT_COMMITS } from "./ReplayEngineCatalog";

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
  const resolvedReplayCommit = resolveSupportedEngineCommit(replayCommit);
  const selectedEngineCommit = engineCommit
    ? resolveSupportedEngineCommit(engineCommit) ?? engineCommit.toLowerCase()
    : resolvedReplayCommit ?? PINNED_OPENFRONT_COMMIT;
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

  if (!resolvedReplayCommit || resolvedReplayCommit !== selectedEngineCommit) {
    return {
      status: "engine-version-mismatch",
      replayCommit: resolvedReplayCommit ?? replayCommit,
      engineCommit: selectedEngineCommit,
      recordedHashCount,
      engineVersionCompatible: false,
      hashVerificationAvailable,
      message:
        "Die Replay-Version stimmt nicht mit einer eingebundenen Original-Engine überein. Eine Simulation mit einer anderen Version wäre nicht verlässlich.",
    };
  }

  if (!hashVerificationAvailable) {
    return {
      status: "version-compatible-no-hashes",
      replayCommit: resolvedReplayCommit,
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
    replayCommit: resolvedReplayCommit,
    engineCommit: selectedEngineCommit,
    recordedHashCount,
    engineVersionCompatible: true,
    hashVerificationAvailable: true,
    message:
      "Die exakte Original-Engine ist verfügbar und Hash-Prüfpunkte sind vorhanden. Ob die Simulation korrekt ist, steht erst nach dem tatsächlichen Abgleich aller Hashes fest.",
  };
}

/**
 * Checks whether persisted compatibility metadata still matches the current
 * engine catalog. This avoids rescanning every hash checkpoint on each launch.
 * Hash counts are reused only when the recorded engine and status still match.
 */
export function isReplayCompatibilityCurrent(
  record: unknown,
  previous: ReplayCompatibility | undefined,
): boolean {
  if (!previous) return false;
  const obj = unwrapGameRecord(record);
  const replayCommit =
    typeof obj.gitCommit === "string" && /^[0-9a-f]{7,40}$/i.test(obj.gitCommit)
      ? obj.gitCommit.toLowerCase()
      : null;
  const resolvedReplayCommit = resolveSupportedEngineCommit(replayCommit);
  const expectedReplayCommit = replayCommit
    ? resolvedReplayCommit ?? replayCommit
    : null;
  const expectedEngineCommit = resolvedReplayCommit ?? PINNED_OPENFRONT_COMMIT;
  const hashCount = previous.recordedHashCount;
  if (!Number.isSafeInteger(hashCount) || hashCount < 0) return false;
  const expectedStatus: ReplayCompatibilityStatus = !replayCommit
    ? "missing-engine-version"
    : !resolvedReplayCommit
      ? "engine-version-mismatch"
      : hashCount > 0
        ? "version-compatible-hashes-available"
        : "version-compatible-no-hashes";
  return previous.replayCommit === expectedReplayCommit
    && previous.engineCommit === expectedEngineCommit
    && previous.status === expectedStatus
    && previous.engineVersionCompatible === Boolean(resolvedReplayCommit)
    && previous.hashVerificationAvailable === (hashCount > 0);
}
