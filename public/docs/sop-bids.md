# Standard Operating Procedure: BIDS Data Structure for Multi-Site Neural Data Sharing

| Field | Value |
|---|---|
| **Document ID** | SOP-BIDS-001 |
| **Version** | 3.3 |
| **Effective Date** | 2026-10-02 |
| **Author** | Brandon Bach |
| **Advisor** | Nishant Sinha |
| **Status** | Draft, Pending Advisor Review |
| **Parent Document** | GOV-001 Regulatory and Governance Framework v2.3 |
| **Related Documents** | SOP-GUI-001 v3.2 |

---

## 1. Purpose

This Standard Operating Procedure defines a standardized data structure for organizing neural data (imaging and electrophysiology) for cross-site sharing. Adopting a common BIDS-based structure keeps a site's data consistent and interoperable, making it straightforward to share with collaborators while meeting data-sharing compliance standards.

The SOP separates two kinds of statement. Requirements on the **site** (convert DICOM, deface structural MRI, supply complete sidecars and electrode tables, keep the subject key) apply whether or not a tool is used. Statements about **NeuroGate** describe only what the application actually does, produces, checks, or de-identifies. Where NeuroGate does not check or produce something, this document says so, and the item remains the site's responsibility.

This version aligns every statement about NeuroGate with the application's verified behavior, adds positron emission tomography (PET) as a supported modality, and documents the Single session structure preset. All output from the tool follows the structure documented here.

---

## 2. Governance Traceability

This SOP implements specific requirements from the Regulatory and Governance Framework (GOV-001). Every procedure in this document traces back to the framework:

| SOP Section | GOV-001 Section | Requirement |
|---|---|---|
| 4.1 (Subject ID format) | 2.3 (HIPAA/PHI Protection) | Coded subject IDs with no PHI; key stored only at originating site |
| 5 (Dataset structure overview) | 3 (Data Standards by Modality) | BIDS-based organization for all supported modalities; `primary/` and `derivatives/scanner/` folder separation |
| 6 to 8 (Structure presets and session requirements) | 3 (Data Standards by Modality) | Organization under the Implant sessions, Custom timepoints, or Single session preset |
| 9 (Derivatives folder) | 3 (Data Standards by Modality), 2.2 (ALCOA+ Accurate) | Scanner-computed derivatives kept out of the raw tree so downstream analysis does not mistake computed maps for acquired data |
| 10 (Metadata files) | 2.1, 2.2, 4 (FAIR, ALCOA+, Metadata Completeness) | Complete, standardized metadata for findability, attributability, and reusability |
| 10.5 (Channels and electrodes consistency) | 2.2 (ALCOA+ Accurate) | Channel names consistent with electrodes.tsv; a site responsibility, not checked by the tool |
| 11 (De-identification and defacing) | 2.3 (HIPAA/PHI) | DICOM stripping, facial defacing, EDF header and annotation, Persyst `.lay` and JSON sidecar de-identification, PHI checks on names, sidecars and tables |
| 12 (NeuroGate tool) | 2.2 (ALCOA+ Legible, Consistent) | Automated organization and checks reduce human error across sites |
| 13 (Validation pipeline) | 2.2 (ALCOA+ Accurate), 6.1 (Pre-Upload Checklist) | No undismissed blocking errors before export |

---

## 3. Scope

This SOP applies to any site organizing neural data for multi-site sharing. It covers:

- Required folder hierarchy and naming conventions for both raw acquisitions and scanner-computed derivative maps
- File formats for each supported modality: T1-weighted MRI, T2-weighted MRI, FLAIR, proton-density weighted MRI, T2*-weighted MRI (including SWI), MR angiography, functional MRI, perfusion / arterial spin labeling, field maps, computed tomography, positron emission tomography, diffusion MRI, scalp EEG, and intracranial EEG
- Metadata requirements including JSON sidecars, participant tables, session tables, and electrode and channel tables
- De-identification and defacing requirements
- Session-based organization under the Implant sessions preset (pre-implant, post-implant, post-surgery), the Custom timepoints preset for longitudinal studies, or the Single session preset (no session level)
- BIDS entities the tool assigns automatically: `run-`, `part-`, `rec-`, `trc-`, `desc-`, and the `sbref` suffix, plus the fixed task labels `task-rest` and `task-monitor`

Uploading the exported dataset to a data infrastructure is out of scope. Each site follows its own upload procedure for the platform it has chosen.

---

## 4. Prerequisites

Before organizing data using this SOP, ensure the following are in place.

### 4.1 Subject ID Format

All subjects are identified using a BIDS-style ID with the format:

`sub-{INSTITUTION_PREFIX}{NNN}`

Where `{INSTITUTION_PREFIX}` is 2 to 6 uppercase letters assigned to the site, and `{NNN}` is the subject number, zero-padded to at least three digits and scoped per institution. Examples: `sub-CHOP016`, `sub-PENN042`, `sub-HUP003`.

NeuroGate builds these IDs from the prefix and a starting number (an integer of 1 or more) entered in its Metadata step, numbering subjects consecutively from that starting number. Subject IDs therefore contain only uppercase letters and digits after the `sub-` prefix. The key linking subject IDs to real patient identifiers must be stored only at the originating institution in a secure, access-controlled system per GOV-001 Section 2.3. It is never entered into the tool, uploaded to any data infrastructure, or shared externally.

### 4.2 Tooling

The following tools support the workflow.

| Tool | Purpose | Required |
|---|---|---|
| dcm2niix | Convert DICOM files to NIfTI format with JSON sidecar generation | Yes, for any DICOM source data |
| pydeface (or equivalent) | Deface anatomical MRI images | Yes, for any T1w, T2w, FLAIR, PDw, or T2starw images intended for sharing |
| PET2BIDS (`pip install pypet2bids`; provides `dcm2niix4pet` and `ecatpet2bids`) | Convert PET DICOM or ECAT data and fill the required PET sidecar fields (Section 6.1.7) | Yes, for ECAT PET data; recommended for any PET data (Section 6.1.7) |
| NeuroGate desktop application | Organize files into BIDS layout, validate, and export | Yes |
| Text editor | Manual edits to JSON sidecars or TSV files when needed | Recommended |

Install scripts for dcm2niix and pydeface are in the NeuroGate repository's `tools/` folder as flat files: `tools/install_mac.sh`, `tools/install_linux.sh`, and `tools/install_windows.ps1`. Each script installs both tools. Usage notes are in `tools/README.md`. The scripts do not install PET2BIDS. The in-app Pre-Processing page also gives install and usage commands for dcm2niix, PET2BIDS (`dcm2niix4pet`), and pydeface. NeuroGate itself does not convert or deface anything.

### 4.3 Institution Assignments

Before organizing a batch of subjects, confirm the following with the project lead or site coordinator:

- Institution prefix (2 to 6 uppercase letters)
- Starting subject number for this batch, to avoid ID collisions with prior batches or other collaborators at the same institution

---

## 5. Dataset Structure Overview

Every dataset organized under this SOP uses a two-folder layout that separates raw acquisitions from scanner-computed derivative maps. This is the layout NeuroGate writes on every export.

**A BIDS-based structure.** This layout is NeuroGate's own BIDS-based structure, designed deliberately by the project. File names, entities, datatype folders, and sidecars follow BIDS conventions, but the root layout (subjects under `primary/`, scanner derivatives under `derivatives/scanner/`) intentionally differs from the official BIDS specification. The official BIDS validator expects subjects at the dataset root and so does not apply to the NeuroGate layout as a whole. A dataset conforms to this SOP when it follows the structure defined here and passes NeuroGate's own validation (Section 13) with no errors.

### 5.1 Root Directory Structure

The desktop application creates an export folder named `<PREFIX>_bids_export_<YYYY-MM-DD>` (with `-2`, `-3`, and so on added if that name already exists). The dataset is the `bids_output/` folder inside it:

```
<PREFIX>_bids_export_<YYYY-MM-DD>/
    bids_output/                        The dataset (NeuroGate BIDS-based layout)
        dataset_description.json        Dataset metadata (generated by the tool)
        participants.tsv                participant_id column only, subjects with exported data (generated by the tool)
        primary/                        Raw acquisitions
            sub-<ID>/
                sub-<ID>_sessions.tsv   Generated by the tool (not for Single session)
                ses-<label>/<datatype>/...
        derivatives/
            scanner/                    Scanner-computed maps; only present when such maps exist
    audit_log_<YYYY-MM-DDTHH-MM-SS>.json             Full export audit log (kept at the site, see Section 11.4)
    audit_log_<YYYY-MM-DDTHH-MM-SS>_shareable.json   Shareable copy of the audit log (Section 11.4)
```

The command-line interface writes `<out>/bids_output/`, `<out>/audit_log.json` (full) and `<out>/audit_log_shareable.json`, where `<out>` defaults to `<PREFIX>_bids_export` next to the source folder.

NeuroGate does not generate `participants.json`, `README`, `CHANGES`, or a `dataset_description.json` for `derivatives/scanner/`. If a recipient needs `participants.json`, `README`, or `CHANGES`, the site writes them and adds them to `bids_output/` after export (Section 10).

Two categories of data live under the dataset root:

**`primary/`** contains the raw, acquired data. This is the folder that downstream analysis pipelines read as their input. Subject directories, session folders, and per-modality subfolders live under `primary/`, and this is what is documented in detail in Sections 6, 7, and 8.

**`derivatives/`** contains processed outputs. The tool only ever writes to `derivatives/scanner/`, which contains maps computed by the scanner console (ADC, FA, trace-weighted and related diffusion maps, and SWI minimum-intensity projections). Site-specific analysis pipelines populate their own subfolders under `derivatives/` outside the tool.

Section 9 documents the `derivatives/scanner/` folder in detail. Sites do not author or edit this folder manually. The tool creates it only when the source data contains scanner-derived maps.

### 5.2 Subject Directory Structure

Under `primary/`, each subject has a directory named `sub-<ID>/`. Its contents depend on the structure preset chosen for the dataset (see Section 5.4).

Under the Implant sessions preset, each subject has up to three session folders corresponding to phases of a surgical evaluation. A session folder, and a modality folder within it, is created only when the subject has exported files for it:

```
primary/
    sub-<ID>/
        sub-<ID>_sessions.tsv         Session metadata
        ses-preimplant/               Pre-surgical evaluation
            anat/                     Anatomical MRI and MR angiography
            dwi/                      Diffusion MRI
            func/                     Functional MRI
            perf/                     Perfusion / arterial spin labeling
            fmap/                     Field maps
            pet/                      Positron emission tomography
            eeg/                      Scalp EEG, with its electrode / channel / event tables
        ses-postimplant/              Intracranial monitoring
            ct/                       CT with electrodes
            ieeg/                     Intracranial EEG, with its electrode / channel / event tables
        ses-postsurgery/              Post-resection
            anat/                     Post-surgery MRI
```

Any modality can be placed in any session; the tree shows the typical placement. Under the Custom timepoints preset, each subject has session folders labeled by the timepoints defined for the dataset (Section 8). Under the Single session preset, there is no session level and no `sessions.tsv`; modality folders sit directly under the subject:

```
primary/
    sub-<ID>/
        anat/    sub-<ID>_T1w.nii.gz
        pet/     sub-<ID>_trc-FDG_pet.nii.gz
```

### 5.3 BIDS Entities Assigned by the Tool

