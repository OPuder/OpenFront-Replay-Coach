/**
 * Minimal Cline orchestrator – CommonJS version for easy execution with `node`.
 */
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Import agent implementations (JS wrappers)
const { replayEngineAgent } = require('../renderer/agents/01-replay-engine.js');
const { coachingIntelligenceAgent } = require('../renderer/agents/02-coaching-intelligence.js');
const { uxVisualizationAgent } = require('../renderer/agents/03-ux-visualization.js');
const { platformUpdatesAgent } = require('../renderer/agents/04-platform-updates.js');
const { qaReleaseAgent } = require('../renderer/agents/05-qa-release.js');

// Agent registry
const agentRegistry = {
  '01': { name: 'Replay Engine', agent: replayEngineAgent },
  '02': { name: 'Coaching Intelligence', agent: coachingIntelligenceAgent },
  '03': { name: 'UX Visualization', agent: uxVisualizationAgent },
  '04': { name: 'Platform Updates', agent: platformUpdatesAgent },
  '05': { name: 'QA Release', agent: qaReleaseAgent },
};

// Task definition
class Task {
  constructor(id, role, description) {
    this.id = id;
    this.role = role;
    this.description = description;
    this.status = 'pending';
    this.result = undefined;
  }
}

const TASK_QUEUE_FILE = path.resolve(process.cwd(), 'task-queue.json');

async function loadTasks() {
  try {
    const data = await fs.readFile(TASK_QUEUE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (_) {
    return [];
  }
}

async function saveTasks(tasks) {
  await fs.writeFile(TASK_QUEUE_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
}

async function processTask(task) {
  console.log(`--- Processing task ${task.id}: ${task.description}`);
  const entry = agentRegistry[task.role];
  if (!entry) throw new Error(`Unknown agent role ${task.role}`);
  try {
    task.status = 'running';
    await saveTasks([task]);
    await entry.agent.run();
    task.status = 'completed';
    task.result = `Agent ${entry.name} finished successfully.`;
    console.log(`✅ Task ${task.id} completed by ${entry.name}`);
    // Run integration tests after successful agent run
    try {
      console.log('Running integration tests...');
      execSync('npm run test:integration-e2e', { stdio: 'inherit' });
      console.log('Integration tests passed.');
      // Commit any changes produced by the agent
      const status = execSync('git status --porcelain', { encoding: 'utf-8' });
      if (status.trim()) {
        console.log('Staging changes for commit.');
        execSync('git add .', { stdio: 'inherit' });
        execSync(`git commit -m "Agent ${entry.name} applied changes for task ${task.id}"`, { stdio: 'inherit' });
        console.log('Committed changes.');
      } else {
        console.log('No changes to commit.');
      }
    } catch (testErr) {
      console.error('Integration tests failed:', testErr.message);
      task.status = 'failed';
      task.result += ` | Test failure: ${testErr.message}`;
    }
  } catch (e) {
    task.status = 'failed';
    task.result = e.message;
    console.error(`❌ Task ${task.id} failed: ${e.message}`);
  }
  await saveTasks([task]);
}

async function runOrchestrator() {
  const tasks = await loadTasks();
  const pending = tasks.filter(t => t.status === 'pending');
  if (!pending.length) {
    console.log('No pending tasks – orchestrator idle.');
    return;
  }
  await Promise.all(pending.map(processTask));
  console.log('All pending tasks processed.');
}

async function addTask({ role, description }) {
  const tasks = await loadTasks();
  const newTask = new Task(`T${Date.now()}`, role, description);
  tasks.push(newTask);
  await saveTasks(tasks);
  console.log(`Added task ${newTask.id} (role ${role})`);
}

// If run directly, process any pending tasks
if (require.main === module) {
  runOrchestrator().catch(err => {
    console.error('Orchestrator error:', err);
    process.exit(1);
  });
}

module.exports = { addTask, runOrchestrator, Task };
