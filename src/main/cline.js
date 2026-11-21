/**
 * Minimal Cline orchestrator – CommonJS version for easy execution with `node`.
 */
const fs = require('fs').promises;
const fsSync = require('fs');
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
const LOCK_DIR = path.resolve(process.cwd(), 'src', 'main', 'task-queue.lock');

async function loadTasks() {
  try {
    const data = await fs.readFile(TASK_QUEUE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (_) {
    return [];
  }
}

// Atomare Schreiboperation für die Task‑Queue.
// Wir lesen die aktuelle Queue, ersetzen die Aufgabe mit derselben ID (falls vorhanden) und schreiben zurück.
async function saveTasks(updatedTask) {
  const all = await loadTasks();
  const idx = all.findIndex(t => t.id === updatedTask.id);
  if (idx !== -1) all[idx] = updatedTask;
  else all.push(updatedTask);
  await fs.writeFile(TASK_QUEUE_FILE, JSON.stringify(all, null, 2), 'utf-8');
}

// Helper: lock utilities
function lockFilePath(id) {
  return path.join(LOCK_DIR, `${id}.lock`);
}
function createLock(id, leaseMs) {
  const expiry = Date.now() + leaseMs;
  fsSync.writeFileSync(lockFilePath(id), expiry.toString(), 'utf-8');
}
function isLocked(id) {
  try {
    const data = fs.readFileSync(lockFilePath(id), 'utf-8');
    const expiry = parseInt(data, 10);
    return Date.now() < expiry;
  } catch (_) {
    return false;
  }
}
function deleteLock(id) {
  try { fs.unlinkSync(lockFilePath(id)); } catch (_) {}
}

async function processTask(task) {
  console.log(`--- Processing task ${task.id}: ${task.description}`);
  const entry = agentRegistry[task.role];
  if (!entry) throw new Error(`Unknown agent role ${task.role}`);
    const leaseMs = parseInt(process.env.LEASE_MS, 10) || 300000; // 5 minutes
    const hb = setInterval(() => createLock(task.id, leaseMs), 10000);
    try {
      // Claim lock
      if (isLocked(task.id)) {
        console.log(`Task ${task.id} already locked – skipping.`);
        return;
      }
      createLock(task.id, leaseMs);
      task.status = 'running';
      const allTasks = await loadTasks();
      const idx = allTasks.findIndex(t => t.id === task.id);
      if (idx !== -1) allTasks[idx] = task;
      await saveTasks(allTasks);
      // Snapshot before agent runs
      const preStatus = execSync('git status --porcelain', { encoding: 'utf-8' });
      await entry.agent.run();
      // Snapshot after agent runs
      const postStatus = execSync('git status --porcelain', { encoding: 'utf-8' });
      const preLines = preStatus.split('\n').filter(Boolean);
      const postLines = postStatus.split('\n').filter(Boolean);
      const changedFiles = postLines
        .filter(l => !preLines.includes(l))
        .map(l => l.trim().split(' ')[1]);
      task.status = 'completed';
      // Integration tests after agent work
      try {
        execSync('npm run test:integration-e2e', { stdio: 'inherit' });
        console.log('Integration tests passed.');
      } catch (e) {
        console.error('Integration tests failed:', e.message);
    } catch (e) {
      task.status = 'failed';
      task.result = e.message;
      console.error(`❌ Task ${task.id} failed: ${e.message}`);
    } finally {
    } finally {
    } finally {
      clearInterval(hb);
      deleteLock(task.id);
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