The tool assigns the following BIDS entities automatically to keep filenames unique and to represent acquisition relationships correctly. Entities appear in the order `sub`, `ses`, `task`, `trc`, `rec`, `run`, `desc`, `part`, then the suffix.

| Entity | Purpose | Section |
|---|---|---|
| `task-rest` / `task-monitor` | Fixed task labels: `task-rest` for every functional MRI run; `task-monitor` for every EEG and iEEG recording and for channels and events tables. They cannot be changed in the tool. | 6.1.3, 6.1.6, 6.2.2 |
| `trc-<tracer>` | PET tracer | 6.1.7 |
| `rec-moco` | Marks the motion-corrected reconstruction of a functional run | 5.3.3 |
| `rec-ac` / `rec-nac` (with `stat` / `dyn`) | Separates attenuation-corrected and non-corrected PET reconstructions | 6.1.7 |
| `run-<N>` | Distinguishes multiple acquisitions of the same modality in a single session | 5.3.1 |
| `desc-<label>` | Distinguishes derivative maps in `derivatives/scanner/` | 9.3 |
| `part-mag` / `part-phase` | Distinguishes magnitude and phase images of a single acquisition | 5.3.2 |
| `sbref` (suffix) | Single-band reference volume from a multiband acquisition | 5.3.4 |

A name collision that survives all of these rules is resolved by renaming the later file `…_dup-N`, and validation reports it as an error that must be resolved before export (Section 13.1). The tool does not fill in `IntendedFor` (Section 6.1.5).

#### 5.3.1 Run Entity for Repeated Acquisitions

When a session contains more than one acquisition of the same modality, each is given a `run-` entity to keep filenames unique. For example, a subject with two T2w scans in `ses-preimplant` produces:

```
sub-<ID>_ses-preimplant_run-1_T2w.nii.gz
sub-<ID>_ses-preimplant_run-2_T2w.nii.gz
```

A scan's companion files (its JSON sidecar, and the `.bval` and `.bvec` files for diffusion) share the same run number as the imaging file. The `run-` entity is added only when a modality repeats within a session. Motion-corrected reconstructions, single-band references, PET images with different tracers or `rec-` labels, and derivative maps are each numbered within their own group, so they take a `run-` entity only when they themselves repeat.

#### 5.3.2 Part Entity for Magnitude and Phase Pairs

Susceptibility-weighted imaging (SWI) and T2*-weighted gradient-echo sequences can produce a magnitude image and a phase image from a single acquisition. The tool treats the pair as one acquisition, distinguished by the `part-mag` and `part-phase` entities. For example:

```
sub-<ID>_ses-preimplant_part-mag_T2starw.nii.gz
sub-<ID>_ses-preimplant_part-phase_T2starw.nii.gz
```

The tool recognizes two namings for a pair: a shared base name where the phase image carries a `_ph` marker (`Sag_SWI_3D` and `Sag_SWI_3D_ph`), and the Siemens separate reconstruction outputs `Mag_Images` and `Pha_Images`. If the session holds more than one such acquisition, both parts of each pair share one run number (for example `run-1_part-mag` and `run-1_part-phase`).

The `part-` entity is applied only when both a magnitude and a phase image are present for the acquisition. A magnitude-only or phase-only file receives no `part-` entity and is treated as a standalone acquisition. Field maps never receive `part-`; they use their own suffixes (Section 6.1.5).

#### 5.3.3 Rec Entity for Motion-Corrected Reconstructions

When a scanner produces both a raw functional run and a motion-corrected reconstruction of it (Siemens `MoCoSeries`), the reconstruction is marked with `rec-moco`. For example:

```
sub-<ID>_ses-preimplant_task-rest_bold.nii.gz            Raw acquisition
sub-<ID>_ses-preimplant_task-rest_rec-moco_bold.nii.gz   Motion-corrected reconstruction
```

Because `rec-` already separates the reconstruction from its source, the two are numbered separately: neither takes a `run-` entity unless the session holds more than one raw run or more than one reconstruction.

#### 5.3.4 Single-Band Reference Volumes

Multiband diffusion and functional sequences acquire a single-band reference volume alongside the main acquisition. The tool recognizes it by an `SBRef` marker in the name and exports it with the `sbref` suffix in the same modality folder as its acquisition:

```
sub-<ID>_ses-preimplant_dwi.nii.gz
sub-<ID>_ses-preimplant_sbref.nii.gz
```

Single-band references are numbered separately from the main acquisitions, so a reference takes a `run-` entity only when the session holds more than one reference for that modality. The reference is used by downstream analysis pipelines for distortion correction and registration.

### 5.4 Three Structure Presets

Every dataset is organized under one of three session-structure presets. The choice is made at the start of the NeuroGate workflow (Step 1, Structure; see SOP-GUI-001) and determines which session labels exist for the dataset. The tool first asks whether each subject has more than one session of data; answering No selects Single session.

**Implant sessions** defines three sessions: `ses-preimplant`, `ses-postimplant`, and `ses-postsurgery`, corresponding to phases of a surgical evaluation and treatment timeline. BIDS itself does not prescribe session names; this is the structure NeuroGate was first built around, and it applies to any dataset that follows the same three-phase clinical structure. It is the only preset with per-session required files (Section 6).

**Custom timepoints** is for any longitudinal study not organized around an implant procedure. The site defines 1 to 24 timepoints, each a number from 0 to 99 and a unit: days, weeks, months, years, or "sessions (no time interval)". For example, 0 months, 2 months, and 6 months generate `ses-0mo`, `ses-2mo`, and `ses-6mo`; the "sessions" unit generates plain numbered labels such as `ses-1` and `ses-2`. There is no free-text entry, so a site name or PI name can never end up in a session label. Section 8 documents this preset.

**Single session** is for datasets with one session per subject. There is no `ses-` level in folders or filenames and no `sessions.tsv`.

A dataset uses exactly one preset. It can be changed later with **Change structure** on the Drop Files or Mapping step, which returns to Step 1 with the current structure selected, clears the added files, corrections and metadata entries, and records a "Structure changed" entry in the audit log (SOP-GUI-001 Section 6.5). The files are then added again under the new structure.

---

## 6. Implant Sessions Preset: Session-by-Session Requirements

This section applies to datasets using the Implant sessions preset (Section 5.4). The per-modality naming, format, and sidecar rules in this section also apply to the same modalities under the Custom timepoints and Single session presets (Section 8.3).

**Required files.** The "Required" columns below mark which files NeuroGate checks for under this preset. "Yes" files are checked as errors and "Recommended" files as warnings (Section 13.2). "If available" files are not checked.

**Required JSON sidecar fields.** The per-modality sidecar field lists below are site requirements from GOV-001 Section 3. NeuroGate does not check them, except for PET, where it warns on missing required PET fields (Section 6.1.7). Sites confirm the fields are present, typically by inspecting the dcm2niix output.

### 6.1 Session 1: Pre-Implant (ses-preimplant)

**Purpose:** Baseline structural and functional imaging acquired before electrode implantation for surgical planning.

#### 6.1.1 Anatomical MRI and MR Angiography (anat/)

The `anat/` folder holds all structural imaging and MR angiography acquired in the pre-implant session. Required and recommended files:

| File | Format | Required |
|---|---|---|
| `sub-<ID>_ses-preimplant_T1w.nii.gz` | NIfTI gzipped | Yes |
| `sub-<ID>_ses-preimplant_T1w.json` | JSON sidecar | Site requirement (not checked) |
| `sub-<ID>_ses-preimplant_T2w.nii.gz` | NIfTI gzipped | Recommended |
| `sub-<ID>_ses-preimplant_T2w.json` | JSON sidecar | Site requirement (not checked) |
| `sub-<ID>_ses-preimplant_FLAIR.nii.gz` | NIfTI gzipped | If available |
| `sub-<ID>_ses-preimplant_FLAIR.json` | JSON sidecar | If available |
| `sub-<ID>_ses-preimplant_PDw.nii.gz` | NIfTI gzipped | If available |
| `sub-<ID>_ses-preimplant_PDw.json` | JSON sidecar | If available |
| `sub-<ID>_ses-preimplant_T2starw.nii.gz` | NIfTI gzipped | If available |
| `sub-<ID>_ses-preimplant_T2starw.json` | JSON sidecar | If available |
| `sub-<ID>_ses-preimplant_angio.nii.gz` | NIfTI gzipped | If available |
| `sub-<ID>_ses-preimplant_angio.json` | JSON sidecar | If available |

**Proton-density weighted imaging (PDw).** The `_PDw` suffix is used for proton-density weighted MRI, typically acquired as part of a turbo spin-echo sequence. Source names the tool recognizes include `pd_tse_tra`, `PD_TSE`, `PDw`, `pd_weighted`, and `proton_density`. A bare `PD` token is deliberately not recognized, because many cohorts use it in subject labels.

**T2-star weighted imaging (T2starw).** The `_T2starw` suffix is used for T2*-weighted gradient-echo MRI and for susceptibility-weighted imaging (SWI). This modality is separate from T2w in BIDS because the contrast mechanism differs. Source names the tool recognizes include `Sag_SWI_3D`, `3D_T2star_GRE`, `SWI_Images`, `SWAN` (GE), `SWIp` (Philips), and the Siemens SWI reconstruction outputs `Mag_Images` and `Pha_Images`.

When an SWI or T2*-weighted acquisition produces both a magnitude and a phase image, the two are distinguished by the `part-mag` and `part-phase` entities as documented in Section 5.3.2. A minimum-intensity projection computed by the scanner console (Siemens `mIP_Images`) is a derivative rather than a raw acquisition and is routed to `derivatives/scanner/` as documented in Section 9.

**Required JSON sidecar fields per modality** (site requirement per GOV-001 Section 3; not checked by the tool):

| Modality | Required JSON Fields |
|---|---|
| T1w | Manufacturer, MagneticFieldStrength, RepetitionTime, EchoTime, FlipAngle, SliceThickness |
| T2w | Manufacturer, MagneticFieldStrength, RepetitionTime, EchoTime, FlipAngle, SliceThickness |
| FLAIR | Manufacturer, MagneticFieldStrength, RepetitionTime, EchoTime, FlipAngle, SliceThickness, InversionTime |
| PDw | Manufacturer, MagneticFieldStrength, RepetitionTime, EchoTime, SliceThickness |
| T2starw | Manufacturer, MagneticFieldStrength, RepetitionTime, EchoTime, FlipAngle |
| angio | Manufacturer, MagneticFieldStrength, RepetitionTime, EchoTime, FlipAngle |

**DICOM to NIfTI Conversion:**

NeuroGate accepts NIfTI, not DICOM. DICOM files (`.dcm`, `.dicom`, `.ima`) added to the tool produce a warning and are not exported. Convert them first. The automation script `convert_dicom_auto.py`, available from the Pre-Processing page in the NeuroGate application, detects the scanner manufacturer (Siemens, GE, or Philips) and applies the matching dcm2niix flags. For manual conversion:

```bash
# Recommended: automation script
python convert_dicom_auto.py /path/to/dicom/T1/ /output/anat/ \
    --subject PENN001 --session preimplant

# Manual fallback: protocol name + series number, gzipped, anonymized BIDS sidecar
dcm2niix -z y -b y -ba y -f %p_%s -o ./anat/ /path/to/dicom/T1/
```

The `-z y` flag compresses output to `.nii.gz`, `-b y` writes the JSON sidecar, and `-ba y` anonymizes it. Build the `-f` filename template from `%p` (protocol name) and `%s` (series number). Never use `%i` (patient ID) or `%n` (patient name) in `-f`, because they write identifiers into the filename. If conversion is run without `-z y`, the resulting uncompressed `.nii` files are still accepted; NeuroGate gzips them to `.nii.gz` on export.

