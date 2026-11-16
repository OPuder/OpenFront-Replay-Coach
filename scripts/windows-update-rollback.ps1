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
  if($_.PSIsContainer){[pscustomobject]@{path=$rel;type='dir';length=0;hash=''}}
  else{[pscustomobject]@{path=$rel;type='file';length=$_.Length;hash=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}}
 } | Sort-Object path)
}
function Assert-Manifest($a,$b,[string]$where){
 $x=ConvertTo-Json -InputObject @($a) -Depth 5 -Compress; $y=ConvertTo-Json -InputObject @($b) -Depth 5 -Compress
 if($x -cne $y){$d=Compare-Object $a $b -Property path,type,length,hash | Out-String; throw "$where manifest mismatch: $d"}
}
function Mirror([string]$from,[string]$to){
 New-Item -ItemType Directory -Path $to -Force|Out-Null
 & robocopy.exe $from $to /MIR /COPY:DAT /DCOPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP
 if($LASTEXITCODE -ge 8){throw "robocopy failed: $LASTEXITCODE"}
}
$backup=Join-Path $env:TEMP ('ofrc-rollback-'+[guid]::NewGuid().ToString('N')); $stage=Join-Path $env:TEMP ('ofrc-stage-'+[guid]::NewGuid().ToString('N'))
$baseline=$null; $started=$false; $restored=$false; $updated=$false
try{
 if($ProcessId -gt 0){try{Wait-Process -Id $ProcessId -Timeout 120 -ErrorAction Stop}catch{if(Get-Process -Id $ProcessId -ErrorAction SilentlyContinue){throw 'Application did not exit'}}}
 if(!(Test-Path -LiteralPath $PackagePath -PathType Leaf)){throw 'Update package missing'}
 if(!(Test-Path -LiteralPath $Executable -PathType Leaf)){throw 'Installed executable missing'}
 $baseline=Manifest $Target; if($baseline.Count -eq 0){throw 'Install directory empty'}
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
 if($FailAfterMutation){
  $criticalArchive=Join-Path $Target 'resources/app.asar'
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
   Log 'ROLLBACK_BEGIN removing complete target tree'
   if(Test-Path -LiteralPath $Target){Remove-Item -LiteralPath $Target -Recurse -Force}
   New-Item -ItemType Directory -Path $Target -Force|Out-Null
   Mirror $backup $Target
   Assert-Manifest $baseline (Manifest $Target) 'Restored tree verification failed'
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
 if($updated -or $restored){Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue}
}
