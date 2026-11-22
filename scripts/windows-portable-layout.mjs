import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Locate the portable Electron app inside an extracted ZIP.
 * electron-builder archives may place the application at the ZIP root or
 * inside one wrapper directory; require exactly one complete app payload.
 */
export function findPortableApplicationRoots(extractionRoot) {
  const pending = [path.resolve(extractionRoot)];
  const matches = [];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
        continue;
      }
      if (!entry.isFile() || entry.name !== "OpenFront Replay Coach.exe") continue;
      const appAsar = path.join(directory, "resources", "app.asar");
      try {
        const executableInfo = lstatSync(absolute);
        const asarInfo = lstatSync(appAsar);
        if (executableInfo.isFile() && !executableInfo.isSymbolicLink()
          && asarInfo.isFile() && !asarInfo.isSymbolicLink()) {
          matches.push({ executable: absolute, appAsar });
        }
      } catch {
        // An executable without its matching app.asar is not a complete app.
      }
    }
  }
  return matches;
}
