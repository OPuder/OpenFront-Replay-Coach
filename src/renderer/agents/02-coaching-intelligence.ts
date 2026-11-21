/**
 * Coaching Intelligence Agent – analyses replay decisions and produces evidence‑based insights.
 */
export interface Agent {
  name: string;
  description: string;
  run(): Promise<void>;
}

export const coachingIntelligenceAgent: Agent = {
  name: 'Coaching Intelligence',
  description: 'Evaluates player decisions and generates evidence‑based strategic coaching.',
  async run() {
    console.log('Coaching Intelligence agent started – no implementation yet');
  },
};