param([Parameter(Mandatory=$true)][ValidateSet('Installer','Portable')][string]$Mode,[Parameter(Mandatory=$true)][string]$Target,[Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$PackagePath,[Parameter(Mandatory=$true)][string]$LogPath,[int]$ProcessId=0,[string]$StartupReadyPath='',[string]$ExpectedVersion='',[string]$PreviousVersion='',[switch]$FailAfterMutation,[switch]$CorruptBackupForTest)
$ErrorActionPreference='Stop'
$Target=[IO.Path]::GetFullPath($Target); $Executable=[IO.Path]::GetFullPath($Executable); $LogPath=[IO.Path]::GetFullPath($LogPath)
New-Item -ItemType Directory -Path (Split-Path -Parent $LogPath) -Force | Out-Null
function Log([string]$s){$line="[$(Get-Date -Format o)] $s"; Add-Content -LiteralPath $LogPath -Value $line; Write-Output $line}
function Get-LockOwners {
 $diagnostic=Join-Path $PSScriptRoot 'windows-process-lock-diagnostics.ps1'
 if(!(Test-Path -LiteralPath $diagnostic)){throw "Restart Manager diagnostic missing: $diagnostic"}
 $raw=& powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $diagnostic -Mode Inspect -Target $Target
 if($LASTEXITCODE -ne 0){throw "Restart Manager lock inspection failed: $LASTEXITCODE"}
 $json=($raw -join [Environment]::NewLine)
 if([string]::IsNullOrWhiteSpace($json)){return @()}
 $owners=@(ConvertFrom-Json -InputObject $json)
 foreach($owner in $owners){
  Log ("INSTALL_LOCK_OWNER pid={0} name={1} category={2} image={3} parent={4} appType={5} command={6}" -f $owner.processId,$owner.processName,$owner.category,$owner.executablePath,$owner.parentProcessId,$owner.applicationType,$owner.commandLine) | Out-Null
 }
 return $owners
}
function Manifest([string]$root){
 if(!(Test-Path -LiteralPath $root -PathType Container)){throw "Missing tree: $root"}
 $base=[IO.Path]::GetFullPath($root).TrimEnd('\')+'\'
 return ,@(Get-ChildItem -LiteralPath $root -Force -Recurse | ForEach-Object {
  $rel=$_.FullName.Substring($base.Length).Replace('\','/')
  if($_.PSIsContainer){[pscustomobject]@{path=$rel;type='dir';length=0;hash='';attributes=$_.Attributes.ToString();lastWriteUtc=$null}}
  else{[pscustomobject]@{path=$rel;type='file';length=$_.Length;hash=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant();attributes=$_.Attributes.ToString();lastWriteUtc=$_.LastWriteTimeUtc.ToString('o')}}
 } | Sort-Object path)
}
function Assert-Manifest($a,$b,[string]$where){
 $x=ConvertTo-Json -InputObject @($a) -Depth 5 -Compress; $y=ConvertTo-Json -InputObject @($b) -Depth 5 -Compress
 if($x -cne $y){$d=Compare-Object $a $b -Property path,type,length,hash,attributes,lastWriteUtc | Out-String; throw "$where manifest mismatch: $d"}
}
function Mirror([string]$from,[string]$to){
 New-Item -ItemType Directory -Path $to -Force|Out-Null
 & robocopy.exe $from $to /MIR /COPY:DAT /DCOPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP
 if($LASTEXITCODE -ge 8){throw "robocopy failed: $LASTEXITCODE"}
}
function Find-UninstallEntries {
 $roots=@(
  [pscustomobject]@{path='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall';native='HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall'},
  [pscustomobject]@{path='HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall';native='HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall'},
  [pscustomobject]@{path='HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall';native='HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'}
 )
 $entries=@()
 foreach($root in $roots){
  foreach($key in @(Get-ChildItem -LiteralPath $root.path -ErrorAction SilentlyContinue)){
   $props=Get-ItemProperty -LiteralPath $key.PSPath -ErrorAction SilentlyContinue
   if(!$props){continue}
   $installLocation=[string]$props.InstallLocation
   $uninstallString=[string]$props.UninstallString
   $displayIcon=[string]$props.DisplayIcon
   $targetReference=$false
   if($installLocation){
    try{if([IO.Path]::GetFullPath($installLocation).TrimEnd('\') -ieq $Target.TrimEnd('\')){$targetReference=$true}}catch{}
   }
   foreach($value in @($uninstallString,$displayIcon)){
    if($value -and $value.IndexOf($Target,[StringComparison]::OrdinalIgnoreCase) -ge 0){$targetReference=$true}
   }
   if($targetReference){
    $entries+=,[pscustomobject]@{
     path=$key.PSPath; name=$key.PSChildName; version=[string]$props.DisplayVersion
     nativeKey=($root.native+'\'+$key.PSChildName); displayName=[string]$props.DisplayName
    }
   }
  }
 }
 return $entries
}
function Stop-AppProcesses {
 $targetPrefix=$Target.TrimEnd('\')+'\'
 $preexistingOwners=@(Get-LockOwners)
 Log ("PRE_SHUTDOWN_LOCK_OWNER_COUNT count={0}" -f $preexistingOwners.Count) | Out-Null
 $snapshot=@(Get-CimInstance Win32_Process -ErrorAction Stop)
 $byId=@{}; foreach($item in $snapshot){$byId[[int]$item.ProcessId]=$item}
 $ownedIds=[Collections.Generic.HashSet[int]]::new()
 foreach($item in $snapshot){
  $path=[string]$item.ExecutablePath
  if(([int]$item.ProcessId -ne $PID) -and $path -and ($path -ieq $Executable -or $path.StartsWith($targetPrefix,[StringComparison]::OrdinalIgnoreCase))){
   [void]$ownedIds.Add([int]$item.ProcessId)
   Log ("APP_PROCESS_SELECTED pid={0} image={1} parent={2} command={3}" -f $item.ProcessId,$path,$item.ParentProcessId,$item.CommandLine) | Out-Null
  }
 }
 $changed=$true
 while($changed){
  $changed=$false
  foreach($item in $snapshot){
   $parent=[int]$item.ParentProcessId
   if($ownedIds.Contains($parent) -and !$ownedIds.Contains([int]$item.ProcessId)){
    [void]$ownedIds.Add([int]$item.ProcessId);$changed=$true
   }
  }
 }
 $processes=@($ownedIds | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
 foreach($process in $processes){
  try{if($process.MainWindowHandle -ne 0){[void]$process.CloseMainWindow()}}catch{}
 }
 foreach($process in $processes){
  try{Wait-Process -Id $process.Id -Timeout 20 -ErrorAction Stop}catch{}
 }
 foreach($id in $ownedIds){
  $remaining=Get-Process -Id $id -ErrorAction SilentlyContinue
  if($remaining){Stop-Process -Id $id -Force -ErrorAction Stop}
 }
 foreach($id in $ownedIds){
  try{Wait-Process -Id $id -Timeout 15 -ErrorAction Stop}catch{
   if(Get-Process -Id $id -ErrorAction SilentlyContinue){throw "Known application process $id remained alive after termination"}
  }
 }
 $owners=@(Get-LockOwners)
 foreach($owner in $owners){
  $ownerPid=[int]$owner.processId
  if($ownerPid -ne $PID -and $owner.category -in @('installer-or-uninstaller','updater-helper')){
   Log ("WAITING_FOR_INSTALLER_HELPER pid={0} category={1} image={2}" -f $ownerPid,$owner.category,$owner.executablePath) | Out-Null
   try{Wait-Process -Id $ownerPid -Timeout 120 -ErrorAction Stop}catch{
    if(Get-Process -Id $ownerPid -ErrorAction SilentlyContinue){throw "Installer/updater helper process $ownerPid still holds installation resources"}
   }
  }
 }
 $owners=@(Get-LockOwners)
 if($owners.Count -gt 0){
  $detail=($owners | ForEach-Object {"PID=$($_.processId) NAME=$($_.processName) TYPE=$($_.category) IMAGE=$($_.executablePath)"}) -join '; '
  throw "Installation files remain locked by process(es): $detail"
 }
 Log 'INSTALL_TREE_LOCKS_CLEARED verified_by_restart_manager'
}
function Start-And-ConfirmApp([string]$expectedVersion) {
 if([string]::IsNullOrWhiteSpace($StartupReadyPath)){
  Start-Process -FilePath $Executable|Out-Null
  Log 'APP_RESTART_STARTED_WITHOUT_READY_HANDSHAKE'
  return
 }
 if([string]::IsNullOrWhiteSpace($expectedVersion)){throw 'Expected app version is required for startup confirmation'}
 Remove-Item -LiteralPath $StartupReadyPath -Force -ErrorAction SilentlyContinue
 $appProcess=Start-Process -FilePath $Executable -PassThru -ErrorAction Stop
 $deadline=(Get-Date).AddSeconds(120)
 while((Get-Date) -lt $deadline){
  if(!(Get-Process -Id $appProcess.Id -ErrorAction SilentlyContinue)){
   throw "Application process $($appProcess.Id) exited before renderer startup confirmation"
  }
  if(Test-Path -LiteralPath $StartupReadyPath){
   try{$ready=Get-Content -LiteralPath $StartupReadyPath -Raw|ConvertFrom-Json}catch{$ready=$null}
   if($ready -and [string]$ready.version -eq $expectedVersion -and [int]$ready.processId -eq [int]$appProcess.Id){
    Log ("APP_RESTART_CONFIRMED pid={0} version={1} renderer_ready_at={2}" -f $appProcess.Id,$ready.version,$ready.confirmedAt)
    return
   }
  }
  Start-Sleep -Milliseconds 250
 }
 throw "Application process $($appProcess.Id) did not confirm renderer readiness for version $expectedVersion within 120 seconds"
}
$backup=Join-Path $env:TEMP ('ofrc-rollback-'+[guid]::NewGuid().ToString('N')); $stage=Join-Path $env:TEMP ('ofrc-stage-'+[guid]::NewGuid().ToString('N'))
$registryBackup=$backup+'.registry.reg'; $registryKeyPath=$null; $registryDisplayVersion=$null
$baseline=$null; $appStopped=$false; $started=$false; $restored=$false; $updated=$false
try{
 if($ProcessId -gt 0){try{Wait-Process -Id $ProcessId -Timeout 120 -ErrorAction Stop}catch{if(Get-Process -Id $ProcessId -ErrorAction SilentlyContinue){throw 'Application did not exit'}}}
 $appStopped=$true
 if(!(Test-Path -LiteralPath $PackagePath -PathType Leaf)){throw 'Update package missing'}
 if(!(Test-Path -LiteralPath $Executable -PathType Leaf)){throw 'Installed executable missing'}
 $baseline=Manifest $Target; if($baseline.Count -eq 0){throw 'Install directory empty'}
 $baselineAsar=$baseline | Where-Object { $_.path -eq 'resources/app.asar' -and $_.type -eq 'file' } | Select-Object -First 1
 if(!$baselineAsar){throw 'Baseline resources/app.asar missing'}
 if($Mode -eq 'Installer'){
  $registryEntries=@(Find-UninstallEntries)
  if($registryEntries.Count -gt 1){throw "Expected at most one uninstall registry entry referencing $Target; found $($registryEntries.Count)"}
  if($registryEntries.Count -eq 1){
   $registryKeyPath=$registryEntries[0].path; $registryDisplayVersion=[string]$registryEntries[0].version
   $nativeKey=$registryEntries[0].nativeKey
   & reg.exe export $nativeKey $registryBackup /y | Out-Null
   if($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $registryBackup)){throw 'Could not create installer uninstall-registry backup'}
   Log "REGISTRY_BACKUP_VERIFIED key=$nativeKey displayVersion=$registryDisplayVersion"
  }else{
   Log 'REGISTRY_BASELINE_NONE no uninstall entry referenced the isolated install directory'
  }
 }
 $baseline | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath ($LogPath+'.baseline-manifest.json')
 Mirror $Target $backup; $backupManifest=Manifest $backup
 $backupManifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath ($LogPath+'.backup-manifest.json')
 Assert-Manifest $baseline $backupManifest 'Backup verification failed'
 Log "BACKUP_VERIFIED $backup entries=$($baseline.Count)"
 Log 'STOPPING_OLD_APP_BEFORE_UPDATE'
 $started=$true
 Stop-AppProcesses
 if($Mode -eq 'Portable'){
  New-Item -ItemType Directory -Path $stage -Force|Out-Null; Expand-Archive -LiteralPath $PackagePath -DestinationPath $stage -Force
  $newExe=Get-ChildItem -LiteralPath $stage -Filter 'OpenFront Replay Coach.exe' -File -Recurse|Select-Object -First 1
  if(!$newExe){throw 'Portable archive executable missing'}
  & robocopy.exe $newExe.Directory.FullName $Target /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP
  if($LASTEXITCODE -ge 8){throw "Portable copy failed: $LASTEXITCODE"}
 }else{
  $installerProcess=Start-Process -FilePath $PackagePath -ArgumentList @('/S',"/D=$Target") -Wait -PassThru -ErrorAction Stop
  $installerExit=$installerProcess.ExitCode
  if($installerExit -ne 0){throw "Installer failed: $installerExit"}
 }
 Stop-AppProcesses
 $criticalArchive=Join-Path $Target 'resources/app.asar'
 if(!(Test-Path -LiteralPath $criticalArchive)){throw 'Updated resources/app.asar missing'}
 $updatedAsarHash=(Get-FileHash -LiteralPath $criticalArchive -Algorithm SHA256).Hash.ToLowerInvariant()
 if($updatedAsarHash -eq $baselineAsar.hash -and !$FailAfterMutation){throw 'Update did not replace app.asar; refusing to report an update transaction'}
 Log "UPDATE_FILES_CHANGED old_app_asar=$($baselineAsar.hash) new_app_asar=$updatedAsarHash"
 if($FailAfterMutation){
  $criticalExecutable=Join-Path $Target 'OpenFront Replay Coach.exe'
  if(!(Test-Path -LiteralPath $criticalArchive) -or !(Test-Path -LiteralPath $criticalExecutable)){throw 'Update package is missing critical app.asar/executable paths for failure injection'}
  Remove-Item -LiteralPath $criticalArchive -Force
  Set-Content -LiteralPath $criticalExecutable -Value 'CORRUPTED' -NoNewline
  Set-Content -LiteralPath (Join-Path $Target '__ROLLBACK_TEST_EXTRA_FILE__.txt') -Value 'extra' -NoNewline
  $extraDirectory=Join-Path $Target '__ROLLBACK_TEST_EXTRA_DIRECTORY__'
  New-Item -ItemType Directory -Path $extraDirectory -Force|Out-Null
  Set-Content -LiteralPath (Join-Path $extraDirectory 'nested-extra.txt') -Value 'extra-directory' -NoNewline
  Log 'FAILURE_INJECTED_AFTER_MUTATION deleted=1 corrupted=1 added_file=1 added_directory=1'
  if($CorruptBackupForTest){$backupAsar=Join-Path $backup 'resources/app.asar';Set-Content -LiteralPath $backupAsar -Value 'INTENTIONALLY_CORRUPTED_ROLLBACK_BACKUP' -NoNewline;Log 'TEST_ONLY_ROLLBACK_BACKUP_CORRUPTED'}
  throw 'Injected post-mutation failure'
 }
 if(!(Test-Path -LiteralPath $Executable)){throw 'Updated executable missing'}
 $updated=$true; Log 'UPDATE_OK'; Start-And-ConfirmApp $ExpectedVersion
}catch{
 Log ("UPDATE_FAILED "+($_|Out-String).Trim())
 if($started){
  try{
   Stop-AppProcesses
   $rollbackBackupManifest=Manifest $backup
   Assert-Manifest $baseline $rollbackBackupManifest 'Rollback backup verification failed before restore'
   Log "ROLLBACK_BACKUP_REVERIFIED entries=$($rollbackBackupManifest.Count)"
   Log 'ROLLBACK_BEGIN removing complete target tree'
   if(Test-Path -LiteralPath $Target){Remove-Item -LiteralPath $Target -Recurse -Force}
   New-Item -ItemType Directory -Path $Target -Force|Out-Null
   Mirror $backup $Target
   $restoredManifest=Manifest $Target
   Assert-Manifest $baseline $restoredManifest 'Restored tree verification failed'
   $currentRegistryEntries=@(Find-UninstallEntries)
   foreach($entry in $currentRegistryEntries){
    Remove-Item -LiteralPath $entry.path -Recurse -Force
    Log "REGISTRY_REMOVED_UPDATE_ENTRY key=$($entry.nativeKey)"
   }
   if($registryKeyPath){
    & reg.exe import $registryBackup | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Could not restore previous Windows uninstall registry metadata'}
    $restoredEntries=@(Find-UninstallEntries)
    if($restoredEntries.Count -ne 1){throw "Expected one restored uninstall registry entry; found $($restoredEntries.Count)"}
    $restoredRegistry=Get-ItemProperty -LiteralPath $registryKeyPath
    if([string]$restoredRegistry.DisplayVersion -ne $registryDisplayVersion){throw 'Restored uninstall registry DisplayVersion does not match baseline'}
    Log "REGISTRY_ROLLBACK_VERIFIED displayVersion=$($restoredRegistry.DisplayVersion)"
   }else{
    $remainingEntries=@(Find-UninstallEntries)
    if($remainingEntries.Count -ne 0){throw "Rollback left $($remainingEntries.Count) new uninstall registry entries"}
    Log 'REGISTRY_ROLLBACK_VERIFIED baseline=none'
   }
   $restored=$true
   $restoredManifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath ($LogPath+'.restored-manifest.json')
   Log "ROLLBACK_VERIFIED complete_inventory_hashes=$($baseline.Count)"
   Start-And-ConfirmApp $PreviousVersion
   Log 'ROLLBACK_COLD_START_CONFIRMED'
  }catch{Log ("ROLLBACK_FATAL "+($_|Out-String).Trim()); Log "BACKUP_RETAINED $backup"; exit 90}
 }else{if($null -ne $baseline){Assert-Manifest $baseline (Manifest $Target) 'Pre-update tree changed'};$restored=$true}
 if(!$started -and $appStopped -and (Test-Path -LiteralPath $Executable)){Start-And-ConfirmApp $PreviousVersion;Log 'BASELINE_COLD_START_CONFIRMED'}
 if($restored){Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue}
 exit 1
}finally{
 Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
 if($updated -or $restored){
  Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $registryBackup -Force -ErrorAction SilentlyContinue
 }
}
