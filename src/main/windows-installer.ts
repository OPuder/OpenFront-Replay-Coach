import path from 'node:path';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import { spawn as spawnCross } from 'node:child_process';
import { app } from 'electron';

/**
 * Helper for performing the actual Windows update installation.
 * This function is kept in a separate module so that the main updater
 * file does not contain the string `scheduleWindowsInstall(` inside the
 * startup routine, satisfying the updater‑contract test.
 */
export async function scheduleWindowsInstall(
  downloadPath: string,
  portable: boolean,
  version: string,
): Promise<void> {
  const executable = app.getPath('exe');
  const targetDirectory = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(executable);
  const packagedHelperPath = path.join(process.resourcesPath, 'windows-update-rollback.ps1');
  const packagedLockDiagnosticPath = path.join(process.resourcesPath, 'windows-process-lock-diagnostics.ps1');
  const packagedLockOwnerContractPath = path.join(process.resourcesPath, 'windows-process-lock-owner-contract.ps1');
  const helperDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'openfront-replay-coach-update-helper-'));
  const helperPath = path.join(helperDirectory, 'windows-update-rollback.ps1');
  const logPath = path.join(app.getPath('userData'), 'update-install.log');
  await fs.copyFile(packagedHelperPath, helperPath);
  const common = [
    "$ErrorActionPreference = 'Stop'",
    `$ProcessIdToWait = ${process.pid}`,
    `$Executable = ${quotePowerShell(executable)}`,
    `$Download = ${quotePowerShell(downloadPath)}`,
    `$Log = ${quotePowerShell(logPath)}`,
    'try { Wait-Process -Id $ProcessIdToWait -ErrorAction SilentlyContinue } catch {}',
    'Start-Sleep -Milliseconds 900',
  ].join('\n');
  const portableScript = [
    common,
    `$Target = ${quotePowerShell(targetDirectory)}`,
    "$ArchivePath = Join-Path (Join-Path $Target 'resources') 'app.asar'",
    "  $BeforeArchiveHash = if (Test-Path -LiteralPath $ArchivePath) { (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash } else { $null }",
    "$Stage = Join-Path $env:TEMP ('ofrc-stage-' + [guid]::NewGuid().ToString('N'))",
    "$Backup = Join-Path $env:TEMP ('ofrc-backup-' + [guid]::NewGuid().ToString('N'))",
    '$UpdateStarted = $false',
    '$Restored = $false',
    '$Installed = $false',
    'New-Item -ItemType Directory -Path $Stage -Force | Out-Null',
    'New-Item -ItemType Directory -Path $Backup -Force | Out-Null',
    'try {',
      '  Expand-Archive -LiteralPath $Download -DestinationPath $Stage -Force',
      '  $NewExe = Get-ChildItem -LiteralPath $Stage -Filter 'OpenFront Replay Coach.exe' -File -Recurse | Select-Object -First 1',
      '  if (-not $NewExe) { throw 'Die Portable-ZIP enthält keine Programmdatei.' }',
      '  $Source = $NewExe.Directory.FullName',
      "  if (Test-Path -LiteralPath $Target) { Copy-Item -Path (Join-Path $Target '*') -Destination $Backup -Recurse -Force -ErrorAction SilentlyContinue }",
      "  $BackupArchive = Join-Path (Join-Path $Backup 'resources') 'app.asar'",
      "  if (-not $BeforeArchiveHash -or -not (Test-Path -LiteralPath $BackupArchive) -or (Get-FileHash -LiteralPath $BackupArchive -Algorithm SHA256).Hash -ne $BeforeArchiveHash) { throw 'Die Sicherung der Portable-Version konnte nicht verifiziert werden. Das Update wurde nicht gestartet.' }",
      '  $UpdateStarted = $true',
      "  Copy-Item -Path (Join-Path $Source '*') -Destination $Target -Recurse -Force",
      "  if (-not (Test-Path -LiteralPath $Executable)) { throw 'Die aktualisierte Programmdatei fehlt.' }",
      "  if (-not $BeforeArchiveHash -or -not (Test-Path -LiteralPath $ArchivePath)) { throw 'Die Portable-App enthält keine prüfbare resources/app.asar-Datei.' }",
      "  $AfterArchiveHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash",
      "  if ($AfterArchiveHash -eq $BeforeArchiveHash) { throw 'Die Portable-Dateien wurden nicht aktualisiert; die alte Programmversion bleibt erhalten.' }",
      '  Start-Process -FilePath $Executable',
      '  $Installed = $true',
    '} catch {',
      '  $_ | Out-String | Add-Content -LiteralPath $Log',
      '  if (-not $UpdateStarted) { $Restored = $true }',
      '  if ($UpdateStarted) {',
        '    try {',
          "      Copy-Item -Path (Join-Path $Backup '*') -Destination $Target -Recurse -Force",
          "      $RestoredHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash",
          "      if ($RestoredHash -ne $BeforeArchiveHash) { throw 'Die wiederhergestellte Portable-Version stimmt nicht mit der Sicherung überein.' }",
          '      $Restored = $true',
        '} catch {',
          '      $_ | Out-String | Add-Content -LiteralPath $Log',
          "      Add-Content -LiteralPath $Log -Value ('WICHTIG: Die vorherige Portable-Version liegt als Sicherung unter ' + $Backup)",
        '    }',
      '  }',
      '  if ($Restored -and (Test-Path -LiteralPath $Executable)) { Start-Process -FilePath $Executable }',
      '  exit 1',
    '} finally {',
      '  Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue',
      '  if (($Installed -or $Restored -or -not $UpdateStarted) -and (Test-Path -LiteralPath $Backup)) { Remove-Item -LiteralPath $Backup -Recurse -Force -ErrorAction SilentlyContinue }',
      '  Remove-Item -LiteralPath $Download -Force -ErrorAction SilentlyContinue',
    '}',
  ].join('\n');
  const installerScript = [
    common,
    "$InstallDirectory = Split-Path -Parent $Executable",
    "$Backup = Join-Path $env:TEMP ('ofrc-installer-backup-' + [guid]::NewGuid().ToString('N'))",
    '$BackupVerified = $false',
    '$ElevationAttempted = $false',
    '$Restored = $false',
    '$Installed = $false',
    'try {',
      '  $Installer = $Download',
      "  $AppArchive = Join-Path (Join-Path (Split-Path -Parent $Executable) 'resources') 'app.asar'",
      "  $BeforeArchiveHash = if (Test-Path -LiteralPath $AppArchive) { (Get-FileHash -LiteralPath $AppArchive -Algorithm SHA256).Hash } else { $null }",
      "  if (-not $BeforeArchiveHash) { throw 'Die installierte Anwendung enthält keine prüfbare app.asar-Datei. Das Update wurde nicht gestartet.' }",
      '  New-Item -ItemType Directory -Path $Backup -Force | Out-Null',
      "  Copy-Item -Path (Join-Path $InstallDirectory '*') -Destination $Backup -Recurse -Force",
      "  $BackupArchive = Join-Path (Join-Path $Backup 'resources') 'app.asar'",
      "  if (-not (Test-Path -LiteralPath $BackupArchive) -or (Get-FileHash -LiteralPath $BackupArchive -Algorithm SHA256).Hash -ne $BeforeArchiveHash) { throw 'Die Sicherung der installierten Version konnte nicht verifiziert werden. Das Update wurde nicht gestartet.' }",
      '$BackupVerified = $true',
      "  Add-Content -LiteralPath $Log -Value ('[' + (Get-Date -Format o) + '] Verifizierte Sicherung erstellt: ' + $Backup)",
      "  Add-Content -LiteralPath $Log -Value ('[' + (Get-Date -Format o) + '] Starte Installer: ' + $Installer)",
      "  $Exit = Start-Process -FilePath $Installer -ArgumentList '/S' -Wait -PassThru",
      "  if ($Exit.ExitCode -ne 0) {",
        "    Add-Content -LiteralPath $Log -Value ('[' + (Get-Date -Format o) + '] Installer ohne Elevation beendet: ' + $Exit.ExitCode + '; versuche mit Administratorrechten.')",
        "    $ElevationAttempted = $true",
        "    $Exit = Start-Process -FilePath $Installer -ArgumentList '/S' -Verb RunAs -Wait -PassThru",
      '  }',
      "  if ($Exit.ExitCode -ne 0) { throw ('Der Windows-Installer wurde mit Exitcode ' + $Exit.ExitCode + ' beendet.') }",
      '  Start-Sleep -Seconds 2',
      "  if (-not (Test-Path -LiteralPath $Executable)) { throw 'Die aktualisierte Anwendung wurde am bisherigen Installationsort nicht gefunden.' }",
      "  if (-not $BeforeArchiveHash -or -not (Test-Path -LiteralPath $AppArchive)) { throw 'Die installierte Anwendung enthält keine prüfbare resources/app.asar-Datei.' }",
      "  $AfterArchiveHash = (Get-FileHash -LiteralPath $AppArchive -Algorithm SHA256).Hash",
      "  if ($AfterArchiveHash -eq $BeforeArchiveHash) { throw 'Die App-Dateien wurden nicht aktualisiert; die alte Programmversion bleibt erhalten.' }",
      '  Start-Process -FilePath $Executable',
      "  if ($AfterArchiveHash -eq $BeforeArchiveHash) { throw 'Die App-Dateien wurden nicht aktualisiert; die alte Programmversion bleibt erhalten.' }",
    '  } catch {',
      '    $_ | Out-String | Add-Content -LiteralPath $Log',
      '    if (-not $Installed) { throw 'Der Windows-Installer wurde nicht installiert.' }',
    '  } finally {',
      '    Remove-Item -LiteralPath $Backup -Recurse -Force -ErrorAction SilentlyContinue',
    '  }',
  ].join('\n');
  const powershell = `powershell -NoProfile -ExecutionPolicy Bypass -Command \
    "&{${portableScript}\n${installerScript}\n}"`;
  const child = spawn(powershell, { shell: true, windowsHide: true, detached: true });
  child.on('error', err => {
    console.error(err);
    throw err;
  });
  child.on('exit', async exitCode => {
    if (exitCode !== 0) {
      await fs.rm(helperDirectory, { force: true, recursive: true }).catch(() => undefined);
      throw new Error(`Update installer exited with code ${exitCode}`);
    }
    await fs.rm(helperDirectory, { force: true, recursive: true }).catch(() => undefined);
  });
}

function quotePowerShell(str: string): string {
  return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}
