Set-Location (Split-Path -Parent $PSScriptRoot)
$readme = Get-Content -Raw -LiteralPath 'README.md'

$onDisk = @()
$onDisk += (Get-ChildItem -Filter '*.md' | Where-Object { $_.Name -ne 'README.md' } | ForEach-Object { $_.Name })
$onDisk += (Get-ChildItem appendices -Filter '*.md' | ForEach-Object { "appendices/$($_.Name)" })
$onDisk += (Get-ChildItem adr -Filter '*.md' | ForEach-Object { "adr/$($_.Name)" })
$onDisk += (Get-ChildItem runbooks -Filter '*.md' | ForEach-Object { "runbooks/$($_.Name)" })

$missing = $onDisk | Where-Object { $readme -notmatch [regex]::Escape($_) }
Write-Output "FILES ON DISK: $($onDisk.Count)"
Write-Output "NOT LINKED FROM README: $($missing.Count)"
$missing | ForEach-Object { Write-Output "    $_" }

# links in README that point at nonexistent files
$refs = [regex]::Matches($readme, '\]\((?!https?:)([^)#]+?)(?:#[^)]*)?\)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
$dead = $refs | Where-Object { -not (Test-Path -LiteralPath $_) }
Write-Output "README LINK TARGETS: $($refs.Count); DEAD: $($dead.Count)"
$dead | ForEach-Object { Write-Output "    $_" }

# H1 titles vs README link text sanity: report each chapter's H1
Write-Output ""
Write-Output "CHAPTER H1 TITLES:"
foreach ($f in (Get-ChildItem -Filter '??-*.md' | Sort-Object Name)) {
    $h1 = (Select-String -LiteralPath $f.FullName -Pattern '^# ' | Select-Object -First 1).Line
    Write-Output ("  {0,-46} {1}" -f $f.Name, $h1)
}
