import { unwrapGameRecord } from "./GameRecordShape";
import { assessReplayCompatibilityCore } from "./ReplayCompatibilityCore.mjs";
import {
  PINNED_OPENFRONT_COMMIT,
  SUPPORTED_OPENFRONT_COMMITS,
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
  return assessReplayCompatibilityCore(
    unwrapGameRecord(record),
    engineCommit,
    SUPPORTED_OPENFRONT_COMMITS,
    PINNED_OPENFRONT_COMMIT,
  );
}
