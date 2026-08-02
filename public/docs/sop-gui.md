# SOP-GUI-001: NeuroGate Compliance Tool User Guide

| Field | Value |
|---|---|
| **Document ID** | SOP-GUI-001 |
| **Version** | 1.7 |
| **Effective Date** | 2026-08-01 |
| **Author** | Brandon Bach |
| **Status** | Draft |
| **Parent Framework** | GOV-001 Regulatory Governance Framework v1.14 |
| **Related Documents** | SOP-BIDS-001, SOP-PENNSIEVE-001 |

---

## 1. Purpose

This SOP provides instructions for using the NeuroGate web-based compliance tool to organize, validate, and export neuroimaging data in Brain Imaging Data Structure (BIDS) format. The tool automates file classification, enforces BIDS naming conventions, scans for protected health information (PHI), and generates an audit trail compliant with ALCOA+ data integrity principles. The exported BIDS folder is then uploaded by the site to whatever data infrastructure they have chosen (Pennsieve, institutional cloud, etc.); platform upload is out of scope for this SOP.

---

## 2. Governance Traceability

This SOP implements the following GOV-001 requirements:

| GOV-001 Section | Requirement | How This SOP Addresses It |
|---|---|---|
| 4.1 FAIR Principles | Data must be structured in machine-readable, interoperable formats | Tool enforces BIDS folder structure and JSON sidecar generation |
| 4.2 ALCOA+ Data Integrity | All data transformations must be attributable and contemporaneous | Audit log captures every user action with timestamps and operator ID |
| 4.3 HIPAA/PHI | PHI must be removed before data leaves the originating site | Validation step scans filenames for PHI patterns before export |
| 5.1 QMS Documentation | SOPs must include step-by-step procedures | Sections 6-11 provide sequential workflow instructions |
| 5.3 Change Control | Corrections must be documented | User corrections to auto-detection are logged in the audit trail |

---

## 3. Scope

This SOP applies to anyone preparing neural data files for sharing, whether at a research site or working independently. This includes research coordinators, imaging technologists, and individual researchers.

**In scope:**
- Organizing raw neural data files (NIfTI for imaging, EDF for electrophysiology, JSON sidecars) into BIDS-compliant folder structures
- Reviewing and correcting automated file classifications
- Entering subject-level and dataset-level metadata
- Validating data completeness and compliance before export
- Exporting a BIDS-formatted ZIP archive with audit documentation

**Out of scope:**
- DICOM-to-NIfTI conversion (install scripts packaged in the same repository at `tools/dcm2niix/`)
- Defacing of anatomical images (install scripts packaged in the same repository at `tools/pydeface/`)
- Uploading the exported ZIP to a data infrastructure (SOP-PENNSIEVE-001 is a worked example for sites using Pennsieve)

---

## 4. Prerequisites

Before using the NeuroGate tool, ensure:

| Requirement | Details |
|---|---|
| **Browser** | Modern browser (Chrome, Firefox, Edge, Safari). No installation required. |
| **File format** | All neuroimaging files must be converted to NIfTI (.nii or .nii.gz) before use. DICOM files are not accepted. Use dcm2niix for conversion (install scripts packaged in the repository at `tools/dcm2niix/`). |
| **Defacing** | All T1w and T2w anatomical images must be defaced before upload. Use pydeface or equivalent (install scripts packaged in the repository at `tools/pydeface/`). |
| **Repository** | The NeuroGate tool, pre-processing install scripts, and this documentation are all available at: github.com/brandonbach44-sudo/Epilepsy_GUI |
| **File naming** | Files should contain identifiable session or modality keywords where possible (e.g., "pre", "post", "T1", "FLAIR"). The auto-detection engine uses these patterns. |
| **Folder structure** | Organizing files into subject-level or session-level folders improves detection accuracy, but is not strictly required. |
| **Subject count** | At least one subject with at least one session of imaging data. |

---

## 5. Tool Overview

NeuroGate operates as a 6-step linear workflow:

| Step | Name | Purpose |
|---|---|---|
| 1 | Choose Your Structure | Pick the Implant sessions preset or define Custom timepoints |
| 2 | File Drop | Upload your imaging files (drag-and-drop or file browser) |
| 3 | Mapping Table | Review auto-detected classifications and correct any errors |
| 4 | Metadata | Enter subject demographics, dataset description, and defacing attestation |
| 5 | Validation | Review compliance checks and resolve any flagged issues |
| 6 | Export | Download BIDS-formatted ZIP archive with audit log |

