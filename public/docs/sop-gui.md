# SOP-GUI-001: NeuroGate Compliance Tool User Guide

| Field | Value |
|---|---|
| **Document ID** | SOP-GUI-001 |
| **Version** | 2.0 |
| **Effective Date** | 2026-08-31 |
| **Author** | Brandon Bach |
| **Status** | Draft |
| **Parent Framework** | GOV-001 Regulatory Governance Framework v1.15 |
| **Related Documents** | SOP-BIDS-001 |

---

## 1. Purpose

This Standard Operating Procedure provides instructions for using the NeuroGate compliance tool to organize, validate, and export neural data in Brain Imaging Data Structure (BIDS) format. NeuroGate is a desktop application that classifies imaging and electrophysiology files, enforces BIDS naming conventions, scans for protected health information, quarantines files that require manual review, and generates an audit trail compliant with ALCOA+ data integrity principles.

The tool exports a validated BIDS folder to the local machine. Uploading that folder to a data infrastructure is out of scope for this SOP and is handled per each site's own procedures for the platform it has chosen.

---

## 2. Governance Traceability

This SOP implements the following requirements from GOV-001:

| GOV-001 Section | Requirement | How This SOP Addresses It |
|---|---|---|
| 2.1 FAIR Principles | Data must be structured in machine-readable, interoperable formats | The tool enforces BIDS folder structure and generates JSON sidecars for every imaging file |
| 2.2 ALCOA+ Data Integrity | All data transformations must be attributable and contemporaneous | The audit log captures every automated decision and user correction with timestamps |
| 2.3 HIPAA/PHI Protection | PHI must be removed before data leaves the originating site | The tool scans filenames and sidecar free-text fields for PHI patterns and de-identifies EDF headers and JSON sidecar date fields automatically on export |
| 2.5 QMS Documentation | SOPs must include step-by-step procedures | Sections 6 through 11 provide sequential workflow instructions |
| Section 5 Audit Traceability | Corrections and detection decisions must be documented | Every user override and detection reason is written to the audit log |

---

## 3. Scope

This SOP applies to anyone preparing neural data files for sharing, whether at a research site or working independently. Typical users include research coordinators, imaging technologists, data managers, and individual researchers.

**In scope:**

- Organizing raw neural data files into BIDS-compliant folder structures. Supported inputs include NIfTI imaging files, EDF and BrainVision electrophysiology recordings, JSON sidecars, and TSV metadata files.
- Reviewing and correcting the tool's automatic classifications
- Entering subject-level and dataset-level metadata
- Validating data completeness and compliance before export
- Exporting a BIDS-formatted folder with a complete audit trail

**Out of scope:**

- Converting DICOM files to NIfTI. This must be completed before opening NeuroGate. Install scripts for dcm2niix are provided in the repository under `tools/dcm2niix/`.
- Defacing anatomical images. This must be completed before opening NeuroGate. Install scripts for pydeface are provided under `tools/pydeface/`.
- Uploading the exported folder to a data infrastructure. Each site follows its own upload procedure for the platform it has chosen.
- Any processing under `derivatives/` beyond what the tool itself produces from scanner-computed maps. Site-specific analysis pipelines populate `derivatives/` separately.

---

## 4. Prerequisites

The following are required before starting the workflow.

### 4.1 Software

| Requirement | Details |
|---|---|
| Operating system | macOS, Windows, or Linux. See Section 4.4 for supported versions. |
| NeuroGate desktop application | Downloaded from the project website. See Section 4.4 for installation. |
| Storage | Sufficient free disk space to hold the source data plus the exported BIDS folder. As a rule of thumb, plan for roughly 1.5 times the size of the source data. |

Users who prefer a command-line workflow can use the CLI binary bundled inside the desktop application. Command-line usage is documented separately in the repository README and is not required to follow this SOP.

### 4.2 Data Preparation

Before opening NeuroGate, the following must be complete:

| Requirement | Details |
|---|---|
| DICOM conversion | All imaging files must be in NIfTI format. Uncompressed `.nii` is accepted and will be compressed to `.nii.gz` automatically on export. DICOM files (`.dcm`) are not accepted by the tool. |
| Defacing | All anatomical scans (T1w, T2w, FLAIR, PDw, T2starw) intended for structural review must be defaced. The tool does not perform defacing and cannot verify it was done. An attestation checkbox is required before export. |
| Institution prefix | A 2 to 6 letter uppercase code used in BIDS subject IDs (for example, PENN, CHOP, HUP). Sites choose their own prefix. |
| Starting subject number | The three-digit starting number for this batch. Coordinate with any collaborators sharing the same institution prefix to avoid ID collisions. |
| Source data organization | Files should be organized into per-subject folders where possible. Descriptive folder or file names (containing session or modality keywords) improve automatic detection but are not strictly required. |

### 4.3 What the Tool Can and Cannot Infer From File Names

The auto-detection engine reads folder paths, filenames, and JSON sidecar contents to classify files. It performs well when file or folder names contain any of the following patterns.

Session hints the tool recognizes:

- Implant-preset keywords such as `preop`, `preimplant`, `postimplant`, `postsurgery`
- Custom-timepoint labels the site defined (`ses-2mo`, `2weeks`, `week2`, `W2`, `visit1`, `V1`, `baseline`, `followup`)
- ISO-format dates (`YYYYMMDD` or `YYYY-MM-DD`)

Modality hints the tool recognizes:

- Standard BIDS suffixes (`T1w`, `T2w`, `FLAIR`, `angio`, `bold`, `asl`, `dwi`, `ieeg`, and so on)
- Common Siemens, GE, and Philips sequence names (`MPRAGE`, `SPGR`, `BRAVO`, `FSPGR`, `TFLR`, `TIRM`, `SWI`, `SWAN`, `ep2d_diff`, `MoCoSeries`, `pd_tse`, and others)
- Descriptive keywords (`resting`, `diffusion`, `fieldmap`, `perfusion`)

The tool does not guess when there is no supporting evidence. Files it cannot confidently classify are held in a review queue rather than assigned to a default modality. This behavior is described in Section 8.4.

### 4.4 Installation

The NeuroGate desktop application is distributed as an installer for each supported operating system. Downloads are available from the project website under the Downloads page.

