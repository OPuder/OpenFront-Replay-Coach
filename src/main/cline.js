const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

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
  } catch {
    return [];
  }
}

async function saveTasks(tasks) {
  await fs.writeFile(TASK_QUEUE_FILE, JSON.stringify(tasks, null, 2));
}

function createLock(taskId) {
  const lockFile = path.join(LOCK_DIR, `${taskId}.lock`);
  try {
    fsSync.writeFileSync(lockFile, 'locked');
  } catch {}
}

function deleteLock(taskId) {
  const lockFile = path.join(LOCK_DIR, `${taskId}.lock`);
  try {
    fsSync.unlinkSync(lockFile);
  } catch {}
}

function isLocked(taskId) {
  const lockFile = path.join(LOCK_DIR, `${taskId}.lock`);
  return fsSync.existsSync(lockFile);
}

async function processTask(task) {
  console.log(`--- Processing task ${task.id}: ${task.description}`);
  if (isLocked(task.id)) {
    console.log(`Task ${task.id} already locked – skipping.`);
    return;
  }
  createLock(task.id);
  task.status = 'running';
  await saveTasks(await loadTasks());
  try {
    // Placeholder for agent execution logic
    await new Promise(r => setTimeout(r, 100));
    task.status = 'completed';
  } catch (e) {
    task.status = 'failed';
    task.result = e.message;
  } finally {
    deleteLock(task.id);
    await saveTasks(await loadTasks());
  }
}

async function runOrchestrator() {
  const tasks = await loadTasks();
  const pending = tasks.filter(t => t.status === 'pending');
  if (!pending.length) {
    console.log('No pending tasks – orchestrator idle.');
    return;
  }
  await Promise.all(pending.map(processTask));
}

async function addTask({ role, description }) {
  const tasks = await loadTasks();
  const newTask = new Task(`T${Date.now()}`, role, description);
  tasks.push(newTask);
  await saveTasks(tasks);
}

module.exports = { addTask, runOrchestrator, Task };
