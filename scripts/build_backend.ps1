# Optional PyInstaller bundle (TruwasNexus-style local backend).
# Requires: pip install pyinstaller uvicorn fastapi playwright
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "release\backend"
Write-Host "Building Python backend stub into $out ..."
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }
Write-Host "Note: full FastAPI backend parity is optional. Nexus Toolkit uses IPC + scripts by default."
Write-Host "Done."