| Platform | Installer | Supported Versions |
|---|---|---|
| macOS | `NeuroGate-<version>.dmg` | macOS 12 Monterey or later, Intel or Apple Silicon |
| Windows | `NeuroGate-<version>-Setup.exe` | Windows 10 or later, 64-bit |
| Linux | `NeuroGate-<version>.AppImage` | Ubuntu 22.04 or later, or any modern 64-bit distribution supporting AppImage |

**macOS installation:**

1. Download the `.dmg` file from the project website
2. Double-click the file to mount the disk image
3. Drag the NeuroGate icon to the Applications folder
4. Launch NeuroGate from Applications or Launchpad
5. On first launch, macOS may display a security warning. Right-click the app and select Open, then confirm the dialog. This is required only once.

**Windows installation:**

1. Download the `Setup.exe` file from the project website
2. Double-click to run the installer
3. Follow the installer prompts and accept the default installation location
4. Launch NeuroGate from the Start menu

**Linux installation:**

1. Download the `.AppImage` file from the project website
2. Make it executable by running `chmod +x NeuroGate-<version>.AppImage` in a terminal, or by right-clicking and enabling execute permission in file properties
3. Double-click the file to launch, or run it from a terminal

The tool runs entirely on the local machine. No files are transmitted over the network at any point during the workflow.

### 4.5 Verifying the Installation

After launching NeuroGate for the first time, the welcome screen displays the current version number in the lower right corner. Confirm the version matches the download you installed.

---

## 5. Tool Overview

NeuroGate operates as a six-step linear workflow. Each step must be completed before the next becomes available.

```
Step 1: Choose Structure
    Pick the Implant sessions preset or define Custom timepoints
        |
        v
Step 2: File Drop
    Add source files by dragging a folder onto the drop zone
        |
        v
Step 3: Mapping Table
    Review the tool's automatic classifications and correct any errors
        |
        v
Step 4: Metadata
    Enter institution prefix, subject demographics, dataset description,
    and the defacing attestation
        |
        v
Step 5: Validation
    Review automated compliance checks and resolve any blocking issues
        |
        v
Step 6: Export
    Generate the BIDS folder and download it with the audit log
```

Progress is tracked in a stepper at the top of the window. The user can return to a previous step at any time to revise inputs. When a change in an earlier step affects a later step, the tool clearly indicates that the later step must be reviewed again before export.

All processing happens locally. No data leaves the machine at any point in the workflow. The exported BIDS folder is written to a location the user chooses on their own file system.

Section-by-section instructions for each step begin in Section 6.

---

## 6. Step 1: Choose Your Structure

Before dropping any files, select how the dataset's sessions are organized. This choice determines which session labels the mapping table offers and how the auto-detection engine assigns sessions to files.

### 6.1 The Two Presets

**Implant sessions** is NeuroGate's original built-in preset. It defines a fixed set of three sessions corresponding to phases of a surgical evaluation and treatment timeline:

- `ses-preimplant`: baseline pre-surgical evaluation
- `ses-postimplant`: intracranial monitoring after electrode placement
- `ses-postsurgery`: post-resection imaging

This preset is documented in SOP-BIDS-001 Section 6. Use it for surgical epilepsy workups or any dataset that follows the same three-phase clinical structure.

**Custom timepoints** is for any longitudinal study not organized around an implant procedure. The tool provides a number-and-unit picker where the site defines its own timepoints. Selecting, for example, 0 months, 2 months, and 6 months generates the session labels `ses-0mo`, `ses-2mo`, and `ses-6mo`.

The picker accepts days, weeks, months, or years as units. There is no free-text entry anywhere in this step. Labels are generated only from the numeric input and the selected unit, so a site name, patient identifier, or PI name can never end up in a session label. Timepoints are automatically sorted chronologically by elapsed time regardless of the order they were entered. Duplicate labels within a single dataset are blocked by the tool.

By convention, a timepoint numbered 0 (in any unit) represents the study baseline. This is documented in SOP-BIDS-001 Section 7.

### 6.2 How to Choose

The choice depends on the study design rather than the modalities present.

Select **Implant sessions** if the dataset represents phases of a surgical workup, monitoring period, and post-operative follow-up for the same patient.

Select **Custom timepoints** if the dataset represents a longitudinal study measured at defined intervals from a baseline visit (for example, treatment response at 2, 6, and 12 months; developmental cohorts sampled annually; drug trial follow-ups).

If neither model fits, contact the project lead before proceeding. A study that does not have a defined session structure may not yet be a candidate for BIDS organization.

### 6.3 Procedure

1. On the Choose Structure screen, review the descriptions of both presets displayed side by side
2. Click the preset that matches your study design. The card is highlighted when selected.
3. If Custom timepoints was selected, the timepoint builder opens. For each visit in the study, enter the numeric offset from baseline and select the unit. Click Add Timepoint to add another. To remove a timepoint, click the delete icon next to it.
4. When all timepoints are entered, review the generated session labels in the preview area. Confirm the labels match the site's intended session structure.
5. Click Continue to Files to proceed to Step 2.

Once files are dropped in Step 2, the structure preset cannot be changed. To switch presets after files have been added, the workflow must be restarted from Step 1. This restriction exists because sessions detected under one preset would not map correctly to labels in the other.

---

## 7. Step 2: File Drop

### 7.1 Procedure

1. On the File Drop screen, either drag a folder containing the source data onto the drop zone, or click Browse to select files using the system file picker
2. The tool accepts individual files or entire folder hierarchies. When a folder is dropped, the tool preserves the hierarchy and uses it as evidence during detection.
3. As files are read, a progress indicator displays the current file count and total size
4. When scanning is complete, the tool automatically advances to Step 3 (Mapping Table)

### 7.2 Accepted File Types

| Extension | Description |
|---|---|
| `.nii` | Uncompressed NIfTI imaging (compressed to `.nii.gz` automatically on export) |
| `.nii.gz` | Gzip-compressed NIfTI imaging |
| `.json` | JSON sidecar metadata |
| `.edf`, `.bdf` | European Data Format electrophysiology recordings |
| `.dat`, `.lay` | Persyst format electrophysiology (both files required as a pair) |
| `.nwb` | Neurodata Without Borders |
| `.bval`, `.bvec` | Diffusion gradient tables |
| `.tsv` | Tab-separated values for metadata files (electrodes, channels, events) |

