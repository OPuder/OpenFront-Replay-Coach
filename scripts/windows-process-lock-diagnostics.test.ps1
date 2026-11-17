param()
$ErrorActionPreference='Stop'
$target=Join-Path $env:TEMP ('ofrc-lock-probe-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $target|Out-Null
$resource=Join-Path $target 'locked-resource.bin'
[IO.File]::WriteAllText($resource,'lock probe')
$ready=Join-Path $target 'ready.txt'
$holderOutput=Join-Path $env:TEMP ('ofrc-lock-holder-'+[guid]::NewGuid().ToString('N')+'.out')
$holderError=Join-Path $env:TEMP ('ofrc-lock-holder-'+[guid]::NewGuid().ToString('N')+'.err')
$holderCode='$stream=[IO.File]::Open("'+$resource+'",[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None); $pidHolder=$PID; Set-Content -LiteralPath "'+$ready+'" -Value $pidHolder; Start-Sleep -Seconds 90'
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($holderCode))
$holder=Start-Process -FilePath powershell.exe -PassThru -WindowStyle Hidden -RedirectStandardOutput $holderOutput -RedirectStandardError $holderError -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$encoded)
try{
 $deadline=(Get-Date).AddSeconds(20)
 while(!(Test-Path $ready) -and (Get-Date) -lt $deadline){Start-Sleep -Milliseconds 100}
 if(!(Test-Path $ready)){$alive=[bool](Get-Process -Id $holder.Id -ErrorAction SilentlyContinue);$stdout=if(Test-Path $holderOutput){Get-Content $holderOutput -Raw}else{''};$stderr=if(Test-Path $holderError){Get-Content $holderError -Raw}else{''};throw "Lock-holder process did not acquire its test file (pid=$($holder.Id), alive=$alive, stdout=$stdout, stderr=$stderr)"}
 $reported=@(& powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'windows-process-lock-diagnostics.ps1') -Mode Inspect -Target $target | ConvertFrom-Json)
 if($LASTEXITCODE -ne 0){throw 'Restart Manager diagnostic script failed'}
 if(!($reported | Where-Object { $_.processId -eq $holder.Id })){throw "Restart Manager did not identify lock holder PID $($holder.Id): $($reported|ConvertTo-Json -Compress)"}
 Write-Host "PROCESS_LOCK_OWNER_IDENTIFIED pid=$($holder.Id)"
}finally{
 if(Get-Process -Id $holder.Id -ErrorAction SilentlyContinue){Stop-Process -Id $holder.Id -Force}
 try{Wait-Process -Id $holder.Id -Timeout 10 -ErrorAction Stop}catch{}
 Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
 Remove-Item -LiteralPath $holderOutput,$holderError -Force -ErrorAction SilentlyContinue
}
Write-Host 'WINDOWS_PROCESS_LOCK_DIAGNOSTICS_TEST_OK'
