$root = Split-Path -Parent $PSScriptRoot
$files = Get-ChildItem -Path $root -Recurse -Filter *.md | Where-Object { $_.FullName -notmatch '\\tools\\' }
$broken = @()
$total = 0

foreach ($f in $files) {
    $text = Get-Content -Raw -LiteralPath $f.FullName
    $matches = [regex]::Matches($text, '\]\(([^)#\s]+\.md)(#[^)]*)?\)')
    foreach ($m in $matches) {
        $total++
        $target = $m.Groups[1].Value
        $resolved = Join-Path $f.DirectoryName $target
        if (-not (Test-Path -LiteralPath $resolved)) {
            $broken += "$($f.Name) -> $target"
        }
    }
    # bare directory links
    $dirMatches = [regex]::Matches($text, '\]\(([a-z]+/)\)')
    foreach ($m in $dirMatches) {
        $total++
        $resolved = Join-Path $f.DirectoryName $m.Groups[1].Value
        if (-not (Test-Path -LiteralPath $resolved)) {
            $broken += "$($f.Name) -> $($m.Groups[1].Value)"
        }
    }
}

Write-Output "TOTAL_LINKS: $total"
Write-Output "BROKEN_COUNT: $($broken.Count)"
$broken | Sort-Object -Unique | ForEach-Object { Write-Output "BROKEN: $_" }