Files with unrecognized extensions are ignored during scanning. If an expected file does not appear in the mapping table, verify the extension is in the list above.

### 7.3 Files That Are Automatically Excluded

The tool identifies and excludes certain operating-system artifacts and transient files that are not scan data. These files never appear in the mapping table and are never written to the export:

- Files whose name begins with a period (`.`), including macOS resource forks (`._filename`) and rsync in-progress copies
- Hidden system files such as `.DS_Store` and `Thumbs.db`

If a legitimate data file has been renamed to begin with a period, restore its original name before dropping the folder.

### 7.4 Files That Are Recognized but Not Exported

Some scan types are recognized by the tool but excluded from the BIDS export because they are not analyzable data. These appear in the mapping table for transparency but are not written to the output folder:

- Localizer and scout scans (three-plane acquisitions used to plan diagnostic scans)
- Duplicate copies of the same acquisition (see Section 8.4)

---

## 8. Step 3: Mapping Table

The mapping table is the central review interface. It displays every file with the tool's automatic classifications and provides controls for reviewing, correcting, and confirming those classifications before proceeding to metadata entry.

### 8.1 Table Columns

| Column | Description |
|---|---|
| File | The original relative path of the file within the dropped folder |
| Subject | The subject ID the tool assigned to this file. Displayed as the group identifier from the source data (later mapped to the BIDS ID in Step 4). |
| Session | The session label the tool assigned. Blank if no session could be determined. |
| Modality | The modality the tool assigned (T1w, T2w, dwi, fmap, ieeg, and so on) |
| Confidence | The tool's confidence in the classification: high, medium, or low |
| Status | Any flags requiring the user's attention. See Section 8.4. |

Every column except File is editable. Click any cell to open a dropdown of valid values and select an override. Overrides are logged in the audit trail.

### 8.2 How the Automatic Detection Works

The auto-detection engine analyzes each file using several signals in combination:

- **File extension** identifies the base file type (imaging, electrophysiology, sidecar, tabular)
- **Filename tokens** are matched against a vocabulary of modality names, scanner sequence names, and session keywords
- **JSON sidecar contents** are read when a matching sidecar is present. The engine extracts `SeriesDescription`, `ProtocolName`, and DICOM `ImageType` to classify files whose own names are generic.
- **Folder path** provides session and subject context when files are organized into per-subject or per-session folders
- **Neighboring files** are used to resolve ambiguous cases (for example, when several unnamed diffusion files sit alongside a `.bval` file)

The tool combines evidence from these signals independently for subject, session, and modality. A classification is marked high confidence only when multiple signals agree specifically on that dimension. A modality that was assigned as a fallback with no supporting evidence is never marked high confidence, even if the subject and session for that file are certain.

Under the Implant sessions preset, if no signal identifies a session for a file, the engine may assign a provisional session based on modality (for example, CT scans default to `ses-postimplant`) and flag the assignment as low confidence for the user to verify. Under Custom timepoints, no such fallback exists. Sessions are assigned only when the file's folder path or filename literally contains one of the dataset's defined labels. Files without a recognizable label are left with a blank session for manual assignment.

### 8.3 Longitudinal Studies and Session Assignment

Longitudinal datasets require particular attention. The tool handles several common conventions automatically:

- Timepoint folder names such as `2weeks`, `2wk`, `week2`, `W2`, `visit1`, `V1`, `baseline`, and `followup` are recognized as sessions when they map to one of the timepoints defined in Step 1
- ISO-format date folders (`YYYYMMDD` or `YYYY-MM-DD`) are recognized as visits and grouped chronologically when the number of date folders equals the number of defined timepoints
- Nested folder structures are handled at any depth. The tool searches for the folder level that partitions a subject's files into the correct number of visits.

The tool intentionally does not guess timepoint assignments in cases where the folder structure does not carry enough information. Two situations produce this outcome:

**A subject with fewer visit folders than the study defines.** When a study is set up with two or more timepoints but a subject has only a single visit folder present, the tool cannot determine which timepoint that visit represents. The subject is held back from export with a message identifying the situation. See Section 8.6 for how to resolve this.

**Date folders that could belong to either a subject or a session.** When the top-level folder inside a subject is a date such as `20180510`, the tool treats it as a session (this is the correct behavior for the overwhelming majority of cases). Date-named patient folders are not supported.

### 8.4 Status Flags in the Mapping Table

The Status column displays badges indicating that a file requires attention or that the tool applied special handling. Each badge has a specific meaning and required action.

**Guessed (amber).** The tool assigned a modality by fallback because no signal in the file's name, folder path, or sidecar identified it. Files with this badge are held back from the primary export. To export the file, either confirm the tool's guess is correct by selecting the same modality in the Modality dropdown, or select a different modality. Making any explicit modality selection clears the badge and allows the file to be exported.

Because the tool refuses to write a guessed modality to `primary/`, files with this badge do not appear in the export folder unless the user takes action. This is the primary safety mechanism preventing misclassified anatomical scans from being exported as legitimate BIDS data.

**Duplicate of `<filename>` (yellow).** The tool identified this file as a redundant copy of another file in the same folder. This occurs when scanner export pipelines produce two copies of the same acquisition (one with the bare series name, one with a decorated name including timestamp and series number). The tool selects the copy with a JSON sidecar as the file to keep, since the sidecar carries information the export needs. The other copy is excluded from the export.

No action is required. The badge exists so the exclusion is visible and can be reversed. To export the duplicate copy instead, select any modality on the excluded file. This overrides the exclusion and the file will be included in the export.

**Derived: `<label>` (blue).** The tool identified this file as a scanner-computed derivative rather than a raw acquisition. Examples include ADC maps, FA maps, TRACEW maps, and minimum-intensity projections computed by the scanner console. The label indicates which derivative it is.

Derived files are written to `derivatives/scanner/` in the export rather than `primary/`, preserving the raw versus derived distinction required by BIDS. No action is required. The badge exists to explain why the file will not appear in the raw `primary/` tree.

**No session assigned (red).** The tool could not determine a session for the file. Under Implant sessions, this indicates the modality is ambiguous enough that even the modality-based fallback did not apply. Under Custom timepoints, this indicates the file's folder path and filename did not match any of the dataset's defined labels.

Files with this badge must have a session selected in the Session dropdown before proceeding to metadata. If several files require assignment to different timepoints in sequence, use the "Assign in order to timepoints" action described in Section 8.6.

