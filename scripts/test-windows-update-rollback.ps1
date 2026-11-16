param([string]$Installer,[string]$PortableZip,[string]$Helper)
$ErrorActionPreference='Stop'; $root=Join-Path $env:RUNNER_TEMP ('ofrc-rollback-'+[guid]::NewGuid().ToString('N')); New-Item -ItemType Directory $root|Out-Null
function Start-Check($exe,$label){$p=Start-Process -FilePath $exe -PassThru; Start-Sleep 8; if($p.HasExited){throw "$label failed to start after rollback"}; Stop-Process -Id $p.Id -Force; Write-Host "ROLLBACK_RESTART_OK $label"}
try{
 $it=Join-Path $root 'installer'; $data=Join-Path $root 'installer-data'; New-Item -ItemType Directory $data|Out-Null; Set-Content (Join-Path $data 'sentinel') 'installer-data'
 $p=Start-Process -FilePath $Installer -ArgumentList @('/S',"/D=$it") -Wait -PassThru; if($p.ExitCode -ne 0){throw "Baseline installer failed: $($p.ExitCode)"}
 $ie=Join-Path $it 'OpenFront Replay Coach.exe'; if(!(Test-Path $ie)){throw 'Baseline installer exe missing'}
 Set-Content (Join-Path $it 'test-extra-sentinel') 'preserve-me'; $ilog=Join-Path $root 'installer.log'
 $a=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$Helper,'-Mode','Installer','-Target',$it,'-Executable',$ie,'-PackagePath',$Installer,'-LogPath',$ilog,'-FailAfterMutation')
 $p=Start-Process powershell.exe -ArgumentList $a -Wait -PassThru -NoNewWindow; if($p.ExitCode -ne 1){throw "Installer rollback exit was $($p.ExitCode)"}
 if(Test-Path (Join-Path $it '__ROLLBACK_TEST_EXTRA_FILE__.txt')){throw 'Installer left injected extra file'}
 if((Get-Content (Join-Path $it 'test-extra-sentinel') -Raw).Trim() -ne 'preserve-me'){throw 'Installer did not restore extra baseline file'}
 if((Get-Content (Join-Path $data 'sentinel') -Raw).Trim() -ne 'installer-data'){throw 'Installer user data changed'}
 if(!(Select-String -LiteralPath $ilog -Pattern 'ROLLBACK_VERIFIED' -Quiet)){throw 'Installer complete manifest/hash proof missing'}
 Start-Check $ie 'Windows Installer'; Write-Host "WINDOWS_INSTALLER_ROLLBACK_OK log=$ilog"
 $pt=Join-Path $root 'portable'; New-Item -ItemType Directory $pt|Out-Null; Expand-Archive $PortableZip $pt
 $peItem=Get-ChildItem $pt -Filter 'OpenFront Replay Coach.exe' -File -Recurse|Select-Object -First 1; if(!$peItem){throw 'Portable executable missing'}
 $pe=$peItem.FullName; $pr=$peItem.Directory.FullName; Set-Content (Join-Path $pr 'test-extra-sentinel') 'preserve-me'
 $pdata=Join-Path $root 'portable-data'; New-Item -ItemType Directory $pdata|Out-Null; Set-Content (Join-Path $pdata 'sentinel') 'portable-data'; $plog=Join-Path $root 'portable.log'
 $a=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$Helper,'-Mode','Portable','-Target',$pr,'-Executable',$pe,'-PackagePath',$PortableZip,'-LogPath',$plog,'-FailAfterMutation')
 $p=Start-Process powershell.exe -ArgumentList $a -Wait -PassThru -NoNewWindow; if($p.ExitCode -ne 1){throw "Portable rollback exit was $($p.ExitCode)"}
 if(Test-Path (Join-Path $pr '__ROLLBACK_TEST_EXTRA_FILE__.txt')){throw 'Portable left injected extra file'}
 if((Get-Content (Join-Path $pr 'test-extra-sentinel') -Raw).Trim() -ne 'preserve-me'){throw 'Portable did not restore extra baseline file'}
 if((Get-Content (Join-Path $pdata 'sentinel') -Raw).Trim() -ne 'portable-data'){throw 'Portable user data changed'}
 if(!(Select-String -LiteralPath $plog -Pattern 'ROLLBACK_VERIFIED' -Quiet)){throw 'Portable complete manifest/hash proof missing'}
 Start-Check $pe 'Windows Portable'; Write-Host "WINDOWS_PORTABLE_ROLLBACK_OK log=$plog"; Write-Host "WINDOWS_ROLLBACK_E2E_OK data=$root"
}catch{Write-Error $_; Write-Host "DIAGNOSTICS_RETAINED $root";throw}
