#!/bin/bash
# NeuroGate Pre-Processing Tools - Linux Installer (Debian/Ubuntu)
#
# Installs:
#   - dcm2niix (DICOM to NIfTI converter)
#   - pydeface (MRI defacing tool)
#   - Python dependencies

echo "================================================"
echo "  NeuroGate Pre-Processing Tools - Linux Installer"
echo "================================================"
echo ""

# Check for Python 3
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1)
    echo "[OK] Found $PYTHON_VERSION"
else
    echo "[ERROR] Python 3 is not installed."
    echo "Install with: sudo apt install python3 python3-pip"
    exit 1
fi

# Check for pip
if command -v pip3 &> /dev/null; then
    echo "[OK] Found pip3"
else
    echo "Installing pip3..."
    sudo apt install -y python3-pip
fi

# Install dcm2niix
echo ""
echo "--- Installing dcm2niix ---"

if command -v dcm2niix &> /dev/null; then
    echo "[OK] dcm2niix is already installed"
else
    if command -v apt &> /dev/null; then
        echo "Installing dcm2niix via apt..."
        sudo apt install -y dcm2niix
    elif command -v conda &> /dev/null; then
        echo "Installing dcm2niix via conda..."
        conda install -y -c conda-forge dcm2niix
    else
        echo "[WARNING] Could not auto-install dcm2niix."
        echo "Try: sudo apt install dcm2niix"
        echo "Or install from: https://github.com/rordenlab/dcm2niix/releases"
    fi
fi

# Install pydeface and dependencies
echo ""
echo "--- Installing pydeface ---"

pip3 install pydeface nibabel numpy 2>&1
if [ $? -eq 0 ]; then
    echo "[OK] pydeface installed successfully"
else
    echo "[WARNING] pydeface installation had issues. Try: pip3 install pydeface"
fi

# Verify installations
echo ""
echo "--- Verifying installations ---"

if command -v dcm2niix &> /dev/null; then
    DCM_VERSION=$(dcm2niix --version 2>&1 | head -1)
    echo "[OK] dcm2niix: $DCM_VERSION"
else
    echo "[WARNING] dcm2niix not found on PATH"
fi

if command -v pydeface &> /dev/null; then
    echo "[OK] pydeface is available"
else
    echo "[WARNING] pydeface not found on PATH. You may need to restart your terminal."
fi

echo ""
echo "================================================"
echo "  Installation complete!"
echo "  Restart your terminal, then verify with:"
echo "    dcm2niix --version"
echo "    pydeface --help"
echo "================================================"
