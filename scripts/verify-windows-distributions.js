const { readdirSync, statSync, mkdirSync, rmSync, execSync } = require('fs');
const path = require('path');

const releaseDir = process.env.RELEASE_DIR ?? 'release';
const installers = readdirSync(releaseDir).filter(f => f.toLowerCase().endsWith('.exe'));
const zips = readdirSync(releaseDir).filter(f => f.toLowerCase().endsWith('.zip'));

if (installers.length !== 1) {
  console.error(`Expected 1 installer, found ${installers.length}`);
  process.exit(1);
}
if (zips.length !== 1) {
  console.error(`Expected 1 portable ZIP, found ${zips.length}`);
  process.exit(1);
}

const installerPath = path.join(releaseDir, installers[0]);
const zipPath = path.join(releaseDir, zips[0]);

if (statSync(installerPath).size < 1e6) {
  console.error('Installer too small (must be >1 MiB)');
  process.exit(1);
}
if (statSync(zipPath).size < 1e6) {
  console.error('Portable ZIP too small (must be >1 MiB)');
  process.exit(1);
}

console.log(`Installer: ${installerPath} (${statSync(installerPath).size} bytes)`);
console.log(`Portable ZIP: ${zipPath} (${statSync(zipPath).size} bytes)`);

// Create a unique temporary extraction directory
const tmpDir = path.join(process.env.RUNNER_TEMP || 'temp', `ofrc-portable-validation-${Date.now()}`);
mkdirSync(tmpDir, { recursive: true });

// Expand the ZIP using PowerShell Expand-Archive
const safeZip = zipPath.replace(/[\\`'"$]/g, '\$&');
try {
  execSync(`powershell -Command "Expand-Archive -LiteralPath '${safeZip}' -DestinationPath '${tmpDir}' -Force"`);
} catch (e) {
  console.error('Failed to extract ZIP');
  process.exit(1);
}

// Recursively find app.asar
function findAsar(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (entry === 'app.asar') return full;
    if (statSync(full).isDirectory()) {
      const found = findAsar(full);
      if (found) return found;
    }
  }
  return null;
}

const asarPath = findAsar(tmpDir);
if (!asarPath) {
  console.error('Portable ZIP does not contain app.asar');
  rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
}
const asarStat = statSync(asarPath);
if (asarStat.size < 1e3) {
  console.error('app.asar too small');
  rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
}
console.log(`Packaged app.asar: ${asarStat.size} bytes`);

// Cleanup
rmSync(tmpDir, { recursive: true, force: true });
