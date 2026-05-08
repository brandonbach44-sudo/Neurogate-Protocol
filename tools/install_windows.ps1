# NeuroGate Pre-Processing Tools - Windows Installer
# Run this script in PowerShell as Administrator
#
# Installs:
#   - dcm2niix (DICOM to NIfTI converter)
#   - pydeface (MRI defacing tool)
#   - Python dependencies

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  NeuroGate Pre-Processing Tools - Windows Installer" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check for Python
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "[ERROR] Python is not installed or not on PATH." -ForegroundColor Red
    Write-Host "Please install Python 3.8+ from https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "Make sure to check 'Add Python to PATH' during installation." -ForegroundColor Yellow
    exit 1
}

$pythonVersion = python --version 2>&1
Write-Host "[OK] Found $pythonVersion" -ForegroundColor Green

# Check for pip
$pip = Get-Command pip -ErrorAction SilentlyContinue
if (-not $pip) {
    Write-Host "[ERROR] pip is not installed." -ForegroundColor Red
    Write-Host "Run: python -m ensurepip --upgrade" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Found pip" -ForegroundColor Green

# Install dcm2niix via conda or direct download
Write-Host ""
Write-Host "--- Installing dcm2niix ---" -ForegroundColor Cyan

$dcm2niix = Get-Command dcm2niix -ErrorAction SilentlyContinue
if ($dcm2niix) {
    Write-Host "[OK] dcm2niix is already installed" -ForegroundColor Green
} else {
    # Try conda first
    $conda = Get-Command conda -ErrorAction SilentlyContinue
    if ($conda) {
        Write-Host "Installing dcm2niix via conda..." -ForegroundColor Yellow
        conda install -y -c conda-forge dcm2niix
    } else {
        # Download latest release
        Write-Host "Downloading dcm2niix..." -ForegroundColor Yellow
        $dcm2niixUrl = "https://github.com/rordenlab/dcm2niix/releases/latest/download/dcm2niix_win.zip"
        $dcm2niixZip = "$env:TEMP\dcm2niix_win.zip"
        $dcm2niixDir = "$env:LOCALAPPDATA\dcm2niix"

        Invoke-WebRequest -Uri $dcm2niixUrl -OutFile $dcm2niixZip
        Expand-Archive -Path $dcm2niixZip -DestinationPath $dcm2niixDir -Force
        Remove-Item $dcm2niixZip

        # Add to user PATH
        $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
        if ($currentPath -notlike "*$dcm2niixDir*") {
            [Environment]::SetEnvironmentVariable("PATH", "$currentPath;$dcm2niixDir", "User")
            $env:PATH += ";$dcm2niixDir"
            Write-Host "Added dcm2niix to PATH" -ForegroundColor Green
        }

        Write-Host "[OK] dcm2niix installed to $dcm2niixDir" -ForegroundColor Green
    }
}

# Install pydeface and dependencies
Write-Host ""
Write-Host "--- Installing pydeface ---" -ForegroundColor Cyan

pip install pydeface nibabel numpy 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] pydeface installed successfully" -ForegroundColor Green
} else {
    Write-Host "[WARNING] pydeface installation had issues. Try manually: pip install pydeface" -ForegroundColor Yellow
}

# Verify installations
Write-Host ""
Write-Host "--- Verifying installations ---" -ForegroundColor Cyan

$dcm2niixCheck = Get-Command dcm2niix -ErrorAction SilentlyContinue
if ($dcm2niixCheck) {
    $version = dcm2niix --version 2>&1 | Select-Object -First 1
    Write-Host "[OK] dcm2niix: $version" -ForegroundColor Green
} else {
    Write-Host "[WARNING] dcm2niix not found on PATH. You may need to restart your terminal." -ForegroundColor Yellow
}

$pydefaceCheck = Get-Command pydeface -ErrorAction SilentlyContinue
if ($pydefaceCheck) {
    Write-Host "[OK] pydeface is available" -ForegroundColor Green
} else {
    Write-Host "[WARNING] pydeface not found on PATH. You may need to restart your terminal." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "  Restart your terminal, then verify with:" -ForegroundColor White
Write-Host "    dcm2niix --version" -ForegroundColor White
Write-Host "    pydeface --help" -ForegroundColor White
Write-Host "================================================" -ForegroundColor Cyan