All processing happens locally in your browser. No data is transmitted to any server. Files remain on your machine throughout the workflow.

---

## 6. Step 1: Choose Your Structure

### 6.1 Procedure

Before dropping any files, pick how this dataset's sessions are organized:

1. **Implant sessions** -- NeuroGate's built-in preset: a fixed `ses-preimplant` / `ses-postimplant` / `ses-postsurgery` structure for implant-based surgical workups.
2. **Custom timepoints** -- for any longitudinal study not organized around an implant procedure. Build your own timepoints from a number-and-unit picker (e.g. 0 months, 2 months, 6 months). There is no free-text entry anywhere in this step, so a site or PI name can never end up in a generated session label. Timepoints are automatically sorted chronologically and duplicate labels are blocked.

This choice can be changed later by starting over, but it cannot be changed mid-dataset once files have been mapped, so pick correctly before proceeding.

### 6.2 What This Affects

The structure choice determines which session labels the Mapping Table (Step 3) offers, how the auto-detection engine classifies files by session (Section 8.2), and how the Metadata step orders sessions (Section 9.3). See SOP-BIDS-001 Section 5.3 for the full specification of both presets.

---

## 7. Step 2: File Drop

### 7.1 Procedure

1. Open the NeuroGate tool in your web browser.
2. On the landing page, you will see the file drop zone in the center of the screen.
3. Either drag and drop a folder containing your imaging files onto the drop zone, or click "browse" to select files using your system file picker.
4. The tool accepts individual files or entire folder structures. Folder hierarchy is preserved and used by the detection engine.

### 7.2 Accepted File Types

| Extension | Description |
|---|---|
| .nii | Uncompressed NIfTI (compressed to .nii.gz automatically on export) |
| .nii.gz | Compressed NIfTI neuroimaging |
| .json | JSON sidecar metadata |
| .edf | European Data Format (scalp EEG) |
| .tsv | Tab-separated values (electrodes, channels) |
| .csv | Comma-separated values (metadata tables) |

### 7.3 What Happens Next

After files are dropped, the tool displays a scanning animation while the 5-layer auto-detection engine analyzes your files. This typically completes in under 2 seconds. You will automatically advance to Step 3 (Mapping Table).

---

## 8. Step 3: Mapping Table

### 8.1 Overview

The Mapping Table displays each file with its auto-detected classification:

- **Subject Group:** Which subject the file belongs to (e.g., sub-PENN001)
- **Session:** The dataset's session label -- pre-implant/post-implant/post-surgery under the Implant sessions preset, or a site-defined timepoint label (e.g. ses-2mo) under Custom timepoints
- **Modality:** Data type (T1w, T2w, FLAIR, MR angiography, CT, DWI, perfusion/ASL, fMRI, field map, EEG, iEEG)
- **Confidence:** Detection confidence level (high, medium, low)

### 8.2 Auto-Detection Engine

The tool uses a 5-layer detection pipeline:

| Layer | Method | What It Detects |
|---|---|---|
| 1 | File extension | Basic file type (NIfTI vs. EDF vs. JSON) |
| 2 | Filename keywords | Session and modality from naming patterns (e.g., "T1", "pre_implant", "FLAIR") |
| 3 | Folder path | Session or subject info from parent folder names |
| 4 | Neighbor context | Infers classification from adjacent files with known types |
| 5 | Subject grouping | Groups files by shared folder paths or naming prefixes |

As part of Layer 2, when a dropped NIfTI file has a matching dcm2niix JSON sidecar, the engine also reads the sidecar's scan description (`SeriesDescription` and `ProtocolName`). This classifies files whose own filename is generic (for example, a scan exported as `sub-X_10.nii` whose sidecar identifies it as an ASL perfusion scan).

Under the Implant sessions preset, when no layer can determine a session, the engine assigns a provisional one based on modality (structural and functional imaging defaults to pre-implant; CT and intracranial EEG default to post-implant) and flags it as low confidence for you to verify. Under Custom timepoints, there is no such fallback: a session is only auto-assigned when a file's folder path or filename literally contains one of the dataset's defined timepoint labels (e.g. `ses-2mo`), because there is no keyword vocabulary that generalizes across arbitrary studies' timepoints. Files that don't already carry a recognizable label are left unassigned for manual mapping; when several need to be assigned to different timepoints in order, select them and use "Assign in order to timepoints" instead of setting each one individually.

