param([string]$Installer,[string]$PortableZip,[string]$PreviousInstaller,[string]$PreviousPortableZip,[string]$Helper)
$ErrorActionPreference='Stop'; $root=Join-Path $env:RUNNER_TEMP ('ofrc-rollback-'+[guid]::NewGuid().ToString('N')); New-Item -ItemType Directory $root|Out-Null
function Start-Check($exe,$label,$userDataRoot,$runId,$evidencePath){
 & node scripts/windows-profile-storage.mjs verify $exe $userDataRoot $runId $evidencePath
 if($LASTEXITCODE -ne 0){throw "$label failed renderer restart or LocalStorage/IndexedDB verification"}
 if((Get-Content (Join-Path $userDataRoot 'rollback-user-data-sentinel.txt') -Raw).Trim() -ne "$label-$runId-user-data-preserved"){throw "$label user-data file sentinel changed"}
 Write-Host "ROLLBACK_RESTART_AND_WEB_STORAGE_OK $label profile=$userDataRoot"
}
function Get-AppMetadata($installRoot){
 $asar=Join-Path $installRoot 'resources/app.asar'
 if(!(Test-Path -LiteralPath $asar)){throw "Packaged app.asar missing: $asar"}
 $json=(& node -e "const a=require('@electron/asar');process.stdout.write(a.extractFile(process.argv[1],'package.json').toString())" $asar | Out-String)
 if($LASTEXITCODE -ne 0){throw 'Could not read package.json from app.asar'}
 if([string]::IsNullOrWhiteSpace($json)){throw 'Packaged app.asar package.json is empty'}
 $metadata=ConvertFrom-Json -InputObject $json
 if([string]::IsNullOrWhiteSpace([string]$metadata.version)){throw 'Packaged app.asar has no application version'}
 return $metadata
}
function Get-AppVersion($installRoot){return [string](Get-AppMetadata $installRoot).version}
function Prepare-UserData($exe,$appDataRoot,$label,$appName,$runId,$evidencePath){
 $env:APPDATA=$appDataRoot; New-Item -ItemType Directory -Path $appDataRoot -Force|Out-Null
 $userDataRoot=Join-Path $appDataRoot $appName
 if(Test-Path -LiteralPath $userDataRoot){throw "$label isolated profile already exists"}
 New-Item -ItemType Directory -Path $userDataRoot -Force|Out-Null
 Set-Content -LiteralPath (Join-Path $userDataRoot 'rollback-user-data-sentinel.txt') -Value "$($label)-$runId-user-data-preserved"
 & node scripts/windows-profile-storage.mjs seed $exe $userDataRoot $runId $evidencePath
 if($LASTEXITCODE -ne 0){throw "$label could not seed real Chromium LocalStorage and IndexedDB"}
 return $userDataRoot
}
try{
 $it=Join-Path $root 'installer'
 $baselineInstallLog=Join-Path $root 'baseline-installer.log'
 "BASELINE_INSTALLER=$PreviousInstaller TARGET=$it" | Set-Content -LiteralPath $baselineInstallLog
 $installerExit=-1
 for($attempt=1;$attempt -le 2;$attempt++){
  try{
   $p=Start-Process -FilePath $PreviousInstaller -ArgumentList @('/S',"/D=$it") -Wait -PassThru -ErrorAction Stop
   $installerExit=$p.ExitCode
  }catch{
   ($_|Out-String) | Add-Content -LiteralPath $baselineInstallLog
  }
  "ATTEMPT=$attempt EXIT=$installerExit" | Add-Content -LiteralPath $baselineInstallLog
  if($installerExit -eq 0){break}
  Start-Sleep -Seconds 3
 }
 if($installerExit -ne 0){
  $events=Get-WinEvent -FilterHashtable @{LogName='Application';Id=1000,1001;StartTime=(Get-Date).AddMinutes(-10)} -ErrorAction SilentlyContinue | Select-Object -First 10 | Format-List TimeCreated,Id,ProviderName,Message | Out-String
  $events | Add-Content -LiteralPath $baselineInstallLog
  Write-Host "BASELINE_INSTALLER_DIAGNOSTICS=$baselineInstallLog"
  throw "Baseline installer failed after two attempts: $installerExit"
 }
 $ie=Join-Path $it 'OpenFront Replay Coach.exe'; if(!(Test-Path $ie)){throw 'Baseline installer exe missing'}
 $installerMetadata=Get-AppMetadata $it
 $installerVersion=[string]$installerMetadata.version
 if($installerVersion -ne '2.2.51'){throw "Expected installer baseline 2.2.51, got $installerVersion"}
 $installerAppName=[string]$installerMetadata.productName
 if([string]::IsNullOrWhiteSpace($installerAppName)){$installerAppName=[string]$installerMetadata.name}
 if([string]::IsNullOrWhiteSpace($installerAppName)){throw 'Baseline installer package has no Electron app name'}
 $installerRunId=[guid]::NewGuid().ToString('N')
 $installerProfileEvidence=Join-Path $root 'installer-profile-evidence.json'
 $installerUserDataRoot=Prepare-UserData $ie (Join-Path $root 'installer-appdata') 'installer' $installerAppName $installerRunId $installerProfileEvidence
 Set-Content (Join-Path $it 'test-extra-sentinel') 'preserve-me'; $ilog=Join-Path $root 'installer.log'
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Helper -Mode Installer -Target $it -Executable $ie -PackagePath $Installer -LogPath $ilog -FailAfterMutation
 if($LASTEXITCODE -ne 1){throw "Installer rollback exit was $LASTEXITCODE"}
 if((Get-AppVersion $it) -ne $installerVersion){throw 'Installer rollback did not restore old application version'}
 $registryWasAbsent=Select-String -LiteralPath $ilog -Pattern 'REGISTRY_BASELINE_NONE' -Quiet
 if($registryWasAbsent){
  if(!(Select-String -LiteralPath $ilog -Pattern 'REGISTRY_ROLLBACK_VERIFIED baseline=none' -Quiet)){throw 'Installer rollback did not preserve the baseline absence of uninstall registry metadata'}
 }else{
  if(!(Select-String -LiteralPath $ilog -Pattern 'REGISTRY_BACKUP_VERIFIED' -Quiet)){throw 'Installer rollback did not capture the baseline uninstall registry metadata'}
  if(!(Select-String -LiteralPath $ilog -Pattern 'REGISTRY_ROLLBACK_VERIFIED displayVersion=' -Quiet)){throw 'Installer rollback did not restore the baseline uninstall registry metadata'}
 }
 if(Test-Path (Join-Path $it '__ROLLBACK_TEST_EXTRA_FILE__.txt')){throw 'Installer left injected extra file'}
 if(Test-Path (Join-Path $it '__ROLLBACK_TEST_EXTRA_DIRECTORY__')){throw 'Installer left injected extra directory'}
 if((Get-Content (Join-Path $it 'test-extra-sentinel') -Raw).Trim() -ne 'preserve-me'){throw 'Installer did not restore extra baseline file'}
 
 if(!(Select-String -LiteralPath $ilog -Pattern 'FAILURE_INJECTED_AFTER_MUTATION' -Quiet)){throw 'Installer did not reach controlled post-mutation failure injection'}
 if(!(Select-String -LiteralPath $ilog -Pattern 'ROLLBACK_VERIFIED' -Quiet)){throw 'Installer complete manifest/hash proof missing'}
 if(!(Test-Path ($ilog+'.baseline-manifest.json')) -or !(Test-Path ($ilog+'.restored-manifest.json'))){throw 'Installer baseline/restored manifests missing'}
 Start-Check $ie 'installer' $installerUserDataRoot $installerRunId $installerProfileEvidence; Write-Host "WINDOWS_INSTALLER_ROLLBACK_OK log=$ilog"
 $pt=Join-Path $root 'portable'; New-Item -ItemType Directory $pt|Out-Null; Expand-Archive $PreviousPortableZip $pt
 $peItem=Get-ChildItem $pt -Filter 'OpenFront Replay Coach.exe' -File -Recurse|Select-Object -First 1; if(!$peItem){throw 'Portable executable missing'}
 $pe=$peItem.FullName; $pr=$peItem.Directory.FullName
 $portableMetadata=Get-AppMetadata $pr
 $portableVersion=[string]$portableMetadata.version
 if($portableVersion -ne '2.2.51'){throw "Expected portable baseline 2.2.51, got $portableVersion"}
 $portableAppName=[string]$portableMetadata.productName
 if([string]::IsNullOrWhiteSpace($portableAppName)){$portableAppName=[string]$portableMetadata.name}
 if([string]::IsNullOrWhiteSpace($portableAppName)){throw 'Baseline portable package has no Electron app name'}
 $currentStage=Join-Path $root 'current-portable-version'; Expand-Archive $PortableZip $currentStage
 $currentExe=Get-ChildItem $currentStage -Filter 'OpenFront Replay Coach.exe' -File -Recurse|Select-Object -First 1
 if(!$currentExe){throw 'Current portable package executable missing'}
 $currentVersion=Get-AppVersion $currentExe.Directory.FullName
 if([version]$currentVersion -le [version]$portableVersion){throw "Current package version $currentVersion is not newer than baseline $portableVersion"}
 Set-Content (Join-Path $pr 'test-extra-sentinel') 'preserve-me'
 $portableRunId=[guid]::NewGuid().ToString('N')
 $portableProfileEvidence=Join-Path $root 'portable-profile-evidence.json'
 $portableUserDataRoot=Prepare-UserData $pe (Join-Path $root 'portable-appdata') 'portable' $portableAppName $portableRunId $portableProfileEvidence; $plog=Join-Path $root 'portable.log'
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Helper -Mode Portable -Target $pr -Executable $pe -PackagePath $PortableZip -LogPath $plog -FailAfterMutation
 if($LASTEXITCODE -ne 1){throw "Portable rollback exit was $LASTEXITCODE"}
 if((Get-AppVersion $pr) -ne $portableVersion){throw 'Portable rollback did not restore old application version'}
 if(Test-Path (Join-Path $pr '__ROLLBACK_TEST_EXTRA_FILE__.txt')){throw 'Portable left injected extra file'}
 if(Test-Path (Join-Path $pr '__ROLLBACK_TEST_EXTRA_DIRECTORY__')){throw 'Portable left injected extra directory'}
 if((Get-Content (Join-Path $pr 'test-extra-sentinel') -Raw).Trim() -ne 'preserve-me'){throw 'Portable did not restore extra baseline file'}
 
 if(!(Select-String -LiteralPath $plog -Pattern 'FAILURE_INJECTED_AFTER_MUTATION' -Quiet)){throw 'Portable did not reach controlled post-mutation failure injection'}
 if(!(Select-String -LiteralPath $plog -Pattern 'ROLLBACK_VERIFIED' -Quiet)){throw 'Portable complete manifest/hash proof missing'}
 if(!(Test-Path ($plog+'.baseline-manifest.json')) -or !(Test-Path ($plog+'.restored-manifest.json'))){throw 'Portable baseline/restored manifests missing'}
 Start-Check $pe 'portable' $portableUserDataRoot $portableRunId $portableProfileEvidence; Write-Host "WINDOWS_PORTABLE_ROLLBACK_OK log=$plog"; Write-Host "WINDOWS_ROLLBACK_E2E_OK data=$root"
}catch{Write-Error $_; Write-Host "DIAGNOSTICS_RETAINED $root";throw}
