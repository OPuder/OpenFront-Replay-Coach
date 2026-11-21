import { resolveSupportedEngineCommit } from "../main/decoder/ReplayEngineCatalog";

export interface ReplayEngineCoverageInput {
  gameId: string;
  gitCommit?: unknown;
}

export interface ReplayEngineCoverageGroup {
  commit: string | null;
  count: number;
  gameIds: string[];
}

export interface ReplayEngineCoverageReport {
  total: number;
  supported: number;
  unsupported: number;
  missingCommit: number;
  groups: ReplayEngineCoverageGroup[];
}

/**
 * Build a coverage report for a list of replay matches.
 * - Deduplicate by gameId.
 * - Resolve commits to known engine commits.
 * - Classify as supported, unsupported, or missing.
 * - Aggregate into groups sorted by count descending.
 */
export function buildReplayEngineCoverageReport(
  matches: readonly ReplayEngineCoverageInput[],
): ReplayEngineCoverageReport {
  const unique = new Map<string, ReplayEngineCoverageInput>();
  for (const match of matches) {
    const id = String(match.gameId ?? "").trim();
    if (id && !unique.has(id)) {
      unique.set(id, match);
    }
  }

  let supported = 0;
  let unsupported = 0;
  let missingCommit = 0;
  const groups = new Map<string, ReplayEngineCoverageGroup>();

  for (const [gameId, match] of unique) {
    const raw = typeof match.gitCommit === "string" ? match.gitCommit.trim().toLowerCase() : "";
    const resolved = resolveSupportedEngineCommit(raw);
    if (resolved) {
      supported++;
      continue;
    }
    if (!raw || !/^[0-9a-f]{7,40}$/.test(raw)) {
      missingCommit++;
    } else {
      unsupported++;
    }
    const key = raw && /^[0-9a-f]{7,40}$/.test(raw) ? raw : "";
    const group = groups.get(key) ?? { commit: key || null, count: 0, gameIds: [] };
    group.count++;
    group.gameIds.push(gameId);
    groups.set(key, group);
  }

  return {
    total: unique.size,
    supported,
    unsupported,
    missingCommit,
    groups: [...groups.values()].sort((a, b) =>
      b.count - a.count || String(a.commit ?? "").localeCompare(String(b.commit ?? "")),
    ),
  };
}