**Duplicate name across sessions.** Informational. The same file name appears in multiple sessions for the same subject. This is expected in longitudinal studies where the same scan protocol runs at every visit. The tool automatically assigns run entities to keep filenames unique in the export.

### 8.5 The "Needs Your Decision" Filter

Above the mapping table, a filter bar provides quick access to files that require action:

- **All files** shows every file
- **Needs your decision** shows only files carrying a badge requiring user action (Guessed, No session assigned). This is the filter to use to identify what remains to be resolved before export.
- **High confidence**, **Medium**, **Low** filter by the confidence column
- **By subject** groups the display by subject ID

The Needs your decision filter is the recommended starting point for the review pass. When the filter shows no results, the mapping table is ready to proceed.

### 8.6 Resolving Files That Need a Session

Files without a session assigned must be resolved before continuing.

**When the file has a session in its name or folder path that the tool did not recognize:** Select the correct session from the Session dropdown. If several files share the same missing pattern, select them all using the checkboxes and use bulk assignment.

**When a subject has fewer visit folders than the study defines:** This is a common longitudinal case. A subject with a single visit against two or more defined timepoints cannot have that visit automatically labeled, because the tool has no way to determine whether it is the baseline or a later timepoint.

To resolve, use the Session dropdown to assign each file to the correct timepoint. If the file names or dates make the correct assignment ambiguous, consult the site's clinical records to determine which visit occurred. Do not guess. An incorrect session assignment will place a scan under the wrong timepoint in the exported dataset, which is difficult to catch downstream.

**When several files must be assigned in chronological order:** Use the Assign in order to timepoints action. Select the files in the order they were acquired (earliest first) using the checkboxes, then click Assign in order to timepoints. The first selected file is paired with the earliest timepoint, the second with the next timepoint, and so on.

### 8.7 Reviewing and Correcting Classifications

The correction workflow supports both single-file edits and bulk operations.

**Single-file correction:**

1. Click the cell containing the value to change (Subject, Session, or Modality)
2. A dropdown opens showing all valid values for that column
3. Select the correct value. The change is applied immediately and logged to the audit trail.

**Bulk correction:**

1. Select multiple files using the checkboxes in the leftmost column
2. The bulk action bar appears at the top of the table
3. Choose the field to change (Session or Modality) and the value to assign
4. Click Apply. The value is set on all selected files at once.

**Reverting a change:** Click the cell again and select the original detected value from the dropdown. Detected values are marked in the dropdown with a small icon so they can be distinguished from user selections.

### 8.8 Audit Trail

Every user correction is logged in the audit trail with:

- The original auto-detected value
- The new user-assigned value
- The field that was changed
- A timestamp
- The tool's reasons for its original classification (so the reviewer's decision is contextualized)

The audit trail is described in full in Section 12.

### 8.9 Proceeding to Step 4

The Continue to Metadata button becomes active when all of the following are true:

- No files have the No session assigned badge
- No files have the Guessed badge (each has either been confirmed or reassigned to a different modality)
- Every subject has at least one file with a valid session and modality assignment

Files with the Duplicate or Derived badges do not block progress. These are informational and represent completed automatic decisions.

Click Continue to Metadata to proceed.

---

## 9. Step 4: Metadata

The Metadata step collects the information the tool cannot infer from the source files. This includes institution configuration, subject demographics, dataset-level description fields, and the defacing attestation.

### 9.1 Institution Configuration

| Field | Description | Example |
|---|---|---|
| Institution prefix | The 2 to 6 letter uppercase code used in BIDS subject IDs | `PENN`, `CHOP`, `HUP` |
| Starting number | The three-digit starting number for the first subject in this batch | `001` |

The tool generates BIDS subject IDs in the format `sub-<PREFIX><NNN>`. For example, an institution prefix of `PENN` with starting number `001` produces `sub-PENN001`, `sub-PENN002`, and so on. The mapping from the source subject group identifier to the generated BIDS ID is displayed in a table for review before proceeding.

The mapping from BIDS ID back to the real patient identifier is not entered into the tool and is never exported. That mapping must be maintained separately in a secure, access-controlled system at the originating institution per GOV-001 Section 2.3.

### 9.2 Subject Metadata

For each detected subject, enter the following:

| Field | Required | Description |
|---|---|---|
| Age | Yes | Age at time of the first session, in whole years |
| Sex | Yes | Male, Female, or Other |
| Sessions present | Auto-filled | Which sessions have data for this subject. Displayed for confirmation. |

Age must be entered as a whole number in years. Do not enter dates of birth. Entering a date of birth introduces PHI risk that is difficult to catch after export.

Sites that need to track additional clinical fields (diagnosis, staging, localization) should maintain that data in their own local clinical records system. The tool intentionally does not accept these fields to keep the export minimal and to reduce the surface area for PHI leaks.

### 9.3 Dataset Description

These fields populate the BIDS-required `dataset_description.json` file at the root of the export.

| Field | Required | Description |
|---|---|---|
| Dataset name | Yes | A human-readable name for the dataset |
| Authors | Yes | At least one author, typically the PI and data submitter. Multiple authors can be added. |
| Acknowledgements | No | Free-text acknowledgements such as funding statements |
| Funding | No | Grant numbers or funding source identifiers |
| BIDS version | Auto-filled | Set to the version of the BIDS specification the tool implements |
| Dataset type | Auto-filled | Set to `raw` |
| GeneratedBy | Auto-filled | Records that NeuroGate produced the dataset, with the tool version |

### 9.4 Defacing Attestation

Structural MRI files (T1w, T2w, FLAIR, PDw, T2starw) must be defaced before submission. The tool cannot verify this was performed correctly and requires an explicit attestation.

The attestation is a checkbox with the following text:

> I confirm that all structural MRI files (T1w, T2w, FLAIR, PDw, T2starw) in this dataset have been defaced using an approved defacing tool. I understand that facial features reconstructable from these scans would constitute protected health information under HIPAA.

Ticking the box records a timestamped audit entry with the attestation text, the user's session identifier, and the tool version. The exported audit log includes this entry as the site's compliance record.

If defacing has not been completed for one or more files, the attestation must not be ticked. Return to the source data, run the appropriate defacing tool (pydeface or equivalent), and re-import.

