import type { EngineCoachInsight } from "./EngineCoachInsights";

const priorityRank = (priority: EngineCoachInsight["priority"]) =>
  priority === "high" ? 0 : priority === "medium" ? 1 : 2;

export interface CoachInsightSelection {
  ordered: EngineCoachInsight[];
  primary: EngineCoachInsight[];
  supporting: EngineCoachInsight[];
}

/**
 * Keep the visible decision coach focused on at most three concrete,
 * medium/high-priority reviews or strengths. Generic observations and
 * lower-priority items remain available as supporting context.
 */
export function selectPrimaryCoachInsights(
  insights: readonly EngineCoachInsight[],
): CoachInsightSelection {
  const ordered = [...insights].sort(
    (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
  );
  const primary = ordered
    .filter(
      (item) =>
        (item.kind === "review" || item.kind === "strength") &&
        (item.priority === "high" || item.priority === "medium"),
    )
    .slice(0, 3);
  const primaryIds = new Set(primary.map((item) => item.id));
  const supporting = ordered.filter((item) => !primaryIds.has(item.id));
  return { ordered, primary, supporting };
}
