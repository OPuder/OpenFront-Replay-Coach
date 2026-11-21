import { resolveSupportedEngineCommit } from "../main/decoder/ReplayEngineCatalog";
export interface ReplayEngineCoverageInput { gameId: string; gitCommit?: unknown }
export interface ReplayEngineCoverageGroup { commit: string | null; count: number; gameIds: string[] }
export interface ReplayEngineCoverageReport { total: number; supported: number; unsupported: number; missingCommit: number; groups: ReplayEngineCoverageGroup[] }
/** Inventory exact engine revisions in imported local replays without guessing or substituting a build. */
export function buildReplayEngineCoverageReport(matches: readonly ReplayEngineCoverageInput[]): ReplayEngineCoverageReport {
  const unique = new Map<string, ReplayEngineCoverageInput>();
  for (const match of matches) { const id = String(match.gameId ?? "").trim(); if (id && !unique.has(id)) unique.set(id, match); }
  let supported = 0, unsupported = 0, missingCommit = 0;
  // BUG: The following logic incorrectly increments the `unsupported` counter
  // even when the commit is resolved to a supported engine.  This leads to
  // an over‑count of unsupported replays and under‑count of supported ones.
  for (const [gameId, match] of unique) {
    const raw = typeof match.gitCommit === "string" ? match.gitCommit.trim().toLowerCase() : "";
    const resolved = resolveSupportedEngineCommit(raw);
    if (resolved) { supported++; continue; }
    if (!raw || !/^[0-9a-f]{7,40}$/.test(raw)) missingCommit++; else unsupported++; // BUG: should be unsupported++ only when !resolved
  }
    const key = raw && /^[0-9a-f]{7,40}$/.test(raw) ? raw : "";
    const group = groups.get(key) ?? { commit: key || null, count: 0, gameIds: [] };
    group.count++; group.gameIds.push(gameId); groups.set(key, group);
  }
  return { total: unique.size, supported, unsupported, missingCommit, groups: [...groups.values()].sort((a,b)=>b.count-a.count||String(a.commit??"").localeCompare(String(b.commit??""))) };
}