Each layer adds confidence. Files classified by multiple agreeing layers receive "high" confidence; single-layer detections receive "medium" or "low."

### 8.3 Reviewing and Correcting Classifications

1. **Filter by confidence:** Use the filter buttons at the top to show only files needing attention (e.g., "Low" confidence files).
2. **Correct a single file:** Click on the Session or Modality cell for any file to open a dropdown. Select the correct value.
3. **Bulk correction:** Select multiple files using the checkboxes, then use the bulk action bar to assign a session or modality to all selected files at once.
4. **Unclassified files:** Files that could not be classified will appear with no session/modality assigned. You must manually assign these before proceeding.

### 8.4 Audit Trail

Every correction you make is logged in the audit trail with:
- Original auto-detected value
- New user-assigned value
- Timestamp
- Field that was changed (session, modality, or subject group)

### 8.5 Proceeding to Step 4

Once all files have a valid session and modality assignment (no unclassified files remain), the "Continue to Metadata" button becomes active. Click it to proceed.

---

## 9. Step 4: Metadata

### 9.1 Overview

The Metadata step collects three categories of information:

1. **Institution Configuration** (site-level settings)
2. **Subject Metadata** (per-subject demographics and session info)
3. **Dataset Description** (BIDS dataset_description.json fields)
4. **Defacing Attestation** (confirmation that anatomical images are defaced)

### 9.2 Institution Configuration

| Field | Description | Example |
|---|---|---|
| Institution Prefix | 4-letter site code used in BIDS subject IDs | PENN, CHOP, MUSC |
| Starting Number | First subject number for this batch | 001 |

The tool generates BIDS subject IDs in the format `sub-{PREFIX}{NUMBER}` (e.g., sub-PENN001, sub-PENN002).

### 9.3 Subject Metadata

For each detected subject, enter:

| Field | Required | Description |
|---|---|---|
| Age | Yes | Age at time of first session (years) |
| Sex | Yes | Male / Female / Other |
| Sessions included | Auto-filled | Which sessions are present for this subject |

Additional clinical fields (diagnosis, condition-specific staging, localization) are outside the scope of this tool. Sites that want to track them should maintain that data in their own local clinical records system.

### 9.4 Dataset Description

| Field | Required | Description |
|---|---|---|
| Dataset Name | Yes | Human-readable name for this dataset |
| Authors | Yes | At least one author (PI or data submitter) |
| Acknowledgements | No | Funding sources or acknowledgements |
| Funding | No | Grant numbers or funding source identifiers |

### 9.5 Defacing Attestation

You must confirm via checkbox that all T1w and T2w anatomical images in this upload have been defaced or de-identified before submission. Ticking the box records a timestamped `defacing-attested` entry in the audit log, which is exported with the dataset.

### 9.6 Proceeding to Step 5

Click "Continue to Validation" once all required fields are completed.

---

## 10. Step 5: Validation

### 10.1 Overview

The Validation step runs automated compliance checks against BIDS requirements and governance framework rules. Results are displayed as a list of checks, each marked as passed, warning, or failed.

### 10.2 Validation Checks Performed

| Category | Check | Severity |
|---|---|---|
| BIDS Structure | All files mapped to valid session/modality | Fail |
| BIDS Structure | Subject IDs follow `sub-{PREFIX}{NNN}` convention | Fail |
| BIDS Structure | At least one session per subject | Fail |
| PHI Scanning | Filenames do not contain patient names or MRNs | Fail |
| PHI Scanning | Filenames do not contain dates in identifiable formats | Warning |
| Metadata | Dataset name is populated | Fail |
| Metadata | At least one author listed | Fail |
| Metadata | Defacing attestation confirmed | Fail |
| Completeness | All expected modalities present per session | Warning |
| Completeness | JSON sidecars present for NIfTI files | Warning |
| Consistency | Subject numbering is sequential with no gaps | Warning |
| Consistency | Sessions are consistent across subjects | Warning |

### 10.3 Resolving Issues