### 9.5 Proceeding to Step 5

Click Continue to Validation once all required fields are populated and the defacing attestation is confirmed. The tool re-runs its automatic checks against the completed metadata before advancing.

---

## 10. Step 5: Validation

Validation runs automated compliance checks against the BIDS specification and the rules defined in GOV-001. Each check is displayed with its status and, where applicable, the affected files.

### 10.1 Validation Categories

Checks are grouped by category and severity:

| Category | Description |
|---|---|
| Structure | Folder hierarchy and filename patterns match the BIDS specification for each modality |
| Metadata | Required JSON sidecar fields are populated for each imaging file |
| Required files | For Implant sessions, the required files listed in SOP-BIDS-001 Section 6 are present. For Custom timepoints, whatever modalities are present have complete file sets. |
| PHI | Filenames, folder paths, and JSON sidecar free-text fields do not contain PHI patterns |
| Cross-file consistency | Channel names in `channels.tsv` match electrode names in `electrodes.tsv`; sessions listed in `sessions.tsv` match the folders present |
| Content sanity | NIfTI headers parse cleanly and dimensions are within expected ranges |
| iEEG-specific | Minimum recording duration and format pairing rules (for example, Persyst `.dat` and `.lay` are present as a pair) |

Each check produces one of four outcomes:

| Outcome | Meaning | Effect on Export |
|---|---|---|
| Pass (green) | The check completed with no issues | None |
| Info (blue) | The tool applied automatic handling; the user should be aware of it | None |
| Warning (yellow) | An issue was detected that does not violate BIDS or governance requirements | Does not block export |
| Fail (red) | An issue was detected that violates BIDS or governance requirements | Blocks export until resolved |

### 10.2 Resolving Failures

Failures block export. Click any failing check to see the list of affected files and a description of the issue. Each failure includes a suggested resolution.

Common failure categories and their resolutions:

**Missing required metadata field.** A JSON sidecar is missing a field required by GOV-001 Section 3 for its modality. Return to the source data, add the field to the sidecar, and re-import. Alternatively, if the field is available from the DICOM headers, re-run the DICOM to NIfTI conversion with the appropriate dcm2niix flags to populate the sidecar automatically.

**PHI detected in filename or sidecar.** A pattern matching a full name, date, medical record number, or Social Security number was detected. Rename the affected file or edit the offending sidecar field outside the tool, then re-import.

**Missing required file for session.** Under the Implant sessions preset, a required file for a session is not present (for example, T1w is required for `ses-preimplant`). Either add the missing file to the source data and re-import, or if the file is genuinely unavailable, document the omission in the site's records and mark the subject for follow-up.

**Cross-file consistency failure.** A channel name in `channels.tsv` does not have a matching entry in `electrodes.tsv`. Correct the discrepancy in the source files and re-import.

### 10.3 Resolving Warnings

Warnings do not block export but should be reviewed. Common warnings and their meanings:

**Diffusion gradient table not matched to an image.** A `.bval` or `.bvec` file was found but the tool could not confidently match it to a specific diffusion image. This occurs when multiple diffusion series share the same b-value in the source data and the gradient table's filename does not identify which series it belongs to. The unmatched table is excluded from the export to prevent it from being paired incorrectly (which would attach the wrong gradient directions to a scan). To resolve, rename the source gradient table to match its intended acquisition, then re-import.

**Same series present twice.** Informational. The tool identified two copies of the same acquisition in the same folder and exported one copy. This is described in Section 8.4 under the Duplicate badge.

**Same filename in multiple sessions.** Informational. A file with the same name appears in more than one session for the same subject. This is expected in longitudinal studies. The tool has assigned run entities to keep filenames unique in the export.

**Subject has no session assigned.** The subject is held back from export. See Section 10.5.

### 10.4 PHI Scanning Details

The PHI scanner runs two complementary checks:

**Filenames and folder paths** are scanned for full names (sequences of capitalized words not matching known modality or session terms), medical record number patterns (numeric sequences of six or more digits), date patterns in common formats (`MM/DD/YYYY`, `YYYY-MM-DD`, `YYYYMMDD`), and Social Security Number patterns.

**JSON sidecar free-text fields** are scanned for the same patterns and for keyword matches against a list of common PHI-suggestive terms. The scanner focuses on the `SeriesDescription` and `ProtocolName` fields, which carry scan-descriptive information that the automatic sidecar de-identification (Section 11.1) does not touch. If a scanner operator typed a patient name or MRN into one of these fields, this check catches it.

If PHI is detected, the affected file must be corrected outside the tool and re-imported. The tool does not modify source files.

### 10.5 Held-Back Subjects

Individual subjects may be held back from export while the rest of the dataset proceeds. This happens when a subject has one or more blocking errors specific to that subject, most commonly no session assigned.

The Validation screen displays held-back subjects in a separate panel with the reason each was excluded and the number of files affected. The rest of the dataset can still be exported. The held-back subjects remain visible on the Export screen so the user can act on them later.

To include a held-back subject, return to Step 3 (Mapping Table) and resolve the issue named in the reason. The most common resolution is assigning sessions manually, as described in Section 8.6.

### 10.6 Proceeding to Step 6

Click Continue to Export once all failures are resolved. Warnings do not need to be resolved to proceed, but should be reviewed. The Validation screen remains available from the stepper at the top of the window if the user wishes to return to it after export.

---

## 11. Step 6: Export

The Export step generates the BIDS folder and writes it to a location the user selects.

### 11.1 Automatic Finalization During Export

During export the tool applies several automatic transformations. These run on every export regardless of whether specific warnings were raised in Validation.

**Uncompressed NIfTI files are compressed to `.nii.gz`.** Source files with the `.nii` extension are written to the export as `.nii.gz`. No user action is required.

**JSON sidecars are renamed to match their data files and placed alongside them.** The tool preserves the sidecar-to-data linkage that BIDS requires.

**EDF and BrainVision headers are de-identified.** The patient name, patient ID, birthdate, and sex fields in the recording header are blanked or replaced with the BIDS subject ID. The recording start date is shifted by a random per-subject offset (not zeroed) so relative timing between a subject's recordings is preserved while the absolute calendar date is removed. The offset is recorded in the audit log.

