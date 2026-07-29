$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$path = 'appendices\d-event-catalog.md'
$lines = Get-Content -LiteralPath $path

$names = @{}
$dupes = @()
$byStream = @{}
$stream = '(none)'
$order = @()

for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^#{2,3}\s.*`([a-z]+\.events)`') {
        $stream = $matches[1]
        if ($order -notcontains $stream) { $order += $stream }
        continue
    }
    # A catalogue row is | `context.entity.verb` | <schema version digit> | ...
    # Stream names (`grant.events` and friends) match the same shape in the
    # ordering and volume tables, so they are excluded explicitly rather than by
    # segment count - some real events, such as `tenant.suspended`, have two.
    if ($lines[$i] -match '^\|\s*\*{0,2}`([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)`\*{0,2}\s*\|\s*\*{0,2}(\d)') {
        $n = $matches[1]
        if ($n -match '^[a-z]+\.events$') { continue }
        if ($names.ContainsKey($n)) { $dupes += "$n (lines $($names[$n]) and $($i+1))"; continue }
        $names[$n] = $i + 1
        if (-not $byStream[$stream]) { $byStream[$stream] = 0 }
        $byStream[$stream]++
    }
}

$above1 = @($names.Keys | Where-Object { $lines[$names[$_] - 1] -match '^\|[^|]+\|\s*\*{0,2}([2-9])' })

$problems = @()
if ($dupes.Count -gt 0) { $problems += "$($dupes.Count) duplicate catalogue rows" }

$text = $lines -join "`n"

# Assert the stated totals in D.9.1 match what is actually in the tables.
if ($text -match '\|\s*Events in the catalogue\s*\|\s*\*{0,2}(\d+)') {
    if ([int]$matches[1] -ne $names.Count) { $problems += "D.9.1 states $($matches[1]) events; the tables contain $($names.Count)" }
} else { $problems += "D.9.1 does not state an event total" }

if ($text -match '\|\s*Streams\s*\|\s*\*{0,2}(\d+)') {
    if ([int]$matches[1] -ne $order.Count) { $problems += "D.9.1 states $($matches[1]) streams; $($order.Count) stream sections exist" }
}

if ($text -match '\|\s*Events with a version above 1\s*\|\s*\*{0,2}(\d+)') {
    if ([int]$matches[1] -ne $above1.Count) { $problems += "D.9.1 states $($matches[1]) events above v1; $($above1.Count) found" }
}

# Assert the per-stream sentence agrees with the section counts.
foreach ($s in $order) {
    $short = ($s -replace '\.events$', '')
    if ($text -match "``$([regex]::Escape($s))``\s+(\d+)") {
        if ([int]$matches[1] -ne $byStream[$s]) {
            $problems += "per-stream line states $($matches[1]) for $s; $($byStream[$s]) rows found"
        }
    }
}

Write-Output "CATALOGUE EVENTS: $($names.Count)"
Write-Output "STREAMS: $($order.Count)"
foreach ($s in $order) { Write-Output ("    {0,-20} {1}" -f $s, $byStream[$s]) }
Write-Output "SCHEMA VERSION ABOVE 1: $($above1.Count)  [$(($above1 | Sort-Object) -join ', ')]"
Write-Output "TOTALS MISMATCHES: $($problems.Count)"
$problems | ForEach-Object { Write-Output "    $_" }