- **Failures (red):** Must be resolved before export. Click the issue to see which file(s) are affected. Use the "Back" button to return to the relevant step and correct the problem.
- **Warnings (yellow):** Do not block export but should be reviewed. Warnings indicate potential issues that may need explanation (e.g., a subject missing a session due to clinical circumstances).

### 10.4 PHI Detection

The PHI scanner runs two complementary checks:

- **Filenames and folder paths:** full names (sequences of capitalized words not matching known modality/session terms), medical record numbers (numeric sequences of 6+ digits), date patterns (MM/DD/YYYY, YYYY-MM-DD, etc.), and Social Security Number patterns.
- **Sidecar JSON free-text fields:** the same patterns and keyword checks, applied to descriptive fields such as `SeriesDescription` and `ProtocolName` inside `.json` sidecars. These fields are needed for BIDS documentation and are not touched by the automatic de-identification in Section 11.1, so if a scanner operator typed a patient name or MRN into one of them, this is the check that catches it.

If PHI is detected, you must correct the offending file (rename it, or edit the sidecar field) outside the tool and re-upload. Both of these scans are separate from the automatic header/date-field de-identification described in Section 11.1, which requires no action from you and runs on every export regardless of whether the PHI scanner flagged anything.

### 10.5 Proceeding to Step 6

Once all failures are resolved, the "Continue to Export" button becomes active.

---

## 11. Step 6: Export

### 11.1 Overview

The Export step generates a BIDS-compliant ZIP archive ready for upload to the site's chosen data infrastructure. SOP-PENNSIEVE-001 is provided as a worked example for sites using Pennsieve.

During export the tool finalizes several details automatically:

- Uncompressed `.nii` files are compressed to `.nii.gz`.
- Each data file's JSON sidecar is renamed to match its data file and placed alongside it, so the scanner metadata travels with the data.
- Every EDF/BDF header is de-identified: patient name, ID, birthdate, and sex fields are blanked or replaced with the BIDS subject ID, and the recording date is shifted by a random per-subject offset (not zeroed) so relative timing between recordings is preserved. The offset is recorded in the audit log.
- Every scan JSON sidecar is de-identified: known-identifying fields (patient name/ID/birthdate, institution, staff names, device serial) are blanked, and acquisition/study date fields are shifted by that subject's same offset.
- When a session contains more than one acquisition of the same modality, each is given a `run-` entity (`run-1`, `run-2`, and so on) so that filenames stay unique.
- Field-map images are named with their standard BIDS suffixes (`magnitude1`, `magnitude2`, `phasediff`).
- Localizer and scout scans are left out of the archive, as they are acquisition aids rather than analyzable data.

### 11.2 Export Contents

The generated ZIP contains:

```
dataset/
  dataset_description.json
  participants.tsv
  participants.json
  sub-PENN001/
    sub-PENN001_sessions.tsv
    ses-preimplant/
      anat/
        sub-PENN001_ses-preimplant_T1w.nii.gz
        sub-PENN001_ses-preimplant_T1w.json
        sub-PENN001_ses-preimplant_run-1_T2w.nii.gz
        sub-PENN001_ses-preimplant_run-1_T2w.json
        sub-PENN001_ses-preimplant_run-2_T2w.nii.gz
        sub-PENN001_ses-preimplant_run-2_T2w.json
      dwi/
        sub-PENN001_ses-preimplant_dwi.nii.gz
        sub-PENN001_ses-preimplant_dwi.json
        sub-PENN001_ses-preimplant_dwi.bval
        sub-PENN001_ses-preimplant_dwi.bvec
      fmap/
        sub-PENN001_ses-preimplant_magnitude1.nii.gz
        sub-PENN001_ses-preimplant_magnitude2.nii.gz
        sub-PENN001_ses-preimplant_phasediff.nii.gz
        sub-PENN001_ses-preimplant_phasediff.json
    ses-postimplant/
      ...
    ses-postsurgery/
      ...
  sub-PENN002/
    ...
```

### 11.3 Folder Tree Preview

Before downloading, the tool displays a preview of the BIDS folder tree that will be generated. Review this to confirm:
- Subject IDs are correct
- Sessions are properly assigned
- File naming follows BIDS conventions
- Folder hierarchy matches expectations

### 11.4 Downloading the Export

1. Click the "Export BIDS Dataset" button.
2. The tool generates the ZIP archive in your browser.
3. Your browser will download two files:
   - `{dataset_name}_BIDS.zip` containing the full BIDS dataset
   - `audit_log_{timestamp}.json` containing the complete audit trail

