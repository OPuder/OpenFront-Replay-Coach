import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const executable = path.resolve("release/win-unpacked/OpenFront Replay Coach.exe");
const port = 9222;
const child = spawn(executable, [
  "--no-sandbox",
  "--disable-gpu",
  "--remote-debugging-port=" + port,
  "--remote-allow-origins=*",
], { stdio: "ignore", windowsHide: true });

let socket;
const diagnostics = [];
try {
  let page;
  const connectDeadline = Date.now() + 45000;
  while (Date.now() < connectDeadline) {
    if (child.exitCode !== null) {
      throw new Error("App-Prozess wurde vor dem Renderer-Start beendet: " + child.exitCode);
    }
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json");
      const targets = await response.json();
      page = targets.find(target => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) break;
    } catch {
      // Chromium is still starting.
    }
    await delay(500);
  }
  if (!page) throw new Error("Kein Chromium-Renderer innerhalb von 45 Sekunden erreichbar.");

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP-Verbindung zeitüberschritten.")), 15000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP-Verbindung fehlgeschlagen.")); }, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", event => {
    try {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      if (message.method === "Runtime.exceptionThrown") {
        diagnostics.push(message.params?.exceptionDetails?.text ?? "Renderer exception");
      } else if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
        const values = message.params.args?.map(arg => arg.value ?? arg.description ?? "").filter(Boolean);
        diagnostics.push("console.error: " + values.join(" "));
      } else if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
        diagnostics.push("browser error: " + message.params.entry.text);
      }
    } catch (error) {
      diagnostics.push("CDP message could not be parsed: " + String(error));
    }
  });

  const command = (method, params = {}, timeoutMs = 15000) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("CDP command timed out: " + method));
      }
    }, timeoutMs);
    pending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await Promise.all([command("Runtime.enable"), command("Page.enable"), command("Log.enable").catch(() => null)]);

  let state = null;
  let lastEvaluationError = null;
  const renderDeadline = Date.now() + 60000;
  while (Date.now() < renderDeadline) {
    if (child.exitCode !== null) {
      throw new Error("App-Prozess wurde während des Renderer-Starts beendet: " + child.exitCode);
    }
    try {
      const result = await command(
        "Runtime.evaluate",
        {
          expression: "({title:document.title,readyState:document.readyState,rootChildren:document.querySelector('#root')?.childElementCount ?? 0,href:location.href})",
          returnByValue: true,
          awaitPromise: true,
        },
        15000,
      );
      state = result?.result?.value ?? null;
      lastEvaluationError = null;
      if (state?.rootChildren > 0 && state.readyState === "complete") break;
    } catch (error) {
      lastEvaluationError = error instanceof Error ? error.message : String(error);
    }
    await delay(750);
  }

  if (!state || state.rootChildren < 1) {
    throw new Error(
      "Renderer blieb leer. Letzter Zustand: " + JSON.stringify(state) +
      ". Letzter CDP-Fehler: " + (lastEvaluationError ?? "keiner") +
      ". Renderer-Diagnose: " + diagnostics.slice(-10).join(" | "),
    );
  }
  if (!/OpenFront Replay Coach/i.test(state.title)) {
    throw new Error("Unerwarteter Fenstertitel: " + state.title);
  }
  console.log("WINDOWS_SMOKE_TEST_OK", JSON.stringify(state));
} finally {
  try { socket?.close(); } catch {}
  try {
    if (child.pid) execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {}
}
