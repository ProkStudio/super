# Bundle portable Python 3.11 + Playwright library (CDP to MostLogin, no Chromium download).# Run before electron-builder on Windows (build:win).
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pyVer = "3.11.9"
$pyZip = "python-$pyVer-embed-amd64.zip"
$cacheDir = Join-Path $PSScriptRoot ".cache"
$zipPath = Join-Path $cacheDir $pyZip
$pyUrl = "https://www.python.org/ftp/python/$pyVer/$pyZip"
$outDir = Join-Path $root "resources\python\win"
$reqFile = Join-Path $root "scripts\requirements.txt"
$sitePackages = Join-Path $outDir "Lib\site-packages"

Write-Host "=== TechPro: bundle Python $pyVer ===" -ForegroundColor Cyan

if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir | Out-Null }

if (-not (Test-Path $zipPath)) {
  Write-Host "Downloading $pyUrl ..."
  Invoke-WebRequest -Uri $pyUrl -OutFile $zipPath -UseBasicParsing
}

if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
New-Item -ItemType Directory -Path $sitePackages -Force | Out-Null

Write-Host "Extracting Python ..."
Expand-Archive -Path $zipPath -DestinationPath $outDir -Force

$pthFile = Get-ChildItem -Path $outDir -Filter "python*._pth" | Select-Object -First 1
if (-not $pthFile) { throw "python*._pth not found in $outDir" }
@(
  "python311.zip"
  "."
  "Lib\site-packages"
  "import site"
) | Set-Content -Path $pthFile.FullName -Encoding ASCII

$pythonExe = Join-Path $outDir "python.exe"
if (-not (Test-Path $pythonExe)) { throw "python.exe missing after extract" }

$getPip = Join-Path $cacheDir "get-pip.py"
if (-not (Test-Path $getPip)) {
  Write-Host "Downloading get-pip.py ..."
  Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPip -UseBasicParsing
}

Write-Host "Installing pip ..."
& $pythonExe $getPip --no-warn-script-location
if ($LASTEXITCODE -ne 0) { throw "get-pip failed" }

if (-not (Test-Path $reqFile)) { throw "Missing $reqFile" }

Write-Host "Installing Python packages from scripts/requirements.txt ..."
& $pythonExe -m pip install --upgrade pip --no-warn-script-location
& $pythonExe -m pip install -r $reqFile --no-warn-script-location
if ($LASTEXITCODE -ne 0) { throw "pip install requirements failed" }

Write-Host "Verifying Playwright (CDP client only, no bundled browser) ..."
& $pythonExe -c "from playwright.sync_api import sync_playwright; print('playwright OK')"
if ($LASTEXITCODE -ne 0) { throw "playwright import check failed" }

$browserDir = Join-Path $root "resources\python\browsers"
if (Test-Path $browserDir) {
  Write-Host "Removing old browsers cache ..."
  Remove-Item -Recurse -Force $browserDir
}

$pySize = [math]::Round((Get-ChildItem $outDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-Host ""
Write-Host "Done. Python + Playwright lib: ${pySize} MB" -ForegroundColor Green
Write-Host "  $outDir"