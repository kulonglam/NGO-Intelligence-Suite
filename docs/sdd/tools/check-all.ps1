#requires -Version 5.1
<#
    Runs every SDD consistency check and exits non-zero if any hard check fails.
    Intended to run in CI on any change under docs/sdd/.
#>

$here = $PSScriptRoot
$failed = @()

function Invoke-Check {
    param([string]$Name, [string]$Script)
    Write-Host ""
    Write-Host "===== $Name ====="
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here $Script) 2>&1
    $out | ForEach-Object { Write-Host $_ }
    ($out | ForEach-Object { [string]$_ }) -join "`n"
}

# --- Hard checks: any non-zero count is a build failure ---

$o = Invoke-Check 'Internal links resolve' 'check-links.ps1'
if ($o -match 'BROKEN_COUNT:\s*([1-9]\d*)') { $failed += "check-links: $($matches[1]) broken links" }

$o = Invoke-Check 'Section cross-references resolve' 'check-sections.ps1'
if ($o -match '(?m)^BAD:\s*([1-9]\d*)') { $failed += "check-sections: $($matches[1]) bad section refs" }

$o = Invoke-Check 'Every file is indexed from README' 'check-toc.ps1'
if ($o -match 'NOT LINKED FROM README:\s*([1-9]\d*)') { $failed += "check-toc: $($matches[1]) unindexed files" }
if ($o -match 'DEAD:\s*([1-9]\d*)') { $failed += "check-toc: $($matches[1]) dead README links" }

$o = Invoke-Check 'Header control blocks present' 'check-headers.ps1'
foreach ($m in [regex]::Matches($o, '(?m)^(\w+): \d+ files, ([1-9]\d*) problems')) {
    $failed += "check-headers: $($m.Groups[1].Value) has $($m.Groups[2].Value) header problems"
}

$o = Invoke-Check 'Identifiers defined before use' 'check-ids.ps1'
foreach ($m in [regex]::Matches($o, '(?m)^(\w+): \d+ defined[^;]*;\s*([1-9]\d*) referenced-but-undefined')) {
    $failed += "check-ids: $($m.Groups[2].Value) undefined $($m.Groups[1].Value) references"
}

$o = Invoke-Check 'Service names and ports agree with chapter 06' 'check-services.ps1'
if ($o -match 'SERVICE NAMES USED BUT NOT IN CH06:\s*([1-9]\d*)') { $failed += "check-services: $($matches[1]) unknown service names" }
if ($o -match 'disagreements:\s*([1-9]\d*)') { $failed += "check-services: $($matches[1]) port disagreements" }

$o = Invoke-Check 'Metric names declared in chapter 24' 'check-obs.ps1'
if ($o -match 'UNDECLARED METRIC REFERENCES:\s*([1-9]\d*)') { $failed += "check-obs: $($matches[1]) undeclared metric references" }

$o = Invoke-Check 'Appendix D totals match its own tables' 'check-event-totals.ps1'
if ($o -match 'TOTALS MISMATCHES:\s*([1-9]\d*)') { $failed += "check-event-totals: $($matches[1]) stated totals disagree with the tables" }

Write-Host ""
Write-Host "===== Mermaid diagrams parse ====="
$mermaidDir = Join-Path $here 'mermaid'
if (Test-Path (Join-Path $mermaidDir 'node_modules')) {
    Push-Location $mermaidDir
    $o = & node validate.mjs (Split-Path -Parent $here) 2>&1
    Pop-Location
    $o | ForEach-Object { Write-Host $_ }
    $text = ($o | ForEach-Object { [string]$_ }) -join "`n"
    if ($text -match 'FAILURES:\s*([1-9]\d*)') { $failed += "mermaid: $($matches[1]) diagrams fail to parse" }
} else {
    Write-Host "SKIPPED - run 'npm install' in tools/mermaid first"
}

# --- Advisory checks: reviewed by a human, never fail the build ---
# Both report a short list of known false positives - Kubernetes resource kinds
# and deliberate counter-examples. See tools/README.md for the full list.

Invoke-Check 'ADVISORY - alert names' 'check-alerts.ps1' | Out-Null
Invoke-Check 'ADVISORY - event names' 'check-events.ps1' | Out-Null

Write-Host ""
Write-Host "================================================"
if ($failed.Count -eq 0) {
    Write-Host "ALL HARD CHECKS PASSED"
    exit 0
}
Write-Host "FAILED: $($failed.Count)"
$failed | ForEach-Object { Write-Host "  - $_" }
exit 1
