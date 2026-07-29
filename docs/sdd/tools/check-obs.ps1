$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$files = Get-ChildItem -Path $root -Recurse -Filter *.md | Where-Object { $_.FullName -notmatch '\\tools\\' }

$obs = Get-Content -Raw -LiteralPath '24-observability.md'

# Every metric the registry in chapter 24 declares.
$defined = @{}
foreach ($m in [regex]::Matches($obs, '`(ngois_[a-z0-9_]+)`')) { $defined[$m.Groups[1].Value] = $true }

# Prometheus derives _bucket, _sum and _count series from any declared histogram
# or summary, so a query naming one of those is referencing a declared metric.
$suffixes = @('_bucket', '_sum', '_count')

function Test-Declared {
    param([string]$Name)
    if ($defined.ContainsKey($Name)) { return $true }
    foreach ($s in $suffixes) {
        if ($Name.EndsWith($s)) {
            $base = $Name.Substring(0, $Name.Length - $s.Length)
            if ($defined.ContainsKey($base)) { return $true }
        }
    }
    return $false
}

$bad = @{}
foreach ($f in $files) {
    if ($f.Name -eq '24-observability.md') { continue }
    $lines = Get-Content -LiteralPath $f.FullName
    for ($i = 0; $i -lt $lines.Count; $i++) {
        foreach ($m in [regex]::Matches($lines[$i], '\b(ngois_[a-z0-9_]+)\b')) {
            $n = $m.Groups[1].Value
            if (-not (Test-Declared $n)) { $bad["$n  [$($f.Name):$($i+1)]"] = $true }
        }
    }
}

Write-Output "METRICS DECLARED IN CH24: $($defined.Count)"
Write-Output "UNDECLARED METRIC REFERENCES: $($bad.Count)"
$bad.Keys | Sort-Object | ForEach-Object { Write-Output "    $_" }
