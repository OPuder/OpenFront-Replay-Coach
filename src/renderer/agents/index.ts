// Re‑export the Agent type only once to avoid duplicate‑export conflicts.
// Individual agent modules export their own implementations.
export type { Agent } from './01-replay-engine';
export { replayEngineAgent } from './01-replay-engine';
export { coachingIntelligenceAgent } from './02-coaching-intelligence';
export { uxVisualizationAgent } from './03-ux-visualization';
export { platformUpdatesAgent } from './04-platform-updates';
export { qaReleaseAgent } from './05-qa-release';