### 11.5 After Export

After downloading:

1. **Verify the ZIP:** Extract and inspect the contents to confirm structure.
2. **Run bids-validator (optional):** For additional assurance, run the official BIDS validator against the extracted folder (`npx bids-validator ./dataset/`).
3. **Upload to your data infrastructure:** Use whatever platform your site has chosen. SOP-PENNSIEVE-001 is a worked example if your site uses Pennsieve.
4. **Archive the audit log:** Store the audit JSON with your site's study records for compliance documentation.

---

## 12. Audit Trail

### 12.1 Accessing the Audit Log During Use

Click the "Audit Log" button in the top-right corner of the header at any time to view the running log of actions taken during your session.

### 12.2 Audit Log Contents

Each entry records:

| Field | Description |
|---|---|
| Timestamp | ISO 8601 date/time of the action |
| Event Type | Category of action (e.g., files-scanned, detection-completed, session-corrected, modality-corrected, export-completed) |
| Description | Human-readable description of what occurred |
| Details | Structured data (file counts, old/new values, confidence scores) |
| Actor | "system" for automated actions, "user" for manual corrections |

### 12.3 ALCOA+ Compliance

The audit log satisfies ALCOA+ requirements:

| Principle | Implementation |
|---|---|
| **Attributable** | Each entry identifies whether action was system or user |
| **Legible** | JSON format with human-readable descriptions |
| **Contemporaneous** | Timestamps generated at time of action |
| **Original** | Log is append-only during session; no entries are modified |
| **Accurate** | Old and new values recorded for corrections |
| **Complete** | Every file scan, detection, correction, validation, and export is logged |
| **Consistent** | Standardized event types and field structure |
| **Enduring** | Exported as JSON file for long-term storage |
| **Available** | Downloadable at any time; auto-downloads with export |

---

## 13. Troubleshooting

| Issue | Possible Cause | Resolution |
|---|---|---|
| Files not appearing after drop | Wrong file type (e.g., .dcm) | Convert DICOM to NIfTI using dcm2niix before uploading |
| Most files classified as "low confidence" | Files lack descriptive naming or folder structure | Organize files into subject/session folders, or use bulk correction |
| PHI detected in filenames | Original clinical filenames contain patient identifiers | Rename files outside the tool to remove PHI, then re-upload |
| Cannot proceed past validation | One or more "fail" checks unresolved | Click the failed check to identify affected files; go back and fix |
| Export ZIP is empty or incomplete | Browser memory limit with very large datasets | Try exporting in smaller batches (fewer subjects per run) |
| Audit log not downloading | Pop-up blocker | Allow pop-ups for the tool's URL, or manually click "Export JSON" in the audit panel |

---

## 14. System Requirements and Limitations

| Item | Details |
|---|---|
| **Processing** | All processing is client-side (in-browser). No data leaves your computer. |
| **File size limit** | Limited by browser memory. Recommended maximum: 500 files or 2 GB per session. For larger datasets, process in batches by subject. |
| **Internet required** | Only for initial page load. Once loaded, the tool works offline. |
| **Data persistence** | The tool does not save state between sessions. If you close the browser, you must start over. Complete the full workflow in one sitting. |
| **Supported modalities** | T1w, T2w, FLAIR, MR angiography (TOF), CT, DWI, perfusion (ASL), fMRI, field maps, EEG (scalp), iEEG (intracranial). Localizer/scout scans are detected but excluded from the export. |
| **Sessions** | Pre-implant, Post-implant, Post-surgery (per the project protocol) |

---

## 15. Contact and Support

| Role | Contact |
|---|---|
| Tool developer | Brandon Bach (brandon.bach44@gmail.com) |
| Project advisor | Nishant Sinha |
| Bug reports | GitHub Issues: github.com/brandonbach44-sudo/Epilepsy_GUI |

---

## 16. Quick-Reference Guide

### Workflow Summary

1. **Prepare files:** Convert DICOM to NIfTI, deface anatomical images
2. **Choose your structure:** Implant sessions, or define Custom timepoints
3. **Drop files:** Drag folder into the tool
4. **Review mapping:** Check auto-detections, correct any errors (focus on low-confidence files)
5. **Enter metadata:** Site prefix, subject info, dataset name, defacing attestation
6. **Validate:** Resolve any failures, review warnings
7. **Export:** Download BIDS ZIP (with headers auto-de-identified) + audit log
8. **Upload:** Upload to your site's chosen data infrastructure (SOP-PENNSIEVE-001 covers Pennsieve as an example)