Time-of-flight (TOF) MR angiography uses the `_angio` suffix and is placed in `anat/` alongside the structural scans, per the BIDS specification.

#### 6.1.2 Diffusion MRI (dwi/)

Diffusion MRI acquisitions are placed in `dwi/`. Raw diffusion acquisitions live in `primary/`; scanner-computed derivative maps (ADC, FA, TRACEW and related) live in `derivatives/scanner/.../dwi/` (see Section 9).

Files that accompany each raw diffusion acquisition:

| File | Format | Description |
|---|---|---|
| `sub-<ID>_ses-preimplant_dwi.nii.gz` | NIfTI gzipped | 4D DWI image |
| `sub-<ID>_ses-preimplant_dwi.json` | JSON | Acquisition metadata |
| `sub-<ID>_ses-preimplant_dwi.bval` | Text | b-values, one per volume |
| `sub-<ID>_ses-preimplant_dwi.bvec` | Text | b-vectors, one column per volume |

**Required JSON sidecar fields for DWI** (site requirement per GOV-001 Section 3; not checked by the tool): `Manufacturer`, `MagneticFieldStrength`, `RepetitionTime`, `EchoTime`, `PhaseEncodingDirection`.

**Gradient table pairing.** Every raw diffusion image requires an accompanying `.bval` and `.bvec` gradient table. When a gradient table has the same base name as a diffusion image (dcm2niix's normal output), the tool keeps them together by that name. When it does not, the tool pairs the table to an image by the b-value and phase-encoding direction read from the two names. Both notations are handled: `b1k` is recognized as equivalent to `b1000`, and `PErev`, `revPE`, and `_rev` are all recognized as markers for a reverse-phase-encoded acquisition.

Pairing is deliberately conservative: a table is paired only when exactly one raw diffusion image in the same subject and session matches. When a session contains two diffusion acquisitions that share the same b-value and phase-encoding direction (for example, `ep2d_diff_b1000` and `ep2d_diff_b1000_TW`), a bare gradient table named `DTI_b1000` cannot be unambiguously matched to either one. In that case, or when no image matches, the gradient table is not exported, and a "Diffusion gradient table not matched to an image" warning names it so it can be resolved by renaming the source file to match its intended acquisition. This behavior is intentional. Attaching a wrong gradient table to a diffusion image produces plausible-looking tractography output from incorrect gradient directions, which is very difficult to catch downstream.

**Multiband single-band reference.** Multiband diffusion sequences (CMRR and others) acquire a single-band reference volume alongside the main acquisition. This reference is exported with the `sbref` suffix (see Section 5.3.4).

**Siemens `ep2d_diff` and CMRR series.** The tool recognizes Siemens' stock diffusion sequence name (`ep2d_diff`, including suffix variants such as `ep2d_diff_sms3_b1000_te94`) and CMRR diffusion sequences identified by a b-value token in the name (`CMRR_b1k_64`, `CMRR_b3k_64`). A b-value written in the `k` shorthand (`b1k`, `b3k`) identifies diffusion on its own, even without a diffusion keyword.

**Scanner-computed derivative maps.** Diffusion sequences frequently produce derivative maps (ADC, FA, TRACEW) computed on the scanner console alongside the raw acquisition. These are not raw diffusion data and must not be placed in raw `dwi/`. The tool identifies them from the DICOM `ImageType` field in the JSON sidecar and routes them to `derivatives/scanner/` with a `desc-` entity naming the map. See Section 9.

#### 6.1.3 Functional MRI (func/)

Functional MRI acquisitions are placed in `func/`:

| File | Format | Description |
|---|---|---|
| `sub-<ID>_ses-preimplant_task-rest_bold.nii.gz` | NIfTI gzipped | 4D BOLD functional image |
| `sub-<ID>_ses-preimplant_task-rest_bold.json` | JSON | Acquisition metadata |

**Required JSON sidecar fields for fMRI** (site requirement per GOV-001 Section 3; not checked by the tool): `Manufacturer`, `MagneticFieldStrength`, `RepetitionTime`, `EchoTime`, `TaskName`, `SliceTiming`.

**Task labels.** The `task-<label>` entity is required by BIDS for all functional MRI. NeuroGate names every functional run `task-rest` and the label cannot be changed in the tool. The tool is therefore suited to resting-state fMRI. A task-based run exported by the tool also carries `task-rest`, and any events table is named `task-monitor` and placed with an EEG or iEEG recording, or in `ieeg/` when there is none (Section 6.1.6), not in `func/`. A site sharing task-based fMRI must correct the task label, the sidecar `TaskName`, and the events-table placement after export.

**Motion-corrected reconstructions.** When a scanner produces both a raw functional run and a motion-corrected reconstruction of the same acquisition (Siemens `MoCoSeries`), the reconstruction is marked with the `rec-moco` entity (see Section 5.3.3). Both files are placed in `func/`. For example:

```
func/
    sub-<ID>_ses-preimplant_task-rest_bold.nii.gz              Raw acquisition
    sub-<ID>_ses-preimplant_task-rest_bold.json
    sub-<ID>_ses-preimplant_task-rest_rec-moco_bold.nii.gz     Motion-corrected reconstruction
    sub-<ID>_ses-preimplant_task-rest_rec-moco_bold.json
```

**Multiband functional acquisitions.** Multiband fMRI sequences produce a single-band reference volume alongside the main acquisition, exported with the `sbref` suffix (see Section 5.3.4).

#### 6.1.4 Perfusion / Arterial Spin Labeling (perf/)

Files for each perfusion acquisition (if available):

| File | Format | Description |
|---|---|---|
| `sub-<ID>_ses-preimplant_asl.nii.gz` | NIfTI gzipped | Arterial spin labeling perfusion image |
| `sub-<ID>_ses-preimplant_asl.json` | JSON | Acquisition metadata |

**Required JSON sidecar fields for ASL** (site requirement per GOV-001 Section 3; not checked by the tool): `Manufacturer`, `MagneticFieldStrength`, `RepetitionTime`, `EchoTime`, `ArterialSpinLabelingType`, `PostLabelingDelay`.

#### 6.1.5 Field Maps (fmap/)

Field maps correct geometric distortion in echo-planar imaging (EPI) acquisitions such as diffusion and functional MRI.

**Gradient-echo field maps.** A gradient-echo field map produces two magnitude images (at two echo times) and one phase-difference image. Each is named with its standard BIDS suffix. `fmap` is the folder name, not a file suffix.

Files (if available):

| File | Format | Description |
|---|---|---|
| `sub-<ID>_ses-preimplant_magnitude1.nii.gz` | NIfTI gzipped | First-echo magnitude image |
| `sub-<ID>_ses-preimplant_magnitude2.nii.gz` | NIfTI gzipped | Second-echo magnitude image |
| `sub-<ID>_ses-preimplant_phasediff.nii.gz` | NIfTI gzipped | Phase-difference image |
| `sub-<ID>_ses-preimplant_phasediff.json` | JSON | Acquisition metadata |

**Required JSON sidecar fields for gradient-echo field maps** (site requirement per GOV-001 Section 3; not checked by the tool): `Manufacturer`, `MagneticFieldStrength`, `EchoTime1`, `EchoTime2`, `IntendedFor`. These accompany the `phasediff` image.

The tool reads the dcm2niix echo and phase markers in filenames (`_e1`, `_e2`, `_ph`) and assigns the `magnitude1`, `magnitude2`, and `phasediff` suffixes automatically. A series with two phase images is named `phase1` and `phase2` instead of `phasediff`. When a session contains multiple gradient-echo field-map series (for example, one for diffusion and one for functional MRI), each series receives its own `run-` number with its own complete set. For example:

```
fmap/
    sub-<ID>_ses-preimplant_run-1_magnitude1.nii.gz
    sub-<ID>_ses-preimplant_run-1_magnitude2.nii.gz
    sub-<ID>_ses-preimplant_run-1_phasediff.nii.gz
    sub-<ID>_ses-preimplant_run-1_phasediff.json
    sub-<ID>_ses-preimplant_run-2_magnitude1.nii.gz
    sub-<ID>_ses-preimplant_run-2_magnitude2.nii.gz
    sub-<ID>_ses-preimplant_run-2_phasediff.nii.gz
    sub-<ID>_ses-preimplant_run-2_phasediff.json
```

**`IntendedFor`.** The `IntendedFor` field in each `phasediff.json` should list the paths of the EPI images the field map is intended to correct. This is standard BIDS practice and is needed for correct downstream distortion correction. NeuroGate does not fill in `IntendedFor`. Because the tool renames every file on export, the site adds `IntendedFor` after export, using the exported paths.

**dcm2niix collision-suffix variants.** When dcm2niix would write two outputs with the same base name, it appends a trailing letter (`a`, `b`, and so on) to disambiguate them. A file named `gre_field_mapping_e1a` is not a variant echo of `_e1`. It belongs to a second, distinct field-map series. The tool treats each collision-suffix group as its own series and assigns it its own `run-` number.

**Reverse-polarity EPI field maps.** The tool classifies reverse-polarity EPI acquisitions named `topup`, `pe_polar`, or `se_pe_polar` as field maps, but it has no `_epi` suffix: it names them with the magnitude/phase scheme above, which is not the correct BIDS naming for this method. Sites using reverse-polarity EPI field maps must rename them to the BIDS `_epi` naming (with the `dir-` entity) after export, and should contact the project lead for site-specific guidance.

#### 6.1.6 Scalp EEG (eeg/)

Files for each scalp EEG recording (if available):

| File | Format | Exported to |
|---|---|---|
| `sub-<ID>_ses-preimplant_task-monitor_eeg.edf` | EDF or BDF | `eeg/` |
| `sub-<ID>_ses-preimplant_task-monitor_eeg.json` | JSON | `eeg/` |
| `sub-<ID>_ses-preimplant_task-monitor_channels.tsv` | TSV | `eeg/` (see below) |

NeuroGate accepts scalp EEG as EDF or BDF only and tells scalp EEG from iEEG by the channel labels in the EDF header. BrainVision (`.vhdr`, `.eeg`, `.vmrk`) is not supported and must be converted to EDF before import. Every EEG recording is named `task-monitor`, and the label cannot be changed in the tool.

**Table placement.** NeuroGate places electrodes, channels, and events tables beside their recording: in `eeg/` for scalp EEG and in `ieeg/` for iEEG. Each table is matched first to the EEG and iEEG recordings in its own source folder, then to those in the same subject and session; the first of these that holds only one kind of recording decides the folder. A table with no matching recording, or where both kinds are present and nothing closer decides, is placed in `ieeg/`. Keep each table in the same source folder as its recording so it is filed correctly, and check the BIDS path shown in the mapping table.

**Required JSON sidecar fields for scalp EEG** (site requirement per GOV-001 Section 3; not checked by the tool): `SamplingFrequency`, `EEGReference`, `PowerLineFrequency`.

**De-identification note:** Patient names must be removed from EDF and BDF recording headers before submission. NeuroGate rewrites the EDF/BDF patient field and shifts the header dates by a random per-subject offset on export. See Section 11.1 for exactly what is and is not changed.

#### 6.1.7 Positron Emission Tomography (pet/)

PET images are placed in `pet/` with the `_pet` suffix. PET is not tied to a particular Implant session; place it in the session in which it was acquired (for example, interictal FDG-PET for presurgical planning in `ses-preimplant`). The same rules apply under the Custom timepoints and Single session presets.

| File | Format | Description |
|---|---|---|
| `sub-<ID>_ses-preimplant_trc-FDG_pet.nii.gz` | NIfTI gzipped | PET image |
| `sub-<ID>_ses-preimplant_trc-FDG_pet.json` | JSON | PET acquisition metadata (required, see below) |

**Detection.** The tool identifies PET from the JSON sidecar (DICOM `Modality` of `PT`, or PET-only fields such as `TracerName`, `TracerRadionuclide`, `InjectedRadioactivity`, or `RadionuclideHalfLife`) and from names (`PET`, `PETCT`, `PETMR`, `trc-`, `amyloid`, `tau-pet`, and common neuro tracer names: FDG, PiB, florbetapir/AV45/Amyvid, florbetaben/FBB/Neuraceq, flutemetamol/Vizamyl, flortaucipir/AV1451/Tauvid, MK6240, PI2620, RO948, UCB-J, flumazenil/FMZ, FDOPA, raclopride). Tracer names such as `AV45` or `MK6240` are never read as subject IDs.

**`trc-` entity.** The tracer label comes from the sidecar `TracerName`, or from the file or folder name. Recognized tracers resolve to one label (for example `18F-FDG` and `Fluorodeoxyglucose` both become `trc-FDG`). An unrecognized sidecar `TracerName` is kept, reduced to letters and digits and at most 24 characters. When no tracer is found, the `trc-` entity is left out. PET images with different tracers in one session are numbered separately, so an FDG scan and an amyloid scan do not become `run-1` and `run-2`.

**`rec-` entity.** The tool adds a `rec-` label only when a session holds both attenuation-corrected and non-attenuation-corrected ("NAC", "noAC") images of the same tracer. It uses `rec-acstat`, `rec-nacstat`, `rec-acdyn`, or `rec-nacdyn`, where dynamic means the sidecar lists more than one frame (or, with no sidecar, the NIfTI header shows more than one volume); when the framing is unknown the label is `rec-ac` or `rec-nac`. An image that does not state its correction is treated as corrected. For example:

```
pet/
    sub-<ID>_ses-preimplant_trc-FDG_rec-acstat_pet.nii.gz
    sub-<ID>_ses-preimplant_trc-FDG_rec-nacstat_pet.nii.gz
```

**Attenuation-correction CT.** The CT a PET/CT scanner acquires only to correct the PET image (named `CTAC`, `AC_CT`, `mu-map`, `umap`, or any CT inside a PET study folder) is recognized as the attenuation CT and is not exported. If it is in fact a diagnostic CT, the user changes its modality to CT in the mapping table.

**Required PET sidecar fields.** This SOP requires every PET image to have a JSON sidecar containing the following BIDS PET metadata fields:

`Manufacturer`, `ManufacturersModelName`, `Units`, `TracerName`, `TracerRadionuclide`, `InjectedRadioactivity`, `InjectedRadioactivityUnits`, `InjectedMass`, `InjectedMassUnits`, `SpecificRadioactivity`, `SpecificRadioactivityUnits`, `ModeOfAdministration`, `TimeZero`, `ScanStart`, `InjectionStart`, `FrameTimesStart`, `FrameDuration`, `AcquisitionMode`, `ImageDecayCorrected`, `ImageDecayCorrectionTime`, `ReconMethodName`, `ReconMethodParameterLabels`, `ReconFilterType`, `AttenuationCorrection`

`InjectedMass`, `SpecificRadioactivity` and their units may be `n/a` (for example for FDG) but must be present. Conditionally required BIDS PET fields that depend on other values are not in this list.

dcm2niix fills only some of these fields (for example `TracerName`, `TracerRadionuclide`, `InjectedRadioactivity`, and `Units`, when the DICOM headers carry them). PET2BIDS fills the rest: install it with `pip install pypet2bids` and convert PET DICOM with its `dcm2niix4pet` command. Supplying complete PET sidecars is the site's responsibility.

**What NeuroGate checks.** For every exported PET image, the tool warns when the image has no JSON sidecar, when the sidecar lacks any of the fields above (naming the missing ones), or when a file was set to PET in the mapping table but no PET details were found. These warnings can be dismissed and never block export. The fields remain required by this SOP, so the site adds any missing ones before the dataset is shared.

**Not supported.** ECAT PET files (`.v`, `.v.gz`) produce a warning and are not exported; convert them to NIfTI with PET2BIDS first. PET blood data (`_blood.tsv`) is not supported.

**Defacing.** PET is exempt from defacing and is not covered by NeuroGate's defacing attestation (Section 11.2).

### 6.2 Session 2: Post-Implant (ses-postimplant)

**Purpose:** CT imaging for electrode localization and intracranial EEG recordings during seizure monitoring.

#### 6.2.1 CT (ct/)

Required files:

| File | Format | Required |
|---|---|---|
| `sub-<ID>_ses-postimplant_ct.nii.gz` | NIfTI gzipped | Yes |
| `sub-<ID>_ses-postimplant_ct.json` | JSON sidecar | Site requirement (not checked) |

**Required JSON sidecar fields for CT** (site requirement per GOV-001 Section 3; not checked by the tool): `Manufacturer`, `AcquisitionVoltage`, `SliceThickness`, `ConvolutionKernel`.

The post-implant CT must clearly show electrode positions for accurate localization. Confirm the full head is captured at sufficient resolution before continuing. This is a site quality check; the tool does not inspect image content.

**De-identification note:** DICOM headers must be stripped during dcm2niix conversion. Verify no patient name, date of birth, or medical record number remains in the JSON sidecar after conversion.

#### 6.2.2 Intracranial EEG (ieeg/)

Required files:

| File | Format | Required |
|---|---|---|
| `sub-<ID>_ses-postimplant_task-monitor_ieeg.<ext>` | EDF, BDF, NWB, or Persyst (.dat + .lay) | Yes |
| `sub-<ID>_ses-postimplant_task-monitor_ieeg.json` | JSON | Site requirement (not checked) |
| `sub-<ID>_ses-postimplant_task-monitor_channels.tsv` | TSV | Yes |
| `sub-<ID>_ses-postimplant_electrodes.tsv` | TSV | Yes |
| `sub-<ID>_ses-postimplant_task-monitor_events.tsv` | TSV | Recommended |

Every iEEG recording, channels table, and events table is named `task-monitor`; the electrodes table carries no task entity. The label cannot be changed in the tool. The tables are placed in `ieeg/` with the recording (Section 6.1.6 describes how a table is matched to its recording).

**Minimum recording requirement:** 48 hours of continuous iEEG recording is a site rule under this SOP. The tool does not check recording duration; the site confirms it before export.

Accepted iEEG formats:

- `.edf` and `.bdf`: European Data Format
- `.nwb`: Neurodata Without Borders
- `.dat` and `.lay`: Persyst format, accepted as the pair. The site must supply both files of each pair. The tool does not check that both are present. On export, the `.lay` file's `File=` line is pointed at the paired `.dat` file's new BIDS name, so the renamed pair stays linked.

Tables supplied as `.csv` produce a warning (BIDS requires `.tsv`); a `.csv` is exported only when it shares a base name with a data file, and it is renamed to `.tsv` without its contents being converted. Sites should convert tables to tab-separated `.tsv` before import.

**Required JSON sidecar fields for iEEG** (site requirement per GOV-001 Section 3; not checked by the tool): `SamplingFrequency`, `iEEGReference`, `ElectrodeManufacturer`, `iEEGPlacementScheme`.

**De-identification note:** Patient identifiers must be removed from all recording headers. NeuroGate de-identifies EDF and BDF headers, EDF+/BDF+ annotations, and Persyst `.lay` files on export (Section 11.1). It does not de-identify NWB files or the Persyst `.dat` file; for these, the site removes identifiers before import, including NWB subject metadata.

**Channel and electrode consistency:** Every intracranial channel listed in `channels.tsv` should have a corresponding entry in `electrodes.tsv` for the same subject and session, per ALCOA+ accuracy requirements (GOV-001 Section 2.2). This is a site responsibility; the tool does not compare the two tables. The tool does warn when a session has an iEEG recording but no `electrodes.tsv` (Section 13.4).

### 6.3 Session 3: Post-Surgery (ses-postsurgery)

**Purpose:** Post-resection imaging to document surgical outcome and resection cavity.

| File | Format | Required |
|---|---|---|
| `sub-<ID>_ses-postsurgery_T1w.nii.gz` | NIfTI gzipped | Yes |
| `sub-<ID>_ses-postsurgery_T1w.json` | JSON sidecar | Site requirement (not checked) |
| `sub-<ID>_ses-postsurgery_T2w.nii.gz` | NIfTI gzipped | Recommended |
| `sub-<ID>_ses-postsurgery_T2w.json` | JSON sidecar | Site requirement (not checked) |
| `sub-<ID>_ses-postsurgery_FLAIR.nii.gz` | NIfTI gzipped | If available |
| `sub-<ID>_ses-postsurgery_FLAIR.json` | JSON sidecar | If available |

**Defacing note:** Post-surgery structural MRI files (T1w, T2w, FLAIR) must be defaced before submission. See Section 11.

---

## 7. Missing Sessions Under the Implant Sessions Preset

Under the Implant sessions preset, not every subject will have data in every session. A subject may have pre-implant imaging but not yet have progressed to intracranial monitoring, or may have declined post-surgery imaging. The tool handles these cases as follows.

The exported dataset contains session folders only for sessions where the subject has exported files. Required files (Section 6) are checked only for sessions in which the subject has files; a session with no files at all is not flagged as missing. A subject with no session at all gets a "Subject has no sessions" error.

The subject's `sub-<ID>_sessions.tsv` lists only the sessions in which the subject has exported files, in both the desktop application and the command-line interface. A session with no acquisition date has `acq_time` of `n/a`.

If a subject has no imaging data for the pre-implant session but has data for post-implant and post-surgery sessions, verify the acquisition records to confirm the pre-implant scan was truly not acquired rather than misclassified during import. The tool does not fabricate files for missing sessions.

---

## 8. Custom Timepoints Preset: File Requirements

This section applies only to datasets using the Custom timepoints preset (Section 5.4).

### 8.1 Session Labels

Session labels are generated by the tool from a number (0 to 99) and a unit. The abbreviations are `d` (days), `wk` (weeks), `mo` (months), and `yr` (years), so timepoints of 1 day, 2 weeks, 6 months, and 1 year produce `ses-1d`, `ses-2wk`, `ses-6mo`, and `ses-1yr`. The "sessions (no time interval)" unit produces plain numbered labels (`ses-1`, `ses-2`). A timepoint numbered 0 (in any unit) is shown as the baseline. Labels are sorted chronologically by elapsed time (a month counts as 30 days and a year as 365) regardless of the order timepoints were entered. Duplicate labels within a single dataset are blocked by the tool. A dataset may define 1 to 24 timepoints.

### 8.2 Recognized Visit Folder Conventions

The tool recognizes the following conventions as visit (timepoint) folders, so that they are not mistaken for subject folders:

| Convention | Examples | How the session is assigned |
|---|---|---|
| Exact session label | `ses-2mo`, `sub-01_ses-2mo_T1w.nii.gz` | Directly, from the label in the path or filename |
| Number-and-unit | `2weeks`, `2wk`, `2 weeks`, `2_weeks`, `02weeks`, `6mo`, `1year` | Directly, when it matches a defined timepoint |
| Unit-first | `week2`, `week_02`, `wk2`, `W2`, `M6`, `Y1` | Directly, when it matches a defined timepoint |
| Word label | `baseline`, `screening`, `enrollment`, `followup`, `endpoint`, `exit`, `final` | By date or folder clustering (Section 8.6) |
| Sequence label | `visit1`, `V1`, `TP1`, `timepoint2` | By date or folder clustering (Section 8.6) |
| Date | `20180510`, `2018-05-10`, `2018_05_10` | By date or folder clustering (Section 8.6) |

Some conventions are intentionally not recognized as visit folders because they collide with other common uses:

- `T0`, `T1`, `T2` style labels are not treated as visits, because these appear overwhelmingly as modality names in imaging data (T1w, T2w) and treating them as sessions would misclassify structural scans
- `S1`, `S2` style labels are not treated as visits, because these appear overwhelmingly as patient IDs
- Bare numeric folders (`01`, `02`) are not treated as visits, because these appear overwhelmingly as subject folders
- Unit conversions between different measures are not made. A folder named `14days` is not recognized as `ses-2wk`, because a study may legitimately define both a 14-day and a 2-week visit as distinct timepoints.

### 8.3 No Fixed Per-Timepoint Modality Requirements

Unlike the Implant sessions preset (Section 6), Custom timepoints datasets have no required-file table per session. An arbitrary study's timepoints cannot be assumed to follow a clinical evaluation sequence, so the tool does not check that a given modality appears at a particular timepoint. Any modality is permitted at any timepoint. The same holds for the Single session preset.

All other requirements in this SOP still apply:

- Correct BIDS naming and folder placement (using the same modality suffixes and folder names documented in Section 6)
- JSON sidecar completeness for whatever modalities are present, per the required-fields lists in Section 6 (a site responsibility; only PET sidecars are checked, as warnings)
- The BIDS entities the tool assigns automatically per Section 5.3
- The `primary/` and `derivatives/scanner/` folder separation per Section 5.1
- All de-identification and defacing requirements in Section 11

### 8.4 Folder Structure Example

```
primary/
    sub-<ID>/
        sub-<ID>_sessions.tsv
        ses-0mo/
            anat/    sub-<ID>_ses-0mo_T1w.nii.gz
            anat/    sub-<ID>_ses-0mo_T1w.json
        ses-2mo/
            anat/    sub-<ID>_ses-2mo_T1w.nii.gz
            anat/    sub-<ID>_ses-2mo_T1w.json
        ses-6mo/
            anat/    sub-<ID>_ses-6mo_T1w.nii.gz
            anat/    sub-<ID>_ses-6mo_T1w.json
```

### 8.5 Nested Folder Structures

The tool handles nested folder hierarchies at any depth. A common Flywheel-exported layout looks like this:

```
sub-01/
    scitran/
        study_name/
            cohort/
                sub-01/
                    2weeks/
                        <scan-series-folders>/
                            <files>.nii.gz
                    6months/
                        <scan-series-folders>/
                            <files>.nii.gz
```

Here the `2weeks/` and `6months/` folders are parsed directly as number-and-unit timepoints (Section 8.2). When visit folders carry no parseable timepoint, folder clustering (Section 8.6) searches the subject's folder levels, shallowest first, for the level that splits the subject's files into exactly as many groups as there are defined timepoints. Datasets with different depths across subjects (some flat, some Flywheel-nested) are handled in the same pass; the level is chosen per subject independently.

### 8.6 Detection and Manual Mapping

For Custom timepoints datasets, the tool assigns a session to each file using the following signals, in order:

1. **Exact label.** The file's folder path or filename contains one of the dataset's session labels (for example `ses-2mo`).
2. **Visit folder name.** A folder named by number and unit, in either order (`2weeks`, `week2`, `W2`, `6mo`), that matches one of the defined timepoints (Section 8.2).
3. **Date clustering.** Files with an acquisition date (from an EDF header or a JSON sidecar) are grouped into visits, where files within 24 hours of the first file in a group belong to the same visit. When the number of visits found for a subject equals the number of defined timepoints, the visits are matched to the timepoints in chronological order. If the counts differ, no session is assigned from dates and the file's detection reasons say why.
4. **Folder clustering.** For files still unassigned, the tool looks for the folder level that splits the subject's files into exactly as many folders as there are defined timepoints. Those folders are ordered by a number in the folder name when every folder has one, or alphabetically otherwise (the lowest-confidence signal), and matched to the timepoints in order.
5. **Neighbor propagation.** A file with no session of its own (for example a `channels.tsv`) takes the session of the other files in the same folder, provided they all agree on one session.

The Implant sessions preset uses a different, keyword-based detector (for example, `preop` or `baseline` suggest pre-implant; `monitoring` or `EMU` suggest post-implant). Every automatic assignment carries a confidence badge and a detection reason in the mapping table and should be verified.

Files that are not assigned automatically must be mapped to a session manually in the tool's mapping table. When several files need to be assigned to different timepoints in sequence (for example, five T1w scans, one per visit), tick them in order and use "Assign in order to timepoints" to pair the first ticked file with the earliest timepoint, the second with the next, and so on.

### 8.7 Missed and Not-Yet-Acquired Visits

When a subject has fewer visits than the study defines, the tool does not guess which timepoint each visit represents. For example, if the study defines `ses-2wk` and `ses-6mo` but a subject has only a single visit folder, the tool cannot determine whether the visit is the baseline or the follow-up. No session is assigned, and the file's detection reasons describe the situation (for example, "most likely a missed or not-yet-acquired visit").

To resolve, the user assigns each of the subject's files to the correct timepoint using the Session dropdown in the mapping table, consulting site clinical records if the correct assignment is not apparent from the source data.

In the desktop application, a file with no session produces a "No session assigned" error that cannot be dismissed, so the export cannot proceed until every such file is assigned. In the command-line interface, which has no per-file corrections, a subject with errors is held back and the rest of the dataset is exported (Section 13.9).

---

## 9. Derivatives Folder Specification

The `derivatives/scanner/` folder holds files that were computed by the scanner console rather than acquired. These are real data (produced by the scanner from the source acquisition using its onboard reconstruction) but they are not raw and must not be treated as raw acquisitions by downstream analysis pipelines.

### 9.1 Purpose

Scanner-computed derivative maps are common in modern MRI workflows. Diffusion sequences frequently produce ADC, FA, and TRACEW maps on the console. Susceptibility-weighted sequences produce minimum-intensity projections. These files:

- Belong under `derivatives/` rather than in the raw acquisition folders
- Are useful to downstream analysis (particularly for quick visual review and quality control)
- Would produce incorrect results if placed in the raw `primary/` tree and read as raw acquisitions

The `derivatives/scanner/` subfolder is reserved for scanner-computed derivatives specifically. It is separate from other subfolders that a site's own analysis pipelines create under `derivatives/`. NeuroGate does not write a `dataset_description.json` inside `derivatives/scanner/`.

### 9.2 Folder Structure

The `derivatives/scanner/` folder mirrors the structure of `primary/`. For example:

```
derivatives/
    scanner/
        sub-PENN001/
            ses-preimplant/
                dwi/
                    sub-PENN001_ses-preimplant_desc-ADC_dwi.nii.gz
                    sub-PENN001_ses-preimplant_desc-ADC_dwi.json
                    sub-PENN001_ses-preimplant_desc-FA_dwi.nii.gz
                    sub-PENN001_ses-preimplant_desc-FA_dwi.json
                    sub-PENN001_ses-preimplant_desc-TRACEW_dwi.nii.gz
                    sub-PENN001_ses-preimplant_desc-TRACEW_dwi.json
                anat/
                    sub-PENN001_ses-preimplant_desc-mIP_T2starw.nii.gz
                    sub-PENN001_ses-preimplant_desc-mIP_T2starw.json
        sub-PENN002/
            ...
```

Each derivative file's parent modality folder matches the modality of the source acquisition. Diffusion-derived maps live in `derivatives/scanner/<subject>/<session>/dwi/`; SWI projections live in `derivatives/scanner/<subject>/<session>/anat/`. Under the Single session preset there is no session level.

### 9.3 The `desc-` Entity

The `desc-<label>` entity identifies which derivative a file is:

| Label | Meaning | Source Modality |
|---|---|---|
| `desc-ADC` | Apparent diffusion coefficient map | dwi |
| `desc-FA` | Fractional anisotropy map | dwi |
| `desc-TRACEW` | Trace-weighted map | dwi |
| `desc-COLFA` | Color-coded fractional anisotropy map | dwi |
| `desc-EXADC` | Exponential ADC map | dwi |
| `desc-mIP` | Minimum-intensity projection | anat (SWI or T2*-weighted) |

### 9.4 How the Tool Identifies Derivatives

The tool uses two signals to identify scanner-computed derivatives, in priority order:

**DICOM `ImageType`** (authoritative, diffusion maps). When a JSON sidecar is present, the tool reads the DICOM `ImageType` field. A value list containing `DERIVED` along with a derivative label (`ADC`, `FA`, `TRACEW`, `COLFA`, `EXADC`) classifies the file as a scanner-derived diffusion map and routes it to `derivatives/scanner/`. This is the authoritative test because it comes from the DICOM header rather than filename convention.

**Filename** (fallback). When `ImageType` has not already identified a derived map, the tool falls back to the file name. A diffusion scan name (containing `dwi`, `dti`, `diffusion`, `ep2d_diff`, or `diff`) ending in `_ADC`, `_FA`, `_TRACEW`, `_COLFA`, or `_EXADC` is routed to the derivatives folder, and the Siemens SWI projection name `mIP_Images` is routed there as `desc-mIP`. Filenames are less reliable than `ImageType`. For example, `_TW` looks like a TRACEW abbreviation, but its `ImageType` is `ORIGINAL` on typical Siemens sequences, so `_TW` is deliberately not treated as a derivative and stays in raw `dwi/`.

### 9.5 Run Numbering in the Derivatives Folder

Derivative files are grouped and run-numbered independently from the raw acquisitions in `primary/`. An ADC map does not take the run number of the raw diffusion series it was computed from; it is numbered within its own derivative-label group and takes a `run-` entity only when the session holds more than one map of that label. This keeps the derivatives folder self-consistent and prevents confusion when a session contains multiple acquisitions of the same modality.

### 9.6 Site-Populated Derivative Folders

Sites may add additional subfolders under `derivatives/` for their own analysis pipelines. Common examples include `derivatives/freesurfer/` for FreeSurfer outputs and `derivatives/ieeg_recon/` for iEEG reconstruction outputs. These folders are outside the scope of this SOP and are managed by each site according to its own analysis workflow.

---

## 10. Metadata Files

The dataset carries metadata files at several levels of its hierarchy, following BIDS conventions. This section documents what NeuroGate generates and what the site supplies.

### 10.1 dataset_description.json

This file lives at the dataset root and is generated by NeuroGate on every export. It contains exactly these fields:

| Field | Type | Source |
|---|---|---|
| Name | string | Study name entered in the Metadata step (required) |
| BIDSVersion | string | `1.8.0`, unless a dropped `dataset_description.json` supplies another value |
| DatasetType | string | `raw`, unless a dropped `dataset_description.json` supplies another value |
| Authors | array | Authors entered in the Metadata step (at least one required) |
| GeneratedBy | array | NeuroGate's name, the application version, and a description of the structure preset used |

The study name and authors can be auto-filled from a `dataset_description.json` included in the dropped files. NeuroGate does not write other optional BIDS fields (for example `Acknowledgements` or `Funding`); a site that wants them adds them after export.

### 10.2 participants.tsv and participants.json

NeuroGate generates `participants.tsv` at the dataset root with a single column, `participant_id`, listing each subject that has exported data. A subject whose files are all left out of the export (for example, only guessed files) is not listed. The tool collects no demographics (age, sex, handedness) and does not generate `participants.json`. Demographics are optional.

| Column | Type | Source |
|---|---|---|
| participant_id | string | Generated by the tool (e.g., `sub-CHOP001`) |

If the study or a recipient needs demographic or clinical columns (for example `age`, `sex`, `handedness`, `pathology`, `implant_type`), the site adds them to the exported `participants.tsv` after export, and writes the `participants.json` data dictionary that describes them if a recipient needs it.

**PHI warning:** The `participants.tsv` file must not contain direct identifiers. Use age as an integer in years, not a date of birth. Use coded subject IDs only. No names, medical record numbers, or dates of birth are permitted per GOV-001 Section 2.3.

### 10.3 sub-<ID>_sessions.tsv

For the Implant sessions and Custom timepoints presets, NeuroGate generates a `sub-<ID>_sessions.tsv` file at each subject's root, listing only the sessions in which that subject has exported data. This is the same in the desktop application and the command-line interface. It is not generated for the Single session preset.

| Column | Type | Description |
|---|---|---|
| session_id | string | Session label (e.g., `ses-preimplant` or `ses-2mo`) |
| acq_time | string | Acquisition date, shifted (see below) and written in ISO 8601 format, or `n/a` |

The session list is described in Section 7.

**Date handling:** `acq_time` is auto-filled, never typed in. It comes from a `sessions.tsv` included in the dropped files, or from a JSON sidecar's `AcquisitionDateTime` when the file sits in a `ses-<label>` folder. Auto-filled dates are not shown on screen. On export, each value is shifted by the subject's random date offset, the same offset applied to that subject's EDF headers and JSON sidecars (Section 11.1), which preserves the intervals between sessions. A value that cannot be shifted is written as `n/a`. Any `sessions.tsv` a site maintains outside the tool must be date-shifted by the site per GOV-001 Section 2.3.

### 10.4 electrodes.tsv

Required for any subject and session that includes intracranial EEG. Under the Implant sessions preset, this typically means `ses-postimplant/ieeg/`. Under Custom timepoints, it applies to any timepoint that includes iEEG. The site supplies this table; NeuroGate renames it and places it beside its recording (`ieeg/` for iEEG, Section 6.1.6). It scans the table's cells for PHI during validation (Section 11.3) but does not check the columns or de-identify the contents; the table is exported unchanged.

Required columns (site responsibility, per the BIDS iEEG specification):

| Column | Type | Description |
|---|---|---|
| name | string, required | Electrode contact name (e.g., `LA1`, `RA2`) |
| x | float, required | X coordinate in mm |
| y | float, required | Y coordinate in mm |
| z | float, required | Z coordinate in mm |
| size | float, recommended | Contact surface area in mm squared |

Example:

```
name    x       y       z       size
LA1     -32.5   -12.3   45.2    2.0
LA2     -35.1   -10.8   43.7    2.0
RA1     28.9    -15.6   42.1    2.0
```

**Coordinate system note:** Electrode coordinates must be in a well-defined anatomical coordinate system. BIDS documents the system (typically MNI or subject-space T1w) in the `iEEGCoordinateSystem` field of a `_coordsystem.json` file. NeuroGate does not export `_coordsystem.json`: it pairs JSON files only with a data file of the same base name in the same folder, so a coordinate-system file is reported as an orphaned sidecar and left out. The site adds `_coordsystem.json` after export.

### 10.5 channels.tsv

Required for any subject and session that includes EEG or iEEG. The site supplies this table; NeuroGate names it `task-monitor`, places it beside its recording (`eeg/` for scalp EEG, `ieeg/` for iEEG; Section 6.1.6), and scans its cells for PHI during validation (Section 11.3). It does not check the columns or de-identify the contents; the table is exported unchanged.

Required columns (site responsibility, per the BIDS EEG and iEEG specifications):

| Column | Type | Description |
|---|---|---|
| name | string, required | Channel label. Intracranial channels should match a name in `electrodes.tsv`. |
| type | string, required | Channel type: `ECOG`, `SEEG`, `EEG`, `ECG`, `EMG`, and so on |
| units | string, required | Measurement units (typically `uV` or `mV`) |
| sampling_frequency | float, recommended | Sampling rate in Hz |
| status | string, recommended | `good` or `bad` |

**Consistency rule:** Every intracranial channel name in `channels.tsv` should have a corresponding entry in `electrodes.tsv` for the same subject and session. This is a site responsibility; the tool does not cross-check the two tables.

### 10.6 README

BIDS recommends a `README` file at the dataset root. NeuroGate does not generate it; if a recipient needs it, the site writes it and adds it to `bids_output/` after export (GOV-001 Section 4). Recommended contents:

- Study name and brief description
- Contact information for the responsible investigator
- Collection protocols (institutions, scanner types, acquisition parameters at a high level)
- Any known issues, exclusions, or caveats (including any NeuroGate validation warnings dismissed or left unresolved at export)

### 10.7 CHANGES

The `CHANGES` file at the dataset root records the version history of the dataset per BIDS convention. NeuroGate does not generate it; if a recipient needs it, the site writes it after export (GOV-001 Section 4). Each entry records the date, version, and a summary of what changed, and the site appends to it each time the dataset is re-exported with substantive changes.

---

## 11. De-identification and Defacing Requirements

All 18 HIPAA identifiers must be removed before data leaves the originating institution per GOV-001 Section 2.3. NeuroGate automates part of this on export; the rest is the site's responsibility before importing data into the tool.

### 11.1 Automatic De-identification on Export

The tool performs the following automatically on every export, under every structure preset. No user action is required.

**Date shift.** Each subject is given one random shift of between −365 and +365 days (0 is possible). The same shift is applied to that subject's EDF/BDF headers, JSON sidecars, Persyst `.lay` test dates, and `sessions.tsv` `acq_time` values, so relative timing between a subject's recordings is preserved while the absolute calendar dates are removed. The shift value is deliberately not recorded anywhere, including the audit log, so the true dates cannot be recovered from the export or the tool's records.

**EDF and BDF header cleaning.**

- **Patient field:** replaced with `<sub-ID> X X X` when it has EDF+ structure (four or more parts), otherwise with `X X X X`. This removes the patient code, sex, birthdate, and name subfields.
- **Recording field:** in EDF+ "Startdate" form, the date is shifted and the administration code and technician become `X`. Otherwise only dates written as `dd-MMM-yyyy` are shifted and other text is kept.
- **Start date:** shifted. The start time is unchanged.
- **Not changed:** dates that cannot be parsed. Files under 256 bytes are copied as-is.
- **Signal headers:** each signal's transducer and prefiltering fields are checked for the patient's name and ID only, and those are replaced with `X`.

**EDF+ and BDF+ annotations.** The "EDF Annotations" or "BDF Annotations" signal is de-identified in place:

- **Replaced with `X`, at the same byte length:** the patient's code, name parts, and birth date and the recording's administration and technician codes (taken from the original header), plus Social Security Numbers, medical record numbers, dates, phone numbers, and email addresses.
- **Unchanged:** event text such as "Seizure onset", every timestamp and time-keeping entry, the signal samples, and the file size.
- The desktop application, the command-line interface, and the browser version produce byte-identical results. The number of redactions is recorded in the de-identification summary of the audit log; the redacted text itself is never recorded.
- The redaction is pattern-based. Identifying text it does not recognize (for example a relative's name typed into an event) is left in place, so annotations still need site review (Section 11.2).

**Persyst `.lay` files.**

- `File=` is pointed at the paired `.dat` file's exported name.
- `[Patient]` keeps only `Sex`, `Hand`, and `TestTime`. `TestDate` is shifted by the subject's offset. Every other key (name, ID, birth date, physician, and so on) is removed.
- `[Comments]` event text is redacted with the same rules as EDF+ annotations; times and durations are unchanged.

**JSON sidecar de-identification.** DICOM-to-NIfTI conversion can carry identifying DICOM header fields into a scan's `.json` sidecar depending on site conversion settings. On every sidecar in the export, at any depth (fields inside nested objects and arrays are handled too):

- **Replaced with "X"** (when present with any non-empty value): `PatientName`, `PatientID`, `PatientBirthDate`, `PatientAddress`, `PatientTelephoneNumbers`, `OtherPatientIDs`, `OtherPatientNames`, `InstitutionName`, `InstitutionAddress`, `InstitutionalDepartmentName`, `ReferringPhysicianName`, `PerformingPhysicianName`, `RequestingPhysician`, `OperatorsName`, `StationName`, `DeviceSerialNumber`.
- **Date-shifted** by the subject's offset: `AcquisitionDateTime`, `AcquisitionDate`, `StudyDate`, `SeriesDate`, `ContentDate`, `InstanceCreationDate`, `ScanDate`, `RadiopharmaceuticalStartDateTime`. A date in a format the tool does not recognize is blanked rather than exported unshifted.
- **Left intact:** every other field, including scan-descriptive fields that downstream BIDS tooling uses (`SeriesDescription`, `ProtocolName`, `EchoTime`, `RepetitionTime`, `FlipAngle`, `SliceThickness` and other acquisition parameters, `Manufacturer`, `ManufacturersModelName`, `MagneticFieldStrength`, `SoftwareVersions`).
- **Not a JSON object:** a sidecar that is not valid JSON, or whose content is not a JSON object (for example `null` or an array), cannot be de-identified. Validation reports it as an error that blocks export (Section 13.1), and the export refuses to copy it. Fix the file in the source data and add the files again.

**`sessions.tsv` `acq_time`.** Shifted and written as ISO 8601. A value that cannot be shifted becomes `n/a` (Section 10.3).

**Not de-identified by the tool:**

- NWB files, Persyst `.dat` files, and NIfTI header text (the NIfTI text is PHI-scanned, Section 11.3, and exported unchanged)
- The contents of electrodes, channels, events, and other TSV tables (these are PHI-scanned, Section 11.3, and exported unchanged)
- Free-text sidecar fields such as `SeriesDescription` and `ProtocolName` (these are PHI-scanned, Section 11.3)
- Image pixels (defacing is done before import and attested, Section 11.2)

### 11.2 Manual De-identification Required Before Import

The following are the site's responsibility and cannot be performed by the tool. They must be complete before source data is imported.

**DICOM header stripping.** DICOM-to-NIfTI conversion via dcm2niix should be run with `-b y -ba y` to write an anonymized sidecar, and with a `-f` filename template that never uses `%i` or `%n` (Section 6.1.1). This is the recommended first-line defense and reduces the burden on the tool's automatic sidecar de-identification.

**Facial defacing.** All structural MRI files (T1w, T2w, FLAIR, PDw, T2starw) that could reconstruct facial features must be defaced using pydeface or an equivalent tool. The tool cannot verify defacing was performed. When any T1w, T2w, FLAIR, PDw, or T2*w image is present (including a file the tool has only guessed to be T1w), the desktop application requires a defacing attestation checkbox in the Metadata step, and the command-line interface requires a yes answer to its defacing question, before export. The time the attestation was ticked is recorded.

Facial defacing is required for the anatomical folders of `ses-preimplant` and `ses-postsurgery` under the Implant sessions preset, and for any anatomical folder under Custom timepoints or Single session. CT scans do not require facial defacing per current standard practice, though sites may choose to deface them as an additional precaution. PET is exempt from defacing and is not covered by the attestation.

**Other recording formats and tables.** Remove identifiers from NWB files, Persyst `.dat` files, NIfTI header text, and all TSV tables (electrodes, channels, events) before import. The tool does not modify any of these. It PHI-scans TSV tables and NIfTI header text during validation (Section 11.3), but a finding has to be fixed in the source file. Also review EDF+ annotations and Persyst `.lay` comments: the tool redacts the identifiers it recognizes (Section 11.1), but free text it does not recognize is kept.

**Manual review of free-text fields.** Free-text sidecar fields such as `SeriesDescription` and `ProtocolName` are left intact by the automatic de-identification because downstream BIDS tooling uses them. If a scanner operator typed a patient name or medical record number into one of these fields at acquisition time, that PHI will remain in the export unless corrected. The tool's PHI scanner checks these fields and flags suspicious values during validation (Section 11.3), but the correction is manual: edit the source sidecar to remove the PHI, then add the files to the tool again.

### 11.3 PHI Scanning During Validation

The tool runs four complementary PHI scans during validation. None of them modifies source files.

**File and folder names** are scanned for:

- **Errors (cannot be dismissed):** Social Security Number patterns; medical record numbers (an `MRN` or `MR#` prefix followed by 5 to 10 digits); a date-of-birth marker followed by digits; `patient`, `pt`, `subj`, or `subject` followed by a First Last name; and a subject group that looks like a person's name.
- **Warnings (can be dismissed):** phone numbers; email addresses; dates written `MM/DD/YYYY` or `MM-DD-YYYY`; "Last, First" names; and the first match of these keywords (underscore variants included): firstname, lastname, fullname, patientname, ssn, social_security, address, street, zipcode, insurance, policy_number, accession, acc_num.

**JSON sidecar content.** Every string field in every sidecar that is not already de-identified (nested objects included) is scanned with the same patterns and keywords, at the same severities, plus a check for two capitalised words that may be a name (warning).

**TSV table contents.** Every cell of each exported TSV table (electrodes, channels, events, and others) is scanned with the same patterns and keywords. Purely numeric cells are skipped, and so is the two-capitalised-words name check, which would flag event labels such as "Seizure Onset". Tables are exported unchanged, so a finding has to be fixed in the source file.

**NIfTI header text.** The free-text `descrip` (80 bytes) and `aux_file` (24 bytes) fields in the header of each exported NIfTI image are scanned with the same patterns and keywords, plus the two-capitalised-words name check. dcm2niix's own `key=value` entries (such as `TE=96;Time=101502.425`) are ignored. The header is exported unchanged, so a finding has to be fixed at the source, for example by converting again.

**Not scanned:** an EDF header that looks identifying is shown only as a warning in the mapping table's detection reasons. The header itself is always de-identified on export (Section 11.1).

PHI errors block export until corrected (Section 13.7). PHI warnings should be reviewed and either corrected or dismissed.

### 11.4 Subject ID Key Management

The mapping from BIDS subject IDs to real patient identifiers must be maintained separately at the originating institution in a secure, access-controlled system per GOV-001 Section 2.3. This mapping is never entered into the NeuroGate tool and is never exported.

Sites should treat the subject ID key as protected health information subject to the same access controls as clinical records.

Every export writes two audit logs. The full audit log contains the original file and folder names (in its corrections and subject names) and the study name, which can identify patients. It stays at the site and is never shared with the dataset. The shareable copy (`audit_log_<timestamp>_shareable.json`; `audit_log_shareable.json` from the command-line interface) replaces each original file name and path with its exported BIDS path (or `file-N` if the file was not exported), each subject group with its assigned `sub-` ID (or `subject-N`), and the operator with "site". Everything else matches the full log. This is the copy to send with a dataset. The Audit Log panel's Export JSON and Export CSV buttons save the full log, not the shareable copy. The full log attributes entries only to "user" (desktop application) or the operating-system username (command-line interface), so the site records the identity of the operator who ran each session in its own records.

---

## 12. The NeuroGate Tool

The NeuroGate desktop application is the primary means of organizing data into the structure specified by this SOP. This section provides a high-level overview. Detailed workflow instructions are in SOP-GUI-001.

### 12.1 Purpose

NeuroGate automates:

- File classification (which imaging or electrophysiology modality each file represents)
- Session assignment (which timepoint or clinical phase each file belongs to)
- Naming and folder placement following BIDS conventions
- Assignment of BIDS entities (`run-`, `part-`, `rec-`, `trc-`, `desc-`, the `sbref` suffix, and the fixed task labels)
- Routing of scanner-computed derivatives to `derivatives/scanner/`
- Generation of `dataset_description.json`, `participants.tsv` (participant_id only), and per-subject `sessions.tsv`
- Automatic de-identification on export (EDF/BDF headers and annotations, Persyst `.lay` files, JSON sidecar fields, and `sessions.tsv` dates)
- The validation checks listed in Section 13, including PHI checks on file names, sidecar content, and TSV table contents
- An audit log of the session's actions, written with every export as a full log (kept at the site) and a shareable copy

Everything runs on the user's computer; no patient data is uploaded anywhere.

### 12.2 Distribution

NeuroGate is distributed through GitHub Releases as a desktop application for macOS (Apple Silicon only), Windows, and Linux. Every desktop build bundles a command-line interface (`neurogate <folder>`). Installation instructions are documented in SOP-GUI-001.

### 12.3 Workflow Summary

The tool operates as a six-step linear workflow. The steps and their relationship to this SOP are:

| Step | Purpose | This SOP Section |
|---|---|---|
| 1: Structure | Select the Implant sessions, Custom timepoints, or Single session preset | 5.4, 6, 8 |
| 2: Drop Files | Import source files | 12.4 (what is excluded) |
| 3: Mapping | Review and correct subject, session, and modality for each file | 5.3, 6, 8, 9 |
| 4: Metadata | Enter institution prefix and starting number, study name and authors, and the defacing attestation | 4.1, 10, 11.2 |
| 5: Validate | Automated BIDS, required-file, PHI, and metadata checks | 13 |
| 6: Export | Write the BIDS folder and the two audit logs | 5.1, 10, 11.1, 11.4 |

### 12.4 Files the Tool Excludes Automatically

The tool drops the following silently when files are added:

- Operating-system artifacts (`.DS_Store`, `Thumbs.db`, files whose name begins with a period, macOS `._` AppleDouble files, and in-progress copy files)

The following are listed in the mapping table but are not exported:

- Localizer and scout scans (acquisition aids, not analyzable data)
- PET attenuation-correction CT and mu-map images (Section 6.1.7)
- The redundant copy of a series converted twice (see Section 12.5)
- Files whose modality the tool has only guessed. An unidentified `.nii.gz` defaults to T1w, marked "Guessed: pick a modality to export", and is not exported until the user picks a modality. One whose NIfTI header shows more than one volume (a series such as fMRI, diffusion or dynamic PET) is not defaulted to T1w and stays Other / Unknown. An unidentified `.nii` stays Other / Unknown. Validation lists a subject's guessed files in one warning (Section 13.1).
- Files with an unrecognized extension, or that could not be classified (a "Unclassified file" warning)
- JSON sidecars with no data file of the same base name (an "Orphaned JSON sidecar" warning), and diffusion gradient tables that could not be paired (Section 6.1.2)
- DICOM files (`.dcm`, `.dicom`, `.ima`) and ECAT PET files (`.v`, `.v.gz`), each with a warning to convert to NIfTI first
- TSV and CSV files other than electrodes, channels, and events tables, unless they share a base name with a data file

### 12.5 Duplicate Series Handling

Flywheel and similar export pipelines frequently produce two copies of the same acquisition in the same folder: the bare series name and dcm2niix's decorated form `_<series>_<timestamp>_<series-number>`. Both are legitimate files, but they represent one acquisition rather than two.

The tool detects duplicate series by a deterministic name relationship: stripping the leading underscore and the trailing `_<timestamp>_<series-number>` from the decorated name must yield the bare name exactly, in the same folder. When it does, the decorated copy (which normally carries the JSON sidecar) is exported and the bare copy is not. NeuroGate's validation reports this as "Same series present twice" (information).

Nothing is deleted from the source data. The bare copy is visible in the mapping table with a "Duplicate of …" badge naming the file it duplicates, and the exclusion can be reversed by explicitly assigning a modality to it.

---

## 13. Validation Pipeline

Validation runs before export (Step 5 in the desktop application; automatically in the command-line interface). Each check produces an error, a warning, or an informational note. Section 13.7 describes which issues block export. A dataset conforms to this SOP when this validation reports no errors (Section 5).

### 13.1 Structural Validation

- **Errors (cannot be dismissed):** a file has no session assigned (not applicable to Single session); a subject has no BIDS ID; two files would get the same name (one was renamed `_dup-N`, Section 5.3); a sidecar that would be exported is not valid JSON, so it cannot be de-identified (Section 11.1)
- **Warnings:** files whose modality is only a guess and will not be exported (one warning per subject, listing the files); unclassified file (not exported); orphaned JSON sidecar (not exported); duplicate sidecar; diffusion gradient table not matched to an image (Section 6.1.2)
- **Information:** special characters in a file name; same series present twice (Section 12.5)

The redundant copy of a duplicated series gets no validation message of its own; it is flagged in the mapping table, and the kept copy is reported as "Same series present twice" (Section 13.10).

### 13.2 Required Files

Required-file checks apply only to the Implant sessions preset. They are run for each session in which the subject has files. Only files that will be exported count, so a guessed file or the redundant copy of a duplicated series does not satisfy a requirement.

| Session | Errors | Warnings |
|---|---|---|
| Pre-implant | T1w | T2w |
| Post-implant | CT, iEEG recording, electrodes.tsv, channels.tsv | events.tsv |
| Post-surgery | T1w | T2w |

- A subject with fewer than four imaging, EEG, or table files gets these as warnings instead of errors
- Every required-file issue can be dismissed
- "Subject has no sessions" (error); "Session has only sidecar/metadata files" (warning)

Custom timepoints and Single session datasets have no required-file checks.

### 13.3 Metadata Validation

- Missing study name, authors, or institution prefix, and a missing defacing attestation when structural MRI is present, are errors. In the desktop application the Metadata step already prevents continuing without them.
- A dataset with no files is an error; a sparse dataset (only a few files) is a warning.

### 13.4 Cross-File and Cross-Session Consistency

- **Errors:** duplicate BIDS subject ID; under the Implant sessions preset, session dates out of chronological order (`preimplant` before `postimplant` before `postsurgery`), checked only when dates were auto-filled
- **Warnings:** the same filename appears in more than one session; an iEEG recording in a session with no `electrodes.tsv`
- **Information:** a subject with only a single session

### 13.5 PET Sidecar Completeness

A warning, which can be dismissed, when an exported PET image has no JSON sidecar, when its sidecar lacks any of the required PET fields (Section 6.1.7), or when a file set to PET has no PET details. It never blocks export (Section 6.1.7).

### 13.6 PHI Scanning

File and folder names, the string fields of JSON sidecars, and the cells of exported TSV tables are scanned as described in Section 11.3. PHI pattern matches that indicate direct identifiers are errors that cannot be dismissed; the remaining patterns and keywords are warnings.

### 13.7 Blocking and Dismissal

In the desktop application, any error that has not been dismissed blocks "Continue to Export", and the button reads "Fix N Errors to Continue". Most errors cannot be dismissed; the Implant required-file errors can. Warnings never block export but should be reviewed. Dismissals are cleared when checks are re-run, and dismissing an issue is not recorded in the audit log.

In the command-line interface, warnings do not stop the export and are listed afterwards; errors are handled as in Section 13.9.

### 13.8 iEEG-Specific Validation

The only iEEG-specific check is the warning for an iEEG recording in a session with no `electrodes.tsv` (Section 13.4), plus the post-implant required files under the Implant preset (Section 13.2). The tool does not check recording duration (the 48-hour minimum is a site rule), Persyst `.dat`/`.lay` pairing, or channel names against `electrodes.tsv`; these remain site responsibilities (Section 6.2.2).

### 13.9 Held-Back Subjects (Command-Line Interface Only)

The command-line interface holds back individual subjects while the rest of the dataset proceeds. A subject with one or more errors specific to that subject (most commonly a file with no session assigned, typically because the subject has fewer visit folders than the study defines) is held back, and the remaining subjects are exported. Errors not tied to a subject, such as missing metadata or attestation, PHI errors, or an empty dataset, block the whole export and the command exits with code 1.

The desktop application does not hold back subjects: every undismissed error must be resolved in the mapping table (or, where allowed, dismissed) before any export proceeds.

### 13.10 Informational Notes

NeuroGate's validation reports the following as informational, because the tool has already applied automatic handling or the situation is often expected:

**Same series present twice.** The tool identified two copies of the same acquisition in the same folder and exported one copy. See Section 12.5.

**Special characters in a file name.** The original name contains characters BIDS does not allow; the exported file is renamed to its BIDS name regardless.

**Single session only.** A subject has data in only one session. This is expected for subjects who have not completed every visit (Section 7).

The tool does not issue a validation message when it routes scanner-computed derivatives to `derivatives/scanner/`; the routing is shown in each file's detection reasons in the mapping table (Section 9).

### 13.11 What the Tool Does NOT Check or Enforce

- Per-modality required JSON sidecar fields (other than PET, which is a warning)
- Channel names in `channels.tsv` against `electrodes.tsv`
- Image dimensions in validation (the NIfTI header is read during detection, and a name that contradicts the dimensions gets a warning in the mapping table, but validation does not check them), or image quality (blurry images export successfully; image quality is a site QC concern)
- iEEG minimum recording duration (the 48-hour site rule, Section 6.2.2)
- Persyst `.dat`/`.lay` pairing
- `sessions.tsv` against the session folders
- Scanner or site consistency across a subject's sessions
- Clinical accuracy of metadata content
- IRB documentation or consent status
- Data use agreements
- Correctness of files under `derivatives/` folders other than `derivatives/scanner/`

---

## 14. Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | April 2026 | Brandon Bach | Initial release covering the Implant sessions preset, five modalities (T1w, T2w, FLAIR, CT, iEEG), and the six-step tool workflow |
| 2.0 | May 2026 | Brandon Bach | Added DWI, MR angiography, ASL perfusion, functional MRI, and field maps as first-class modalities; added JSON sidecar de-identification and EDF header cleaning to Section 11 |
| 2.5 | July 2026 | Brandon Bach | Added the Custom timepoints preset (Section 8) for longitudinal studies not organized around an implant procedure; expanded the tool workflow overview |
| 2.9 | August 1, 2026 | Brandon Bach | Clarified that upload to a data infrastructure is out of scope; refined the traceability matrix |
| 3.0 | August 31, 2026 | Brandon Bach | Substantive rewrite. Added proton-density weighted (PDw) and T2*-weighted (T2starw) as first-class modalities with their own required-fields tables (Section 6.1.1). Documented the `part-mag` / `part-phase` entities for magnitude/phase pairs (Sections 5.3.2, 6.1.1). Documented the `rec-moco` entity for motion-corrected reconstructions of functional runs (Sections 5.3.3, 6.1.3). Documented the `sbref` suffix for multiband single-band reference volumes (Sections 5.3.4, 6.1.2, 6.1.3). Added the `derivatives/scanner/` folder as a first-class part of the dataset structure (Sections 5.1, 9). Added the `desc-` entity for derivative-map identification (Sections 5.3, 9.3). Expanded the diffusion section with gradient-table pairing rules (Section 6.1.2). Expanded the field-map section with per-series run assignment and dcm2niix collision-suffix handling (Section 6.1.5). Expanded the Custom timepoints section with recognized visit-folder conventions and nested-folder handling (Sections 8.2, 8.5). Added a duplicate-series handling section (Section 12.5). Expanded the validation pipeline to cover held-back subjects, informational notes, and derivatives folder structural checks (Section 13). |
| 3.1 | September 30, 2026 | Brandon Bach | Accuracy revision: every statement about NeuroGate now matches the verified capability inventory, and site obligations are separated from tool behavior. Added PET (Section 6.1.7): `pet/` folder, `_pet` suffix, `trc-` and `rec-` rules, attenuation-CT exclusion, the BIDS-required PET sidecar fields, PET2BIDS (`pypet2bids`, `dcm2niix4pet`), non-blocking PET warnings, ECAT conversion, and no blood-data support; added PET to modality lists and trees. Added the Single session preset and the "sessions" timepoint unit (Sections 5.4, 8.1). Section 5.1 now shows the real export layout (`bids_output/`, participant_id-only `participants.tsv`, per-subject `sessions.tsv`, audit log) and states that `participants.json`, `README`, and `CHANGES` are not generated and are added by the site (Sections 10.2, 10.6, 10.7). Documented the entity order and the fixed `task-rest` / `task-monitor` labels, and corrected the `rec-moco`, `sbref`, `part-`, and derivative naming examples (run numbering is per group). Post-surgery T1w is now required (error) and T2w recommended under the Implant preset (Section 6.3). Rewrote de-identification (Section 11) with the exact EDF and sidecar field lists, `sessions.tsv` `acq_time` shifting, and the date shift not being recorded; removed the claims that NWB headers are de-identified and that the shift is in the audit log. Rewrote PHI scanning and validation (Sections 11.3, 13) to the actual checks and severities; removed the claimed channels/electrodes cross-check, 48-hour iEEG minimum check (the 48-hour minimum is kept as a site rule the tool does not check, Section 6.2.2), Persyst pair check, NIfTI sanity checks, per-modality sidecar field checks, bids-validator run, and GUI held-back subjects (held-back subjects are CLI-only). Section 8 now describes the custom-timepoint detection layers (exact labels, number-and-unit folder names, date clustering, folder clustering, neighbor propagation) in place of the "literal only" claim. Corrected install-script paths to `tools/install_mac.sh`, `tools/install_linux.sh`, `tools/install_windows.ps1` and changed the dcm2niix example to a `%p_%s` template. Documented that electrode, channel, and event tables are placed beside their recording (`eeg/` for scalp EEG, `ieeg/` for iEEG, matched by source folder then subject and session, with `ieeg/` as the fallback; Sections 6.1.6, 10.4, 10.5), that `IntendedFor` and `_coordsystem.json` are not produced, that reverse-polarity EPI field maps are not given `_epi` names, and that BrainVision is not supported. Removed the future derivative-labels statement and added `desc-COLFA` / `desc-EXADC`. Section 5 now states that the export layout is NeuroGate's own BIDS-based structure: names, entities, datatype folders and sidecars follow BIDS conventions, but the root layout (`primary/`, `derivatives/scanner/`) intentionally differs from the official BIDS specification, so the official BIDS validator does not apply to it as a whole; conformance means following this SOP's structure and passing NeuroGate's own validation with no errors (Section 13). Removed statements that a dataset will not pass, or that sites run, the official BIDS validator, and replaced "BIDS-compliant" with "BIDS-based" wording. PET sidecar fields are required by this SOP (Section 6.1.7); PET is exempt from defacing. Demographics are optional and added by the site after export; `participants.json`, `README` and `CHANGES` are written by the site if a recipient needs them (Sections 5.1, 10.2, 10.6, 10.7). The date shift is deliberately not recorded, so true dates cannot be recovered (Section 11.1). The audit log stays at the site and is never shared, and sites record the operator's identity themselves (Section 11.4). Persyst `.dat`/`.lay` remain accepted (Section 6.2.2). Section 4.2 references the Pre-Processing page's dcm2niix, PET2BIDS (`dcm2niix4pet`) and pydeface commands and adds `ecatpet2bids`. |
| 3.2 | October 2, 2026 | Brandon Bach | Updated for NeuroGate 1.2.0. Section 5.1: the export folder holds a full audit log and a shareable copy (CLI: `audit_log.json` and `audit_log_shareable.json`); participants.tsv lists subjects with exported data. Section 5.3: a leftover `_dup-N` collision is now a blocking validation error. Section 6.2: Persyst `.lay` files are de-identified and their `File=` line points at the renamed `.dat`; EDF+/BDF+ annotations are de-identified; NWB and the Persyst `.dat` remain a site step. Section 7: the CLI's sessions.tsv no longer lists sessions with no data. Section 10: participants.tsv and sessions.tsv list only subjects and sessions with exported data (desktop and CLI); electrodes and channels tables are PHI-scanned but exported unchanged; JSON pairing is by base name in the same folder. Section 11.1: date shift covers the `.lay` test date; added EDF+/BDF+ annotation redaction (same byte length, event text and timestamps kept), signal-header transducer and prefiltering checks, and Persyst `.lay` handling; sidecar fields are handled at any depth, and a sidecar that is not a JSON object blocks validation and is not exported (replacing the top-level-only and copy-unchanged limits). Section 11.2: manual de-identification now covers NWB, the Persyst `.dat`, NIfTI header text and TSV tables, with review of annotations and `.lay` comments. Section 11.3: added the TSV table content scan. Section 11.4: described the shareable audit log. Section 12: updated the automation list, workflow table and guessed-file note. Section 13.1: added the duplicate-name and invalid-sidecar errors and the per-subject guessed-files warning. Section 13.2: only exported files satisfy required-file checks. Section 13.6: table contents are scanned. Header updates the parent to GOV-001 v2.2 and the related document to SOP-GUI-001 v3.1. |
| 3.3 | October 2, 2026 | Brandon Bach | Updated for NeuroGate 1.3.0. Section 5.4: the structure can be changed later with Change structure (files cleared, change audit-logged). Section 6.1.7: with no sidecar, PET framing comes from the NIfTI volume count. Sections 11.1 to 11.3: NIfTI header text (`descrip`, `aux_file`) is PHI-scanned in a fourth scan, and exported unchanged. Section 13: a 4D NIfTI is not defaulted to T1w; the not-checked list now reflects that headers are read during detection. |

---

**Source documents:**

- `docs/capabilities.md` (NeuroGate capability inventory, updated for release 1.3.0)
- `public/docs/gov-001.md` (GOV-001, currently v2.2)
- `public/docs/sop-gui.md` (SOP-GUI-001, currently v3.1)
- BIDS Specification: https://bids-specification.readthedocs.io
- iEEG-BIDS Extension: https://bids-specification.readthedocs.io/en/stable/modality-specific-files/intracranial-electroencephalography.html
- PET-BIDS: https://bids-specification.readthedocs.io/en/stable/modality-specific-files/positron-emission-tomography.html
- PET2BIDS: https://github.com/openneuropet/PET2BIDS
