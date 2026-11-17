param()
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'windows-process-lock-owner-contract.ps1')
$target=Join-Path $env:TEMP ('ofrc-lock-probe-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $target|Out-Null
$holders=New-Object System.Collections.ArrayList
function Assert-Throws([scriptblock]$Action,[string]$Name){
 $threw=$false
 try{& $Action}catch{$threw=$true}
 if(!$threw){throw "Expected malformed Restart Manager payload to be rejected: $Name"}
}
function Read-LockOwners([string]$Path){
 $raw=@(& powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'windows-process-lock-diagnostics.ps1') -Mode Inspect -Target $Path)
 if($LASTEXITCODE -ne 0){throw "Restart Manager diagnostic process failed with exit code $LASTEXITCODE"}
 $json=($raw -join [Environment]::NewLine).Trim()
 return (ConvertFrom-OpenFrontLockOwnerDiagnostic -Json $json)
}
function Start-LockHolder([string]$Label){
 $resource=Join-Path $target ($Label+'.bin')
 [IO.File]::WriteAllText($resource,'lock probe '+$Label)
 $ready=Join-Path $target ($Label+'.ready')
 $out=Join-Path $env:TEMP ('ofrc-lock-holder-'+[guid]::NewGuid().ToString('N')+'.out')
 $err=Join-Path $env:TEMP ('ofrc-lock-holder-'+[guid]::NewGuid().ToString('N')+'.err')
 $resourceLiteral="'"+$resource.Replace("'","''")+"'"
 $readyLiteral="'"+$ready.Replace("'","''")+"'"
 $holderCode='$stream=[IO.File]::Open('+ $resourceLiteral +',[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None); $pidHolder=$PID; Set-Content -LiteralPath '+$readyLiteral+' -Value $pidHolder; Start-Sleep -Seconds 90'
 $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($holderCode))
 $process=Start-Process -FilePath powershell.exe -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$encoded)
 $holder=[pscustomobject]@{process=$process;ready=$ready;out=$out;err=$err}
 [void]$holders.Add($holder)
 $deadline=(Get-Date).AddSeconds(20)
 while(!(Test-Path -LiteralPath $ready) -and (Get-Date) -lt $deadline){Start-Sleep -Milliseconds 100}
 if(!(Test-Path -LiteralPath $ready)){
  $stdout=if(Test-Path $out){Get-Content $out -Raw}else{''}
  $stderr=if(Test-Path $err){Get-Content $err -Raw}else{''}
  throw "Lock-holder $Label did not acquire its test file (pid=$($process.Id), stdout=$stdout, stderr=$stderr)"
 }
 $reportedPid=[int](Get-Content -LiteralPath $ready -Raw).Trim()
 if($reportedPid -ne $process.Id){throw "Lock-holder PID mismatch for ${Label}: ready=$reportedPid process=$($process.Id)"}
 return $reportedPid
}
try{
 # A truly empty target must be represented explicitly, not as a null/blank pseudo-owner.
 $empty=Read-LockOwners $target
 if($empty.status -ne 'empty' -or $empty.count -ne 0 -or @($empty.owners).Count -ne 0){throw 'Empty Restart Manager result was not represented as status=empty/count=0/owners=[]'}
 Write-Host 'RESTART_MANAGER_EMPTY_LIST_CONFIRMED'

 # Contract-level tests: one valid owner, multiple valid owners, and malformed records.
 $single='{"schemaVersion":1,"status":"owners","count":1,"owners":[{"processId":1234,"processName":"powershell.exe","executablePath":"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe","applicationType":"Unknown","category":"external-or-unclassified","sessionId":1}]}'
 $parsedSingle=ConvertFrom-OpenFrontLockOwnerDiagnostic -Json $single
 if($parsedSingle.count -ne 1 -or $parsedSingle.owners[0].processId -ne 1234){throw 'Single-owner JSON contract failed'}
 $multiple='{"schemaVersion":1,"status":"owners","count":2,"owners":[{"processId":1234,"processName":"powershell.exe","executablePath":"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe","applicationType":"Unknown","category":"external-or-unclassified","sessionId":1},{"processId":2345,"processName":"cmd.exe","executablePath":"C:\\Windows\\System32\\cmd.exe","applicationType":"Console","category":"external-or-unclassified","sessionId":1}]}'
 $parsedMultiple=ConvertFrom-OpenFrontLockOwnerDiagnostic -Json $multiple
 if($parsedMultiple.count -ne 2 -or @($parsedMultiple.owners).Count -ne 2){throw 'Multiple-owner JSON contract failed'}
 Assert-Throws {ConvertFrom-OpenFrontLockOwnerDiagnostic -Json '{"schemaVersion":1,"status":"empty","count":1,"owners":[]}'} 'count mismatch'
 Assert-Throws {ConvertFrom-OpenFrontLockOwnerDiagnostic -Json '{"schemaVersion":1,"status":"owners","count":1,"owners":[{}]}'} 'missing owner fields'
 Assert-Throws {ConvertFrom-OpenFrontLockOwnerDiagnostic -Json '{"schemaVersion":1,"status":"owners","count":1,"owners":[{"processId":0,"processName":"","executablePath":"","applicationType":"","category":"","sessionId":0}]}'} 'empty owner fields'
 Assert-Throws {ConvertFrom-OpenFrontLockOwnerDiagnostic -Json '{"schemaVersion":1,"status":"owners","count":0,"owners":[]}'} 'owners status with empty list'
 Assert-Throws {ConvertFrom-OpenFrontLockOwnerDiagnostic -Json '{"schemaVersion":1,"status":"empty","count":0,"owners":null}'} 'null owners list'
 Assert-Throws {ConvertFrom-OpenFrontLockOwnerDiagnostic -Json '{"schemaVersion":1,"status":"owners","count":2,"owners":[{"processId":1234,"processName":"powershell.exe","executablePath":"","applicationType":"Unknown","category":"external-or-unclassified","sessionId":1},{}]}'} 'malformed second owner in multiple-owner list'
 Assert-Throws {ConvertFrom-OpenFrontLockOwnerDiagnostic -Json 'null'} 'JSON null'
 Write-Host 'RESTART_MANAGER_JSON_CONTRACT_TESTS_OK'

 $pidOne=Start-LockHolder 'one'
 $one=Read-LockOwners $target
 if($one.status -ne 'owners' -or $one.count -ne 1 -or @($one.owners | Where-Object { [int]$_.processId -eq $pidOne }).Count -ne 1){
  throw "Restart Manager failed single live owner test: $($one|ConvertTo-Json -Depth 6 -Compress)"
 }
 Write-Host "PROCESS_LOCK_OWNER_IDENTIFIED pid=$pidOne"

 $pidTwo=Start-LockHolder 'two'
 $two=Read-LockOwners $target
 $observed=@($two.owners | ForEach-Object { [int]$_.processId })
 if($two.status -ne 'owners' -or $two.count -ne 2 -or $observed -notcontains $pidOne -or $observed -notcontains $pidTwo){
  throw "Restart Manager failed multiple live owner test: expected=$pidOne,$pidTwo actual=$($two|ConvertTo-Json -Depth 6 -Compress)"
 }
 Write-Host "PROCESS_LOCK_OWNERS_IDENTIFIED pids=$pidOne,$pidTwo"
}finally{
 foreach($holder in $holders){
  if(Get-Process -Id $holder.process.Id -ErrorAction SilentlyContinue){Stop-Process -Id $holder.process.Id -Force}
  try{Wait-Process -Id $holder.process.Id -Timeout 10 -ErrorAction Stop}catch{}
  Remove-Item -LiteralPath $holder.out,$holder.err -Force -ErrorAction SilentlyContinue
 }
 Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host 'WINDOWS_PROCESS_LOCK_DIAGNOSTICS_TEST_OK'
