import type { ReplayCompatibility } from "./ReplayCompatibility";

export function assessReplayCompatibilityCore(
  record: unknown,
  engineCommit: string | undefined,
  supportedCommits: readonly string[],
  pinnedCommit: string,
): ReplayCompatibility;
