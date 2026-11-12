import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const executable = path.resolve("release/win-unpacked/OpenFront Replay Coach.exe");
const port = 9222;
const child = spawn(executable, [
  "--no-sandbox",
  "--disable-gpu",
  "--remote-debugging-port=" + port,
  "--remote-allow-origins=*"
], { stdio: "ignore", windowsHide: true });

let socket;
try {
  let page;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("App-Prozess wurde vor dem Renderer-Start beendet: " + child.exitCode);
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json");
      const targets = await response.json();
      page = targets.find(target => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) break;
    } catch { /* Chromium is still starting. */ }
    await delay(500);
  }
  if (!page) throw new Error("Kein Chromium-Renderer innerhalb von 30 Sekunden erreichbar.");

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP-Verbindung zeitüberschritten.")), 10000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP-Verbindung fehlgeschlagen.")); }, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  const evaluate = expression => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("Renderer-Auswertung zeitüberschritten.")); } }, 5000);
  });

  let result;
  const renderDeadline = Date.now() + 15000;
  while (Date.now() < renderDeadline) {
    result = await evaluate("({title:document.title,rootChildren:document.querySelector('#root')?.childElementCount ?? 0,href:location.href})");
    if (result?.result?.value?.rootChildren > 0) break;
    await delay(500);
  }
  const state = result?.result?.value;
  if (!state || state.rootChildren < 1) throw new Error("Renderer blieb leer: " + JSON.stringify(state));
  if (!/OpenFront Replay Coach/i.test(state.title)) throw new Error("Unerwarteter Fenstertitel: " + state.title);
  console.log("WINDOWS_SMOKE_TEST_OK", JSON.stringify(state));
} finally {
  try { socket?.close(); } catch {}
  try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
}