**JSON sidecar identifying fields are cleared.** DICOM-to-NIfTI conversion can carry identifying DICOM header fields into the JSON sidecar depending on conversion settings. Fields including patient name, patient ID, birthdate, institution name and address, referring and performing physician, scanner operator, station name, and device serial number are blanked in every sidecar. Acquisition and study date fields (`AcquisitionDate`, `AcquisitionDateTime`, `StudyDate`, `SeriesDate`) are shifted by that subject's same offset. Scan-descriptive fields that BIDS tooling requires (`SeriesDescription`, `ProtocolName`, `EchoTime`, `RepetitionTime`, and so on) are left intact.

**Run entities are assigned to distinguish repeated acquisitions.** When a session contains more than one acquisition of the same modality, each is given a `run-` entity (`run-1`, `run-2`, and so on) so that every filename in the export is unique. A scan's companion files (JSON sidecar, `.bval`, `.bvec`) share the same run number as the imaging file.

**Field-map images are named with their standard BIDS suffixes.** The tool reads the dcm2niix echo and phase markers in filenames (`_e1`, `_e2`, `_ph`) and assigns `magnitude1`, `magnitude2`, and `phasediff` suffixes to the corresponding files.

**Magnitude and phase pairs share a run entity with `part-` distinction.** When an SWI or T2*-weighted sequence produces a magnitude image and a phase image from a single acquisition, both are given the same run number and distinguished by the `part-mag` and `part-phase` entities. This is required by BIDS to indicate that both files come from one acquisition rather than two.

**Motion-corrected functional runs use the `rec-moco` entity.** When a scanner produces both a raw functional run and a motion-corrected reconstruction of it, both are given the same run number and the reconstructed version is marked with `rec-moco`.

**Single-band reference images use the `sbref` suffix.** Multiband diffusion or functional sequences produce a single-band reference volume that is exported alongside the main acquisition with the `sbref` suffix and the same run number.

**Duplicate copies of the same acquisition are excluded.** As described in Section 8.4.

**Scanner-computed derivatives are written to `derivatives/scanner/`.** As described in Section 11.3.

**Localizer and scout scans are excluded from the export.** These are acquisition aids rather than analyzable data.

### 11.2 Export Folder Structure

The exported folder follows the BIDS specification. A typical export looks like this:

```
<dataset-name>/
    dataset_description.json
    participants.tsv
    participants.json
    README
    CHANGES
    primary/
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
                ct/
                    sub-PENN001_ses-postimplant_ct.nii.gz
                    sub-PENN001_ses-postimplant_ct.json
                ieeg/
                    sub-PENN001_ses-postimplant_task-rest_ieeg.edf
                    sub-PENN001_ses-postimplant_task-rest_ieeg.json
                    sub-PENN001_ses-postimplant_task-rest_channels.tsv
                    sub-PENN001_ses-postimplant_electrodes.tsv
            ses-postsurgery/
                anat/
                    sub-PENN001_ses-postsurgery_T1w.nii.gz
                    sub-PENN001_ses-postsurgery_T1w.json
        sub-PENN002/
            ...
    derivatives/
        scanner/
            sub-PENN001/
                ses-preimplant/
                    dwi/
                        sub-PENN001_ses-preimplant_run-1_desc-ADC_dwi.nii.gz
                        sub-PENN001_ses-preimplant_run-1_desc-FA_dwi.nii.gz
                        sub-PENN001_ses-preimplant_run-1_desc-TRACEW_dwi.nii.gz
```

The `primary/` folder contains raw acquisitions. The `derivatives/scanner/` folder contains scanner-computed maps produced by the acquisition console, kept separate from the raw data per BIDS conventions.

The tool populates `primary/` and `derivatives/scanner/`. Additional folders under `derivatives/` for site-specific analysis pipelines are managed by the site outside this tool.

### 11.3 What Ends Up in `derivatives/scanner/`

The tool routes files identified as scanner-computed derivatives to `derivatives/scanner/` rather than `primary/`. The following file types are handled this way:

| Derivative | Source | BIDS Location |
|---|---|---|
| ADC map | Scanner-computed diffusion parameter map | `derivatives/scanner/.../dwi/*_desc-ADC_dwi.nii.gz` |
| FA map | Scanner-computed diffusion parameter map | `derivatives/scanner/.../dwi/*_desc-FA_dwi.nii.gz` |
| TRACEW map | Scanner-computed diffusion parameter map | `derivatives/scanner/.../dwi/*_desc-TRACEW_dwi.nii.gz` |
| Minimum-intensity projection (mIP) | Scanner-computed SWI projection | `derivatives/scanner/.../anat/*_desc-mIP_T2starw.nii.gz` |

These files are real data that were computed by the scanner rather than acquired. Keeping them separate from raw acquisitions is required by BIDS and prevents downstream analysis tools from mistaking a computed derivative for a raw scan.

### 11.4 Held-Back Subjects at Export

If any subjects were held back at the Validation step, the Export screen displays a summary before the download begins:

```
2 subjects will not be exported and need attention:

    sub-PENN003
        No session assigned (11 files): This subject has 1 visit folder
        but the study defines 2 timepoints (ses-2wk, ses-6mo), most likely
        a missed or not-yet-acquired visit. Which timepoint this is cannot
        be determined from the folder structure alone, so assign it manually.

    sub-PENN005
        No session assigned (30 files): Same as above.

3 of 5 subjects will be exported. The held-back subjects can be resolved
by returning to Step 3.
```

The user has two options at this point:

1. **Proceed with a partial export.** Click Export Anyway. The included subjects are exported normally. The held-back subjects remain in the current session so the user can resolve them and re-export without starting over.
2. **Return to Step 3.** Click Back to Mapping. Assign sessions to the held-back subjects, then return to Export.

### 11.5 Downloading the Export

1. Click Choose Export Location and select the folder where the BIDS output should be written
2. Click Export BIDS Dataset. The tool writes the folder to the chosen location.
3. When the export completes, two items are written:
    - The BIDS folder (named after the dataset name entered in Step 4)
    - The audit log, as `audit_log_<timestamp>.json`, in the same parent directory
4. A summary screen displays the counts of exported subjects, files, and derivatives, along with the location on disk

### 11.6 After Export

After exporting, the following steps are recommended:

