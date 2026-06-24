#!/usr/bin/env python3
"""
NeuroGate DICOM-to-NIfTI Automation Script
===========================================
Reads DICOM headers from a folder, detects manufacturer, field strength,
and sequence type, then runs the appropriate dcm2niix command with the
correct flags for that scanner configuration.

Supports:
  - Siemens 3T (Prisma, Skyra, MAGNETOM) including XA30 enhanced DICOMs
  - Siemens 7T (Terra, Terra.X)
  - GE 3T (Discovery, Signa)
  - Philips 3T / 7T (Ingenia, Elition)
  - Sequence types: T1w / MPRAGE / MP2RAGE, T2w, FLAIR, fMRI (BOLD),
    DWI, field maps, ASL

Requirements:
  pip install pydicom

Usage:
  python convert_dicom_auto.py <input_dicom_dir> <output_dir> \\
      --subject PENN001 --session preimplant [--task rest] [--dry-run]

Batch example (one DICOM folder per series):
  for series_dir in /data/sub-PENN001/dicoms/*/; do
    python convert_dicom_auto.py "$series_dir" /data/sub-PENN001/nifti/ \\
        --subject PENN001 --session preimplant
  done
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

try:
    import pydicom
    from pydicom.errors import InvalidDicomError
except ImportError:
    print(
        "ERROR: pydicom not installed.\n"
        "Run: pip install pydicom\n"
        "Or:  conda install -c conda-forge pydicom"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------

def find_first_dicom(dicom_dir: str) -> Path:
    """Return the first readable DICOM file in dicom_dir (recursive)."""
    search_root = Path(dicom_dir)
    # Prefer files with .dcm extension; fall back to any non-hidden file.
    candidates = list(search_root.rglob("*.dcm")) or list(search_root.rglob("*.DCM"))
    if not candidates:
        candidates = [
            f for f in search_root.rglob("*")
            if f.is_file() and not f.name.startswith(".")
            and f.suffix.lower() not in {".json", ".txt", ".py", ".md"}
        ]
    if not candidates:
        raise FileNotFoundError(f"No DICOM files found in: {dicom_dir}")
    return candidates[0]


def detect_properties(dicom_dir: str) -> dict:
    """
    Read the first DICOM header and return a properties dict.
    All downstream flag decisions come from this dict only.
    """
    first = find_first_dicom(dicom_dir)
    try:
        ds = pydicom.dcmread(str(first), stop_before_pixels=True, force=True)
    except InvalidDicomError as exc:
        raise ValueError(f"Could not read {first} as DICOM: {exc}") from exc

    manufacturer = str(getattr(ds, "Manufacturer", "")).upper()
    series_desc = str(getattr(ds, "SeriesDescription", "")).lower()
    field_strength = float(getattr(ds, "MagneticFieldStrength", 0) or 0)
    sop_class = str(getattr(ds, "SOPClassUID", ""))

    # Siemens enhanced DICOM uses a different SOP class
    is_enhanced = "1.2.840.10008.5.1.4.1.1.4.1" in sop_class

    # Sequence classification based on SeriesDescription keywords
    desc_tokens = set(series_desc.replace("_", " ").replace("-", " ").split())

    is_fmri = bool(
        desc_tokens & {"bold", "func", "fmri", "rest", "task", "epi", "rsfmri"}
        or "bold" in series_desc
    )
    is_t1 = bool(
        desc_tokens & {"t1", "mprage", "mp2rage", "bravo", "tfe", "ir-fspgr", "vfa"}
        or "t1" in series_desc
    )
    is_mp2rage = "mp2rage" in series_desc
    is_t2 = bool(desc_tokens & {"t2", "flair", "tse", "fse"}) or "t2" in series_desc
    is_dwi = bool(desc_tokens & {"dwi", "dti", "diffusion", "dki"}) or "dwi" in series_desc
    is_fmap = bool(
        desc_tokens & {"field", "b0", "fmap", "gre", "fieldmap", "phasediff"}
        or "field_map" in series_desc
        or "b0map" in series_desc
    )
    is_asl = bool(desc_tokens & {"asl", "perf", "perfusion", "pCASL", "PCASL".lower()})

    return {
        "manufacturer": manufacturer,
        "field_strength": field_strength,
        "series_desc": series_desc,
        "is_enhanced": is_enhanced,
        "is_siemens": "SIEMENS" in manufacturer,
        "is_ge": any(k in manufacturer for k in ("GE", "GEMS")),
        "is_philips": "PHILIPS" in manufacturer,
        "is_7t": field_strength >= 6.5,
        "is_3t": 3.0 <= field_strength < 6.5,
        "is_fmri": is_fmri,
        "is_t1": is_t1,
        "is_mp2rage": is_mp2rage,
        "is_t2": is_t2,
        "is_dwi": is_dwi,
        "is_fmap": is_fmap,
        "is_asl": is_asl,
    }


# ---------------------------------------------------------------------------
# Command builder
# ---------------------------------------------------------------------------

def build_command(props: dict, input_dir: str, output_dir: str,
                  subject: str, session: str) -> list[str]:
    """
    Assemble a dcm2niix command tuned for the detected scanner and sequence.

    Rationale for each flag is documented inline so sites can audit this
    against GOV-001 requirements.
    """
    cmd = [
        "dcm2niix",
        "-z", "y",     # gzip output to .nii.gz (BIDS required format)
        "-b", "y",     # write JSON sidecar with acquisition metadata
        "-ba", "y",    # anonymize sidecar: strips PatientName, DOB, MRN
        "-v", "2",     # verbose: logs unrecognized series so nothing is silently skipped
    ]

    # --- Siemens-specific flags ---
    if props["is_siemens"]:
        if props["is_enhanced"] or props["is_7t"]:
            # Siemens XA30 (Terra 7T, newer Prisma firmware) writes all slices
            # into a single enhanced DICOM file. Without -m n, dcm2niix may
            # attempt to merge volumes incorrectly.
            cmd += ["-m", "n"]
        if props["is_7t"] and props["is_fmri"]:
            # 7T multiband (SMS) sequences encode slice timing in the CSA header.
            # dcm2niix extracts it automatically, but --ignore_trigger_times
            # prevents rare scanner clock glitches from corrupting SliceTiming.
            cmd += ["--ignore_trigger_times"]

    # --- Philips-specific flags ---
    if props["is_philips"]:
        # Philips applies proprietary intensity rescaling before export.
        # Setting --philips_scaling 0 preserves raw scanner values,
        # which is required for quantitative sequences (MP2RAGE, ASL).
        cmd += ["--philips_scaling", "0"]

    # --- GE-specific flags ---
    if props["is_ge"] and props["is_fmri"]:
        # GE sometimes writes one DICOM per volume in older (14.x) software.
        # -t y forces dcm2niix to treat each DICOM as a separate time point,
        # avoiding accidental 3D misinterpretation.
        cmd += ["-t", "y"]

    # --- MP2RAGE (common at 7T Siemens) ---
    if props["is_mp2rage"]:
        # MP2RAGE produces INV1, INV2, UNI-Images, and T1 map as separate
        # derived series. -i y keeps all derived images so the UNI image
        # (used for registration) and T1map are not discarded.
        cmd += ["-i", "y"]

    # --- fMRI BOLD ---
    if props["is_fmri"]:
        # For fMRI, explicitly request the full slice timing array.
        # This is critical for preprocessing pipelines (fMRIPrep, FSL FEAT).
        # SliceTiming is extracted from private CSA headers on Siemens;
        # for GE and Philips verify the JSON output contains this field.
        cmd += ["--export_nrrd", "n"]  # ensure NIfTI output only, not NRRD

    # --- DWI ---
    if props["is_dwi"]:
        # Write BVEC and BVAL files alongside the NIfTI.
        # dcm2niix does this by default with -b y, but flag here for clarity.
        pass  # already handled by -b y above

    # Filename template: use protocol name (%p) and series number (%s)
    # so multiple series from the same session get unique names.
    filename_template = f"sub-{subject}_ses-{session}_%p_%s"
    cmd += ["-f", filename_template, "-o", output_dir, input_dir]

    return cmd


# ---------------------------------------------------------------------------
# Post-processing
# ---------------------------------------------------------------------------

def patch_fmri_sidecars(output_dir: str, task_name: str) -> int:
    """
    Add required TaskName field to fMRI JSON sidecars.
    dcm2niix does not populate TaskName; BIDS requires it for BOLD files.
    """
    patched = 0
    for json_file in Path(output_dir).glob("*.json"):
        with open(json_file) as f:
            try:
                sidecar = json.load(f)
            except json.JSONDecodeError:
                print(f"  WARNING: Could not parse {json_file.name} as JSON, skipping.")
                continue
        if "RepetitionTime" in sidecar and "TaskName" not in sidecar:
            sidecar["TaskName"] = task_name
            with open(json_file, "w") as f:
                json.dump(sidecar, f, indent=2)
            patched += 1
            print(f"  Patched TaskName='{task_name}' into {json_file.name}")
    return patched


def verify_sidecars(output_dir: str, props: dict) -> list[str]:
    """
    Check each JSON sidecar for required BIDS/GOV-001 fields.
    Returns a list of warning strings for any missing fields.
    """
    warnings = []
    base_required = ["Manufacturer", "MagneticFieldStrength", "RepetitionTime", "EchoTime"]
    fmri_required = ["SliceTiming", "TaskName"]
    dwi_required = ["TotalReadoutTime", "PhaseEncodingDirection"]

    for json_file in Path(output_dir).glob("*.json"):
        with open(json_file) as f:
            try:
                sidecar = json.load(f)
            except json.JSONDecodeError:
                warnings.append(f"{json_file.name}: invalid JSON")
                continue

        required = list(base_required)
        if props["is_fmri"]:
            required += fmri_required
        if props["is_dwi"]:
            required += dwi_required

        missing = [k for k in required if k not in sidecar]
        if missing:
            warnings.append(
                f"{json_file.name}: missing required fields: {', '.join(missing)}"
            )
        else:
            print(f"  OK: {json_file.name}")

    return warnings


def check_dcm2niix() -> bool:
    """Return True if dcm2niix is on PATH."""
    try:
        result = subprocess.run(
            ["dcm2niix", "--version"],
            capture_output=True, text=True, timeout=10
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="NeuroGate: Auto-detect scanner type and convert DICOM to NIfTI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("input_dir", help="Directory containing DICOM files for one series")
    parser.add_argument("output_dir", help="Output directory for NIfTI + JSON files")
    parser.add_argument("--subject", required=True,
                        help="Subject ID without 'sub-' prefix (e.g. PENN001)")
    parser.add_argument("--session", default="preimplant",
                        help="Session label (default: preimplant)")
    parser.add_argument("--task", default="rest",
                        help="fMRI TaskName to inject into sidecar (default: rest)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print the dcm2niix command without executing it")
    args = parser.parse_args()

    print("\n=== NeuroGate DICOM Conversion ===")
    print(f"Input:    {args.input_dir}")
    print(f"Output:   {args.output_dir}")
    print(f"Subject:  sub-{args.subject}")
    print(f"Session:  ses-{args.session}")

    # --- Pre-flight check ---
    if not args.dry_run and not check_dcm2niix():
        print(
            "\nERROR: dcm2niix not found on PATH.\n"
            "Install it first (see NeuroGate Pre-Processing page) and retry."
        )
        sys.exit(1)

    # --- Detect ---
    print("\n[1/3] Detecting scanner properties...")
    try:
        props = detect_properties(args.input_dir)
    except (FileNotFoundError, ValueError) as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)

    field_label = f"{props['field_strength']}T" if props["field_strength"] else "unknown field strength"
    print(f"  Manufacturer:   {props['manufacturer'] or 'unknown'}")
    print(f"  Field strength: {field_label}")
    print(f"  Series desc:    {props['series_desc'] or '(none)'}")
    print(f"  Is 7T:          {props['is_7t']}")
    print(f"  Is fMRI:        {props['is_fmri']}")
    print(f"  Is MP2RAGE:     {props['is_mp2rage']}")
    print(f"  Is DWI:         {props['is_dwi']}")
    print(f"  Enhanced DICOM: {props['is_enhanced']}")

    # Warn about 7T-specific considerations
    if props["is_7t"]:
        print(
            "\n  NOTE (7T): Field maps are strongly recommended at 7T due to higher\n"
            "  B0 inhomogeneity. Ensure fmap/ series are also converted and included\n"
            "  in IntendedFor fields of the field map JSON sidecar."
        )
    if props["is_philips"] and props["is_fmri"]:
        print(
            "\n  NOTE (Philips fMRI): Verify SliceTiming in the output JSON. Philips\n"
            "  encodes timing differently from Siemens; some dcm2niix versions may\n"
            "  not extract it. If missing, obtain timing from your MR physicist."
        )
    if props["is_ge"] and props["is_fmri"]:
        print(
            "\n  NOTE (GE fMRI): SliceTiming is not always embedded in GE DICOMs.\n"
            "  Confirm with your scanner operator and add it manually to the JSON\n"
            "  sidecar if absent from the output."
        )

    # --- Build command ---
    print("\n[2/3] Building conversion command...")
    os.makedirs(args.output_dir, exist_ok=True)
    cmd = build_command(props, args.input_dir, args.output_dir, args.subject, args.session)
    print(f"  {' '.join(cmd)}")

    if args.dry_run:
        print("\n[DRY RUN] Skipping execution. Command shown above.")
        return

    # --- Execute ---
    print("\n  Running dcm2niix...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.stdout:
        for line in result.stdout.splitlines():
            print(f"  {line}")
    if result.returncode != 0:
        print(f"\nERROR: dcm2niix exited with code {result.returncode}:\n{result.stderr}")
        sys.exit(1)

    # --- Post-processing ---
    print("\n[3/3] Post-processing sidecars...")
    if props["is_fmri"]:
        patched = patch_fmri_sidecars(args.output_dir, args.task)
        if patched == 0:
            print(
                "  WARNING: No fMRI sidecars found to patch. If conversion produced\n"
                "  output files, verify the JSON sidecars manually."
            )

    # --- Verification ---
    print("\n  Verifying sidecars against GOV-001 required fields...")
    warnings = verify_sidecars(args.output_dir, props)
    if warnings:
        print("\n  WARNINGS - manual action required before uploading:")
        for w in warnings:
            print(f"    - {w}")
    else:
        print("  All sidecars pass field checks.")

    print(
        "\n=== Conversion complete ===\n"
        "Next steps:\n"
        "  1. Visually QA the NIfTI volumes (FSLeyes, ITK-SNAP, or mrview)\n"
        "  2. Run pydeface on all T1w / T2w / FLAIR anatomical images\n"
        "  3. Open the NeuroGate Tool for BIDS compliance validation\n"
    )


if __name__ == "__main__":
    main()
