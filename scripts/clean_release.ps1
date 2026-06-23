# После electron-builder убираем промежуточные артефакты из release/
$ErrorActionPreference = 'SilentlyContinue'
$root = (Join-Path $PSScriptRoot '..') | Resolve-Path
$release = Join-Path $root 'release'

Remove-Item (Join-Path $release 'win-unpacked') -Recurse -Force
Remove-Item (Join-Path $release 'builder-debug.yml') -Force

$pkgJson = Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8
$ver = if ($pkgJson -match '"version"\s*:\s*"([^"]+)"') { $Matches[1] } else { '0.0.0' }

$currentSetup = "TechPro-Setup-$ver.exe"
$currentPortable = "TechPro $ver.exe"
$currentPortableAlt = "TechPro-$ver.exe"

Get-ChildItem $release -File -Filter 'TechPro-Setup-*.exe' | Where-Object { $_.Name -ne $currentSetup } | Remove-Item -Force
Get-ChildItem $release -File -Filter 'TechPro-Setup-*.exe.blockmap' | Where-Object { $_.Name -ne "$currentSetup.blockmap" } | Remove-Item -Force
Get-ChildItem $release -File -Filter 'TechPro*.exe' | Where-Object {
  $_.Name -notin @($currentSetup, $currentPortable, $currentPortableAlt)
} | Remove-Item -Force
Get-ChildItem $release -File -Filter 'TechPro Setup *' | Remove-Item -Force

Write-Host "release/ cleaned: $currentSetup, portable, latest.yml"
