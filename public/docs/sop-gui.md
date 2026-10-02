# SOP-GUI-001: NeuroGate Compliance Tool User Guide

| Field | Value |
|---|---|
| **Document ID** | SOP-GUI-001 |
| **Version** | 3.1 |
| **Effective Date** | 2026-10-02 |
| **Author** | Brandon Bach |
| **Status** | Draft, Pending Advisor Review |
| **Parent Framework** | GOV-001 Regulatory and Governance Framework v2.2 |
| **Related Documents** | SOP-BIDS-001 v3.2 |

---

## 1. Purpose

This Standard Operating Procedure explains how to use NeuroGate to organize, check, and export neural data in NeuroGate's BIDS-based structure, which follows Brain Imaging Data Structure (BIDS) naming conventions (SOP-BIDS-001 Section 5). NeuroGate is a desktop application. It classifies imaging and electrophysiology files, assigns BIDS names, scans file and folder names and JSON sidecars for protected health information (PHI) patterns, applies a limited set of de-identification steps on export, and keeps an audit log of the session.

The tool writes a BIDS-based dataset folder to the local computer. Uploading that folder to a data infrastructure is out of scope for this SOP and is handled per each site's own procedures for the platform it has chosen.

---

## 2. Governance Traceability

This SOP supports the following requirements from GOV-001:

| GOV-001 Section | Requirement | How This SOP Addresses It |
|---|---|---|
| 2.1 FAIR Principles | Data must be structured in machine-readable, interoperable formats | The tool places each file in a BIDS folder with a BIDS name, carries over existing JSON sidecars next to their data files, and generates `dataset_description.json`, `participants.tsv` and per-subject `sessions.tsv` files (Section 11) |
| 2.2 ALCOA+ Data Integrity | Data transformations must be attributable and contemporaneous | The audit log records timestamped setup, detection, correction, metadata, validation and export events. Its limits are listed in Section 12. |
| 2.3 HIPAA/PHI Protection | PHI must be removed before data leaves the originating site | The tool scans file names, folder names, sidecar text and TSV table contents for PHI patterns (Section 10.4) and on export de-identifies EDF/BDF headers and annotations, Persyst `.lay` files, selected JSON sidecar fields and `sessions.tsv` dates (Section 11.1). It does not de-identify everything; see Section 11.1 for what is not changed. |
| 2.5 QMS Documentation | SOPs must include step-by-step procedures | Sections 6 through 11 give the workflow in order |
| 5 Audit Traceability | Corrections and detection decisions must be documented | Every Mapping correction is logged with its old and new value. Detection is logged as summary counts; per-file detection reasons are shown in the Mapping table but are not written to the log (Section 12.3). |

---

## 3. Scope

This SOP applies to anyone preparing neural data files for sharing, whether at a research site or working independently. Typical users include research coordinators, imaging technologists, data managers, and individual researchers.

**In scope:**

- Organizing neural data files into a BIDS folder structure. Supported inputs are NIfTI imaging files, EDF/BDF, NWB and Persyst recordings, JSON sidecars, diffusion gradient tables, and TSV tables (full list in Section 7.2)
- Reviewing and correcting the tool's automatic classifications
- Entering dataset-level metadata and the defacing attestation
- Running the tool's checks before export
- Exporting a BIDS folder together with the audit log (a full log for the site and a shareable copy)

**Out of scope:**

- Converting DICOM or ECAT PET files to NIfTI. This must be done before opening NeuroGate. The in-app Pre-Processing page gives dcm2niix commands with PHI-safe filename templates, a conversion helper script, and PET2BIDS (`dcm2niix4pet`) commands for PET.
- Defacing anatomical images. This must be done before opening NeuroGate (the Pre-Processing page describes pydeface). NeuroGate does not deface images and cannot verify that defacing was done.
- Uploading the exported folder to a data infrastructure. Each site follows its own upload procedure for the platform it has chosen.
- Any processing under `derivatives/` beyond the scanner-computed maps the tool places in `derivatives/scanner/`. Site-specific analysis pipelines populate `derivatives/` separately.

---

## 4. Prerequisites

The following are required before starting the workflow.

### 4.1 Software

| Requirement | Details |
|---|---|
| Operating system | macOS on Apple Silicon, Windows, or Linux. There is no macOS build for Intel Macs. |
| NeuroGate desktop application | Downloaded from the Download page of the project website. See Section 4.4. |
| Storage | Enough free disk space for the exported BIDS folder in addition to the source data. The desktop app copies files into a new folder; it never modifies the source files. |

A command-line interface (CLI) is bundled with every desktop build. It is summarized in Section 15 and is not required to follow this SOP.

### 4.2 Data Preparation

Before opening NeuroGate, the following must be complete:

| Requirement | Details |
|---|---|
| DICOM conversion | All imaging files must be NIfTI. Uncompressed `.nii` is accepted and is gzipped to `.nii.gz` on export. DICOM (`.dcm`, `.dicom`, `.ima`) and ECAT PET (`.v`, `.v.gz`) files are flagged with a warning and are not exported. |
| Defacing | All structural MRI (T1w, T2w, FLAIR, PDw, T2*w) must be defaced. The tool does not deface and cannot verify defacing. An attestation checkbox is required before the workflow can continue when any of these modalities is present. PET is exempt from defacing. |
| Institution prefix | A 2 to 6 letter uppercase code used in BIDS subject IDs (for example, PENN, CHOP, HUP). Sites choose their own prefix. |
| Starting subject number | A whole number of 1 or more for the first subject in this batch. It is padded to at least three digits in the ID. Coordinate with any collaborators sharing the same prefix to avoid ID collisions. |
| Source data organization | Per-subject folders are recommended. Any folder layout is accepted, but descriptive folder and file names (containing session or modality keywords) improve automatic detection. |

### 4.3 What the Tool Uses to Classify Files

The detection engine combines several signals, strongest first:

1. The JSON sidecar's DICOM `Modality` field (`PT`, `CT`, `MR`) and PET-only fields
2. The sidecar's `ImageType`, which identifies scanner-derived ADC, FA and TRACEW maps
3. EDF channel labels, which tell scalp EEG from iEEG
4. Keywords in the sidecar scan name (`SeriesDescription`, `ProtocolName` and similar fields)
5. Keywords in the file name
6. Folder names
7. Neighbouring files
8. Subject grouping
9. For Custom timepoints only: clusters of dates and folders

**Fallback:** a `.nii.gz` file that no signal identifies is set to T1w, marked as a guess, and is not exported until the user picks a modality (Section 8.3). An unidentified `.nii` file stays Other / Unknown.

### 4.4 Installation

Download NeuroGate from the Download page of the project website:

<https://epilepsy-gui.vercel.app/download>

