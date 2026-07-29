$root = Split-Path -Parent $PSScriptRoot
$domains = 'identity','tenant','platform','grant','hr','beneficiary','programme','fielddata','lms'
$pattern = '`(' + ($domains -join '|') + ')((\.[a-z_]+){1,3})`'

$catalog = @{}
$catText = Get-Content -Raw -LiteralPath (Join-Path $root 'appendices\d-event-catalog.md')
foreach ($m in [regex]::Matches($catText, '\| `([a-z_]+(\.[a-z_]+){1,3})` \|')) {
    $n = $m.Groups[1].Value
    # `<context>.events` is a stream, not an event; it appears in the volume and
    # ordering tables in the same column shape as a catalogue entry.
    if ($n -match '^[a-z]+\.events$') { continue }
    $catalog[$n] = $true
}

$used = @{}
foreach ($f in (Get-ChildItem -Path $root -Recurse -Filter *.md | Where-Object { $_.FullName -notmatch '\\tools\\' })) {
    if ($f.Name -eq 'd-event-catalog.md') { continue }
    $t = Get-Content -Raw -LiteralPath $f.FullName
    foreach ($m in [regex]::Matches($t, $pattern)) {
        $name = $m.Groups[1].Value + $m.Groups[2].Value
        if ($name -match '^[a-z]+\.events$') { continue }
        if ($name -match '\.' -and $name -notmatch '\.(md|ts|json|sql|yaml|yml)$') {
            if (-not $used.ContainsKey($name)) { $used[$name] = @() }
            if ($used[$name] -notcontains $f.Name) { $used[$name] += $f.Name }
        }
    }
}

Write-Output "CATALOG_EVENTS: $($catalog.Count)"
Write-Output "REFERENCED_NAMES: $($used.Count)"
Write-Output "--- referenced but NOT in catalog ---"
$missing = 0
foreach ($k in ($used.Keys | Sort-Object)) {
    if (-not $catalog.ContainsKey($k)) { $missing++; Write-Output ("  {0}  [{1}]" -f $k, ($used[$k] -join ', ')) }
}
Write-Output "MISSING_COUNT: $missing"
