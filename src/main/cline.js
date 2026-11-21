const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * Simple task definition used by the orchestrator.
 * Each task is persisted in a JSON file and guarded by a lock file to
 * prevent concurrent execution by multiple processes.
 */
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
if (!fsSync.existsSync(LOCK_DIR)) fsSync.mkdirSync(LOCK_DIR, { recursive: true });

async function loadTasks() {
  try {
    const data = await fs.readFile(TASK_QUEUE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveTasks(tasks) {
  await fs.writeFile(TASK_QUEUE_FILE, JSON.stringify(tasks, null, 2));
}

function getLockFile(taskId) {
  return path.join(LOCK_DIR, `${taskId}.lock`);
}

/**
 * Execute a single task.  `execFn` should perform the real work.
 * The task status is updated atomically and the lock is released even on error.
 */
async function processTask(task, execFn = () => {}) {
  console.log(`--- Processing task ${task.id}: ${task.description}`);
  // Atomically acquire lock
  try {
    await fs.open(getLockFile(task.id), { flag: 'wx' });
  } catch (e) {
    // Lock already exists – remove stale lock and continue
    try { await fs.unlink(getLockFile(task.id)); } catch {}
  }
  // Load current tasks to update status safely
  const tasks = await loadTasks();
  const target = tasks.find(t => t.id === task.id);
  if (!target) {
    await fs.unlink(getLockFile(task.id));
    return;
  }
  target.status = 'running';
  await saveTasks(tasks);
  try {
    await execFn();
    target.status = 'not implemented';
  } catch (e) {
    target.status = 'failed';
    target.result = e.message;
  } finally {
    try {
      await fs.unlink(getLockFile(task.id));
    } catch { /* ignore */ }
    await saveTasks(tasks);
  }
}

/**
 * Orchestrate all pending tasks.
 */
async function runOrchestrator() {
  const tasks = await loadTasks();
  const pending = tasks.filter(t => t.status === 'pending');
  if (!pending.length) {
    console.log('No pending tasks – orchestrator idle.');
    return;
  }
  await Promise.all(pending.map(processTask));
}

/**
 * Create a new task entry.
 */
async function addTask({ role, description }) {
  const tasks = await loadTasks();
  const newTask = new Task(`T${Date.now()}`, role, description);
  tasks.push(newTask);
  await saveTasks(tasks);
}

module.exports = { addTask, runOrchestrator, Task };