The page always offers the latest release, puts your system first, and shows the install steps below for each platform. The installer files themselves are published on GitHub Releases (<https://github.com/brandonbach44-sudo/Neurogate-Protocol/releases/latest>), which also lists older versions.

| Platform | File |
|---|---|
| macOS (Apple Silicon only) | `NeuroGate-<version>-arm64.dmg` |
| Windows | `NeuroGate-Setup-<version>.exe` |
| Linux | `NeuroGate-<version>.AppImage` |

The builds are not signed with an Apple Developer ID or a Windows code-signing certificate (the macOS build is ad-hoc signed), so each operating system shows a warning on first launch.

**macOS installation:**

1. Download the `.dmg` file from the Releases page
2. Double-click the file to mount the disk image
3. Drag the NeuroGate icon to the Applications folder
4. Launch NeuroGate from Applications
5. If macOS blocks the app, open System Settings, go to Privacy & Security, and click Open Anyway next to the NeuroGate message. Confirm when asked.

**Windows installation:**

1. Download the `NeuroGate-Setup-<version>.exe` file from the Releases page
2. Double-click to run the installer
3. If Windows SmartScreen shows "Windows protected your PC", click More info, then Run anyway
4. Follow the installer prompts, then launch NeuroGate

**Linux installation:**

1. Download the `.AppImage` file from the Releases page
2. Make it executable by running `chmod +x NeuroGate-<version>.AppImage` in a terminal, or by enabling execute permission in the file's properties
3. Double-click the file to launch, or run it from a terminal

All processing happens on the local computer. No patient data is uploaded anywhere. The desktop app runs a small web server on `127.0.0.1:3001` that is reachable only from the same computer and serves the app's own pages. The only network requests the app makes are the update check (to GitHub) and loading fonts from Google Fonts.

### 4.5 Updates

Each time the installed app starts, it checks GitHub Releases for a newer version. If the check fails (for example, when offline), nothing is shown.

- **Windows and Linux:** a dialog offers the new version with Download or Later. After Download, the update downloads in the background while you keep working, then a second dialog offers Restart now or Later. If you choose Later, the update installs the next time you quit NeuroGate.
- **macOS:** a dialog offers Open download page or Later. Open download page opens the release page in the browser. Download the new `.dmg` and drag NeuroGate into Applications to replace the old version.

### 4.6 Installing the Command-Line Tool (Optional)

An **Install CLI** button appears in the top navigation bar of the Home, Documentation, Pre-Processing and About pages. It is not shown on the tool page, and it is hidden when the window is narrow.

Clicking it copies the `neurogate` command into a `bin` folder inside NeuroGate's application-data folder.

- **Windows:** the folder is also added to your user PATH. Open a new terminal window before using the command.
- **macOS and Linux:** the panel shows the folder; add it to your PATH yourself.

When it succeeds, the panel shows the command `neurogate <folder>` with a Copy button.

### 4.7 Verifying the Installation

The NeuroGate version appears in the footer of the Home, Documentation, Pre-Processing and About pages. Confirm it matches the release you downloaded.

---

## 5. Tool Overview

The tool page runs a six-step workflow. The stepper at the top shows the steps as:

**Structure · Drop Files · Mapping · Metadata · Validate · Export**

```
Step 1: Structure
    Answer whether subjects have more than one session, then choose
    Single session, Implant sessions, or Custom timepoints
        |
        v
Step 2: Drop Files
    Add a folder or files
        |
        v
Step 3: Mapping
    Review the automatic classifications and correct them
        |
        v
Step 4: Metadata
    Institution prefix, dataset description, defacing attestation
        |
        v
Step 5: Validate
    Review the checks and resolve anything that blocks export
        |
        v
Step 6: Export
    Write the BIDS folder and the audit log
```

The stepper only shows progress; it cannot be clicked. Use the buttons at the bottom of each step to move forward or back.

### 5.1 Going Back Loses Work

Some Back buttons discard what was entered. Plan the workflow so that you do not need them:

| Action | What is lost |
|---|---|
| **Back to Drop Zone** (on Mapping) | The dropped files, every Mapping correction, and the saved progress. The chosen structure and the audit log are kept. |
| **Back to Mapping** (on Metadata), then returning to Metadata | Every Metadata entry: prefix, starting number, study name, authors, attestation |
| **Back to Metadata** (on Validate) | Every Metadata entry, as above |
| **Back to Validation** (on Export) | Validation is re-run, which clears every dismissed issue |

The audit log lasts for the whole app session, including across Back to Drop Zone and additional datasets. Reloading or closing the app loses it, so save it first (Section 12.1).

Section-by-section instructions for each step begin in Section 6.

---

## 6. Step 1: Structure

Before dropping any files, choose how the dataset's sessions are organized. This choice decides whether the export has `ses-` folders, which session labels the Mapping table offers, and how detection assigns sessions.

### 6.1 The First Question

The Structure screen first asks: **"Does each subject have more than one session of data?"**

- **No** selects **Single session**: one folder per subject with no `ses-` level and no `sessions.tsv`. Use it for cross-sectional studies, or a single-block acute or implant recording with no follow-up timepoints.
- **Yes** shows two presets to choose from: **Implant sessions** and **Custom timepoints**.

### 6.2 The Multi-Session Presets

**Implant sessions** defines three fixed sessions for an implant-based surgical workup:

- `ses-preimplant`
- `ses-postimplant`
- `ses-postsurgery`

The per-session file requirements are documented in SOP-BIDS-001. Only this preset has required-file checks (Section 10.4).

**Custom timepoints** is for longitudinal studies without an implant procedure. Each timepoint is a number from 0 to 99 plus a unit: days, weeks, months, years, or "sessions (no time interval)". Labels are generated from those two inputs only, with no free text, for example `ses-1d`, `ses-2wk`, `ses-6mo`, `ses-1yr`, or `ses-1` for the "sessions" unit. A timepoint numbered 0 is marked as baseline. Between 1 and 24 timepoints can be defined. Timepoints are ordered by elapsed time (a month counts as 30 days and a year as 365), not by the order they were entered, and duplicate labels are blocked.

### 6.3 How to Choose

The choice depends on the study design rather than the modalities present.

- Choose **Single session** if each subject has one block of data.
- Choose **Implant sessions** if the data represent pre-implant evaluation, intracranial monitoring, and post-surgery follow-up for the same patient.
- Choose **Custom timepoints** if the data represent visits at defined intervals (for example, 2 weeks and 6 months after baseline).

### 6.4 Procedure

1. On the Structure screen, answer the first question with **No** or **Yes**.
2. If you answered No, review the Single session card and click **Continue**.
3. If you answered Yes, click **Implant sessions** or **Custom timepoints**. The selected card is highlighted.
4. For Custom timepoints, use the **Define timepoints** panel: enter a number and choose a unit for each visit, click **+ Add timepoint** for more, and **Remove** to delete one. Check the generated labels and the **Session order** preview.
5. Click **Continue** to go to Drop Files. **Back** returns to the first question.

**The structure can't be changed after you add files without starting over,** as the Structure screen says. To change it, click Back to Drop Zone on the Mapping step and then reload the app. Reloading also clears the audit log, so save the log first if you need it.

---

## 7. Step 2: Drop Files

### 7.1 Procedure

1. Drag a folder or files onto the drop zone, or use the "browse folder" or "select files" links. Any folder layout is accepted, and the folder hierarchy is used as evidence during detection.
2. The tool scans the files and moves to the Mapping step when detection is complete.

**Memory use:** the desktop app records only the location of each file, not its contents, so files of any size work. (When NeuroGate runs in a web browser instead of the desktop app, files up to 500 MB are held in memory.)

### 7.2 Recognized File Types

| Extension | How it is handled |
|---|---|
| `.nii.gz`, `.nii` | Imaging. `.nii` is gzipped to `.nii.gz` on export. |
| `.json` | Sidecar, paired with the data file of the same base name in the same folder |
| `.edf`, `.bdf` | Scalp EEG or iEEG, told apart by the channel labels in the EDF header |
| `.nwb`, `.dat`, `.lay` | iEEG. Every `.dat` file is treated as Persyst. A `.lay` file is rewritten on export (Section 11.1). |
| `.bval`, `.bvec` | Diffusion gradient tables |
| `.tsv` | electrodes, channels and events tables. Other `.tsv` files export only alongside a data file of the same base name. |
| `.csv` | Warning: BIDS needs `.tsv`. Exported only alongside a data file of the same base name, renamed (not converted) to `.tsv`. |
| `.dcm`, `.dicom`, `.ima` | Warning: convert DICOM to NIfTI first. Not exported. |
| `.v`, `.v.gz` (ECAT PET) | Warning: convert to NIfTI first. Not exported. |
| anything else | Other / Unknown. Not exported. |

BrainVision (`.vhdr`, `.eeg`, `.vmrk`), DICOM input, ECAT, and PET blood data (`_blood.tsv`) are not supported.

### 7.3 Files That Are Dropped Silently

Operating-system files never appear in the Mapping table and are never exported: `.DS_Store`, `Thumbs.db`, any file whose name begins with a period (including macOS `._` AppleDouble files), and in-progress copy files. If a real data file has been renamed to begin with a period, restore its name before dropping the folder.

### 7.4 Saved Progress

The tool saves the Mapping state in the app's tab storage for 12 hours. When saved progress exists, a "Saved progress from … ago" banner appears with a **Discard** button.

- Adding exactly the same folder again (same names, sizes and paths) restores the mapping automatically. Anything different discards it.
- Metadata is never saved and must be re-entered.

---

## 8. Step 3: Mapping

The Mapping table shows every file with its automatic classification and lets you correct it.

### 8.1 Table Columns

| Column | Description |
|---|---|
| (checkbox) | Selects the row for bulk edits |
| Original File | The file's path in the dropped folder, with the BIDS path it will be exported to shown underneath |
| Subject | The subject group, as a free-text field. This is the name from the source data; BIDS IDs are assigned in Metadata. |
| Session | Dropdown of the structure's sessions. Hidden for Single session. |
| Modality | Dropdown of modalities |
| Confidence | High (green), Medium (yellow), Low (orange), or Needs Review (red) |

Clicking a row shows its **Detection Reasons** and **File Info**.

### 8.2 Filters

The filter bar shows a count for each filter: **All**, **High**, **Medium**, **Low**, **Needs Review**, and **Needs your decision**.

**Needs your decision** lists the files that will not be exported until you act: files with a guessed modality, and files with no session that the tool cannot place. Start the review with this filter.

### 8.3 Badges Under the File Name

**Guessed: pick a modality to export (orange).** No signal identified the scan, so the modality shown is the T1w fallback. The file is not exported until you choose a modality in the Modality dropdown, even if T1w is correct. Choosing any modality clears the badge. A guessed file gets no message in the Validate step, so this badge is the only warning. A guessed T1w still counts as structural MRI for the defacing attestation.

**Duplicate of `<filename>` (yellow).** The same series was converted twice (a bare name plus dcm2niix's decorated `_<name>_<digits>_<n>` copy in the same folder). The decorated copy, which carries the scanner sidecar, is exported and this copy is not. Setting a modality on this row exports it as well.

**Derived: `<label>` (blue).** The file is a scanner-computed map (ADC, FA, TRACEW or mIP). It is exported under `derivatives/scanner/` with a `desc-<label>` entity instead of under `primary/`. The Mapping table has no control to move it to `primary/`.

### 8.4 Correcting Classifications

**Single-file correction:** edit the Subject text, or choose a new value in the Session or Modality dropdown. The change applies immediately and is logged.

**Bulk correction:**

1. Tick the checkboxes of the rows to change
2. Use **Set session…** or **Set modality…**, then click **Apply**
3. Click **Clear selection** when done

**Assign in order to timepoints:** with Custom timepoints and two or more rows ticked, this button assigns the ticked rows to the timepoints in the order you ticked them (first ticked to the earliest timepoint, and so on).

**Audit log:** each session, modality or subject correction is logged with the old and new value. Subject edits are logged per keystroke. Bulk edits are logged as a count of files.

### 8.5 Proceeding to Step 4

**Continue to Metadata** is always enabled. The Mapping step does not stop you from continuing with unresolved files:

- Files with no session produce an error in Validate that cannot be dismissed and blocks export.
- Guessed files are not exported. Validate lists them in one warning per subject.

Clear the **Needs your decision** filter before continuing.

---

## 9. Step 4: Metadata

The Metadata step has four tabs. The header shows "N of 4 sections complete", and each tab is marked complete or incomplete.

### 9.1 Institution Setup

| Field | Description | Example |
|---|---|---|
| Institution Prefix | 2 to 6 uppercase letters (required) | `PENN` |
| Starting Number | A whole number of 1 or more | `1` |

Subject IDs are `sub-<PREFIX><number padded to at least 3 digits>`. A prefix of `PENN` with starting number 1 gives `sub-PENN001`, `sub-PENN002`, and so on. The tab shows a Subject ID Preview. Subjects are numbered in the order they were detected.

The link from a BIDS ID back to the real patient is not entered into the tool and is never exported. It must be kept in a secure, access-controlled system at the originating institution per GOV-001 Section 2.3.

### 9.2 Subject Sessions

A read-only list of each subject's session labels. Nothing is entered here. No demographics (age, sex, handedness) are collected anywhere in the tool. Demographics are optional; a site that needs them adds them to `participants.tsv` after export (SOP-BIDS-001 Section 10.2).

### 9.3 Dataset Description

These fields populate `dataset_description.json`.

| Field | Required | Description |
|---|---|---|
| Study name | Yes | A human-readable name for the dataset |
| Authors | Yes | At least one author |
| Dataset type | Read-only | `raw`, unless a dropped `dataset_description.json` supplies a value |
| BIDS version | Read-only | `1.8.0`, unless a dropped `dataset_description.json` supplies a value |

`GeneratedBy` (NeuroGate, the app version and the structure used) is added automatically on export.

### 9.4 Defacing Attestation

When any T1w, T2w, FLAIR, PDw or T2*w image is present (a guessed T1w counts), one checkbox is required:

> I confirm that all structural MRI files in this dataset have been defaced or de-identified using an approved defacing tool before being included in this dataset.

When the box is ticked, the screen shows the time it was confirmed. When you leave Metadata with the box ticked, the audit log gets a "Defacing attestation confirmed" entry. That entry does not contain the attestation text, and unticking the box is not logged.

If no structural MRI is present, the tab says the attestation is not required.

If defacing has not been done for one or more files, do not tick the box. Deface the source data (Pre-Processing page), then start again.

### 9.5 Auto-Fill

- The study name and authors are filled from a dropped `dataset_description.json`.
- Session dates are taken from a dropped `sessions.tsv`, or from a sidecar's `AcquisitionDateTime` when the file sits in a `ses-<label>` folder. These dates are not shown on screen. They are used by the date-order check (Section 10.4) and exported, date-shifted, in `sessions.tsv`.

### 9.6 Proceeding to Step 5

Click **Continue to Validation**. If anything required is missing, the tool lists it under "Please complete the following before continuing" and does not continue. Required items are a valid prefix, the study name, at least one author, and the attestation when structural MRI is present.

---

## 10. Step 5: Validate

The Validate step runs the tool's checks and shows the results. Under SOP-BIDS-001, a dataset must pass these checks with no errors (Section 10.2) before export.

### 10.1 The Validation Screen

- A banner reads **Validation Passed** or **Validation Failed**, with counts of errors, warnings and info (and dismissed issues, if any).
- Category cards appear for each category that has issues: BIDS Structure, PHI / Privacy, Required Files, Cross-Session, File Format, Metadata, Defacing. Clicking a card filters the list to that category.
- A severity filter shows **All**, **Error**, **Warning** and **Info**, with counts.
- Clicking an issue expands it. Issues that allow it show **Dismiss this issue**.
- **Re-run Checks** runs the checks again and clears all dismissals.

| Severity | Effect on export |
|---|---|
| Error | Blocks export unless dismissed. Most errors cannot be dismissed. |
| Warning | Does not block export |
| Info | Does not block export |

### 10.2 What Blocks Export

Any error that has not been dismissed blocks export. The button then reads **Fix N Errors to Continue** instead of **Continue to Export**. The only errors that can be dismissed are the Implant sessions required-file errors.

Dismissals are not written to the audit log. They are cleared by Re-run Checks and by returning from Export with Back to Validation.

### 10.3 Resolving Errors

Most errors must be fixed in an earlier step or in the source data:

- **No session assigned / subject has no BIDS ID:** go back to Mapping and assign the session. Going back to Mapping resets Metadata (Section 5.1).
- **PHI error in a file or folder name:** rename the file or folder outside the tool, then start again with the corrected folder. The tool does not modify source files.
- **Implant required file missing:** add the file and start again, or, if the file genuinely does not exist, dismiss the error and record the omission in the site's records.
- **Sessions out of chronological order (Implant, auto-filled dates):** check the session assignments in Mapping against the site's records.
- **Duplicate subject ID:** check the Subject column in Mapping.
- **Two files would get the same name:** the tool renamed one of them `…_dup-N`. Usually the two files are the same scan, or one is in the wrong session or has the wrong modality. Fix the session or modality in Mapping, or remove the extra file from the source folder and start again.
- **Sidecar is not valid JSON:** the file cannot be de-identified, so it cannot be exported. Fix or remove the `.json` file in the source folder, then start again.

### 10.4 The Checks

**BIDS structure**

- Errors (cannot be dismissed): no session assigned; subject has no BIDS ID; two files would get the same name (one was renamed `_dup-N`); a sidecar that would be exported is not valid JSON, so it cannot be de-identified
- Warnings: files whose modality is only a guess and will not be exported (one warning per subject, listing the files); unclassified file (not exported); orphaned JSON sidecar (not exported); duplicate sidecar; unmatched `.bval`/`.bvec`
- Info: special characters in a name; same series present twice
- Duplicate-copy files get no message of their own. They are flagged in Mapping.

**PHI in file and folder names**

- Errors (cannot be dismissed): Social Security number; medical record number (an MRN or MR# prefix with 5 to 10 digits); a date-of-birth marker followed by digits; `patient`, `pt`, `subj` or `subject` followed by a first and last name; a subject group that looks like a person's name
- Warnings: phone number; email address; MM/DD/YYYY or MM-DD-YYYY dates; "Last, First"; the first match of these keywords (underscore variants included): firstname, lastname, fullname, patientname, ssn, social_security, address, street, zipcode, insurance, policy_number, accession, acc_num
- Sidecar content: every string field of a JSON sidecar that is not already de-identified, including nested fields, is scanned with the same patterns, plus a warning for two capitalized words that could be a name.
- Table contents: every cell of each exported TSV file (electrodes, channels, events and others) is scanned with the same patterns and keywords. Purely numeric cells are skipped, and so is the two-capitalized-words check, which would flag event labels such as "Seizure Onset". Tables are exported unchanged, so fix a finding in the source file.
- Not scanned: an EDF header that looks identifying is shown only as a warning in the Mapping table's detection reasons. The header itself is always de-identified on export (Section 11.1).

**Required files (Implant sessions only)**

Checked for each session in which the subject has files. Only files that will be exported count, so a guessed file or a duplicate copy does not satisfy a requirement.

| Session | Errors | Warnings |
|---|---|---|
| `ses-preimplant` | T1w | T2w |
| `ses-postimplant` | CT, iEEG, electrodes.tsv, channels.tsv | events.tsv |
| `ses-postsurgery` | T1w | T2w |

A subject with fewer than 4 imaging, EEG or table files gets these as warnings instead. Every required-file issue can be dismissed. Also: "Subject has no sessions" (error) and "Session has only sidecar/metadata files" (warning).

**Cross-session**

- Implant sessions, when dates were auto-filled: sessions out of chronological order (error)
- Duplicate subject ID (error)
- Same file name in several sessions (warning)
- iEEG without electrodes.tsv in that session (warning)
- Single-session subject (info)

**PET:** a warning, which can be dismissed, when a PET image has no sidecar or its sidecar lacks any of the PET fields required by SOP-BIDS-001 (Section 6.1.7). It never blocks export.

**Metadata:** missing dataset name, authors, prefix or defacing attestation are errors, but the Metadata step already prevents them. Also: sparse dataset (warning) and empty dataset (error).

**Not checked:** per-modality required JSON fields (other than PET); channel names against electrodes; NIfTI headers or dimensions; iEEG minimum duration; Persyst `.dat`/`.lay` pairing; `sessions.tsv` against the folders; scanner or site consistency.

### 10.5 Proceeding to Step 6

Click **Continue to Export** once no undismissed errors remain. Review warnings before continuing, even though they do not block. Continuing adds a "validation passed" entry to the audit log.

---

## 11. Step 6: Export

The Export screen shows the output folder tree, the number of subjects and files, the total size, and the list of metadata files NeuroGate generates (`dataset_description.json`, `participants.tsv`, and a `sessions.tsv` per subject unless the structure is Single session).

### 11.1 De-identification Applied on Export

The following is applied to the exported copies on every export. Source files are not modified.

**Date shift.** Each subject gets one random shift between −365 and +365 days (0 is possible), applied to EDF/BDF headers, JSON sidecars, the Persyst `.lay` test date and `sessions.tsv` `acq_time`. The shift value is deliberately not recorded anywhere, including the audit log, so the true dates cannot be recovered.

**EDF/BDF headers:**

- Patient field: becomes `<sub-ID> X X X` if it has EDF+ structure (four or more parts), otherwise `X X X X`
- Recording field: in EDF+ "Startdate" form, the date is shifted and the administration and technician codes become X. Otherwise only `dd-MMM-yyyy` dates in it are shifted and other text is kept.
- Start date: shifted. The start time is not changed.
- Not changed: dates that cannot be parsed. Files under 256 bytes are copied as-is.
- Signal headers: the transducer and prefiltering fields are checked for the patient's name and ID only.

**EDF+/BDF+ annotations:**

- Identifying text is replaced with X in place, at the same byte length: the patient's code, name and birth date and the recording's administration and technician codes (taken from the original header), plus Social Security numbers, medical record numbers, dates, phone numbers and email addresses.
- Event text such as "Seizure onset", every timestamp, the signal data and the file size are not changed.
- The audit log records how many redactions were made, never the text itself.

**Persyst `.lay` files:**

- `File=` is pointed at the renamed `.dat`, so the pair stays linked.
- In `[Patient]`, only Sex, Hand and TestTime are kept. TestDate is shifted. Every other key (name, ID, birth date, physician and so on) is removed.
- `[Comments]` text is redacted the same way as EDF annotations. Times and durations are not changed.

**JSON sidecars:**

- Set to "X" when present with any value: PatientName, PatientID, PatientBirthDate, PatientAddress, PatientTelephoneNumbers, OtherPatientIDs, OtherPatientNames, InstitutionName, InstitutionAddress, InstitutionalDepartmentName, ReferringPhysicianName, PerformingPhysicianName, RequestingPhysician, OperatorsName, StationName, DeviceSerialNumber
- Date-shifted: AcquisitionDateTime, AcquisitionDate, StudyDate, SeriesDate, ContentDate, InstanceCreationDate, ScanDate, RadiopharmaceuticalStartDateTime. A date in an unrecognized format is blanked.
- These fields are handled at any depth, including inside nested objects and arrays.
- A sidecar that is not a JSON object (invalid JSON, null, or an array) cannot be de-identified. Validate shows it as an error that blocks export (Section 10.4), and it is never copied.

**`sessions.tsv` `acq_time`:** shifted and written as ISO 8601. A value that cannot be shifted becomes `n/a`.

**Not de-identified:**

- NWB files, Persyst `.dat` files, and NIfTI header text
- The contents of electrodes, channels, events and other TSV files (these are PHI-scanned in Validate, Section 10.4, but exported unchanged)
- Free-text sidecar fields (these are PHI-scanned in Validate, Section 10.4, but not changed)
- Image pixels. Defacing must be done before NeuroGate and is attested in Metadata.

Review these file types yourself before the dataset leaves the site. Also skim EDF annotations and `.lay` comments: the tool removes the identifiers it recognizes, but not, for example, a relative's name typed into an event.

### 11.2 Naming Applied on Export

- Entity order: `sub_ses_task_trc_rec_run_desc_part_suffix`
- Repeated acquisitions get `run-N`
- Siemens MoCoSeries get `rec-moco`
- Magnitude and phase pairs get `part-mag` and `part-phase`
- Single-band references get the `_sbref` suffix
- Field maps get `_magnitude1`/`_magnitude2`, `_phasediff`, or `_phase1`/`_phase2`
- Functional MRI is always `task-rest`. Scalp EEG and iEEG are always `task-monitor`. Task labels cannot be changed.
- electrodes, channels and events tables go beside their recording: `eeg/` for scalp EEG, `ieeg/` for iEEG. A table is matched to an EEG or iEEG recording in the same source folder first, then in the same subject and session; otherwise, or when both kinds are present, it goes in `ieeg/`. Check the BIDS path under each table's name in Mapping. channels and events get `task-monitor`; electrodes gets no task.
- A name collision that survives all of the above is renamed `…_dup-N`, and Validate shows it as an error that must be fixed before export (Section 10.3)
- `IntendedFor` is not filled in

Not exported: localizer and scout scans, PET attenuation CT and mu-maps, unclassified files, guessed files, and redundant duplicate copies.

### 11.3 Output Layout

```
bids_output/
    dataset_description.json      Name, BIDSVersion, DatasetType, Authors,
                                  GeneratedBy (NeuroGate, version, structure)
    participants.tsv              participant_id only (subjects with exported data)
    primary/
        sub-PENN001/
            sub-PENN001_sessions.tsv          session_id, acq_time (sessions with data)
            ses-preimplant/
                anat/
                    sub-PENN001_ses-preimplant_T1w.nii.gz
                    sub-PENN001_ses-preimplant_T1w.json
                dwi/
                    sub-PENN001_ses-preimplant_dwi.nii.gz
                    sub-PENN001_ses-preimplant_dwi.json
                    sub-PENN001_ses-preimplant_dwi.bval
                    sub-PENN001_ses-preimplant_dwi.bvec
            ses-postimplant/
                ct/
                    sub-PENN001_ses-postimplant_ct.nii.gz
                    sub-PENN001_ses-postimplant_ct.json
                ieeg/
                    sub-PENN001_ses-postimplant_task-monitor_ieeg.edf
                    sub-PENN001_ses-postimplant_task-monitor_channels.tsv
                    sub-PENN001_ses-postimplant_electrodes.tsv
            ses-postsurgery/
                anat/
                    sub-PENN001_ses-postsurgery_T1w.nii.gz
        sub-PENN002/
            ...
    derivatives/
        scanner/                  only when scanner-derived maps exist
            sub-PENN001/
                ses-preimplant/
                    dwi/
                        sub-PENN001_ses-preimplant_desc-ADC_dwi.nii.gz
                        sub-PENN001_ses-preimplant_desc-FA_dwi.nii.gz
```

- For Single session there is no `ses-` folder level and no `sessions.tsv`.
- `participants.tsv` lists only subjects that have exported data, and each `sessions.tsv` lists only the sessions in which that subject has exported data.
- `derivatives/scanner/` has no `dataset_description.json` of its own.
- No `participants.json`, `README` or `CHANGES` file is generated. The site writes them if a recipient needs them.
- Additional folders under `derivatives/` for site analysis pipelines are managed by the site outside this tool.

### 11.4 Exporting from the Desktop App

1. Click **Export to Folder**. A folder picker opens.
2. Choose a location and click **Export Here**.
3. The tool creates `<PREFIX>_bids_export_<YYYY-MM-DD>` in that location (adding `-2`, `-3`, … if the name already exists). Inside it are `bids_output/`, `audit_log_<YYYY-MM-DDTHH-MM-SS>.json` (the full log, which stays at the site) and `audit_log_<YYYY-MM-DDTHH-MM-SS>_shareable.json` (the copy to send with the dataset, Section 12.4).
4. Files are streamed to disk, with no size limit. Progress is shown as "Writing file N of M…".
5. When done, the screen shows the folder path and a **Show Folder** button. The export button then reads **Export Again**.

If a file could not be read (for example, a cloud-only OneDrive file), a "File not locally available" warning names it. In Windows Explorer, right-click the file, choose "Always keep on this device", then add the folder again.

### 11.5 Exporting from a Web Browser

The project website (https://epilepsy-gui.vercel.app) runs the same tool in a web browser. Processing still happens on your computer and nothing is uploaded, but the Export step works differently:

- **Download** builds `<PREFIX>_bids_export_<date>.zip` (uncompressed, with `bids_output/` inside). A second click on **Download** saves it. The two audit logs (full and shareable) download as separate files.
- Files over 500 MB are left out of the ZIP and listed as not included. Use the desktop app or the CLI for these.

### 11.6 After Export

1. **Verify the folder structure.** Open the export folder and confirm the hierarchy matches expectations.
2. **Review what is not de-identified** (Section 11.1), especially TSV tables, NWB and Persyst `.dat` files, and skim EDF annotations and `.lay` comments.
3. **Keep the full audit log at the site.** It contains original file and folder names (Section 12.4). Remove it from the export folder before the dataset is shared, and store it with the site's study records. If the recipient wants an audit record, send the `_shareable.json` copy.
4. **Add site files if needed.** Demographic columns in `participants.tsv`, and `participants.json`, `README` or `CHANGES`, are added by the site after export if a recipient needs them (SOP-BIDS-001 Section 10).
5. **Record who ran the session** in the site's records. The audit log records only "user" (and the shareable copy shows the operator as "site").
6. **Upload to the chosen data infrastructure.** Follow the site's own procedure. Upload is out of scope for this SOP.

---

## 12. Audit Trail

The audit log records what happened during an app session, with timestamps. It is not a complete record of every decision; Section 12.3 lists what is left out.

### 12.1 Accessing the Audit Log During Use

The **Audit Log** button in the tool header shows the number of entries. It opens a panel listing the log, with **Export JSON** and **Export CSV** buttons, available at any time.

The log lasts for the whole app session, including across Back to Drop Zone and additional datasets. Reloading or closing the app loses it. The desktop export also writes the JSON log into the export folder automatically, together with a shareable copy (Section 11.4). The panel's Export JSON and Export CSV buttons always save the full log.

### 12.2 Contents of the Audit Log

The file has a header with the session start time, tool version, export time, exported-by (recorded as "user" in the app), the total number of entries, and counts per action.

Each entry records:

| Field | Description |
|---|---|
| id | Entry number |
| timestamp | ISO 8601 date and time |
| actor | `user` or `system` |
| action | The event type |
| summary | Human-readable description |
| details | Structured data for the event |

Events recorded:

- **Setup:** structure selected; files scanned; session restored
- **Detection:** detection completed (counts)
- **Mapping:** session, modality and subject corrections (old value and new value); bulk applies (count of files)
- **Metadata** (written when you leave Metadata): institution configured; subject sessions; dataset description; defacing attested (only if the box is ticked)
- **Validation:** validation passed (on Continue to Export)
- **Export:** export completed; de-identification summary (fields stripped or shifted, whether EDF PHI was found, and how many annotation and `.lay` redactions were made, without shift values or redacted text); audit exported. The "audit exported" entry is written after the file is saved, so it is not in that file.

### 12.3 What Is Not Logged

- Dismissing a validation issue, and unticking the defacing attestation
- Per-file detection reasons (they are shown in the Mapping table only)
- Export started, and errors
- The identity of the person using the tool. The log records only "user" or "system"; sites record the operator's identity themselves.
- A restore from saved progress does not re-log files scanned or detection completed
- Date-shift values

### 12.4 Warning: The Audit Log Contains Identifying Names

The full audit log contains original file and folder names (in corrections and subject names, including every keystroke of a subject edit) and the study name. Those can identify patients. **The full audit log stays at the site and is never shared with the dataset.** In a desktop export the logs are written next to `bids_output/`, not inside it.

Every export also writes a shareable copy (`audit_log_<timestamp>_shareable.json`, or `audit_log_shareable.json` from the CLI). In it, each original file name and path is replaced by its exported BIDS path (or `file-N` if the file was not exported), each subject group by its `sub-` ID (or `subject-N`), and the operator by "site". Everything else is the same as the full log. This is the copy to send with a dataset. Share `bids_output/` and, if wanted, the shareable copy, nothing else.

### 12.5 ALCOA+ Considerations

| Principle | What the audit log provides | Limits |
|---|---|---|
| Attributable | Each entry is marked `user` or `system` | The person is not identified. Sites must record who ran the session separately. |
| Legible | JSON, with human-readable summaries, and CSV export | None |
| Contemporaneous | Each entry is timestamped when it is written | Metadata entries, including the attestation, are written when leaving the Metadata step, not when each field was entered |
| Original | Entries are only added during a session, never edited | The log is lost if the app is reloaded or closed before saving |
| Accurate | Corrections record both the old and the new value | None |
| Complete | Setup, detection counts, corrections, metadata, validation pass and export | See Section 12.3 for what is not logged |
| Consistent | A fixed set of action types and a fixed entry structure | None |
| Enduring | Saved as a file on export, or at any time from the panel | Storage is the site's responsibility |
| Available | Viewable and exportable at any time during the session | Not after a reload |

---

## 13. Multi-Session and Longitudinal Data

### 13.1 How Sessions Are Detected Under Custom Timepoints

A session is assigned directly when the path or file name matches one of the labels defined in Step 1:

- An exact label in the path or file name (for example, `ses-2mo`)
- A number-and-unit folder name that converts to a defined label, in forms such as `2weeks`, `2_weeks`, `2 weeks`, `02weeks`, `week2`, `week_02`, `wk2`, `W2`, `M6`, `Y1`, `6mo` or `1year`

Word and sequence folder names (`baseline`, `screening`, `followup`, `endpoint`, `visit1`, `V1`, `TP1`, `timepoint2`) and date folders (`20180510`, `2018-05-10`) are recognized as visit folders, so they are not mistaken for subjects. Their sessions come from the date-cluster and folder-cluster signals. Check these assignments in the Mapping table.

Units are not converted: a folder named `14days` does not become `ses-2wk`. `T0`/`T1`/`T2` (which read as modality names), `S1`/`S2` and bare numbers such as `01` (which read as subject IDs) are not treated as visit folders.

### 13.2 Subjects With Fewer Visits Than the Study Defines

When a subject has fewer visit folders than the study's timepoints, the tool may not be able to tell which timepoint each visit is, and those files are left with no session. Assign them in the Mapping table using the site's clinical records. Do not guess: a wrong session puts a scan under the wrong timepoint.

In the desktop app, every file with no session must be resolved before export; the "no session assigned" error cannot be dismissed. Holding back individual subjects and exporting the rest is available only in the CLI (Section 15).

### 13.3 Repeated Scan Names Across Visits

The same protocol run at every visit produces files with identical names in each visit folder. The full folder path keeps them apart, and Validate shows a "same filename in several sessions" warning. No action is needed if the sessions are correct.

---

## 14. PET Data

**Detection:**

- From the sidecar: `Modality: "PT"`, or PET-only fields such as TracerName, TracerRadionuclide, InjectedRadioactivity and RadionuclideHalfLife
- From names: PET, PETCT, PETMR, `trc-`, amyloid, tau-pet, and the tracers FDG, PiB, florbetapir/AV45/Amyvid, florbetaben/FBB/Neuraceq, flutemetamol/Vizamyl, flortaucipir/AV1451/Tauvid, MK6240, PI2620, RO948, UCB-J, flumazenil/FMZ, FDOPA and raclopride
- Tracer names such as AV45 or MK6240 are never read as subject IDs

**Naming:** PET images go to `pet/` with the `_pet` suffix.

- `trc-<tracer>` comes from the sidecar TracerName or from the name. An unrecognized TracerName is kept (letters and digits only, up to 24 characters). The entity is left out when no tracer is found.
- `rec-acstat`, `rec-nacstat`, `rec-acdyn` and `rec-nacdyn` are used only when a session has both attenuation-corrected and uncorrected ("NAC") images. Dynamic means more than one frame. `rec-ac`/`rec-nac` are used when the framing is unknown, and an image that does not say is treated as corrected.

**Attenuation CT:** a CT named CTAC, AC_CT or mu-map, or any CT inside a PET study folder, is treated as the attenuation CT and is not exported. To export it as a CT, change its modality to CT in the Mapping table.

**Validation:** a dismissible warning when a PET image has no sidecar or its sidecar lacks any of the PET fields required by SOP-BIDS-001 (Section 6.1.7). It never blocks export. To fill those fields, convert PET with PET2BIDS (`dcm2niix4pet`); the Pre-Processing page gives the commands.

**Defacing:** PET is exempt from defacing and is not covered by the defacing attestation.

**Not supported:** ECAT (`.v`, `.v.gz`; convert to NIfTI first) and PET blood data (`_blood.tsv`).

---

## 15. Command-Line Interface

The `neurogate` command is bundled in every desktop build and installed with Install CLI (Section 4.6). Run `neurogate <folder>`. It asks, in order:

1. The source folder, if it was not given. Quotes around a pasted path are removed.
2. The structure: Implant (default), Custom, or Single. For Custom it asks for the number of timepoints (1 to 24), then each number (a whole number from 0 to 99) and unit. It asks again after an invalid answer, and when two timepoints would get the same label.
3. The prefix (asked again until valid) and the starting number
4. The study name
5. The authors (asked again until at least one is given)
6. Defacing, yes or no, required, asked only when structural MRI is present
7. The output folder. The default is `<PREFIX>_bids_export` next to the source folder, and it is not made unique.

It writes `<out>/bids_output/`, `<out>/audit_log.json` (the full log) and `<out>/audit_log_shareable.json` (the shareable copy, Section 12.4), streaming every file with no size limit. Symbolic links are skipped. De-identification is the same as the desktop app (Section 11.1), and `participants.tsv` and `sessions.tsv` list only subjects and sessions with exported data, as in the app.

Differences from the desktop app:

- **Held-back subjects (CLI only):** a subject with errors is held back and the rest are exported. Errors not tied to a subject (missing metadata or attestation, PHI errors, an empty dataset) stop the whole export with exit code 1.
- Warnings do not stop the CLI. It exports, then lists each warning.
- No per-file corrections are possible.
- Subjects are numbered in alphabetical order of their groups.
- The audit log's actor is the operating-system username.

---

## 16. Troubleshooting

| Issue | Likely Cause | Resolution |
|---|---|---|
| macOS says NeuroGate can't be opened | The app is not signed with an Apple Developer ID | System Settings → Privacy & Security → Open Anyway |
| No macOS download for an Intel Mac | Only Apple Silicon is built | Use a Windows or Linux computer, or an Apple Silicon Mac |
| Windows shows "Windows protected your PC" | The installer is not code-signed | Click More info, then Run anyway |
| Linux AppImage does nothing when opened | The file is not executable | Run `chmod +x NeuroGate-<version>.AppImage` |
| No update prompt appears | The check failed silently (for example, offline), or you have the latest version | Compare the footer version with the Releases page and download manually if needed |
| Install CLI button is missing | You are on the tool page, or the window is narrow | Go to the Home page and widen the window |
| `neurogate` not found after Install CLI | The `bin` folder is not on PATH, or the terminal was already open | On Windows, open a new terminal. On macOS and Linux, add the folder shown in the panel to PATH. |
| A file does not appear or is Other / Unknown | The extension is not recognized, or the file is DICOM or ECAT | Check Section 7.2. Convert DICOM and ECAT to NIfTI first. |
| Most files are Low or Needs Review | Source names and folders carry little information | Organize files into subject and session folders, or use bulk edits in Mapping |
| A file shows "Guessed: pick a modality to export" | No signal identified the scan | Choose the correct modality. Guessed files are not exported otherwise. |
| A file you expected is missing from the export | It was guessed, unclassified, a duplicate copy, a localizer, an attenuation CT, or (browser only) over 500 MB | Check its badge and modality in Mapping, and the guessed-files warning in Validate |
| A subject or session is missing from `participants.tsv` or `sessions.tsv` | None of its files were exported (for example, all guessed) | Pick modalities for its files in Mapping |
| Validate says two files would get the same name | One file was renamed `_dup-N` | Fix the session or modality in Mapping, or remove the extra file (Section 10.3) |
| Validate says a sidecar is not valid JSON | The `.json` file is damaged or is not a JSON object | Fix or remove it in the source folder, then start again |
| PHI warning in a TSV table | A name, date or number in an electrodes, channels or events table | Edit the table outside the tool, then start again. Tables are exported unchanged. |
| `XXXX` in EDF annotations or `.lay` comments | Identifying text was redacted on export | Expected. Event text and timestamps are kept. |
| "Fix N Errors to Continue" on Validate | Undismissed errors remain | Expand each error. Most must be fixed in Mapping or in the source data (Section 10.3). |
| Validate shows "no session assigned" | Mapping let you continue with files that have no session | Back to Metadata, Back to Mapping, assign sessions, then re-enter Metadata |
| Metadata won't continue | A required field or the attestation is missing | Read the "Please complete the following" list and visit each incomplete tab |
| Metadata entries disappeared | You went back to Mapping or back from Validate | Re-enter them (Section 5.1) |
| Dismissed issues came back | Re-run Checks, or Back to Validation from Export | Dismiss them again |
| Wrong structure chosen | The structure cannot be changed on screen | Save the audit log, click Back to Drop Zone, reload the app, and start again |
| PHI error in a file or folder name | The source name contains an identifier | Rename it outside the tool, then start again |
| PHI warning in a sidecar | A name or number was typed into a sidecar field at the scanner | Edit the sidecar outside the tool, then start again |
| "File not locally available" on Export | A cloud-only file (for example, OneDrive) | Right-click it in Windows Explorer, choose "Always keep on this device", then add the folder again |
| A file is in `derivatives/scanner/` | It was detected as a scanner-computed map (Derived badge) | Expected. It cannot be moved to `primary/` in the tool. |
| No `derivatives/` folder in the export | No scanner-computed maps were present | Expected |
| Audit log is empty or missing entries | The app was reloaded, or the event is not logged (Section 12.3) | Save the log before reloading |

### 16.1 Reporting Issues

If an issue is not resolved by this section, contact the project lead with:

- The NeuroGate version (footer of the Home, Documentation, Pre-Processing or About page)
- The operating system and version
- The workflow step where the issue occurred
- Any error messages shown

Do not send the full audit log or screenshots of the Mapping table outside the site without checking them first. Both show original file and folder names, which can identify patients. Send the shareable audit log copy instead.

---

## 17. Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | April 2026 | Brandon Bach | Initial release covering the six-step workflow, browser-based tool model, five-layer detection engine, and Implant sessions preset |
| 1.5 | May 2026 | Brandon Bach | Added JSON sidecar de-identification and EDF header cleaning behavior; expanded modality coverage to include fMRI, ASL, MR angiography, and field maps |
| 1.9 | August 2026 | Brandon Bach | Added the Custom timepoints preset and Step 1 (Choose Your Structure); revised the mapping table to show both session preset options; clarified that upload is out of scope |
| 2.0 | August 31, 2026 | Brandon Bach | Substantive rewrite. Reframed the tool from browser-based to a desktop application (Section 4 installation, Section 5 tool overview). Expanded modality coverage to include PDw, T2starw, MoCoSeries functional, single-band references, and magnitude/phase pairs (Section 8.2). Added the mapping table status badges (Section 8.4) documenting the guessed-modality quarantine gate, duplicate resolution, and derivative separation behaviors introduced in the 2026-08-17 detection engine improvements. Added the Needs Your Decision filter (Section 8.5). Added the derivatives export path documentation (Section 11.3). Added the held-back subject behavior (Sections 10.5 and 11.4) allowing partial export when individual subjects cannot be resolved automatically. Added a dedicated Longitudinal Study Handling section (Section 13) covering visit folder recognition, nested layouts, and missed visits. Expanded troubleshooting to cover the new behaviors. |
| 3.0 | September 30, 2026 | Brandon Bach | Rewritten to describe only what the tool does, verified against the capability inventory and the code. Distribution: desktop app and CLI via GitHub Releases with actual file names, Apple Silicon only on macOS, and first-launch steps (macOS Open Anyway, Windows SmartScreen, Linux `chmod +x`) (Section 4.4); auto-update behavior per platform (Section 4.5); Install CLI (Section 4.6); version shown in the page footer (Section 4.7). Workflow: real step labels and button names throughout; "going back loses work" limitations (Section 5.1); the Step-0 question and the Single session preset, and that the structure cannot be changed on screen (Section 6); saved progress (Section 7.4); the Mapping table's actual columns, filters, badges and bulk edits, and that Continue to Metadata is always enabled (Section 8); Metadata's four tabs, auto-fill and blocking behavior (Section 9); Validation's dismissal rules, what blocks export, and the actual list of checks and non-checks (Section 10); desktop folder export with no size limit versus browser ZIP (Sections 11.4 and 11.5); the de-identification actually applied and what is not de-identified (Section 11.1); corrected output layout (Section 11.3). Audit log: what is and is not logged, and the warning that it contains original file and folder names and must stay at the site (Section 12). Added PET (Section 14) and a CLI summary including CLI-only held-back subjects (Section 15). Removed features that do not exist: subject demographics (age, sex), Acknowledgements and Funding fields, BrainVision support, held-back subjects in the desktop app, unimplemented checks (per-modality sidecar fields, channel/electrode matching, NIfTI header checks, iEEG duration, Persyst pairing, sessions.tsv matching), per-check Pass results, participants.json/README/CHANGES generation, recorded date-shift values, the project website and Downloads page, the version display in the lower right corner, clickable stepper, editable Subject/Session/Modality cells with detected-value markers, the Implant fallback session, and the Mapping gate on unresolved files. Troubleshooting rewritten to match. Also: the Structure step's text now reads "This can't be changed after you add files without starting over", and the note that the screen text was inaccurate is removed (Section 6.4); electrode, channel and event tables are placed beside their recording (`eeg/` for scalp EEG, `ieeg/` for iEEG, `ieeg/` as the fallback) rather than always in `ieeg/` (Section 11.2); the dataset is described as NeuroGate's BIDS-based structure and the Validate step no longer refers to the official bids-validator (Sections 1, 10); the Pre-Processing page's PET2BIDS (`dcm2niix4pet`) commands are referenced (Sections 3, 14); PET sidecar fields are those required by SOP-BIDS-001 and PET is exempt from defacing (Sections 4.2, 10.4, 14); demographics are optional and added by the site after export, and `participants.json`, `README` and `CHANGES` are written by the site if a recipient needs them (Sections 9.2, 11.3, 11.6); the date shift is deliberately not recorded, so true dates cannot be recovered (Section 11.1); the audit log stays at the site and is never shared, and sites record the operator's identity themselves (Sections 11.6, 12.3, 12.4); Section 13.1 no longer says sessions are assigned only by label match (clustering also assigns them) and lists the `M6`/`Y1` forms. |
| 3.1 | October 2, 2026 | Brandon Bach | Updated for NeuroGate 1.2.0. Section 2: PHI row covers table scanning, EDF annotations and Persyst `.lay`. Section 7.2: sidecars pair by base name in the same folder; `.lay` files are rewritten on export. Section 8.5: guessed files now get a Validate warning. Section 10: added the duplicate-name and invalid-sidecar errors and how to resolve them, the per-subject guessed-files warning, the TSV table content scan, and that only exported files satisfy required-file checks. Section 11.1: date shift covers the `.lay` test date; added EDF+/BDF+ annotation redaction and signal-header checks, Persyst `.lay` handling, sidecar fields at any depth, and that a sidecar that is not a JSON object blocks export; removed Persyst `.lay`, annotations and the top-level-only limit from what is not de-identified. Sections 11.2, 11.3: `_dup-N` is a Validate error; participants.tsv and sessions.tsv list only subjects and sessions with exported data. Sections 11.4 to 11.6 and 12: every export writes a full audit log (stays at the site) and a shareable copy (original names replaced by BIDS paths and `sub-` IDs, operator shown as "site") that can be sent with the dataset; the de-identification summary includes redaction counts. Section 15: CLI custom timepoints are checked (1 to 24 timepoints, whole numbers 0 to 99, no duplicate labels); the CLI writes the shareable copy; its sessions.tsv no longer lists sessions without data. Section 16: new troubleshooting rows for these behaviors. Header updates the parent to GOV-001 v2.2 and the related document to SOP-BIDS-001 v3.2. |
