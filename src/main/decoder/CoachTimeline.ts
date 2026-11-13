import type { EngineCoachInsight } from "./EngineCoachInsights";

export interface ReplayTimelineBaseEvent {
  time: number;
  title: string;
  detail: string;
  kind: string;
  turn: number | null;
}

export interface ReplayTimelineEntry extends ReplayTimelineBaseEvent {
  id: string;
  insight?: EngineCoachInsight;
}

/**
 * Combine recorded match milestones with the coach's highest-priority
 * engine-backed moments. Timestamps are game seconds; this is a navigation
 * aid, not a claim that the official viewer accepts a deep-link seek target.
 */
export function buildReplayTimeline(
  events: readonly ReplayTimelineBaseEvent[],
  insights: readonly EngineCoachInsight[],
): ReplayTimelineEntry[] {
  const recorded: ReplayTimelineEntry[] = events.map((event, index) => ({
    ...event,
    id: `event-${index}`,
  }));
  const coached: ReplayTimelineEntry[] = insights.flatMap((insight) =>
    insight.seconds === null
      ? []
      : [{
          id: `coach-${insight.id}`,
          time: insight.seconds,
          title: insight.title,
          detail: insight.summary,
          kind: insight.kind === "strength" ? "Stärke" : "Coach",
          turn: null,
          insight,
        }],
  );

  return [...recorded, ...coached]
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.time - b.event.time || a.index - b.index)
    .map(({ event }) => event);
}