1. **Verify the folder structure.** Open the export in a file browser and confirm the folder hierarchy matches expectations.
2. **Run the official BIDS validator (optional).** For additional assurance, run `npx bids-validator ./<dataset-name>/` in a terminal. The tool's internal checks are aligned with BIDS but the official validator provides an independent verification.
3. **Archive the audit log.** Store the audit JSON with the site's study records for compliance documentation. The audit log is the ALCOA+ evidence of every classification and correction that produced the export.
4. **Upload to the chosen data infrastructure.** Follow the site's own procedure for the platform it uses. Upload itself is out of scope for this SOP.

If any subjects were held back, resolve them by returning to Step 3, then re-export. A subsequent export includes whichever subjects the user has resolved, so the site can either merge the two exports into a single BIDS folder or upload them separately depending on the destination platform's conventions.

---

## 12. Audit Trail

The audit log is the ALCOA+ evidence produced by NeuroGate for every session. It records every automatic decision the tool made and every correction the user applied, with timestamps and enough context to reconstruct what happened after the fact.

### 12.1 Accessing the Audit Log During Use

An Audit Log button in the top-right of the header opens a panel showing the running log for the current session. The panel can be opened at any time without interrupting the workflow.

### 12.2 Contents of the Audit Log

Each entry in the audit log records the following fields:

