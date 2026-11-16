param([Parameter(Mandatory=$true)][ValidateSet('Installer','Portable')][string]$Mode,[Parameter(Mandatory=$true)][string]$Target,[Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$PackagePath,[Parameter(Mandatory=$true)][string]$LogPath,[int]$ProcessId=0,[switch]$FailAfterMutation)
$ErrorActionPreference='Stop'
$Target=[IO.Path]::GetFullPath($Target); $Executable=[IO.Path]::GetFullPath($Executable); $LogPath=[IO.Path]::GetFullPath($LogPath)
New-Item -ItemType Directory -Path (Split-Path -Parent $LogPath) -Force | Out-Null
function Log([string]$s){$line="[$(Get-Date -Format o)] $s"; Add-Content -LiteralPath $LogPath -Value $line; Write-Output $line}
function Manifest([string]$root){
 if(!(Test-Path -LiteralPath $root -PathType Container)){throw "Missing tree: $root"}
 $base=[IO.Path]::GetFullPath($root).TrimEnd('\')+'\'
 return ,@(Get-ChildItem -LiteralPath $root -Force -Recurse | ForEach-Object {
  $rel=$_.FullName.Substring($base.Length).Replace('\','/')
  if($_.PSIsContainer){[pscustomobject]@{path=$rel;type='dir';length=0;hash='';attributes=$_.Attributes.ToString();lastWriteUtc=$_.LastWriteTimeUtc.ToString('o')}}
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
function Stop-AppProcesses {
 Get-Process -Name 'OpenFront Replay Coach' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
 Start-Sleep -Milliseconds 500
}
$backup=Join-Path $env:TEMP ('ofrc-rollback-'+[guid]::NewGuid().ToString('N')); $stage=Join-Path $env:TEMP ('ofrc-stage-'+[guid]::NewGuid().ToString('N'))
$registryBackup=$backup+'.registry.reg'; $registryKeyPath=$null; $registryDisplayVersion=$null
$baseline=$null; $started=$false; $restored=$false; $updated=$false
try{
 if($ProcessId -gt 0){try{Wait-Process -Id $ProcessId -Timeout 120 -ErrorAction Stop}catch{if(Get-Process -Id $ProcessId -ErrorAction SilentlyContinue){throw 'Application did not exit'}}}
 if(!(Test-Path -LiteralPath $PackagePath -PathType Leaf)){throw 'Update package missing'}
 if(!(Test-Path -LiteralPath $Executable -PathType Leaf)){throw 'Installed executable missing'}
 $baseline=Manifest $Target; if($baseline.Count -eq 0){throw 'Install directory empty'}
 $baselineAsar=$baseline | Where-Object { $_.path -eq 'resources/app.asar' -and $_.type -eq 'file' } | Select-Object -First 1
 if(!$baselineAsar){throw 'Baseline resources/app.asar missing'}
 if($Mode -eq 'Installer'){
  $uninstallRoots=@(
   [pscustomobject]@{path='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall';native='HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall'},
   [pscustomobject]@{path='HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall';native='HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall'},
   [pscustomobject]@{path='HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall';native='HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'}
  )
  $matches=@(foreach($root in $uninstallRoots){Get-ChildItem -LiteralPath $root.path -ErrorAction SilentlyContinue | ForEach-Object {
   $props=Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
   if($props.DisplayName -eq 'OpenFront Replay Coach'){
    $installLocation=[string]$props.InstallLocation; $uninstallString=[string]$props.UninstallString; $displayIcon=[string]$props.DisplayIcon
    $targetReference=($installLocation -and ([IO.Path]::GetFullPath($installLocation).TrimEnd('\') -ieq $Target.TrimEnd('\'))) -or
     ($uninstallString -and $uninstallString.IndexOf($Target,[StringComparison]::OrdinalIgnoreCase) -ge 0) -or
     ($displayIcon -and $displayIcon.IndexOf($Target,[StringComparison]::OrdinalIgnoreCase) -ge 0)
    if($targetReference){[pscustomobject]@{path=$_.PSPath;name=$_.PSChildName;version=$props.DisplayVersion;nativeKey=($root.native+'\'+$_.PSChildName)}}
   }
  }})
  if($matches.Count -ne 1){throw "Expected exactly one uninstall registry entry referencing $Target; found $($matches.Count)"}
  $registryKeyPath=$matches[0].path; $registryDisplayVersion=[string]$matches[0].version
  $nativeKey=$matches[0].nativeKey
  & reg.exe export $nativeKey $registryBackup /y | Out-Null
  if($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $registryBackup)){throw 'Could not create installer uninstall-registry backup'}
  Log "REGISTRY_BACKUP_VERIFIED key=$nativeKey displayVersion=$registryDisplayVersion"
 }
 $baseline | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath ($LogPath+'.baseline-manifest.json')
 Mirror $Target $backup; $backupManifest=Manifest $backup
 $backupManifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath ($LogPath+'.backup-manifest.json')
 Assert-Manifest $baseline $backupManifest 'Backup verification failed'
 Log "BACKUP_VERIFIED $backup entries=$($baseline.Count)"
 if($Mode -eq 'Portable'){
  New-Item -ItemType Directory -Path $stage -Force|Out-Null; Expand-Archive -LiteralPath $PackagePath -DestinationPath $stage -Force
  $newExe=Get-ChildItem -LiteralPath $stage -Filter 'OpenFront Replay Coach.exe' -File -Recurse|Select-Object -First 1
  if(!$newExe){throw 'Portable archive executable missing'}
  $started=$true; & robocopy.exe $newExe.Directory.FullName $Target /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP
  if($LASTEXITCODE -ge 8){throw "Portable copy failed: $LASTEXITCODE"}
 }else{
  $started=$true; & $PackagePath '/S' "/D=$Target"
  $installerExit=$LASTEXITCODE
  if($installerExit -ne 0){throw "Installer failed: $installerExit"}
 }
 Stop-AppProcesses
 $criticalArchive=Join-Path $Target 'resources/app.asar'
 if(!(Test-Path -LiteralPath $criticalArchive)){throw 'Updated resources/app.asar missing'}
 $updatedAsarHash=(Get-FileHash -LiteralPath $criticalArchive -Algorithm SHA256).Hash.ToLowerInvariant()
 if($updatedAsarHash -eq $baselineAsar.hash){throw 'Update did not replace app.asar; refusing to report an update transaction'}
 Log "UPDATE_FILES_CHANGED old_app_asar=$($baselineAsar.hash) new_app_asar=$updatedAsarHash"
 if($FailAfterMutation){
  $criticalExecutable=Join-Path $Target 'OpenFront Replay Coach.exe'
  if(!(Test-Path -LiteralPath $criticalArchive) -or !(Test-Path -LiteralPath $criticalExecutable)){throw 'Update package is missing critical app.asar/executable paths for failure injection'}
  Remove-Item -LiteralPath $criticalArchive -Force
  Set-Content -LiteralPath $criticalExecutable -Value 'CORRUPTED' -NoNewline
  Set-Content -LiteralPath (Join-Path $Target '__ROLLBACK_TEST_EXTRA_FILE__.txt') -Value 'extra' -NoNewline
  Log 'FAILURE_INJECTED_AFTER_MUTATION deleted=1 corrupted=1 added=1'
  throw 'Injected post-mutation failure'
 }
 if(!(Test-Path -LiteralPath $Executable)){throw 'Updated executable missing'}
 $updated=$true; Log 'UPDATE_OK'; Start-Process -FilePath $Executable|Out-Null
}catch{
 Log ("UPDATE_FAILED "+($_|Out-String).Trim())
 if($started){
  try{
   Stop-AppProcesses
   Log 'ROLLBACK_BEGIN removing complete target tree'
   if(Test-Path -LiteralPath $Target){Remove-Item -LiteralPath $Target -Recurse -Force}
   New-Item -ItemType Directory -Path $Target -Force|Out-Null
   Mirror $backup $Target
   $restoredManifest=Manifest $Target
   Assert-Manifest $baseline $restoredManifest 'Restored tree verification failed'
   if($registryKeyPath){
    if(Test-Path -LiteralPath $registryKeyPath){Remove-Item -LiteralPath $registryKeyPath -Recurse -Force}
    & reg.exe import $registryBackup | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Could not restore previous Windows uninstall registry metadata'}
    $restoredRegistry=Get-ItemProperty -LiteralPath $registryKeyPath
    if([string]$restoredRegistry.DisplayVersion -ne $registryDisplayVersion){throw 'Restored uninstall registry DisplayVersion does not match baseline'}
    Log "REGISTRY_ROLLBACK_VERIFIED displayVersion=$($restoredRegistry.DisplayVersion)"
   }
   $restored=$true
   $restoredManifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath ($LogPath+'.restored-manifest.json')
   Log "ROLLBACK_VERIFIED complete_inventory_hashes=$($baseline.Count)"
  }catch{Log ("ROLLBACK_FATAL "+($_|Out-String).Trim()); Log "BACKUP_RETAINED $backup"; exit 90}
 }else{if($null -ne $baseline){Assert-Manifest $baseline (Manifest $Target) 'Pre-update tree changed'};$restored=$true}
 if($restored -and (Test-Path -LiteralPath $Executable)){Log 'RELAUNCH_RESTORED_VERSION';Start-Process -FilePath $Executable|Out-Null}
 if($restored){Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue}
 exit 1
}finally{
 Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
 if($updated -or $restored){
  Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $registryBackup -Force -ErrorAction SilentlyContinue
 }
}
