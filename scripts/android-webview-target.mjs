export function parseExpectedWebViewPid(value) {
  const pids = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (pids.length !== 1 || !/^\d+$/.test(pids[0])) {
    throw new Error("CONTEXT_ERROR: Expected exactly one numeric foreground app PID; received " + JSON.stringify(value));
  }
  return pids[0];
}

export function expectedWebViewSocketName(pid) {
  if (!/^\d+$/.test(String(pid))) throw new Error("CONTEXT_ERROR: Invalid expected WebView PID " + String(pid));
  return "webview_devtools_remote_" + pid;
}

export function assertWebViewSocketPid(socketName, expectedPid) {
  const match = /^webview_devtools_remote_(\d+)$/.exec(String(socketName ?? ""));
  if (!match) throw new Error("CONTEXT_ERROR: Invalid WebView DevTools socket " + String(socketName));
  if (match[1] !== String(expectedPid)) {
    throw new Error("CONTEXT_ERROR: WebView socket PID " + match[1] + " does not match foreground app PID " + expectedPid);
  }
  return match[1];
}

export function selectCoachWebViewTarget(targets, socketName, expectedPid) {
  assertWebViewSocketPid(socketName, expectedPid);
  if (!Array.isArray(targets)) return undefined;
  return targets.find(target =>
    target?.type === "page" &&
    target.title === "OpenFront Replay Coach" &&
    typeof target.url === "string" &&
    (/^https?:\/\/localhost(?::\d+)?(?:\/|$)/i.test(target.url) || /^file:\/\/\/android_asset\//i.test(target.url)) &&
    typeof target.webSocketDebuggerUrl === "string" &&
    target.webSocketDebuggerUrl.length > 0
  );
}
