# Pre-Processing Tools

Before using the GUI to organize your data into BIDS format, your raw imaging files need two pre-processing steps:

1. **DICOM to NIfTI conversion** (dcm2niix) - Converts raw DICOM files from the scanner into NIfTI format (.nii.gz), which is the standard format required by BIDS.
2. **Defacing** (pydeface) - Removes facial features from structural MRI scans (T1w, T2w, FLAIR) to protect patient privacy per HIPAA requirements.

This folder contains install scripts and usage guides for both tools.

---

## Quick Start

### 1. Install the tools

**Windows (PowerShell as Administrator):**
```powershell
.\install_windows.ps1
```

**macOS:**
```bash
chmod +x install_mac.sh
./install_mac.sh
```

**Linux (Debian/Ubuntu):**
```bash
chmod +x install_linux.sh
./install_linux.sh
```

### 2. Convert DICOM to NIfTI

Use `dcm2niix` directly to convert your DICOM folders:

```bash
# Convert a single subject's DICOM folder to compressed NIfTI with JSON sidecars
dcm2niix -z y -b y -ba y -o /path/to/output /path/to/dicom/folder
```

Flag reference:
- `-z y` compresses output to .nii.gz
- `-b y` generates BIDS JSON sidecars
- `-ba y` anonymizes the sidecar (strips patient info)
- `-o` sets the output directory

For more options, run `dcm2niix --help` or see the [dcm2niix docs](https://github.com/rordenlab/dcm2niix).

### 3. Deface structural MRIs

Use `pydeface` directly on any T1w, T2w, or FLAIR NIfTI files:

```bash
# Deface a structural MRI (overwrites the original by default)
pydeface /path/to/T1w.nii.gz

# Deface and save to a new file (keeps the original)
pydeface /path/to/T1w.nii.gz --outfile /path/to/T1w_defaced.nii.gz
```

Always visually inspect the defaced output to confirm facial features are removed and brain tissue is intact.

### 4. Use the GUI

Once your files are converted and defaced, drag them into the GUI for BIDS organization, validation, and export.

---

## Tool Details

### dcm2niix

dcm2niix is the standard tool for converting DICOM images to NIfTI format. It automatically generates JSON sidecar files containing acquisition metadata, which BIDS requires alongside every imaging file.

- **Repository:** https://github.com/rordenlab/dcm2niix
- **Documentation:** https://github.com/rordenlab/dcm2niix/blob/master/README.md

Key features:
- Converts DICOM (.dcm) to compressed NIfTI (.nii.gz)
- Auto-generates JSON sidecars with scanner metadata
- Handles most scanner vendors (Siemens, GE, Philips)
- Produces .bval and .bvec files for diffusion data

### pydeface

pydeface removes facial features from structural MRI scans by masking the face region. This is required for any T1w, T2w, or FLAIR images to comply with HIPAA before sharing data.

- **Repository:** https://github.com/poldracklab/pydeface
- **Documentation:** https://github.com/poldracklab/pydeface/blob/master/README.rst

Key features:
- Works on T1w, T2w, and FLAIR NIfTI files
- Preserves brain tissue while removing facial features
- Outputs defaced files that can be visually verified

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `dcm2niix: command not found` | Ensure dcm2niix is installed and on your PATH. Re-run the install script. |
| `pydeface: command not found` | Ensure Python and pydeface are installed: `pip install pydeface` |
| Conversion produces no output | Check that your input folder contains valid DICOM files (.dcm or extensionless) |
| Defacing fails on a file | Ensure the file is a valid NIfTI (.nii.gz). Try running FSL's `fslinfo` on it first. |
| Defacing removes too much brain | This is rare. Try `mri_deface` (FreeSurfer) as an alternative defacing tool. |
| Python not found | Install Python 3.8+ from https://www.python.org/downloads/ |
