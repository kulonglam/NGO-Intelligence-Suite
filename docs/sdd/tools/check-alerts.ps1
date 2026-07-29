$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$obs = Get-Content -Raw -LiteralPath '24-observability.md'
$defined = @{}
foreach ($m in [regex]::Matches($obs, '(?m)^\| `([A-Za-z][A-Za-z0-9]+)`')) { $defined[$m.Groups[1].Value] = $true }

# Kubernetes / non-alert CamelCase tokens that legitimately appear
$allow = @('CrashLoopBackOff','ImagePullBackOff','CreateContainerConfigError','ErrImagePull',
           'OOMKilled','ContainerCreating','PodDisruptionBudget','StatefulSet','ConfigMap',
           'ReplicaSet','HorizontalPodAutoscaler','NetworkPolicy','ServiceAccount','NoSchedule')

$targets = @('appendices\g-runbook-index.md','28-operational-runbooks.md') +
           (Get-ChildItem runbooks -Filter *.md | ForEach-Object { "runbooks\$($_.Name)" })

$bad = @{}
foreach ($f in $targets) {
    $t = Get-Content -Raw -LiteralPath $f
    foreach ($m in [regex]::Matches($t, '`([A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+)`')) {
        $n = $m.Groups[1].Value
        if ($allow -contains $n) { continue }
        if (-not $defined.ContainsKey($n)) { $bad["$n  [$(Split-Path -Leaf $f)]"] = $true }
    }
}

Write-Output "ALERTS DEFINED IN CH24: $($defined.Count)"
Write-Output "UNRECOGNISED IN RUNBOOKS/INDEX: $($bad.Count)"
$bad.Keys | Sort-Object | ForEach-Object { Write-Output "    $_" }
