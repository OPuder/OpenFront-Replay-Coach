import test from "node:test";
import assert from "node:assert/strict";
import {
  parseExpectedWebViewPid, expectedWebViewSocketName, assertWebViewSocketPid, selectCoachWebViewTarget,
} from "./android-webview-target.mjs";

const target = {
  type: "page",
  title: "OpenFront Replay Coach",
  url: "https://localhost/",
  webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/coach",
};

test("requires one exact foreground app PID", () => {
  assert.equal(parseExpectedWebViewPid("1234"), "1234");
  assert.throws(() => parseExpectedWebViewPid(""), /CONTEXT_ERROR/);
  assert.throws(() => parseExpectedWebViewPid("1234 5678"), /CONTEXT_ERROR/);
  assert.throws(() => parseExpectedWebViewPid("abc"), /CONTEXT_ERROR/);
});

test("derives and verifies only the matching WebView socket", () => {
  assert.equal(expectedWebViewSocketName("1234"), "webview_devtools_remote_1234");
  assert.equal(assertWebViewSocketPid("webview_devtools_remote_1234", "1234"), "1234");
  assert.throws(() => assertWebViewSocketPid("webview_devtools_remote_9999", "1234"), /CONTEXT_ERROR/);
  assert.throws(() => assertWebViewSocketPid("other_socket", "1234"), /CONTEXT_ERROR/);
});

test("never selects a target from a socket belonging to another PID", () => {
  assert.throws(() => selectCoachWebViewTarget([target], "webview_devtools_remote_9999", "1234"), /CONTEXT_ERROR/);
});

test("selects the initialized Coach page by title and application URL", () => {
  assert.equal(selectCoachWebViewTarget([target], "webview_devtools_remote_1234", "1234"), target);
  assert.equal(selectCoachWebViewTarget([{ ...target, title: "Other app" }], "webview_devtools_remote_1234", "1234"), undefined);
  assert.equal(selectCoachWebViewTarget([{ ...target, url: "https://example.invalid/" }], "webview_devtools_remote_1234", "1234"), undefined);
  assert.equal(selectCoachWebViewTarget([{ ...target, type: "worker" }], "webview_devtools_remote_1234", "1234"), undefined);
});

test("retains a matching application page with an empty title for renderer diagnostics", () => {
  const blankTitle = { ...target, title: "" };
  assert.equal(selectCoachWebViewTarget([blankTitle], "webview_devtools_remote_1234", "1234"), blankTitle);
  assert.equal(selectCoachWebViewTarget([{ ...target, title: null }], "webview_devtools_remote_1234", "1234")?.title, null);
  assert.equal(selectCoachWebViewTarget([{ ...target, title: "Unrelated page" }, blankTitle], "webview_devtools_remote_1234", "1234"), blankTitle);
});
