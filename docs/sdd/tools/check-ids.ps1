$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$specs = @(
    @{ Name = 'Risk';       Pattern = '\bR-(\d{2})\b';                     Home = '32-risk-register.md' },
    @{ Name = 'Threat';     Pattern = '\bT-(\d+\.\d+)\b';                  Home = '16-threat-model-stride.md' },
    @{ Name = 'SLO';        Pattern = '\bS-(\d{1,2})\b';                   Home = '24-observability.md' },
    @{ Name = 'Dashboard';  Pattern = '\bD-(\d{2})\b';                     Home = '24-observability.md' },
    @{ Name = 'NFR';        Pattern = '\b(?:FS|PE|CO|US|RE|SE|PR|MA|PO|BC)-(\d{2})\b'; Home = '30-quality-attributes-nfr.md'; Full = $true },
    @{ Name = 'Assumption'; Pattern = '\bASM-(\d{2})\b';                   Home = '04-architecture-principles.md' },
    @{ Name = 'Constraint'; Pattern = '\bCON-(\d{2})\b';                   Home = '04-architecture-principles.md' },
    @{ Name = 'Chaos';      Pattern = '\bCH-(\d{1,2})\b';                  Home = '23-testing-strategy.md' }
)

$files = Get-ChildItem -Path $root -Recurse -Filter *.md | Where-Object { $_.FullName -notmatch '\\tools\\' }

foreach ($spec in $specs) {
    $homePath = Get-ChildItem -Path $root -Recurse -Filter $spec.Home | Select-Object -First 1
    $homeText = Get-Content -Raw -LiteralPath $homePath.FullName
    $defined = @{}
    foreach ($m in [regex]::Matches($homeText, $spec.Pattern)) {
        $defined[$m.Value] = $true
    }
    $undefined = @{}
    foreach ($f in $files) {
        if ($f.Name -eq $spec.Home) { continue }
        $t = Get-Content -Raw -LiteralPath $f.FullName
        foreach ($m in [regex]::Matches($t, $spec.Pattern)) {
            if (-not $defined.ContainsKey($m.Value)) {
                $key = "$($m.Value)  [$($f.Name)]"
                $undefined[$key] = $true
            }
        }
    }
    Write-Output "$($spec.Name): $($defined.Count) defined in $($spec.Home); $($undefined.Count) referenced-but-undefined"
    $undefined.Keys | Sort-Object | ForEach-Object { Write-Output "    $_" }
}
