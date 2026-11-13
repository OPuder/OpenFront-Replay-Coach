/**
 * Pure compatibility decision shared by the renderer wrapper and Node regression tests.
 * The record must already be normalized to the canonical GameRecord shape.
 */
export function assessReplayCompatibilityCore(
  record,
  engineCommit,
  supportedCommits,
  pinnedCommit,
) {
  const replayCommit =
    typeof record?.gitCommit === "string" && /^[0-9a-f]{7,40}$/i.test(record.gitCommit)
      ? record.gitCommit.toLowerCase()
      : null;
  const selectedEngineCommit =
    engineCommit ??
    (replayCommit && supportedCommits.includes(replayCommit)
      ? replayCommit
      : pinnedCommit);
  const turns = Array.isArray(record?.turns) ? record.turns : [];
  const recordedHashCount = turns.filter((turn) => {
    if (!turn || typeof turn !== "object") return false;
    const hash = turn.hash;
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
        "Die Replay-Version stimmt nicht mit einer eingebundenen Original-Engine überein. Eine Simulation mit einer anderen Version wäre nicht verlässlich.",
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
    engineCommit: selectedEngineCommit,
    recordedHashCount,
    engineVersionCompatible: true,
    hashVerificationAvailable: true,
    message:
      "Die exakte Original-Engine ist verfügbar und Hash-Prüfpunkte sind vorhanden. Ob die Simulation korrekt ist, steht erst nach dem tatsächlichen Abgleich aller Hashes fest.",
  };
}
