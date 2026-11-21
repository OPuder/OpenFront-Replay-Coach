/**
 * QA Release Agent – verifies tests, linting, builds, and release artefacts.
 */
export interface Agent {
  name: string;
  description: string;
  run(): Promise<void>;
}

export const qaReleaseAgent: Agent = {
  name: 'QA Release',
  description: 'Runs tests, linting, builds and validates release artefacts.',
  async run() {
    console.log('QA Release agent started – no implementation yet');
  },
};