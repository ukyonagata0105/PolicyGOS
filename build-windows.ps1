# PowerShell script to build the entire PolicyEval GOS app for Windows

Write-Host "========================================="
Write-Host "  PolicyEval GOS Windows Build Script    "
Write-Host "========================================="

$ErrorActionPreference = "Stop"

$RootDir = Get-Location
$BackendDir = Join-Path $RootDir "document_ocr_api"
$FrontendDir = Join-Path $RootDir "policyevaluationGOS"

Write-Host "`n[1/3] Setting up and building Backend (Python)..."
Set-Location $BackendDir

# Check if venv exists, if not create it
if (-not (Test-Path "venv")) {
    Write-Host "Creating Python virtual environment..."
    python -m venv venv
}

# Activate venv and install dependencies
Write-Host "Installing backend dependencies..."
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install pyinstaller

# Run PyInstaller script
Write-Host "Building backend executable..."
python build_backend.py

# Deactivate venv
deactivate

Write-Host "`n[2/3] Setting up and building Frontend (React/Electron)..."
Set-Location $FrontendDir

# We need to copy the built backend into the Electron resources folder
$ResourcesDir = Join-Path $FrontendDir "resources"
if (-not (Test-Path $ResourcesDir)) {
    New-Item -ItemType Directory -Force -Path $ResourcesDir | Out-Null
}

$BackendSrc = Join-Path $BackendDir "dist\backend"
$BackendDest = Join-Path $ResourcesDir "backend"

Write-Host "Copying backend executable to frontend resources..."
if (Test-Path $BackendDest) {
    Remove-Item -Recurse -Force $BackendDest
}
Copy-Item -Path $BackendSrc -Destination $BackendDest -Recurse

Write-Host "Installing frontend dependencies..."
npm install

Write-Host "`n[3/3] Packaging Electron Application..."
# Wait for the build to finish
npm run electron:build

Write-Host "`n========================================="
Write-Host "  Build Complete!                        "
Write-Host "  Installer should be located in:        "
Write-Host "  policyevaluationGOS\release            "
Write-Host "========================================="

Set-Location $RootDir
