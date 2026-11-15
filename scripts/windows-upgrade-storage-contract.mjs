import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";

export class UpgradeContextError extends Error {
  constructor(message) { super("WINDOWS_UPGRADE_CONTEXT_ERROR: " + message); this.name = "UpgradeContextError"; }
}
export class UpgradeDataLossError extends Error {
  constructor(message) { super("WINDOWS_UPGRADE_DATA_LOSS: " + message); this.name = "UpgradeDataLossError"; }
}

export function isCoachRendererTarget(target, expectedInstallDirectory) {
  if (!target || target.type !== "page" || typeof target.url !== "string" || !target.webSocketDebuggerUrl) return false;
  try {
    const url = new URL(target.url);
    if (url.protocol !== "file:") return false;
    const pathname = decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, "$1");
    const actual = path.win32.normalize(pathname);
    const expected = path.win32.normalize(path.win32.join(expectedInstallDirectory, "resources", "app.asar", "dist", "index.html"));
    return actual.toLowerCase() === expected.toLowerCase();
  } catch { return false; }
}

export function assertCoachRendererTarget(target, expectedInstallDirectory) {
  if (!isCoachRendererTarget(target, expectedInstallDirectory)) {
    throw new UpgradeContextError("DevTools target is not the expected packaged Coach renderer.");
  }
  return true;
}

export function firstDifference(before, after, prefix = "$") {
  if (isDeepStrictEqual(before, after)) return null;
  if (before === null || after === null || typeof before !== "object" || typeof after !== "object") {
    return { path: prefix, before, after };
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (!(key in before)) return { path: prefix + "." + key, before: undefined, after: after[key] };
    if (!(key in after)) return { path: prefix + "." + key, before: before[key], after: undefined };
    const difference = firstDifference(before[key], after[key], Array.isArray(before) ? prefix + "[" + key + "]" : prefix + "." + key);
    if (difference) return difference;
  }
  return { path: prefix, before, after };
}

export function assertContextContinuity(before, after) {
  for (const [label, left, right] of [
    ["renderer URL", before.renderer?.href, after.renderer?.href],
    ["renderer origin", before.renderer?.origin, after.renderer?.origin],
    ["renderer protocol", before.renderer?.protocol, after.renderer?.protocol],
    ["Electron userData directory", before.electron?.userDataPath, after.electron?.userDataPath],
    ["Electron appData directory", before.electron?.appDataPath, after.electron?.appDataPath],
    ["Chromium profile identity", before.profileIdentity, after.profileIdentity],
    ["IndexedDB database name", before.indexedDB?.name, after.indexedDB?.name],
    ["IndexedDB database version", before.indexedDB?.version, after.indexedDB?.version],
  ]) {
    if (left === undefined || left === null || left === "") throw new UpgradeContextError("Missing " + label + " in baseline snapshot.");
    if (right === undefined || right === null || right === "") throw new UpgradeContextError("Missing " + label + " in updated snapshot.");
    if (left !== right) throw new UpgradeContextError(label + " changed: baseline=" + String(left) + "; updated=" + String(right));
  }
  if (before.renderer?.title !== "OpenFront Replay Coach" || after.renderer?.title !== "OpenFront Replay Coach") {
    throw new UpgradeContextError("DevTools is not attached to the initialized OpenFront Replay Coach renderer.");
  }
  if (before.renderer?.readyState !== "complete" || after.renderer?.readyState !== "complete") {
    throw new UpgradeContextError("Renderer was inspected before document initialization completed.");
  }
}

export function assertStoragePreserved(before, after) {
  const left = { localStorage: before.localStorage, indexedDB: before.indexedDB?.stores, records: before.indexedDB?.records };
  const right = { localStorage: after.localStorage, indexedDB: after.indexedDB?.stores, records: after.indexedDB?.records };
  const difference = firstDifference(left, right);
  if (difference) {
    const show = value => value === undefined ? "<missing>" : JSON.stringify(value);
    throw new UpgradeDataLossError(difference.path + " changed: before=" + show(difference.before) + "; after=" + show(difference.after));
  }
  for (const store of before.indexedDB.stores) {
    const beforeCount = before.indexedDB.counts[store.name];
    const afterCount = after.indexedDB.counts[store.name];
    if (beforeCount !== afterCount) throw new UpgradeDataLossError("IndexedDB " + store.name + " record count changed from " + beforeCount + " to " + afterCount);
  }
  return true;
}

export function assertUpgradeSnapshotsEqual(before, after) {
  assertContextContinuity(before, after);
  assertStoragePreserved(before, after);
  return true;
}
