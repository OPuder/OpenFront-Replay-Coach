param([string]$Installer,[string]$PortableZip,[string]$PreviousInstaller,[string]$PreviousPortableZip,[string]$Helper)
$ErrorActionPreference='Stop'; $root=Join-Path $env:RUNNER_TEMP ('ofrc-rollback-'+[guid]::NewGuid().ToString('N')); New-Item -ItemType Directory $root|Out-Null
function Start-Check($exe,$label){
 Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force -ErrorAction SilentlyContinue
 $p=Start-Process -FilePath $exe -PassThru; Start-Sleep 8
 if($p.HasExited){throw "$label failed to start after rollback"}
 Stop-Process -Id $p.Id -Force; Write-Host "ROLLBACK_RESTART_OK $label"
}
function Get-AppVersion($installRoot){
 $asar=Join-Path $installRoot 'resources/app.asar'
 if(!(Test-Path -LiteralPath $asar)){throw "Packaged app.asar missing: $asar"}
 $json=& node -e "const a=require('@electron/asar');process.stdout.write(a.extractFile(process.argv[1],'package.json').toString())" $asar
 if($LASTEXITCODE -ne 0){throw 'Could not read package.json from app.asar'}
 return (ConvertFrom-Json $json).version
}
function Prepare-UserData($exe,$appDataRoot,$label){
 $env:APPDATA=$appDataRoot; New-Item -ItemType Directory -Path $appDataRoot -Force|Out-Null
 $p=Start-Process -FilePath $exe -PassThru; Start-Sleep 8
 if($p.HasExited){throw "$label baseline app did not start to create isolated user data"}
 Stop-Process -Id $p.Id -Force
 $dirs=@(Get-ChildItem -LiteralPath $appDataRoot -Directory -Force)
 if($dirs.Count -lt 1){throw "$label did not create an Electron userData directory"}
 $file=Join-Path $dirs[0].FullName 'rollback-user-data-sentinel.txt'
 Set-Content -LiteralPath $file -Value "$($label)-user-data-preserved"
 return $file
}
try{
 $it=Join-Path $root 'installer'
 $p=Start-Process -FilePath $PreviousInstaller -ArgumentList @('/S',"/D=$it") -Wait -PassThru; if($p.ExitCode -ne 0){throw "Baseline installer failed: $($p.ExitCode)"}
 $ie=Join-Path $it 'OpenFront Replay Coach.exe'; if(!(Test-Path $ie)){throw 'Baseline installer exe missing'}
 $installerVersion=Get-AppVersion $it; if($installerVersion -ne '2.2.51'){throw "Expected installer baseline 2.2.51, got $installerVersion"}
 $uninstallRoot='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
 $registryEntries=@(Get-ChildItem -LiteralPath $uninstallRoot | ForEach-Object {$props=Get-ItemProperty -LiteralPath $_.PSPath; if($props.DisplayName -eq 'OpenFront Replay Coach' -and $props.InstallLocation -and ([IO.Path]::GetFullPath($props.InstallLocation).TrimEnd('\') -ieq $it.TrimEnd('\'))){[pscustomobject]@{path=$_.PSPath;version=[string]$props.DisplayVersion}}})
 if($registryEntries.Count -ne 1 -or $registryEntries[0].version -ne '2.2.51'){throw 'Could not verify v2.2.51 installer uninstall registry metadata'}
 $installerRegistryPath=$registryEntries[0].path
 $installerDataFile=Prepare-UserData $ie (Join-Path $root 'installer-appdata') 'installer'
 Set-Content (Join-Path $it 'test-extra-sentinel') 'preserve-me'; $ilog=Join-Path $root 'installer.log'
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Helper -Mode Installer -Target $it -Executable $ie -PackagePath $Installer -LogPath $ilog -FailAfterMutation
 if($LASTEXITCODE -ne 1){throw "Installer rollback exit was $LASTEXITCODE"}
 if((Get-AppVersion $it) -ne $installerVersion){throw 'Installer rollback did not restore old application version'}
 if([string](Get-ItemProperty -LiteralPath $installerRegistryPath).DisplayVersion -ne '2.2.51'){throw 'Installer rollback did not restore old uninstall registry version'}
 if(Test-Path (Join-Path $it '__ROLLBACK_TEST_EXTRA_FILE__.txt')){throw 'Installer left injected extra file'}
 if((Get-Content (Join-Path $it 'test-extra-sentinel') -Raw).Trim() -ne 'preserve-me'){throw 'Installer did not restore extra baseline file'}
 if((Get-Content $installerDataFile -Raw).Trim() -ne 'installer-user-data-preserved'){throw 'Installer user data changed'}
 if(!(Select-String -LiteralPath $ilog -Pattern 'FAILURE_INJECTED_AFTER_MUTATION' -Quiet)){throw 'Installer did not reach controlled post-mutation failure injection'}
 if(!(Select-String -LiteralPath $ilog -Pattern 'ROLLBACK_VERIFIED' -Quiet)){throw 'Installer complete manifest/hash proof missing'}
 if(!(Test-Path ($ilog+'.baseline-manifest.json')) -or !(Test-Path ($ilog+'.restored-manifest.json'))){throw 'Installer baseline/restored manifests missing'}
 Start-Check $ie 'Windows Installer'; Write-Host "WINDOWS_INSTALLER_ROLLBACK_OK log=$ilog"
 $pt=Join-Path $root 'portable'; New-Item -ItemType Directory $pt|Out-Null; Expand-Archive $PreviousPortableZip $pt
 $peItem=Get-ChildItem $pt -Filter 'OpenFront Replay Coach.exe' -File -Recurse|Select-Object -First 1; if(!$peItem){throw 'Portable executable missing'}
 $pe=$peItem.FullName; $pr=$peItem.Directory.FullName
 $portableVersion=Get-AppVersion $pr; if($portableVersion -ne '2.2.51'){throw "Expected portable baseline 2.2.51, got $portableVersion"}
 $currentStage=Join-Path $root 'current-portable-version'; Expand-Archive $PortableZip $currentStage
 $currentExe=Get-ChildItem $currentStage -Filter 'OpenFront Replay Coach.exe' -File -Recurse|Select-Object -First 1
 if(!$currentExe){throw 'Current portable package executable missing'}
 $currentVersion=Get-AppVersion $currentExe.Directory.FullName
 if([version]$currentVersion -le [version]$portableVersion){throw "Current package version $currentVersion is not newer than baseline $portableVersion"}
 Set-Content (Join-Path $pr 'test-extra-sentinel') 'preserve-me'
 $portableDataFile=Prepare-UserData $pe (Join-Path $root 'portable-appdata') 'portable'; $plog=Join-Path $root 'portable.log'
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Helper -Mode Portable -Target $pr -Executable $pe -PackagePath $PortableZip -LogPath $plog -FailAfterMutation
 if($LASTEXITCODE -ne 1){throw "Portable rollback exit was $LASTEXITCODE"}
 if((Get-AppVersion $pr) -ne $portableVersion){throw 'Portable rollback did not restore old application version'}
 if(Test-Path (Join-Path $pr '__ROLLBACK_TEST_EXTRA_FILE__.txt')){throw 'Portable left injected extra file'}
 if((Get-Content (Join-Path $pr 'test-extra-sentinel') -Raw).Trim() -ne 'preserve-me'){throw 'Portable did not restore extra baseline file'}
 if((Get-Content $portableDataFile -Raw).Trim() -ne 'portable-user-data-preserved'){throw 'Portable user data changed'}
 if(!(Select-String -LiteralPath $plog -Pattern 'FAILURE_INJECTED_AFTER_MUTATION' -Quiet)){throw 'Portable did not reach controlled post-mutation failure injection'}
 if(!(Select-String -LiteralPath $plog -Pattern 'ROLLBACK_VERIFIED' -Quiet)){throw 'Portable complete manifest/hash proof missing'}
 if(!(Test-Path ($plog+'.baseline-manifest.json')) -or !(Test-Path ($plog+'.restored-manifest.json'))){throw 'Portable baseline/restored manifests missing'}
 Start-Check $pe 'Windows Portable'; Write-Host "WINDOWS_PORTABLE_ROLLBACK_OK log=$plog"; Write-Host "WINDOWS_ROLLBACK_E2E_OK data=$root"
}catch{Write-Error $_; Write-Host "DIAGNOSTICS_RETAINED $root";throw}
