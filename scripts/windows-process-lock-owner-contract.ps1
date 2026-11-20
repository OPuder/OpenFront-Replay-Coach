function ConvertFrom-OpenFrontLockOwnerDiagnostic {
    param([Parameter(Mandatory=$true)][string]$Json)
    if ([string]::IsNullOrWhiteSpace($Json)) { throw 'Restart Manager diagnostic returned empty output instead of a JSON envelope' }
    try { $document = ConvertFrom-Json -InputObject $Json -ErrorAction Stop }
    catch { throw "Restart Manager diagnostic returned invalid JSON: $($_.Exception.Message)" }
    if ($null -eq $document) { throw 'Restart Manager diagnostic returned JSON null instead of an envelope' }
    $propertyNames = @($document.PSObject.Properties | ForEach-Object Name)
    foreach ($required in @('schemaVersion','status','count','owners')) {
        if ($propertyNames -notcontains $required) { throw "Restart Manager diagnostic envelope is missing '$required'" }
    }
    if ([int]$document.schemaVersion -ne 1) { throw "Unsupported Restart Manager diagnostic schema version: $($document.schemaVersion)" }
    if ($document.status -notin @('empty','owners')) { throw "Invalid Restart Manager diagnostic status: '$($document.status)'" }
    if ($null -eq $document.owners) { throw 'Restart Manager diagnostic owners field is null; expected an array' }
    $owners = @($document.owners)
    $declaredCount = 0
    if (-not [int]::TryParse([string]$document.count,[ref]$declaredCount) -or $declaredCount -lt 0) {
        throw "Invalid Restart Manager diagnostic count: '$($document.count)'"
    }
    if ($declaredCount -ne $owners.Count) { throw "Restart Manager diagnostic count mismatch: declared=$declaredCount actual=$($owners.Count)" }
    if ($document.status -eq 'empty' -and $declaredCount -ne 0) { throw 'Restart Manager diagnostic marked a non-empty owner list as empty' }
    if ($document.status -eq 'owners' -and $declaredCount -eq 0) { throw 'Restart Manager diagnostic marked an empty owner list as owners' }
    for ($index=0; $index -lt $owners.Count; $index++) {
        $owner = $owners[$index]
        if ($null -eq $owner) { throw "Restart Manager owner record $index is null" }
        $fields = @($owner.PSObject.Properties | ForEach-Object Name)
        foreach ($required in @('processId','processName','executablePath','applicationType','category','sessionId')) {
            if ($fields -notcontains $required) { throw "Restart Manager owner record $index is missing '$required'" }
        }
        $processId = 0
        if (-not [int]::TryParse([string]$owner.processId,[ref]$processId) -or $processId -le 0) {
            throw "Restart Manager owner record $index has invalid processId '$($owner.processId)'"
        }
        foreach ($field in @('processName','applicationType','category')) {
            if ([string]::IsNullOrWhiteSpace([string]$owner.$field)) { throw "Restart Manager owner record $index has empty '$field'" }
        }
        if ($null -eq $owner.executablePath) { throw "Restart Manager owner record $index has null executablePath" }
    }
    return [pscustomobject]@{ status=[string]$document.status; count=$declaredCount; owners=@($owners) }
}
