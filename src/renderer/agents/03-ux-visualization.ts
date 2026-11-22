/**
 * UX Visualization Agent – drives the UI layer for replay maps and coaching cards.
 */
import type { Agent } from './01-replay-engine';

export const uxVisualizationAgent: Agent = {
  name: 'UX Visualization',
  description: 'Builds interactive replay maps, timelines, and coaching cards.',
  async run() {
    console.log('UX Visualization agent started – no implementation yet');
  },
};