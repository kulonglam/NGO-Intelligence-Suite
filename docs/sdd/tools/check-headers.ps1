$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# --- prose-style headers (chapters, appendices) ---
foreach ($g in @(
    @{ Name='Chapters';   Files=(Get-ChildItem -Filter '??-*.md') },
    @{ Name='Appendices'; Files=(Get-ChildItem appendices -Filter '*.md') })) {
    $bad = @()
    foreach ($f in $g.Files) {
        $head = (Get-Content -LiteralPath $f.FullName -TotalCount 18) -join "`n"
        foreach ($r in @('Owner:','Status:','Last Reviewed:')) {
            if ($head -notmatch [regex]::Escape($r)) { $bad += "$($f.Name) missing '$r'" }
        }
        if ($head -notmatch '(?m)^# ') { $bad += "$($f.Name) missing H1" }
    }
    Write-Output "$($g.Name): $($g.Files.Count) files, $($bad.Count) problems"
    $bad | ForEach-Object { Write-Output "    $_" }
}

# --- table-style headers (ADRs, runbooks) ---
foreach ($g in @(
    @{ Name='ADRs';     Dir='adr';      Require=@('Status','Date','Deciders','Related') },
    @{ Name='Runbooks'; Dir='runbooks'; Require=@('ID','Applies to','Severity','Owner','Expected duration','Last verified','Related') })) {
    $files = Get-ChildItem $g.Dir -Filter '*.md'
    $bad = @()
    foreach ($f in $files) {
        $head = (Get-Content -LiteralPath $f.FullName -TotalCount 16) -join "`n"
        foreach ($r in $g.Require) {
            if ($head -notmatch "\|\s*\*\*$([regex]::Escape($r))\*\*\s*\|") { $bad += "$($f.Name) missing '$r'" }
        }
        if ($head -notmatch '(?m)^# ') { $bad += "$($f.Name) missing H1" }
    }
    Write-Output "$($g.Name): $($files.Count) files, $($bad.Count) problems"
    $bad | ForEach-Object { Write-Output "    $_" }
}

# --- reconcile runbook header facts against Appendix G ---
$gtext = Get-Content -Raw -LiteralPath 'appendices\g-runbook-index.md'
Write-Output ""
Write-Output "RUNBOOK HEADER FACTS (authoritative) vs Appendix G:"
foreach ($f in (Get-ChildItem runbooks -Filter '*.md' | Sort-Object Name)) {
    $head = (Get-Content -LiteralPath $f.FullName -TotalCount 16) -join "`n"
    $id  = if ($head -match '\|\s*\*\*ID\*\*\s*\|\s*([^|]+?)\s*\|') { $matches[1] } else { '?' }
    $sev = if ($head -match '\|\s*\*\*Severity\*\*\s*\|\s*([^|]+?)\s*\|') { $matches[1] } else { '?' }
    $dur = if ($head -match '\|\s*\*\*Expected duration\*\*\s*\|\s*([^|]+?)\s*\|') { $matches[1] } else { '?' }
    $ver = if ($head -match '\|\s*\*\*Last verified\*\*\s*\|\s*([^|]+?)\s*\|') { $matches[1] } else { '?' }
    $date = if ($ver -match '(\d{4}-\d{2}-\d{2})') { $matches[1] } else { '?' }
    $inG = if ($gtext -match [regex]::Escape($date)) { 'date-in-G' } else { '** DATE NOT IN G **' }
    Write-Output ("  {0,-6} sev={1,-28} dur={2,-24} verified={3,-12} {4}" -f $id, $sev, $dur, $date, $inG)
}
