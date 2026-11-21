// Task orchestrator – runs queued tasks with file‑based locks.
// ---------------------------------------------------------------------
// NOTE: All functions are async and use Node.js file‑system APIs.
// ---------------------------------------------------------------------
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// --- Agent registry -----------------------------------------------------
const { replayEngineAgent } = require('../renderer/agents/01-replay-engine.js');
const { coachingIntelligenceAgent } = require('../renderer/agents/02-coaching-intelligence.js');
const { uxVisualizationAgent } = require('../renderer/agents/03-ux-visualization.js');
const { platformUpdatesAgent } = require('../renderer/agents/04-platform-updates.js');
const { qaReleaseAgent } = require('../renderer/agents/05-qa-release.js');

const agentMap = {
  'replay-engine': replayEngineAgent,
  'coaching-intelligence': coachingIntelligenceAgent,
  'ux-visualization': uxVisualizationAgent,
  'platform-updates': platformUpdatesAgent,
  'qa-release': qaReleaseAgent,
};

// --- Task definition ----------------------------------------------------
class Task {
  constructor(id, role, description) {
    this.id = id;
    this.role = role;
    this.description = description;
    this.status = 'pending';
    this.result = undefined;
  }
}

// --- Persistence -------------------------------------------------------
const TASK_QUEUE_FILE = path.resolve(process.cwd(), 'task-queue.json');
const LOCK_DIR = path.resolve(process.cwd(), 'src', 'main', 'task-queue.lock');
if (!fsSync.existsSync(LOCK_DIR)) fsSync.mkdirSync(LOCK_DIR, { recursive: true });

async function loadTasks() {
  try {
    const data = await fs.readFile(TASK_QUEUE_FILE, 'utf-8');
    return JSON.parse(data) || [];
  } catch {
    return [];
  }
}

async function saveTasks(tasks) {
  await fs.writeFile(TASK_QUEUE_FILE, JSON.stringify(tasks, null, 2));
}

// --- Lock handling -----------------------------------------------------
const LOCK_AGE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

function getLockPath(taskId) {
  return path.join(LOCK_DIR, `${taskId}.lock`);
}

async function acquireLock(taskId) {
  const lockPath = getLockPath(taskId);
  while (true) {
    try {
      const fd = await fs.open(lockPath, 'wx', 0o600);
      // write metadata: timestamp and pid
      const meta = JSON.stringify({ ts: Date.now(), pid: process.pid });
      await fd.writeFile(meta);
      return { fd, lockPath };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // lock exists – check stale
      try {
        const data = await fs.readFile(lockPath, 'utf-8');
        const { ts, pid } = JSON.parse(data);
        const age = Date.now() - ts;
        if (age > LOCK_AGE_LIMIT_MS) {
          // stale – remove and retry
          await fs.unlink(lockPath);
          continue;
        }
        // lock is active – wait a bit
        await new Promise(r => setTimeout(r, 100));
        continue;
      } catch {
        // file unreadable – delete and retry
        try {
          await fs.unlink(lockPath);
        } catch {}
        continue;
      }
    }
  }
}

async function releaseLock(fd, lockPath) {
  try {
    await fd.close();
  } finally {
    try {
      await fs.unlink(lockPath);
    } catch {}
  }
}

// --- Task execution ----------------------------------------------------
async function processTask(task) {
  console.log(`--- Processing task ${task.id}: ${task.description}`);
  const { fd, lockPath } = await acquireLock(task.id);
  const tasks = await loadTasks();
  const target = tasks.find(t => t.id === task.id);
  if (!target) {
    // Should not happen – just return
    await releaseLock(fd, lockPath);
    return;
  }
  try {
    // Update status to running and persist
    target.status = 'running';
    await saveTasks(tasks);

    const agent = agentMap[task.role];
    if (!agent) {
      throw new Error(`Unknown role: ${task.role}`);
    }

    // Execute the agent
    await agent.run();
    target.status = 'completed';
    target.result = 'success';
    await saveTasks(tasks);
  } catch (e) {
    const tasks = await loadTasks();
    const target = tasks.find(t => t.id === task.id);
    if (target) {
      target.status = 'failed';
      target.result = e.message;
      await saveTasks(tasks);
    }
    throw e;
   } finally {
     await releaseLock(fd, lockPath);
   }
}

// --- Orchestrator ------------------------------------------------------
async function runOrchestrator() {
  const tasks = await loadTasks();
  const pending = tasks.filter(t => t.status === 'pending');
  if (!pending.length) {
    console.log('No pending tasks – orchestrator idle.');
    return;
  }
  await Promise.all(pending.map(processTask));
}

// --- Public API --------------------------------------------------------
async function addTask({ role, description }) {
  const tasks = await loadTasks();
  const newTask = new Task(`T${Date.now()}`, role, description);
  tasks.push(newTask);
  await saveTasks(tasks);
}

module.exports = {
  Task,
  addTask,
  runOrchestrator,
  processTask,
};
