param([string]$Installer,[string]$PortableZip,[string]$PreviousInstaller,[string]$PreviousPortableZip,[string]$Helper)
$ErrorActionPreference='Stop'
$root=Join-Path $env:RUNNER_TEMP ('ofrc-rollback-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root|Out-Null

function Get-AppMetadata([string]$installRoot){
 $asar=Join-Path $installRoot 'resources/app.asar'
 if(!(Test-Path -LiteralPath $asar)){throw "Packaged app.asar missing: $asar"}
 $json=(& node -e "const a=require('@electron/asar');process.stdout.write(a.extractFile(process.argv[1],'package.json').toString())" $asar | Out-String)
 if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($json)){throw 'Could not read package.json from app.asar'}
 $metadata=ConvertFrom-Json -InputObject $json
 if([string]::IsNullOrWhiteSpace([string]$metadata.version)){throw 'Packaged app.asar has no version'}
 return $metadata
}
function Get-AppVersion([string]$installRoot){return [string](Get-AppMetadata $installRoot).version}
function Prepare-UserData([string]$exe,[string]$appDataRoot,[string]$label,[string]$appName,[string]$runId,[string]$evidencePath){
 $env:APPDATA=$appDataRoot
 New-Item -ItemType Directory -Path $appDataRoot -Force|Out-Null
 $profile=Join-Path $appDataRoot $appName
 if(Test-Path -LiteralPath $profile){throw "$label profile already exists; refusing reuse"}
 New-Item -ItemType Directory -Path $profile -Force|Out-Null
 Set-Content -LiteralPath (Join-Path $profile 'rollback-user-data-sentinel.txt') -Value "$label-$runId-user-data-preserved"
 & node scripts/windows-profile-storage.mjs seed $exe $profile $runId $evidencePath | ForEach-Object { Write-Host $_ }
 if($LASTEXITCODE -ne 0){throw "$label could not seed real Chromium LocalStorage and IndexedDB"}
 return $profile
}
function Start-Check([string]$exe,[string]$label,[string]$profile,[string]$runId,[string]$evidencePath){
 & node scripts/windows-profile-storage.mjs verify $exe $profile $runId $evidencePath
 if($LASTEXITCODE -ne 0){throw "$label failed renderer restart or LocalStorage/IndexedDB verification"}
 $sentinel=(Get-Content (Join-Path $profile 'rollback-user-data-sentinel.txt') -Raw).Trim()
 if($sentinel -ne "$label-$runId-user-data-preserved"){throw "$label user-data file sentinel changed"}
 Write-Host "ROLLBACK_RESTART_AND_WEB_STORAGE_OK $label profile=$profile"
}
function Copy-InstallTree([string]$source,[string]$destination){
 New-Item -ItemType Directory -Path $destination -Force|Out-Null
 & robocopy.exe $source $destination /MIR /COPY:DAT /DCOPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP
 if($LASTEXITCODE -ge 8){throw "Could not create isolated negative-test copy: $LASTEXITCODE"}
}
function Assert-ExpectedRollback([string]$target,[string]$exe,[string]$mode,[string]$package,[string]$log,[string]$expectedExit,[string]$label){
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Helper -Mode $mode -Target $target -Executable $exe -PackagePath $package -LogPath $log -FailAfterMutation
 if($LASTEXITCODE -ne [int]$expectedExit){throw "$label expected helper exit $expectedExit, got $LASTEXITCODE"}
 if(!(Select-String -LiteralPath $log -Pattern 'FAILURE_INJECTED_AFTER_MUTATION' -Quiet)){throw "$label did not fail after file mutations"}
 if(!(Select-String -LiteralPath $log -Pattern 'ROLLBACK_VERIFIED' -Quiet)){throw "$label complete inventory/hash rollback verification missing"}
 if(!(Test-Path ($log+'.baseline-manifest.json')) -or !(Test-Path ($log+'.restored-manifest.json'))){throw "$label baseline/restored file manifests missing"}
}
function Assert-FailedRestore([string]$target,[string]$exe,[string]$mode,[string]$package,[string]$log,[string]$label,[string]$profile,[string]$runId,[string]$evidencePath,[string]$originalExe){
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Helper -Mode $mode -Target $target -Executable $exe -PackagePath $package -LogPath $log -FailAfterMutation -CorruptBackupForTest
 if($LASTEXITCODE -ne 90){throw "$label damaged-backup rollback should fail closed with exit 90; got $LASTEXITCODE"}
 if(!(Select-String -LiteralPath $log -Pattern 'TEST_ONLY_ROLLBACK_BACKUP_CORRUPTED' -Quiet) -or !(Select-String -LiteralPath $log -Pattern 'ROLLBACK_FATAL' -Quiet)){throw "$label failed-rollback diagnostics missing"}
 Start-Check $originalExe $label $profile $runId $evidencePath
 $retained=Select-String -LiteralPath $log -Pattern 'BACKUP_RETAINED (.+)$' | Select-Object -Last 1
 if($retained){Remove-Item -LiteralPath $retained.Matches[0].Groups[1].Value -Recurse -Force -ErrorAction SilentlyContinue}
}
try{
 # Windows Installer: install and start the published 2.2.51 baseline into an isolated directory.
 $installerTarget=Join-Path $root 'installer'
 $baselineInstallerLog=Join-Path $root 'baseline-installer.log'
 $installExit=-1
 for($attempt=1;$attempt -le 2;$attempt++){
  try{$p=Start-Process -FilePath $PreviousInstaller -ArgumentList @('/S',"/D=$installerTarget") -Wait -PassThru -ErrorAction Stop;$installExit=$p.ExitCode}
  catch{($_|Out-String)|Add-Content -LiteralPath $baselineInstallerLog}
  "ATTEMPT=$attempt EXIT=$installExit" | Add-Content -LiteralPath $baselineInstallerLog
  if($installExit -eq 0){break}
  Start-Sleep -Seconds 3
 }
 if($installExit -ne 0){throw "Published Windows baseline installer failed: $installExit"}
 $installerExe=Join-Path $installerTarget 'OpenFront Replay Coach.exe'
 if(!(Test-Path $installerExe)){throw 'Baseline installer executable missing'}
 $installerMeta=Get-AppMetadata $installerTarget
 $installerVersion=[string]$installerMeta.version
 if($installerVersion -ne '2.2.51'){throw "Expected installer baseline 2.2.51, got $installerVersion"}
 $installerAppName=[string]$installerMeta.productName
 if([string]::IsNullOrWhiteSpace($installerAppName)){$installerAppName=[string]$installerMeta.name}
 if([string]::IsNullOrWhiteSpace($installerAppName)){throw 'Baseline installer app name missing'}
 $installerRunId=[guid]::NewGuid().ToString('N')
 $installerProfileEvidence=Join-Path $root 'installer-profile-evidence.json'
 $installerProfile=Prepare-UserData $installerExe (Join-Path $root 'installer-appdata') 'installer' $installerAppName $installerRunId $installerProfileEvidence
 Set-Content (Join-Path $installerTarget 'test-extra-sentinel') 'preserve-me'
 $installerLog=Join-Path $root 'installer.log'
 Assert-ExpectedRollback $installerTarget $installerExe Installer $Installer $installerLog 1 'Installer'
 if((Get-AppVersion $installerTarget) -ne $installerVersion){throw 'Installer rollback did not restore 2.2.51'}
 if(Test-Path (Join-Path $installerTarget '__ROLLBACK_TEST_EXTRA_FILE__.txt')){throw 'Installer left injected extra file'}
 if(Test-Path (Join-Path $installerTarget '__ROLLBACK_TEST_EXTRA_DIRECTORY__')){throw 'Installer left injected extra directory'}
 if((Get-Content (Join-Path $installerTarget 'test-extra-sentinel') -Raw).Trim() -ne 'preserve-me'){throw 'Installer did not restore baseline sentinel file'}
 if(!(Select-String -LiteralPath $installerLog -Pattern 'REGISTRY_BACKUP_VERIFIED' -Quiet) -or !(Select-String -LiteralPath $installerLog -Pattern 'REGISTRY_ROLLBACK_VERIFIED displayVersion=' -Quiet)){throw 'Installer uninstall registry metadata was not backed up and restored'}
 Start-Check $installerExe 'installer' $installerProfile $installerRunId $installerProfileEvidence
 Write-Host "WINDOWS_INSTALLER_ROLLBACK_OK log=$installerLog"

 # A truncated installer must fail and restore the complete baseline on a disposable copy.
 $badInstaller=Join-Path $root 'incomplete-installer.exe'
 $installerBytes=[IO.File]::ReadAllBytes($Installer)
 $prefixLength=[Math]::Min(2048,$installerBytes.Length)
 $prefix=New-Object byte[] $prefixLength
 [Array]::Copy($installerBytes,$prefix,$prefixLength)
 [IO.File]::WriteAllBytes($badInstaller,$prefix)
 $badInstallerTarget=Join-Path $root 'installer-incomplete-package-target'
 Copy-InstallTree $installerTarget $badInstallerTarget
 $badInstallerLog=Join-Path $root 'installer-incomplete-package.log'
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Helper -Mode Installer -Target $badInstallerTarget -Executable (Join-Path $badInstallerTarget 'OpenFront Replay Coach.exe') -PackagePath $badInstaller -LogPath $badInstallerLog
 if($LASTEXITCODE -ne 1 -or !(Select-String -LiteralPath $badInstallerLog -Pattern 'ROLLBACK_VERIFIED' -Quiet)){throw 'Truncated installer package was not rejected with a verified restore'}
 if((Get-AppVersion $badInstallerTarget) -ne $installerVersion){throw 'Truncated installer package changed baseline version'}
 Start-Check $installerExe 'installer' $installerProfile $installerRunId $installerProfileEvidence

 # A corrupted rollback backup must fail closed without touching the real user profile.
 $failedInstallerTarget=Join-Path $root 'installer-failed-restore-target'
 Copy-InstallTree $installerTarget $failedInstallerTarget
 Assert-FailedRestore $failedInstallerTarget (Join-Path $failedInstallerTarget 'OpenFront Replay Coach.exe') Installer $Installer (Join-Path $root 'installer-failed-restore.log') 'installer' $installerProfile $installerRunId $installerProfileEvidence $installerExe

 # Windows Portable: independently extract, seed a second profile and test its update path.
 $portableRoot=Join-Path $root 'portable'
 New-Item -ItemType Directory -Path $portableRoot|Out-Null
 Expand-Archive -LiteralPath $PreviousPortableZip -DestinationPath $portableRoot
 $portableExeItem=Get-ChildItem -LiteralPath $portableRoot -Filter 'OpenFront Replay Coach.exe' -File -Recurse|Select-Object -First 1
 if(!$portableExeItem){throw 'Baseline portable executable missing'}
 $portableExe=$portableExeItem.FullName
 $portableTarget=$portableExeItem.Directory.FullName
 $portableMeta=Get-AppMetadata $portableTarget
 $portableVersion=[string]$portableMeta.version
 if($portableVersion -ne '2.2.51'){throw "Expected portable baseline 2.2.51, got $portableVersion"}
 $portableAppName=[string]$portableMeta.productName
 if([string]::IsNullOrWhiteSpace($portableAppName)){$portableAppName=[string]$portableMeta.name}
 if([string]::IsNullOrWhiteSpace($portableAppName)){throw 'Baseline portable app name missing'}
 $currentPortable=Join-Path $root 'current-portable'
 Expand-Archive -LiteralPath $PortableZip -DestinationPath $currentPortable
 $currentPortableExe=Get-ChildItem -LiteralPath $currentPortable -Filter 'OpenFront Replay Coach.exe' -File -Recurse|Select-Object -First 1
 if(!$currentPortableExe){throw 'Current portable package executable missing'}
 $currentVersion=Get-AppVersion $currentPortableExe.Directory.FullName
 if([version]$currentVersion -le [version]$portableVersion){throw "Current portable package version $currentVersion is not newer than $portableVersion"}
 $portableRunId=[guid]::NewGuid().ToString('N')
 $portableProfileEvidence=Join-Path $root 'portable-profile-evidence.json'
 $portableProfile=Prepare-UserData $portableExe (Join-Path $root 'portable-appdata') 'portable' $portableAppName $portableRunId $portableProfileEvidence
 Set-Content (Join-Path $portableTarget 'test-extra-sentinel') 'preserve-me'
 $portableLog=Join-Path $root 'portable.log'
 Assert-ExpectedRollback $portableTarget $portableExe Portable $PortableZip $portableLog 1 'Portable'
 if((Get-AppVersion $portableTarget) -ne $portableVersion){throw 'Portable rollback did not restore 2.2.51'}
 if(Test-Path (Join-Path $portableTarget '__ROLLBACK_TEST_EXTRA_FILE__.txt')){throw 'Portable left injected extra file'}
 if(Test-Path (Join-Path $portableTarget '__ROLLBACK_TEST_EXTRA_DIRECTORY__')){throw 'Portable left injected extra directory'}
 if((Get-Content (Join-Path $portableTarget 'test-extra-sentinel') -Raw).Trim() -ne 'preserve-me'){throw 'Portable did not restore baseline sentinel file'}
 Start-Check $portableExe 'portable' $portableProfile $portableRunId $portableProfileEvidence
 Write-Host "WINDOWS_PORTABLE_ROLLBACK_OK log=$portableLog"

 # An incomplete portable archive must be rejected before mutation and preserve the old app.
 $partialPayload=Join-Path $root 'incomplete-portable-payload'
 New-Item -ItemType Directory -Path $partialPayload|Out-Null
 Set-Content (Join-Path $partialPayload 'partial-update.txt') 'deliberately incomplete package'
 $badPortable=Join-Path $root 'incomplete-portable.zip'
 Compress-Archive -LiteralPath (Join-Path $partialPayload 'partial-update.txt') -DestinationPath $badPortable -Force
 $badPortableTarget=Join-Path $root 'portable-incomplete-package-target'
 Copy-InstallTree $portableTarget $badPortableTarget
 $badPortableLog=Join-Path $root 'portable-incomplete-package.log'
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Helper -Mode Portable -Target $badPortableTarget -Executable (Join-Path $badPortableTarget 'OpenFront Replay Coach.exe') -PackagePath $badPortable -LogPath $badPortableLog
 if($LASTEXITCODE -ne 1 -or !(Select-String -LiteralPath $badPortableLog -Pattern 'UPDATE_FAILED' -Quiet)){throw 'Incomplete portable archive was not rejected'}
 if((Get-AppVersion $badPortableTarget) -ne $portableVersion){throw 'Incomplete portable archive changed baseline version'}
 Start-Check $portableExe 'portable' $portableProfile $portableRunId $portableProfileEvidence

 # Exercise failed rollback independently from the successful portable rollback.
 $failedPortableTarget=Join-Path $root 'portable-failed-restore-target'
 Copy-InstallTree $portableTarget $failedPortableTarget
 Assert-FailedRestore $failedPortableTarget (Join-Path $failedPortableTarget 'OpenFront Replay Coach.exe') Portable $PortableZip (Join-Path $root 'portable-failed-restore.log') 'portable' $portableProfile $portableRunId $portableProfileEvidence $portableExe

 Write-Host "WINDOWS_ROLLBACK_E2E_OK run=$root"
}catch{
 Write-Error $_
 Write-Host "DIAGNOSTICS_RETAINED $root"
 throw
}