| Field | Description |
|---|---|
| Timestamp | ISO 8601 date and time with millisecond precision |
| Event type | The category of event (see below) |
| Description | Human-readable description of what occurred |
| Details | Structured data specific to the event (file counts, old and new values, reasons for the tool's classification) |
| Actor | `system` for automated actions or `user` for manual corrections |
| Session ID | A UUID grouping all entries from a single tool session |

Event types recorded include:

- Session started (tool version, host operating system)
- Files scanned (file count, total size, source path)
- Structure preset selected
- Detection completed (per-file: detected session, modality, subject, confidence, reasons)
- Session corrected (per file: old session, new session, actor)
- Modality corrected (per file: old modality, new modality, actor)
- Subject group corrected (per file: old subject, new subject, actor)
- Metadata entered (per field: value, source `user` or `auto-filled` or `DICOM tag`)
- Defacing attested (timestamp, attestation text, tool version)
- De-identification offset applied (per subject: random date-shift value, in days)
- Validation run (per check: category, severity, outcome, affected files)
- Held-back subject (subject ID, reasons)
- Export started (destination path)
- Export completed (subject count, file count, total bytes, output paths)
- Error encountered (error details, context)

### 12.3 ALCOA+ Compliance

The audit log satisfies each ALCOA+ requirement as follows:

| Principle | How the Audit Log Satisfies It |
|---|---|
| Attributable | Each entry identifies whether the action was performed by the system or by a user, and includes the tool session identifier |
| Legible | The log is written as JSON with human-readable descriptions and CSV export for spreadsheet review |
| Contemporaneous | Timestamps are generated at the time of the action, not backfilled |
| Original | The log is append-only during the session. No entry is modified after it is written. |
| Accurate | Corrections record both the old and the new value so the change is unambiguous |
| Complete | Every file scan, detection decision, correction, validation check, and export operation is logged. No detection decision is silent. |
| Consistent | Every entry uses a standardized event-type vocabulary and field structure across all sites and versions of the tool |
| Enduring | The log is exported as a persistent file for long-term storage alongside the dataset |
| Available | The log is downloadable at any time during the session and is automatically written alongside the exported BIDS folder |

### 12.4 Storing the Audit Log

The audit log is written as a single JSON file next to the exported BIDS folder. The file is named `audit_log_<timestamp>.json` where the timestamp identifies the tool session.

Sites should store the audit log with their own study records according to their records-management policy. Some sites include the audit log inside the BIDS folder as part of the dataset; others store it separately in a compliance archive. Either is acceptable. The audit log is a compliance artifact rather than a BIDS artifact, so it is not required to remain with the dataset itself.

---

## 13. Longitudinal Study Handling

Datasets organized around repeated visits (Custom timepoints preset) require attention to a few specific behaviors that differ from datasets under the Implant sessions preset. This section describes those behaviors so users can anticipate them.

### 13.1 Visit Folder Recognition

The tool recognizes a range of common conventions for naming visit folders. Any of the following will be recognized as a timepoint if it matches one of the labels defined in Step 1:

- Number-and-unit forms: `2weeks`, `2wk`, `2 weeks`, `2_weeks`, `02weeks`
- Unit-first forms: `week2`, `week_02`, `wk2`, `W2`
- Word labels: `baseline`, `followup`, `screening`, `endpoint`
- Sequence labels: `visit1`, `V1`, `TP1`, `timepoint2`
- ISO dates: `20180510`, `2018-05-10`

Recognition is literal and only against the labels defined for the dataset. A folder named `week2` is recognized as `ses-2wk` only if the site defined a 2-week timepoint in Step 1.

Some conventions are intentionally not recognized:

- Single-letter session identifiers such as `T0`, `T1`, `T2` are not treated as visits. These overwhelmingly appear as modality names in imaging data (T1w, T2w), and treating them as sessions would misclassify structural scans.
- Single-letter subject identifiers such as `S1`, `S2` are not treated as visits. These overwhelmingly appear as patient IDs.
- Bare numeric folders such as `01`, `02` are not treated as visits. These overwhelmingly appear as subject folders.
- Unit conversions between different measures. A folder named `14days` is not recognized as `ses-2wk`, because a study may legitimately define both a 14-day and a 2-week visit as distinct timepoints.

### 13.2 Nested Folder Structures

The tool handles nested folder hierarchies at any depth. A common Flywheel-exported layout looks like this:

```
sub-01/
    scitran/
        study_name/
            cohort/
                sub-01/
                    2weeks/
                        <scan folders>/
                            <files>.nii.gz
                    6months/
                        <scan folders>/
                            <files>.nii.gz
```

The tool searches for the folder level that partitions the subject's files into the correct number of timepoints. In this example, the `2weeks/` and `6months/` level is identified as the session level and the subject is grouped correctly.

Datasets with different depths across subjects (some flat, some Flywheel-nested) are handled in the same pass. The tool determines the correct level per subject independently.

### 13.3 Missed and Not-Yet-Acquired Visits

When a subject has fewer visit folders than the study defines, the tool holds the subject back rather than guessing which timepoint the visit represents.

For example, if the study defines `ses-2wk` and `ses-6mo` but a subject has only a single visit folder, the tool cannot determine whether that visit is the baseline or the follow-up. The subject is held back with a message describing the situation:

> This subject has 1 visit folder but the study defines 2 timepoints (`ses-2wk`, `ses-6mo`), most likely a missed or not-yet-acquired visit. Which timepoint this is cannot be determined from the folder structure alone, so assign it manually.

Missed visits are routine in longitudinal work. The tool treats them as a first-class case rather than an error. To resolve, return to the Mapping Table (Step 3), use the Session dropdown to assign each of the subject's files to the correct timepoint, and continue to Export. The subject can also be exported separately by re-running the workflow with a Single session preset (a variant of Custom timepoints with only one timepoint defined) if the site's records confirm the visit is the only one that will ever be acquired for that subject.

### 13.4 Repeated Scan Names Across Visits

Longitudinal studies routinely acquire the same scan protocol at every visit, which produces files with identical names in each visit folder. For example, a subject with two visits both containing an `MPRAGE.nii.gz` file will produce two files with the same base name.

The tool handles this automatically. The full folder path is used to distinguish the files during grouping, so both are correctly assigned to their respective visits. In the export, run entities are assigned to keep filenames unique within each session as needed.

An informational warning is displayed in Validation ("Same filename in multiple sessions") to make this transparent, but no action is required.

### 13.5 Cohort Presets Across Subjects

When different subjects in a study have different session structures (for example, one subject has both visits and another is a single-visit case), run those subjects together. The tool determines the appropriate session assignment per subject rather than assuming all subjects follow the same structure. Held-back subjects can be exported separately as described in Section 13.3.

---

## 14. Troubleshooting

The following table lists common issues and their resolutions.

| Issue | Likely Cause | Resolution |
|---|---|---|
| Files do not appear after being dropped | The file extension is not recognized, or files are in DICOM format | Confirm the extensions match the accepted list in Section 7.2. Convert any DICOM files to NIfTI using dcm2niix before importing. |
| Most files are marked low confidence | Source data lacks descriptive names and is not organized into per-subject or per-session folders | Organize files into subject or session folders before importing, or use bulk correction in the Mapping Table to assign sessions and modalities in batch |
| Many files show the Guessed badge | Modality tokens in filenames are unfamiliar to the tool | Review each guessed file in the Mapping Table and either confirm the guess or select the correct modality. If a common vendor sequence name is not being recognized, report it to the project lead for inclusion in the next release. |
| A subject is held back with "No session assigned" | The subject has fewer visit folders than timepoints defined for the dataset | Return to Step 3, use the Session dropdown to assign each file to the correct timepoint per the site's clinical records |
| PHI detected in a filename | The source filename contains a patient identifier | Rename the file outside the tool to remove the PHI, then re-import. The tool does not modify source files. |
| PHI detected in a sidecar description | A patient name or MRN was typed into a `SeriesDescription` or `ProtocolName` field at the scanner console | Edit the sidecar outside the tool to remove the PHI, then re-import |
| Cannot proceed past validation | One or more failing checks are blocking export | Click each failing check to see the affected files and the recommended resolution. Return to the appropriate step and correct the issue. |
| Cannot proceed past mapping table | Files remain with the "No session assigned" or "Guessed" badge | Use the Needs Your Decision filter to see remaining files and resolve each one |
| Duplicate diffusion gradient tables warning | Multiple diffusion series share the same b-value and the gradient table's filename does not identify which one it belongs to | Rename the source gradient table to match its intended acquisition (for example, `DTI_b1000_series7.bval`), then re-import. If the correct pairing is unknown, consult the acquisition records. |
| Export produces empty derivatives folder | No scanner-computed derivative maps were present in the source data | Expected. The derivatives folder is created only when ADC, FA, TRACEW, or mIP files are present. |
| A file is unexpectedly in derivatives instead of primary | The tool identified the file as a scanner-computed derivative | Review the Modality dropdown in the Mapping Table. If the file is a raw acquisition rather than a derivative, override the classification. See Section 11.3 for the full list of files routed to derivatives. |
| Unsure what a status badge in the Mapping Table means | Guessed, Duplicate, Derived, or No session assigned badge appears on a file | See Section 8.4 for a description of each badge and the action required (if any) |
| Application does not launch on macOS | The application has not been granted permission to run | Right-click the application, select Open, and confirm the security dialog. This is required only on the first launch. |
| Application launches then closes immediately | Common causes include insufficient permissions on the export destination folder, or a corrupted download | Try selecting a different export location. If the problem persists, redownload the installer from the project website. |

### 14.1 Reporting Issues

If an issue is not resolved by the guidance in this section, contact the project lead with the following information:

- Tool version (displayed in the lower right of the application window)
- Operating system and version
- A description of the workflow step where the issue occurred
- Any error messages displayed by the tool
- The audit log for the affected session, if available. The audit log contains detailed context on what the tool did and does not contain PHI (the tool never handles PHI in the first place).

---

## 15. Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | April 2026 | Brandon Bach | Initial release covering the six-step workflow, browser-based tool model, five-layer detection engine, and Implant sessions preset |
| 1.5 | May 2026 | Brandon Bach | Added JSON sidecar de-identification and EDF header cleaning behavior; expanded modality coverage to include fMRI, ASL, MR angiography, and field maps |
| 1.9 | August 2026 | Brandon Bach | Added the Custom timepoints preset and Step 1 (Choose Your Structure); revised the mapping table to show both session preset options; clarified that upload is out of scope |
| 2.0 | August 31, 2026 | Brandon Bach | Substantive rewrite. Reframed the tool from browser-based to a desktop application (Section 4 installation, Section 5 tool overview). Expanded modality coverage to include PDw, T2starw, MoCoSeries functional, single-band references, and magnitude/phase pairs (Section 8.2). Added the mapping table status badges (Section 8.4) documenting the guessed-modality quarantine gate, duplicate resolution, and derivative separation behaviors introduced in the 2026-08-17 detection engine improvements. Added the Needs Your Decision filter (Section 8.5). Added the derivatives export path documentation (Section 11.3). Added the held-back subject behavior (Sections 10.5 and 11.4) allowing partial export when individual subjects cannot be resolved automatically. Added a dedicated Longitudinal Study Handling section (Section 13) covering visit folder recognition, nested layouts, and missed visits. Expanded troubleshooting to cover the new behaviors. |
