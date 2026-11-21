/**
 * UX Visualization Agent – drives the UI layer for replay maps and coaching cards.
 */
export interface Agent {
  name: string;
  description: string;
  run(): Promise<void>;
}

export const uxVisualizationAgent: Agent = {
  name: 'UX Visualization',
  description: 'Builds interactive replay maps, timelines, and coaching cards.',
  async run() {
    console.log('UX Visualization agent started – no implementation yet');
  },
};