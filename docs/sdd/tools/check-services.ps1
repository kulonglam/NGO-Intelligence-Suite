Set-Location (Split-Path -Parent $PSScriptRoot)
$all = Get-ChildItem -Recurse -Filter '*.md' | Where-Object { $_.FullName -notmatch '\\tools\\' }

# Canonical services + ports from chapter 06
$ch6 = Get-Content -Raw -LiteralPath '06-microservice-design.md'
$canon = @{}
foreach ($m in [regex]::Matches($ch6, '`([a-z][a-z0-9-]*-service|api-gateway)`[^\n|]*\|\s*(\d{4})\b')) {
    $canon[$m.Groups[1].Value] = $m.Groups[2].Value
}
# fallback: collect service names from ch06 even without a port
$ch6names = [regex]::Matches($ch6, '`([a-z][a-z0-9-]*-service)`') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
Write-Output "CANONICAL SERVICES IN CH06: $($ch6names.Count)"
$ch6names | ForEach-Object { $p = if ($canon[$_]) { $canon[$_] } else { '-' }; Write-Output ("    {0,-28} {1}" -f $_, $p) }

# Any *-service token used anywhere that ch06 doesn't define
$used = @{}
foreach ($f in $all) {
    $t = Get-Content -Raw -LiteralPath $f.FullName
    foreach ($m in [regex]::Matches($t, '`([a-z][a-z0-9-]*-service)`')) {
        $n = $m.Groups[1].Value
        if ($ch6names -notcontains $n) {
            if (-not $used[$n]) { $used[$n] = @() }
            if ($used[$n] -notcontains $f.Name) { $used[$n] += $f.Name }
        }
    }
}
Write-Output ""
Write-Output "SERVICE NAMES USED BUT NOT IN CH06: $($used.Keys.Count)"
foreach ($k in ($used.Keys | Sort-Object)) { Write-Output "    $k  [$($used[$k] -join ', ')]" }

# Port conflicts: same port cited for two different services anywhere
Write-Output ""
Write-Output "PORT MENTIONS OUTSIDE CH06 THAT DISAGREE WITH CH06:"
$bad = 0
foreach ($f in $all) {
    if ($f.Name -eq '06-microservice-design.md') { continue }
    $lines = Get-Content -LiteralPath $f.FullName
    for ($i = 0; $i -lt $lines.Count; $i++) {
        foreach ($m in [regex]::Matches($lines[$i], '([a-z][a-z0-9-]*-service|api-gateway)[^0-9\n]{0,24}?:(\d{4})\b')) {
            $n = $m.Groups[1].Value; $p = $m.Groups[2].Value
            if ($canon.ContainsKey($n) -and $canon[$n] -ne $p) {
                Write-Output "    $($f.Name):$($i+1)  $n :$p  (ch06 says $($canon[$n]))"
                $bad++
            }
        }
    }
}
Write-Output "    disagreements: $bad"

# Roles: canonical eight from ch15
$ch15 = Get-Content -Raw -LiteralPath '15-rbac-and-authorization.md'
$roles = [regex]::Matches($ch15, '`([a-z_]{4,30})`') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
$known = @('super_admin','ngo_admin','programme_manager','finance_manager','hr_manager','field_officer','auditor','viewer')
Write-Output ""
Write-Output "CANONICAL ROLES: $($known -join ', ')"
$roleUse = @{}
foreach ($f in $all) {
    $t = Get-Content -Raw -LiteralPath $f.FullName
    foreach ($m in [regex]::Matches($t, '`(program_manager|project_manager|admin|ngo_manager|field_worker|readonly|read_only|donor|m_and_e_officer)`')) {
        $n = $m.Groups[1].Value
        if (-not $roleUse[$n]) { $roleUse[$n] = @() }
        if ($roleUse[$n] -notcontains $f.Name) { $roleUse[$n] += $f.Name }
    }
}
Write-Output "SUSPICIOUS ROLE TOKENS: $($roleUse.Keys.Count)"
foreach ($k in ($roleUse.Keys | Sort-Object)) { Write-Output "    $k  [$($roleUse[$k] -join ', ')]" }
