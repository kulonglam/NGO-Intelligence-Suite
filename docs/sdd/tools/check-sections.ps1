$root = Split-Path -Parent $PSScriptRoot
$files = Get-ChildItem -Path $root -Recurse -Filter *.md | Where-Object { $_.FullName -notmatch '\\tools\\' }

# Collect heading numbers per file
$headings = @{}
foreach ($f in $files) {
    $set = @{}
    foreach ($l in (Get-Content -LiteralPath $f.FullName)) {
        if ($l -match '^#{2,6}\s+(?:Appendix\s+[A-Z]\s+)?([A-Z]?\.?\d+(?:\.\d+)*)\.?[\s—-]') {
            $set[$matches[1].TrimStart('.')] = $true
        }
        elseif ($l -match '^#{2,6}\s+([A-Z]\.\d+(?:\.\d+)*)\.?[\s—-]') {
            $set[$matches[1]] = $true
        }
    }
    $headings[$f.FullName] = $set
}

$bad = @()
$checked = 0
foreach ($f in $files) {
    $text = Get-Content -Raw -LiteralPath $f.FullName
    # [ ... §<num> ]( <relative path>.md )   possibly multiple § in one label
    foreach ($m in [regex]::Matches($text, '\[[^\]]*?§([A-Z]?\.?[\dA-Z]+(?:\.\d+)*)[^\]]*?\]\(([^)#\s]+\.md)')) {
        $checked++
        $num = $m.Groups[1].Value.TrimStart('.')
        $target = Join-Path $f.DirectoryName $m.Groups[2].Value
        try { $target = (Resolve-Path -LiteralPath $target).Path } catch { continue }
        if (-not $headings.ContainsKey($target)) { continue }
        if (-not $headings[$target].ContainsKey($num)) {
            $bad += "$($f.Name) -> $(Split-Path -Leaf $target) `u{00A7}$num  NOT FOUND"
        }
    }
}

Write-Output "SECTION_REFS_CHECKED: $checked"
Write-Output "BAD: $($bad.Count)"
$bad | Sort-Object -Unique | ForEach-Object { Write-Output "  $_" }