### Key Rules

- All anatomical images MUST be defaced before use
- No PHI in filenames (no patient names, MRNs, or identifiable dates)
- Every correction you make is permanently logged in the audit trail
- The tool does not save progress; complete the full workflow in one session
- Export both the BIDS ZIP and the audit log; both are required for compliance

### Confidence Levels

| Level | Meaning | Action Required |
|---|---|---|
| High (green) | Multiple detection layers agree | Verify briefly, likely correct |
| Medium (yellow) | Single-layer detection or partial match | Review and confirm or correct |
| Low (orange) | Weak signal, best guess | Manually verify and correct as needed |
| Unclassified | No detection possible | Must assign session and modality manually |

---

## 17. Revision History

| Version | Date | Author | Summary of Changes |
|---|---|---|---|
| 1.0 | 2026-05-04 | Brandon Bach | Initial draft covering all 5 workflow steps, audit trail, troubleshooting, and quick-reference guide |
| 1.1 | 2026-05-22 | Brandon Bach | Updated the supported-modality lists to add MR angiography, perfusion (ASL), fMRI, and field maps; documented that Layer 2 also reads dcm2niix JSON sidecar scan descriptions and that the engine defaults a session by modality when no other clue is found; noted that the export compresses `.nii` to `.nii.gz` and excludes localizer/scout scans; updated the parent GOV-001 reference to v1.8 |
| 1.2 | 2026-05-25 | Brandon Bach | Documented the export naming behavior in Section 10: each data file's JSON sidecar is now included in the export, repeated acquisitions of the same modality receive `run-` entities, and field-map images are named `magnitude1` / `magnitude2` / `phasediff`. Updated the Export Contents tree to show sidecars, `run-` entities, a field-map folder, and the per-subject sessions.tsv. Updated the parent GOV-001 reference to v1.9. |
| 1.3 | 2026-05-27 | Brandon Bach | Section 8.4 Dataset Description: dropped the (inaccurate) License auto-fill row and added the optional Funding row to match the actual form. Section 8.5 Defacing Attestation: rewritten to describe the simplified single-checkbox attestation; the tool no longer captures defacing tool name, version, or attestor identity. Updated the parent GOV-001 reference to v1.10. |
| 1.4 | 2026-07-31 | Brandon Bach | Removed SOP-REDCAP-001 and ONBOARD-001 from Related Documents and all in-text REDCap references (Sections 3, 8.3, 10.5): additional clinical fields beyond age/sex/sessions are now described as out of scope for the tool rather than pointed to REDCap, and the After Export step for entering REDCap metadata was removed. Updated the parent GOV-001 reference to v1.13. |
| 1.5 | 2026-07-31 | Brandon Bach | Section 3 Scope: rewrote the applicability statement to describe anyone preparing neural data (site-based or independent) rather than a role list assuming institutional participation and a principal investigator. |
| 1.6 | 2026-08-01 | Brandon Bach | Major update: the tool is now a 6-step workflow, not 5. Added new Section 6 (Step 1: Choose Your Structure) documenting the Implant sessions / Custom timepoints preset choice; renumbered former Sections 6-16 to 7-17. Updated Section 8 (Mapping Table) to describe preset-aware session detection, including that Custom timepoints has no modality-based fallback and instead requires either a literal label match or the "Assign in order to timepoints" bulk action. Updated Section 11.1 (Export) and Section 10.4 (PHI Detection) to document the tool's new automatic EDF header and JSON sidecar de-identification (date-shift, not blank, per subject). Updated the Quick-Reference workflow summary from 7 to 8 steps. Removed remaining "epilepsy" domain framing from Section 3 Scope. Updated the parent GOV-001 reference to v1.14. |
| 1.7 | 2026-08-01 | Brandon Bach | Section 10.4 (PHI Detection): documented the second PHI scan added this pass, which reads sidecar JSON free-text fields (SeriesDescription, ProtocolName, etc.) for PHI patterns -- these fields are excluded from automatic de-identification because they're needed for BIDS documentation, so this scan is the safeguard against a scanner operator typing identifying information into one of them. |
