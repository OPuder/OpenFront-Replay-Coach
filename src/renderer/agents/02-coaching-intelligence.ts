/**
 * Coaching Intelligence Agent – analyses replay decisions and produces evidence‑based insights.
 */
import type { Agent } from './01-replay-engine';

export const coachingIntelligenceAgent: Agent = {
  name: 'Coaching Intelligence',
  description: 'Evaluates player decisions and generates evidence‑based strategic coaching.',
  async run() {
    console.log('Coaching Intelligence agent started – no implementation yet');
  },
};