# Standard Operating Procedure: BIDS Data Structure for Multi-Site Neural Data Sharing

| Field | Value |
|---|---|
| **Document ID** | SOP-BIDS-001 |
| **Version** | 3.0 |
| **Effective Date** | 2026-08-31 |
| **Author** | Brandon Bach |
| **Advisor** | Nishant Sinha |
| **Status** | Draft, Pending Advisor Review |
| **Parent Document** | GOV-001 Regulatory and Governance Framework v1.15 |
| **Related Documents** | SOP-GUI-001 v2.0 |

---

## 1. Purpose

This Standard Operating Procedure defines a standardized data structure for organizing neural data (imaging and electrophysiology) for cross-site sharing. Adopting a common BIDS-compliant structure keeps a site's data consistent and interoperable, making it straightforward to share with collaborators while meeting data-sharing compliance standards.

This version updates the specification to reflect the expanded modality coverage and folder structure introduced by NeuroGate v2 (August 2026), including proton-density weighted imaging, T2*-weighted imaging and susceptibility-weighted imaging, scanner-computed derivative maps, and additional BIDS entities for repeated acquisitions, magnitude/phase pairs, motion-corrected reconstructions, and single-band references. All output from the tool follows the structure documented here.

---

## 2. Governance Traceability

This SOP implements specific requirements from the Regulatory and Governance Framework (GOV-001). Every procedure in this document traces back to the framework:

| SOP Section | GOV-001 Section | Requirement |
|---|---|---|
| 4.1 (Subject ID format) | 2.3 (HIPAA/PHI Protection) | Coded subject IDs with no PHI; key stored only at originating site |
| 5 (Dataset structure overview) | 3 (Data Standards by Modality) | BIDS-compliant organization for all supported modalities; `primary/` and `derivatives/scanner/` folder separation |
| 6 to 8 (Structure presets and session requirements) | 3 (Data Standards by Modality) | Session-based organization under either the Implant sessions or Custom timepoints preset |
| 9 (Derivatives folder) | 3 (Data Standards by Modality), 2.2 (ALCOA+ Accurate) | Scanner-computed derivatives kept out of the raw tree so downstream analysis does not mistake computed maps for acquired data |
| 10 (Metadata files) | 2.1, 2.2, 4 (FAIR, ALCOA+, Metadata Completeness) | Complete, standardized metadata for findability, attributability, and reusability |
| 10.5 (Channels cross-validation) | 2.2 (ALCOA+ Accurate) | Channel names must match electrodes.tsv for data integrity |
| 11 (De-identification and defacing) | 2.3 (HIPAA/PHI) | DICOM stripping, facial defacing, EDF/JSON sidecar header de-identification, filename PHI checks |
| 12 (GUI tool) | 2.2 (ALCOA+ Legible, Consistent) | Automated compliance reduces human error across sites |
| 13 (Validation pipeline) | 2.2 (ALCOA+ Accurate), 6.1 (Pre-Upload Checklist) | Validation must complete with no blocking errors before export |

---

## 3. Scope

This SOP applies to any site organizing neural data for multi-site sharing. It covers:

- Required folder hierarchy and naming conventions for both raw acquisitions and scanner-computed derivative maps
- File formats for each supported modality: T1-weighted MRI, T2-weighted MRI, FLAIR, proton-density weighted MRI, T2*-weighted MRI, MR angiography, functional MRI, perfusion / arterial spin labeling, field maps, computed tomography, diffusion MRI, scalp EEG, and intracranial EEG
- Metadata requirements including JSON sidecars, participant tables, session tables, and electrode and channel tables
- De-identification and defacing requirements
- Session-based organization under either the Implant sessions preset (pre-implant, post-implant, post-surgery) or a Custom timepoints preset for longitudinal studies
- BIDS entities the tool assigns automatically: `run-`, `part-`, `rec-`, `sbref`, and `desc-`

Uploading the exported dataset to a data infrastructure is out of scope. Each site follows its own upload procedure for the platform it has chosen.

---

## 4. Prerequisites

Before organizing data using this SOP, ensure the following are in place.

### 4.1 Subject ID Format

All subjects are identified using a BIDS-compliant ID with the format:

`sub-{INSTITUTION_PREFIX}{NNN}`

Where `{INSTITUTION_PREFIX}` is 2 to 6 uppercase letters assigned to the site, and `{NNN}` is a three-digit zero-padded number scoped per institution. Examples: `sub-CHOP016`, `sub-PENN042`, `sub-HUP003`.

Subject IDs must contain only alphanumeric characters. No spaces, hyphens, underscores, or special characters are permitted after the `sub-` prefix. The key linking subject IDs to real patient identifiers must be stored only at the originating institution in a secure, access-controlled system per GOV-001 Section 2.3. It is never uploaded to any data infrastructure or shared externally.

### 4.2 Tooling

The following tools support the workflow. Install scripts for the two pre-processing tools are packaged in the NeuroGate repository.

| Tool | Purpose | Required |
|---|---|---|
| dcm2niix | Convert DICOM files to NIfTI format with JSON sidecar generation | Yes, for any DICOM source data |
| pydeface (or equivalent) | Deface anatomical MRI images | Yes, for any T1w, T2w, FLAIR, PDw, or T2starw images intended for sharing |
| NeuroGate desktop application | Organize files into BIDS layout, validate, and export | Yes |
| Text editor | Manual edits to JSON sidecars or TSV files when needed | Recommended |

Install scripts for dcm2niix and pydeface are in the repository under `tools/dcm2niix/` and `tools/pydeface/`.

### 4.3 Institution Assignments

Before organizing a batch of subjects, confirm the following with the project lead or site coordinator:

- Institution prefix (2 to 6 uppercase letters)
- Starting subject number for this batch, to avoid ID collisions with prior batches or other collaborators at the same institution

---

## 5. Dataset Structure Overview

Every dataset organized under this SOP uses a two-folder top-level layout that separates raw acquisitions from scanner-computed derivative maps. This separation is required by BIDS and is enforced by the NeuroGate tool.

### 5.1 Root Directory Structure

The top-level dataset directory contains the following:

```
dataset_root/
    dataset_description.json    Dataset metadata (auto-generated by the tool)
    participants.json           Participant metadata schema
    participants.tsv            Participant demographic data
    README                      Dataset overview, contact, collection protocols
    CHANGES                     Version history of dataset changes per BIDS format
    primary/                    Raw acquisitions
    derivatives/                Processed data outputs
        scanner/                Scanner-computed maps auto-populated by the tool
```

Two categories of data live under the root:

**`primary/`** contains the raw, acquired data. This is the folder that downstream analysis pipelines read as their input. Subject directories, session folders, and per-modality subfolders live under `primary/`, and this is what is documented in detail in Sections 6, 7, and 8.

**`derivatives/`** contains processed outputs. Under `derivatives/`, the tool creates one subfolder for each pipeline that produced derivatives. The tool itself only ever writes to `derivatives/scanner/`, which contains maps computed by the scanner console (ADC maps, FA maps, TRACEW maps, minimum-intensity projections). Site-specific analysis pipelines populate their own subfolders under `derivatives/` outside the tool.

Section 9 documents the `derivatives/scanner/` folder in detail. Sites do not author or edit this folder manually. It is populated automatically by the tool when the source data contains scanner-derived maps and is empty otherwise.

### 5.2 Subject Directory Structure

Under `primary/`, each subject has a directory named `sub-<ID>/` containing session folders. The set of session folders depends on the structure preset chosen for the dataset (see Section 5.4).

Under the Implant sessions preset, each subject has three session folders corresponding to phases of a surgical evaluation:

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
            eeg/                      Scalp EEG
        ses-postimplant/              Intracranial monitoring
            ct/                       CT with electrodes
            ieeg/                     Intracranial EEG
        ses-postsurgery/              Post-resection
            anat/                     Post-surgery MRI
```

Under the Custom timepoints preset, each subject has session folders labeled by the timepoints defined for the dataset. See Section 8 for details.

### 5.3 BIDS Entities Assigned by the Tool

The tool automatically assigns the following BIDS entities to keep filenames unique and to represent the acquisition relationships correctly. Each is described in the section noted; the summary here shows the full list in one place.

| Entity | Purpose | Section |
|---|---|---|
| `run-<N>` | Distinguishes multiple acquisitions of the same modality in a single session | 5.3.1 |
| `part-mag` / `part-phase` | Distinguishes magnitude and phase images of a single acquisition | 5.3.2 |
| `rec-moco` | Marks the motion-corrected reconstruction of a functional run | 5.3.3 |
| `sbref` (suffix) | Single-band reference volume from a multiband acquisition | 5.3.4 |
| `desc-<label>` | Distinguishes derivative maps in `derivatives/scanner/` | 9.3 |
| `task-<label>` | Task name for functional MRI and electrophysiology recordings | Per modality section |

#### 5.3.1 Run Entity for Repeated Acquisitions

When a session contains more than one acquisition of the same modality, each is given a `run-` entity to keep filenames unique. For example, a subject with two T2w scans in `ses-preimplant` produces:

```
sub-<ID>_ses-preimplant_run-1_T2w.nii.gz
sub-<ID>_ses-preimplant_run-2_T2w.nii.gz
```

A scan's companion files (its JSON sidecar, and the `.bval` and `.bvec` files for diffusion) share the same run number as the imaging file. The single-file examples throughout this document omit the `run-` entity for readability; it is added only when a modality repeats within a session.

#### 5.3.2 Part Entity for Magnitude and Phase Pairs

Susceptibility-weighted imaging (SWI) and T2*-weighted gradient-echo sequences produce a magnitude image and a phase image from a single acquisition. Both are given the same run number and are distinguished by the `part-mag` and `part-phase` entities. For example:

```
sub-<ID>_ses-preimplant_run-1_part-mag_T2starw.nii.gz
sub-<ID>_ses-preimplant_run-1_part-phase_T2starw.nii.gz
```

Using the same run number indicates the two files come from one acquisition rather than two separate acquisitions of the same modality. This is required by BIDS to correctly represent complex-valued imaging data.

The `part-` entity is applied only when both a magnitude and a phase image are present for the acquisition. A magnitude-only or phase-only file receives no `part-` entity and is treated as a standalone acquisition.

#### 5.3.3 Rec Entity for Motion-Corrected Reconstructions

When a scanner produces both a raw functional run and a motion-corrected reconstruction of it (Siemens `MoCoSeries` and similar), both files are given the same run number. The reconstructed version is marked with `rec-moco`. For example:

```
sub-<ID>_ses-preimplant_task-rest_run-1_bold.nii.gz              Raw acquisition
sub-<ID>_ses-preimplant_task-rest_run-1_rec-moco_bold.nii.gz     Motion-corrected reconstruction
```

Sharing the run number correctly represents that both files come from the same underlying acquisition, distinguished only by the on-scanner reconstruction applied to one.

#### 5.3.4 Single-Band Reference Volumes

Multiband diffusion and functional sequences acquire a single-band reference volume alongside the main acquisition. This reference is exported with the `sbref` suffix and the same run number as the main acquisition:

```
sub-<ID>_ses-preimplant_run-1_dwi.nii.gz
sub-<ID>_ses-preimplant_run-1_sbref.nii.gz
```

The reference is used by downstream analysis pipelines for distortion correction and registration. It is a small file (typically a single volume) and is always exported when present in the source data.

### 5.4 Two Structure Presets

Every dataset is organized under one of two session-structure presets. The choice is made at the start of the NeuroGate workflow (SOP-GUI-001 Section 6) and determines which session labels exist for the dataset.

**Implant sessions** is NeuroGate's original built-in preset. It defines three sessions: `ses-preimplant`, `ses-postimplant`, and `ses-postsurgery`, corresponding to phases of a surgical evaluation and treatment timeline. This is not a universal BIDS standard. BIDS itself does not prescribe session names. It is the structure NeuroGate was first built around, and it applies to any dataset that follows the same three-phase clinical structure. Section 6 documents the per-session and per-modality file requirements for this preset in detail.

**Custom timepoints** is for any longitudinal study not organized around an implant procedure. The site defines its own timepoints from a number-and-unit picker in the tool. For example, defining 0 months, 2 months, and 6 months generates session labels `ses-0mo`, `ses-2mo`, and `ses-6mo`. There is no free-text entry, so a site name or PI name can never end up in a session label. Section 8 documents this preset's requirements.

A dataset uses exactly one preset. The two are not combined within a single dataset. To change presets after files have been imported, the workflow must be restarted.

---

## 6. Implant Sessions Preset: Session-by-Session Requirements

This section applies only to datasets using the Implant sessions preset (Section 5.4). For Custom timepoints datasets, see Section 8.

### 6.1 Session 1: Pre-Implant (ses-preimplant)

**Purpose:** Baseline structural and functional imaging acquired before electrode implantation for surgical planning.

#### 6.1.1 Anatomical MRI and MR Angiography (anat/)

The `anat/` folder holds all structural imaging and MR angiography acquired in the pre-implant session. Required and recommended files:

| File | Format | Required |
|---|---|---|
| `sub-<ID>_ses-preimplant_T1w.nii.gz` | NIfTI gzipped | Yes |
| `sub-<ID>_ses-preimplant_T1w.json` | JSON sidecar | Yes |
| `sub-<ID>_ses-preimplant_T2w.nii.gz` | NIfTI gzipped | Recommended |
| `sub-<ID>_ses-preimplant_T2w.json` | JSON sidecar | Recommended |
| `sub-<ID>_ses-preimplant_FLAIR.nii.gz` | NIfTI gzipped | If available |
| `sub-<ID>_ses-preimplant_FLAIR.json` | JSON sidecar | If available |
| `sub-<ID>_ses-preimplant_PDw.nii.gz` | NIfTI gzipped | If available |
| `sub-<ID>_ses-preimplant_PDw.json` | JSON sidecar | If available |
| `sub-<ID>_ses-preimplant_T2starw.nii.gz` | NIfTI gzipped | If available |
| `sub-<ID>_ses-preimplant_T2starw.json` | JSON sidecar | If available |
| `sub-<ID>_ses-preimplant_angio.nii.gz` | NIfTI gzipped | If available |
| `sub-<ID>_ses-preimplant_angio.json` | JSON sidecar | If available |

**Proton-density weighted imaging (PDw).** The `_PDw` suffix is used for proton-density weighted MRI, typically acquired as part of a turbo spin-echo sequence. Common source names the tool recognizes automatically include `pd_tse_tra`, `PD_TSE`, and `pd_weighted`. Required JSON sidecar fields per GOV-001 Section 3: `Manufacturer`, `MagneticFieldStrength`, `RepetitionTime`, `EchoTime`, `SliceThickness`.

**T2-star weighted imaging (T2starw).** The `_T2starw` suffix is used for T2*-weighted gradient-echo MRI and for susceptibility-weighted imaging (SWI). This modality is separate from T2w in BIDS because the contrast mechanism differs. Common source names the tool recognizes automatically include `Sag_SWI_3D`, `3D_T2star_GRE`, `SWI_Images`, `SWAN` (GE), and `SWIp` (Philips). Required JSON sidecar fields per GOV-001 Section 3: `Manufacturer`, `MagneticFieldStrength`, `RepetitionTime`, `EchoTime`, `FlipAngle`.

When an SWI or T2*-weighted acquisition produces both a magnitude and a phase image, both files share a run number and are distinguished by the `part-mag` and `part-phase` entities as documented in Section 5.3.2. For example:

```
sub-<ID>_ses-preimplant_run-1_part-mag_T2starw.nii.gz
sub-<ID>_ses-preimplant_run-1_part-phase_T2starw.nii.gz
```

A susceptibility-weighted combined image (the sequence's primary product, distinct from raw magnitude and phase) is exported as a standalone `_T2starw` file with no `part-` entity. A minimum-intensity projection (Siemens `mIP_Images`) computed by the scanner console is a derivative rather than a raw acquisition and is routed to `derivatives/scanner/` as documented in Section 9.

**Required JSON sidecar fields per modality** (per GOV-001 Section 3):

| Modality | Required JSON Fields |
|---|---|
| T1w | Manufacturer, MagneticFieldStrength, RepetitionTime, EchoTime, FlipAngle, SliceThickness |
| T2w | Manufacturer, MagneticFieldStrength, RepetitionTime, EchoTime, FlipAngle, SliceThickness |
| FLAIR | Manufacturer, MagneticFieldStrength, RepetitionTime, EchoTime, FlipAngle, SliceThickness, InversionTime |
| PDw | Manufacturer, MagneticFieldStrength, RepetitionTime, EchoTime, SliceThickness |
| T2starw | Manufacturer, MagneticFieldStrength, RepetitionTime, EchoTime, FlipAngle |
| angio | Manufacturer, MagneticFieldStrength, RepetitionTime, EchoTime, FlipAngle |

**DICOM to NIfTI Conversion:**

Use the NeuroGate automation script (`convert_dicom_auto.py`, available on the Pre-Processing page of the site) to detect the scanner type automatically and apply the correct dcm2niix flags. For manual conversion:

```bash
# Recommended: automation script (handles 3T, 7T, fMRI, and all manufacturers)
python convert_dicom_auto.py /path/to/dicom/T1/ /output/anat/ \
    --subject PENN001 --session preimplant

# Manual fallback (3T structural only)
dcm2niix -z y -b y -ba y -f sub-<ID>_ses-preimplant_T1w -o ./anat/ /path/to/dicom/T1/
```

The `-z y` flag compresses output to `.nii.gz`. The JSON sidecar is automatically generated. If conversion is run without `-z y`, the resulting uncompressed `.nii` files are still accepted; the NeuroGate tool compresses them to `.nii.gz` automatically on export.

Time-of-flight (TOF) MR angiography uses the `_angio` suffix and is placed in `anat/` alongside the structural scans, per the BIDS specification.

#### 6.1.2 Diffusion MRI (dwi/)

Diffusion MRI acquisitions are placed in `dwi/`. Raw diffusion acquisitions live in `primary/`; scanner-computed derivative maps (ADC, FA, TRACEW) live in `derivatives/scanner/dwi/` (see Section 9).

Files that accompany each raw diffusion acquisition:

| File | Format | Description |
|---|---|---|
| `sub-<ID>_ses-preimplant_dwi.nii.gz` | NIfTI gzipped | 4D DWI image |
| `sub-<ID>_ses-preimplant_dwi.json` | JSON | Acquisition metadata |
| `sub-<ID>_ses-preimplant_dwi.bval` | Text | b-values, one per volume |
| `sub-<ID>_ses-preimplant_dwi.bvec` | Text | b-vectors, one column per volume |

**Required JSON sidecar fields for DWI** (per GOV-001 Section 3): `Manufacturer`, `MagneticFieldStrength`, `RepetitionTime`, `EchoTime`, `PhaseEncodingDirection`.

**Gradient table pairing.** Every raw diffusion image requires an accompanying `.bval` and `.bvec` gradient table. The tool pairs gradient tables to images by matching the b-value and phase-encoding direction of the acquisition, not by filename. Both notations are handled: `b1k` in a filename is recognized as equivalent to `b1000`, and `PErev`, `revPE`, and `_rev` are all recognized as markers for a reverse-phase-encoded acquisition.

Pairing is deliberately conservative. When a session contains two diffusion acquisitions that share the same b-value and phase-encoding direction (for example, `ep2d_diff_b1000` and `ep2d_diff_b1000_TW`), a bare gradient table named `DTI_b1000` cannot be unambiguously matched to either one. In that case the gradient table is not paired to any image and is not exported to the raw tree. A validation warning names the unmatched table so it can be resolved by renaming the source file to match its intended acquisition. This behavior is intentional. Attaching a wrong gradient table to a diffusion image produces plausible-looking tractography output from incorrect gradient directions, which is very difficult to catch downstream.

**Multiband single-band reference.** Multiband diffusion sequences (CMRR and others) acquire a single-band reference volume alongside the main acquisition. This reference is exported with the `sbref` suffix and shares the run number of the main diffusion acquisition (see Section 5.3.4).

**Siemens `ep2d_diff` and CMRR series.** The tool recognizes Siemens' stock diffusion sequence name (`ep2d_diff`, including all suffix variants such as `ep2d_diff_sms3_b1000_te94`) and CMRR diffusion sequences identified by a b-value token in the filename (`CMRR_b1k_64`, `CMRR_b3k_64`). Sequences that carry a b-value but are not accompanied by a diffusion-specific keyword are still classified as diffusion based on the b-value.

**Scanner-computed derivative maps.** Diffusion sequences frequently produce derivative maps (ADC, FA, TRACEW) computed on the scanner console alongside the raw acquisition. These are not raw diffusion data and must not be placed in raw `dwi/`. The tool distinguishes them by reading the DICOM `ImageType` field in the JSON sidecar: a value including `DERIVED` and a derivative label (`ADC`, `FA`, `TRACEW`) routes the file to `derivatives/scanner/dwi/` with a `desc-` entity naming the derivative type. See Section 9 for the derivatives folder specification.

#### 6.1.3 Functional MRI (func/)

Functional MRI acquisitions are placed in `func/`. Required files for each functional acquisition (if available):

| File | Format | Description |
|---|---|---|
| `sub-<ID>_ses-preimplant_task-<label>_bold.nii.gz` | NIfTI gzipped | 4D BOLD functional image |
| `sub-<ID>_ses-preimplant_task-<label>_bold.json` | JSON | Acquisition metadata |
| `sub-<ID>_ses-preimplant_task-<label>_events.tsv` | TSV | Event log for task-based fMRI |

**Required JSON sidecar fields for fMRI** (per GOV-001 Section 3): `Manufacturer`, `MagneticFieldStrength`, `RepetitionTime`, `EchoTime`, `TaskName`, `SliceTiming`.

**Task labels.** The `task-<label>` entity is required for all functional MRI. Use `task-rest` for resting-state fMRI. Task-based fMRI uses site-defined task labels. Task labels are alphanumeric with no spaces or special characters.

**Motion-corrected reconstructions.** When a scanner produces both a raw functional run and a motion-corrected reconstruction of the same acquisition (Siemens `MoCoSeries` and similar), both files share the run number and the reconstructed version is marked with the `rec-moco` entity (see Section 5.3.3). Both files are placed in `func/` under the same task label. For example:

```
func/
    sub-<ID>_ses-preimplant_task-rest_run-1_bold.nii.gz              Raw acquisition
    sub-<ID>_ses-preimplant_task-rest_run-1_bold.json
    sub-<ID>_ses-preimplant_task-rest_run-1_rec-moco_bold.nii.gz     Motion-corrected reconstruction
    sub-<ID>_ses-preimplant_task-rest_run-1_rec-moco_bold.json
```

**Multiband functional acquisitions.** Multiband fMRI sequences produce a single-band reference volume alongside the main acquisition, exported with the `sbref` suffix and the same run number as the main functional run (see Section 5.3.4).

#### 6.1.4 Perfusion / Arterial Spin Labeling (perf/)

Required files for each perfusion acquisition (if available):

| File | Format | Description |
|---|---|---|
| `sub-<ID>_ses-preimplant_asl.nii.gz` | NIfTI gzipped | Arterial spin labeling perfusion image |
| `sub-<ID>_ses-preimplant_asl.json` | JSON | Acquisition metadata |

**Required JSON sidecar fields for ASL** (per GOV-001 Section 3): `Manufacturer`, `MagneticFieldStrength`, `RepetitionTime`, `EchoTime`, `ArterialSpinLabelingType`, `PostLabelingDelay`.

#### 6.1.5 Field Maps (fmap/)

Field maps correct geometric distortion in echo-planar imaging (EPI) acquisitions such as diffusion and functional MRI. The tool supports two types of field map data.

**Gradient-echo field maps.** A gradient-echo field map produces two magnitude images (at two echo times) and one phase-difference image. Each is named with its standard BIDS suffix. `fmap` is the folder name, not a file suffix.

Required files (if available):

| File | Format | Description |
|---|---|---|
| `sub-<ID>_ses-preimplant_magnitude1.nii.gz` | NIfTI gzipped | First-echo magnitude image |
| `sub-<ID>_ses-preimplant_magnitude2.nii.gz` | NIfTI gzipped | Second-echo magnitude image |
| `sub-<ID>_ses-preimplant_phasediff.nii.gz` | NIfTI gzipped | Phase-difference image |
| `sub-<ID>_ses-preimplant_phasediff.json` | JSON | Acquisition metadata |

**Required JSON sidecar fields for gradient-echo field maps** (per GOV-001 Section 3): `Manufacturer`, `MagneticFieldStrength`, `EchoTime1`, `EchoTime2`, `IntendedFor`. These accompany the `phasediff` image.

The tool reads the dcm2niix echo and phase markers in filenames (`_e1`, `_e2`, `_ph`) and assigns the `magnitude1`, `magnitude2`, and `phasediff` suffixes automatically. When a session contains multiple gradient-echo field-map series (for example, one for diffusion and one for functional MRI, or two acquired at different resolutions), each series receives its own `run-` number with a complete magnitude1, magnitude2, and phasediff triple. For example:

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

The `IntendedFor` field in each `phasediff.json` should list the paths of the EPI images the field map is intended to correct. This is standard BIDS behavior and is required for correct downstream distortion correction.

**dcm2niix collision-suffix variants.** When dcm2niix encounters two acquisitions in the same DICOM series that produce output files with the same base name, it appends a trailing letter (`a`, `b`, and so on) to disambiguate them. A file named `gre_field_mapping_e1a` is not a variant echo of `_e1`. It is a second distinct field-map series whose files happen to share the base name pattern. The tool treats each collision-suffix group as its own series and assigns it its own `run-` number.

**Reverse-polarity EPI field maps.** For sites using reverse-polarity EPI field maps (`topup`, `pe_polar`, `se_pe_polar`), the pair of EPI images with opposite phase-encoding polarities are placed in `fmap/` with the standard BIDS naming for that method. Contact the project lead for site-specific naming guidance if reverse-polarity field maps are in use.

#### 6.1.6 Scalp EEG (eeg/)

Required files for each scalp EEG recording (if available):

| File | Format | Description |
|---|---|---|
| `sub-<ID>_ses-preimplant_task-<label>_eeg.edf` | EDF or BDF | EEG recording |
| `sub-<ID>_ses-preimplant_task-<label>_eeg.json` | JSON | EEG metadata |
| `sub-<ID>_ses-preimplant_task-<label>_channels.tsv` | TSV | Channel descriptions |

**Required JSON sidecar fields for scalp EEG** (per GOV-001 Section 3): `SamplingFrequency`, `EEGReference`, `PowerLineFrequency`.

**De-identification note:** Patient names must be removed from EDF and BDF recording headers before submission. The NeuroGate tool blanks the patient name, ID, birthdate, and sex fields in EDF headers automatically on export and shifts the recording start date by a random per-subject offset. See Section 11 for details.

### 6.2 Session 2: Post-Implant (ses-postimplant)

**Purpose:** CT imaging for electrode localization and intracranial EEG recordings during seizure monitoring.

#### 6.2.1 CT (ct/)

Required files:

| File | Format | Required |
|---|---|---|
| `sub-<ID>_ses-postimplant_ct.nii.gz` | NIfTI gzipped | Yes |
| `sub-<ID>_ses-postimplant_ct.json` | JSON sidecar | Yes |

**Required JSON sidecar fields for CT** (per GOV-001 Section 3): `Manufacturer`, `AcquisitionVoltage`, `SliceThickness`, `ConvolutionKernel`.

The post-implant CT must clearly show electrode positions for accurate localization. Confirm the full head is captured at sufficient resolution before continuing.

**De-identification note:** DICOM headers must be stripped during dcm2niix conversion. Verify no patient name, date of birth, or medical record number remains in the JSON sidecar after conversion.

#### 6.2.2 Intracranial EEG (ieeg/)

Required files:

| File | Format | Required |
|---|---|---|
| `sub-<ID>_ses-postimplant_task-<label>_ieeg.<ext>` | EDF, NWB, or Persyst (.dat + .lay) | Yes |
| `sub-<ID>_ses-postimplant_task-<label>_ieeg.json` | JSON | Yes |
| `sub-<ID>_ses-postimplant_task-<label>_channels.tsv` | TSV | Yes |
| `sub-<ID>_ses-postimplant_electrodes.tsv` | TSV | Yes |
| `sub-<ID>_ses-postimplant_task-<label>_events.tsv` | TSV | Recommended |

Accepted iEEG formats:

- `.edf` and `.bdf`: European Data Format
- `.nwb`: Neurodata Without Borders
- `.dat` and `.lay`: Persyst format. Both files are required as a pair. Neither is exportable without the other.

**Minimum recording requirement:** 48 hours of continuous iEEG recording is required per GOV-001 Section 3.

**Required JSON sidecar fields for iEEG** (per GOV-001 Section 3): `SamplingFrequency`, `iEEGReference`, `ElectrodeManufacturer`, `iEEGPlacementScheme`.

**De-identification note:** Patient names must be removed from EDF and NWB recording headers. The tool blanks and shifts these fields automatically on export as documented in Section 11. For Persyst files, verify no patient identifiers appear in the `.lay` header text.

**Cross-validation rule:** Every channel name listed in `channels.tsv` must have a corresponding entry in `electrodes.tsv` for the same subject and session. This ensures data integrity per ALCOA+ accuracy requirements (GOV-001 Section 2.2) and is enforced automatically by the tool during validation.

### 6.3 Session 3: Post-Surgery (ses-postsurgery)

**Purpose:** Post-resection imaging to document surgical outcome and resection cavity.

Required files (if available):

| File | Format | Required |
|---|---|---|
| `sub-<ID>_ses-postsurgery_T1w.nii.gz` | NIfTI gzipped | If available |
| `sub-<ID>_ses-postsurgery_T1w.json` | JSON sidecar | If available |
| `sub-<ID>_ses-postsurgery_FLAIR.nii.gz` | NIfTI gzipped | If available |
| `sub-<ID>_ses-postsurgery_FLAIR.json` | JSON sidecar | If available |

**Defacing note:** Post-surgery structural MRI files (T1w, FLAIR) must be defaced before submission. See Section 11.

---

## 7. Missing Sessions Under the Implant Sessions Preset

Under the Implant sessions preset, not every subject will have data in every session. A subject may have pre-implant imaging but not yet have progressed to intracranial monitoring, or may have declined post-surgery imaging. The tool handles these cases as follows.

When a subject has data for only some of the three implant sessions, the exported dataset includes only the session folders for which data is present. The subject's `sub-<ID>_sessions.tsv` file lists only the sessions actually acquired.

If a subject has no imaging data for the pre-implant session but has data for post-implant and post-surgery sessions, verify the acquisition records to confirm the pre-implant scan was truly not acquired rather than misclassified during import. The tool does not fabricate missing sessions.

---

## 8. Custom Timepoints Preset: File Requirements

This section applies only to datasets using the Custom timepoints preset (Section 5.4).

### 8.1 Session Labels

Session labels are generated by the tool from a number and a unit (days, weeks, months, or years). For example, defining timepoints at 0 months, 2 months, and 6 months produces the labels `ses-0mo`, `ses-2mo`, and `ses-6mo`. By convention, a timepoint numbered 0 (in any unit) represents the study baseline. Labels are sorted chronologically by elapsed time regardless of the order timepoints were entered. Duplicate labels within a single dataset are blocked by the tool.

### 8.2 Recognized Visit Folder Conventions

The tool recognizes the following conventions for visit folder names when they map to one of the timepoints defined for the dataset. Recognition is literal against the labels defined in Step 1 of the workflow.

| Convention | Examples |
|---|---|
| Number-and-unit | `2weeks`, `2wk`, `2 weeks`, `2_weeks`, `02weeks` |
| Unit-first | `week2`, `week_02`, `wk2`, `W2` |
| Word label | `baseline`, `followup`, `screening`, `endpoint` |
| Sequence label | `visit1`, `V1`, `TP1`, `timepoint2` |
| ISO date | `20180510`, `2018-05-10` |

Some conventions are intentionally not recognized as visit folders because they collide with other common uses:

- Single-letter session identifiers (`T0`, `T1`, `T2`) are not treated as visits, because these appear overwhelmingly as modality names in imaging data (T1w, T2w) and treating them as sessions would misclassify structural scans
- Single-letter subject identifiers (`S1`, `S2`) are not treated as visits, because these appear overwhelmingly as patient IDs
- Bare numeric folders (`01`, `02`) are not treated as visits, because these appear overwhelmingly as subject folders
- Unit conversions between different measures. A folder named `14days` is not recognized as `ses-2wk`, because a study may legitimately define both a 14-day and a 2-week visit as distinct timepoints.

### 8.3 No Fixed Per-Timepoint Modality Requirements

Unlike the Implant sessions preset (Section 6), Custom timepoints datasets have no required-file table per session. An arbitrary study's timepoints cannot be assumed to follow a clinical evaluation sequence, so the tool does not enforce that a given modality must appear at a particular timepoint. Any modality is permitted at any timepoint.

All other requirements in this SOP still apply:

- Correct BIDS naming and folder placement (using the same modality suffixes and folder names documented in Section 6)
- JSON sidecar completeness for whatever modalities are present, per the required-fields tables in Section 6
- All BIDS entities the tool assigns automatically (`run-`, `part-`, `rec-`, `sbref`) per Section 5.3
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

The tool searches for the folder level that partitions the subject's files into the correct number of timepoints. In this example, the `2weeks/` and `6months/` level is identified as the session level and the subject is grouped correctly. Datasets with different depths across subjects (some flat, some Flywheel-nested) are handled in the same pass; the tool determines the correct level per subject independently.

### 8.6 Detection and Manual Mapping

The tool's auto-detection engine assigns a Custom timepoints session only when a file's folder path or filename literally contains one of the labels defined for that dataset (Section 8.2). There is no fuzzy keyword matching for Custom timepoints, unlike the Implant sessions preset's filename and folder heuristics. There is no keyword vocabulary that generalizes across arbitrary studies' timepoints.

Files that do not already carry a recognizable label must be mapped to a session manually in the tool's mapping table. When several files need to be assigned to different timepoints in sequence (for example, five T1w scans, one per visit), select them in order and use "Assign in order to timepoints" to pair the first selected file with the earliest timepoint, the second with the next, and so on.

### 8.7 Missed and Not-Yet-Acquired Visits

When a subject has fewer visit folders than the study defines, the tool holds the subject back rather than guessing which timepoint the visit represents. For example, if the study defines `ses-2wk` and `ses-6mo` but a subject has only a single visit folder, the tool cannot determine whether the visit is the baseline or the follow-up.

The subject is held back from export with a message describing the situation. To resolve, the user assigns each of the subject's files to the correct timepoint using the Session dropdown in the mapping table, consulting site clinical records if the correct assignment is not apparent from the source data.

Held-back subjects can be resolved individually, and the rest of the dataset can be exported without them. Held-back subjects can also be exported separately by re-running the workflow with a single-timepoint preset if the site's records confirm the visit is the only one that will be acquired for that subject.

---

## 9. Derivatives Folder Specification

The `derivatives/scanner/` folder holds files that were computed by the scanner console rather than acquired. These are real data (produced by the scanner from the source acquisition using its onboard reconstruction) but they are not raw and must not be treated as raw acquisitions by downstream analysis pipelines.

### 9.1 Purpose

Scanner-computed derivative maps are common in modern MRI workflows. Diffusion sequences frequently produce ADC, FA, and TRACEW maps on the console. Susceptibility-weighted sequences produce minimum-intensity projections. These files:

- Are BIDS-compliant outputs, provided they are placed under `derivatives/` rather than in the raw acquisition folders
- Are useful to downstream analysis (particularly for quick visual review and quality control)
- Would produce incorrect results if placed in the raw `primary/` tree and read as raw acquisitions

The `derivatives/scanner/` subfolder is reserved for scanner-computed derivatives specifically. It is separate from other subfolders that a site's own analysis pipelines create under `derivatives/`.

### 9.2 Folder Structure

The `derivatives/scanner/` folder mirrors the structure of `primary/`. A dataset that produces derivative maps under both sessions and both subjects looks like this:

```
derivatives/
    scanner/
        sub-PENN001/
            ses-preimplant/
                dwi/
                    sub-PENN001_ses-preimplant_run-1_desc-ADC_dwi.nii.gz
                    sub-PENN001_ses-preimplant_run-1_desc-ADC_dwi.json
                    sub-PENN001_ses-preimplant_run-1_desc-FA_dwi.nii.gz
                    sub-PENN001_ses-preimplant_run-1_desc-FA_dwi.json
                    sub-PENN001_ses-preimplant_run-1_desc-TRACEW_dwi.nii.gz
                    sub-PENN001_ses-preimplant_run-1_desc-TRACEW_dwi.json
                anat/
                    sub-PENN001_ses-preimplant_desc-mIP_T2starw.nii.gz
                    sub-PENN001_ses-preimplant_desc-mIP_T2starw.json
        sub-PENN002/
            ...
```

Each derivative file's parent modality folder matches the modality of the source acquisition. Diffusion-derived maps live in `derivatives/scanner/<subject>/<session>/dwi/`; SWI projections live in `derivatives/scanner/<subject>/<session>/anat/`.

### 9.3 The `desc-` Entity

The `desc-<label>` entity identifies which derivative a file is. Labels correspond to the derivative type and are stable across all datasets:

| Label | Meaning | Source Modality |
|---|---|---|
| `desc-ADC` | Apparent diffusion coefficient map | dwi |
| `desc-FA` | Fractional anisotropy map | dwi |
| `desc-TRACEW` | Trace-weighted map | dwi |
| `desc-mIP` | Minimum-intensity projection | anat (SWI or T2*-weighted) |

Additional derivative labels may be added in future versions of this SOP as the tool's derivative detection expands.

### 9.4 How the Tool Identifies Derivatives

The tool uses two signals to identify scanner-computed derivatives, in priority order:

**DICOM `ImageType`** (authoritative). When a JSON sidecar is present, the tool reads the DICOM `ImageType` field. A value list containing `DERIVED` along with a derivative label (`ADC`, `FA`, `TRACEW`) classifies the file as a derivative and routes it to `derivatives/scanner/`. This is the authoritative test because it comes from the DICOM header rather than filename convention.

**Filename suffix** (fallback). When no JSON sidecar is present, the tool falls back to filename tokens. Suffixes `_ADC`, `_FA`, `_TRACEW`, and `_mIP` route to the derivatives folder. Filenames are less reliable than `ImageType`. For example, `_TW` looks like a TRACEW abbreviation, but its `ImageType` is `ORIGINAL` on typical Siemens sequences, so it stays in raw `dwi/`. The tool always prefers the DICOM header verdict when both are available.

### 9.5 Run Numbering in the Derivatives Folder

Derivative files are grouped and run-numbered independently from the raw acquisitions in `primary/`. An ADC map does not take the run number of the raw diffusion series it was computed from; it is numbered within its own derivative-label group. This keeps the derivatives folder self-consistent and prevents confusion when a session contains multiple acquisitions of the same modality.

### 9.6 Site-Populated Derivative Folders

Sites may add additional subfolders under `derivatives/` for their own analysis pipelines. Common examples include `derivatives/freesurfer/` for FreeSurfer outputs and `derivatives/ieeg_recon/` for iEEG reconstruction outputs. These folders are outside the scope of this SOP and are managed by each site according to its own analysis workflow.

---

## 10. Metadata Files

BIDS-compliant datasets require several metadata files at various levels of the dataset hierarchy. This section documents the required content for each.

### 10.1 dataset_description.json

This file lives at the dataset root and is generated by the NeuroGate tool on first export. Required fields per GOV-001 Section 4:

| Field | Type | Required | Description |
|---|---|---|---|
| Name | string | Yes | Study name |
| BIDSVersion | string | Yes | Currently `1.8.0` |
| DatasetType | string | Yes | Set to `raw` |
| Authors | array | Yes | List of contributing institution authors |
| Acknowledgements | string | Optional | Funding or institutional acknowledgements |
| Funding | array | Optional | List of grant numbers or funding source identifiers |
| GeneratedBy | array | Auto-filled | Tools used to generate the dataset. NeuroGate populates this with its own name and version. |

### 10.2 participants.tsv and participants.json

The `participants.tsv` file stores demographic and clinical data for all subjects. It lives at the dataset root. The `participants.json` file is the data dictionary describing the columns.

Required columns in `participants.tsv`:

| Column | Type | Description |
|---|---|---|
| participant_id | string, required | BIDS subject ID (e.g., `sub-CHOP001`) |
| age | integer, required | Age at time of the first session |
| sex | string, required | `M`, `F`, or `O` |

Additional recommended columns: `handedness`, `pathology`, `implant_type` (for datasets under the Implant sessions preset).

**PHI warning:** The `participants.tsv` file must not contain direct identifiers. Use age as an integer in years, not a date of birth. Use coded subject IDs only. No names, medical record numbers, or dates of birth are permitted per GOV-001 Section 2.3.

The NeuroGate tool generates the participants files automatically from the metadata entered in Step 4 of the workflow. Sites do not author these files manually.

### 10.3 sub-<ID>_sessions.tsv

Each subject has a `sub-<ID>_sessions.tsv` file at the subject root listing their sessions and acquisition dates.

Required columns:

| Column | Type | Description |
|---|---|---|
| session_id | string, required | Session label (e.g., `ses-preimplant` or `ses-2mo`) |
| acq_time | string, recommended | Date of acquisition in ISO 8601 format (`YYYY-MM-DD`) |

**Date handling:** Acquisition dates should be shifted to preserve relative timing only, per GOV-001 Section 2.3. The NeuroGate tool shifts date fields in EDF headers and JSON sidecars automatically on export using a per-subject offset (see Section 11). Sites are responsible for shifting dates in any manually maintained `sessions.tsv` file.

### 10.4 electrodes.tsv

Required for any subject and session that includes intracranial EEG or that would otherwise carry electrode position data. Under the Implant sessions preset, this typically means `ses-postimplant/ieeg/`. Under Custom timepoints, it applies to any timepoint that includes iEEG.

Required columns:

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

**Coordinate system note:** Electrode coordinates must be in a well-defined anatomical coordinate system. The `iEEGCoordinateSystem` field in the corresponding `_coordsystem.json` file documents which system (typically MNI or subject-space T1w).

### 10.5 channels.tsv

Required for any subject and session that includes EEG or iEEG.

Required columns:

| Column | Type | Description |
|---|---|---|
| name | string, required | Channel label. Must match a name in `electrodes.tsv` for iEEG. |
| type | string, required | Channel type: `ECOG`, `SEEG`, `EEG`, `ECG`, `EMG`, and so on |
| units | string, required | Measurement units (typically `uV` or `mV`) |
| sampling_frequency | float, required | Sampling rate in Hz |
| status | string, recommended | `good` or `bad` |

**Cross-validation rule:** Every channel name in `channels.tsv` for iEEG must have a corresponding entry in `electrodes.tsv` for the same subject and session. This is enforced automatically by the tool during validation.

### 10.6 README

The `README` file at the dataset root provides a plain-text overview of the dataset. Recommended contents:

- Study name and brief description
- Contact information for the responsible investigator
- Collection protocols (institutions, scanner types, acquisition parameters at a high level)
- Any known issues, exclusions, or caveats

### 10.7 CHANGES

The `CHANGES` file at the dataset root records the version history of the dataset per BIDS convention. Each entry records the date, version, and a summary of what changed. Sites append to this file each time the dataset is re-exported with substantive changes.

---

## 11. De-identification and Defacing Requirements

All 18 HIPAA identifiers must be removed before data leaves the originating institution per GOV-001 Section 2.3. The NeuroGate tool automates some of this on export; the rest is the site's responsibility before importing data into the tool.

### 11.1 Automatic De-identification on Export

The tool performs the following automatically on every export. No user action is required for any of these steps.

**EDF and BDF header cleaning.** The patient name, patient ID, birthdate, and sex subfields of the EDF or BDF header are blanked or replaced with the BIDS subject ID. The recording start date is shifted by a random offset generated per subject (not zeroed) so relative timing between a subject's recordings is preserved while the absolute calendar date is removed. The offset is recorded in the export's audit log.

**JSON sidecar de-identification.** DICOM-to-NIfTI conversion (via dcm2niix or equivalent) can carry identifying DICOM header fields into a scan's `.json` sidecar depending on site conversion settings. The following fields are blanked on every sidecar in the export:

- Patient name, patient ID, patient birthdate
- Institution name, institution address, department name
- Referring physician, performing physician, requesting physician
- Scanner operator, station name
- Device serial number, device software version

The following date fields are shifted by that subject's same random offset applied to EDF headers:

- `AcquisitionDate`
- `AcquisitionDateTime`
- `StudyDate`
- `SeriesDate`

Scan-descriptive fields that downstream BIDS tooling requires are left intact:

- `SeriesDescription`, `ProtocolName`
- `EchoTime`, `RepetitionTime`, `FlipAngle`, `SliceThickness`, and other acquisition parameters
- `Manufacturer`, `ManufacturersModelName`, `MagneticFieldStrength`

The tool's automatic de-identification runs on both structure presets and on every export regardless of source.

### 11.2 Manual De-identification Required Before Import

The following are the site's responsibility and cannot be performed by the tool. They must be complete before source data is imported.

**DICOM header stripping.** DICOM-to-NIfTI conversion via dcm2niix should be run with appropriate flags (`-b y -ba y`) to strip PHI from the sidecar during conversion. This reduces the burden on the tool's automatic sidecar de-identification and is the recommended first-line defense.

**Facial defacing.** All structural MRI files (T1w, T2w, FLAIR, PDw, T2starw) that could reconstruct facial features must be defaced using pydeface or an equivalent tool. The tool cannot verify defacing was performed correctly. A defacing attestation checkbox is required before export.

Facial defacing is required for the anatomical folders of `ses-preimplant` and `ses-postsurgery` under the Implant sessions preset, and for any anatomical folder under Custom timepoints. CT scans do not require facial defacing per current standard practice, though sites may choose to deface them as an additional precaution.

**Manual review of free-text fields.** The `SeriesDescription` and `ProtocolName` fields in JSON sidecars are left intact by the automatic de-identification because downstream BIDS tooling requires them. If a scanner operator typed a patient name or medical record number into one of these fields at acquisition time, that PHI will remain in the export. The tool's PHI scanner detects this pattern and flags it during validation (Section 13), but the correction is manual: edit the sidecar to remove the PHI, then re-import.

### 11.3 PHI Scanning During Validation

The tool runs two complementary PHI scans during validation.

**Filenames and folder paths** are scanned for:

- Full names, defined as sequences of capitalized words not matching known modality or session terms
- Medical record number patterns, defined as numeric sequences of six or more digits
- Date patterns in common formats: `MM/DD/YYYY`, `YYYY-MM-DD`, `YYYYMMDD`
- Social Security Number patterns

**JSON sidecar free-text fields** are scanned for the same patterns in the `SeriesDescription` and `ProtocolName` fields, plus a keyword check against a list of common PHI-suggestive terms.

PHI detection blocks export until corrected. The tool does not modify source files.

### 11.4 Subject ID Key Management

The mapping from BIDS subject IDs to real patient identifiers must be maintained separately at the originating institution in a secure, access-controlled system per GOV-001 Section 2.3. This mapping is never entered into the NeuroGate tool and is never exported.

Sites should treat the subject ID key as protected health information subject to the same access controls as clinical records.

---

## 12. The NeuroGate Tool

The NeuroGate desktop application is the primary means of organizing data into the structure specified by this SOP. This section provides a high-level overview. Detailed workflow instructions are in SOP-GUI-001.

### 12.1 Purpose

NeuroGate automates:

- File classification (which imaging or electrophysiology modality each file represents)
- Session assignment (which timepoint or clinical phase each file belongs to)
- BIDS-compliant naming and folder placement
- Assignment of BIDS entities (`run-`, `part-`, `rec-`, `sbref`, `desc-`)
- Routing of scanner-computed derivatives to `derivatives/scanner/`
- Automatic de-identification on export (EDF headers and JSON sidecar fields)
- Validation of BIDS compliance and PHI absence
- Generation of an ALCOA+ compliant audit log

### 12.2 Distribution

NeuroGate is distributed as a desktop application for macOS, Windows, and Linux, plus a bundled command-line binary for automation workflows. Downloads and installation instructions are documented in SOP-GUI-001 Section 4.

### 12.3 Workflow Summary

The tool operates as a six-step linear workflow. The steps and their relationship to this SOP are:

| Step | Purpose | This SOP Section |
|---|---|---|
| 1: Choose Structure | Select Implant sessions or Custom timepoints preset | 5.4, 6, 8 |
| 2: File Drop | Import source files | 10 (accepted formats) |
| 3: Mapping Table | Review and correct automatic classifications | 5.3, 6, 8, 9 |
| 4: Metadata | Enter institution prefix, subject demographics, dataset description, defacing attestation | 4.1, 10, 11.2 |
| 5: Validation | Automated BIDS and governance compliance checks | 13 |
| 6: Export | Write the BIDS folder and audit log | 10, 11.1 |

### 12.4 Files the Tool Excludes Automatically

The tool identifies and excludes the following from export automatically:

- Operating-system artifacts (files whose name begins with a period, including `.DS_Store`, macOS resource forks, and rsync in-progress copies)
- Localizer and scout scans (acquisition aids, not analyzable data)
- Duplicate copies of the same acquisition, where the tool identifies two files as the bare and decorated names of the same source series (see Section 12.5)

Files with unrecognized extensions are ignored during import and never appear in the export.

### 12.5 Duplicate Series Handling

Flywheel and similar export pipelines frequently produce two copies of the same acquisition in the same folder: the bare series name and dcm2niix's decorated form including timestamp and series number. Both are legitimate files, but they represent one acquisition rather than two.

The tool detects duplicate series by matching a deterministic name relationship: stripping the leading underscore and trailing `_<timestamp>_<series-number>` from the decorated form yields the bare form. When this matches within a single folder, the file carrying the JSON sidecar is exported and the other copy is excluded.

Nothing is deleted from the source data. The excluded copy is visible in the mapping table with an indication of which file it duplicates, and the exclusion can be reversed by explicitly assigning a modality to the excluded copy.

---

## 13. Validation Pipeline

Validation runs before export. Each check produces one of four outcomes: pass, informational note, warning, or failure. Failures block export until corrected. Warnings do not block export but should be reviewed.

### 13.1 Structural Validation

- Folder hierarchy matches the active preset's pattern: `primary/sub-<ID>/ses-<label>/<modality>/` for both presets, with the specific session labels defined by the preset
- Filenames match the BIDS regular expressions for their modality
- `derivatives/scanner/` folder (if present) mirrors the `primary/` structure

### 13.2 Required Files

- Under the Implant sessions preset, per-session required files from Section 6 are present
- Under Custom timepoints, whatever modalities are present have complete file sets (imaging file plus JSON sidecar, plus `.bval` and `.bvec` for diffusion)
- Every raw diffusion image has an accompanying gradient table (`.bval` and `.bvec`) with matching b-value and phase-encoding direction (Section 6.1.2)
- Every EEG or iEEG channel referenced in `channels.tsv` has a corresponding entry in `electrodes.tsv` (iEEG only)

### 13.3 Metadata Validation

- JSON sidecars are present for every imaging file
- Required fields per Section 6 are populated for each modality
- `dataset_description.json` has all required fields populated (Section 10.1)
- `participants.tsv` has required columns for every subject in the export

### 13.4 Cross-File Consistency

- Channel names in `channels.tsv` match electrode names in `electrodes.tsv`
- Sessions listed in `sub-<ID>_sessions.tsv` match the folders present under the subject directory
- Same subject ID appears consistently across all files and metadata references

### 13.5 Content Sanity

- NIfTI headers parse cleanly
- Image dimensions are within expected ranges for each modality

### 13.6 PHI Scanning

- Filenames and folder paths are free of full names, medical record numbers, date patterns, and Social Security Number patterns
- JSON sidecar free-text fields (`SeriesDescription`, `ProtocolName`) pass the same checks

### 13.7 Cross-Session Consistency (Within Batch)

- Same subject ID is consistent across sessions
- Under the Implant sessions preset, acquisition dates must be chronological (`preimplant` before `postimplant` before `postsurgery`)
- Constant metadata (site, scanner) does not contradict across a subject's sessions

### 13.8 iEEG-Specific Validation

- Minimum recording duration of 48 hours per acquisition
- Persyst format requires both `.dat` and `.lay` files present as a pair

### 13.9 Held-Back Subjects

Individual subjects may be held back from export while the rest of the dataset proceeds. This happens when a subject has one or more blocking errors specific to that subject, most commonly no session assigned (typically because the subject has fewer visit folders than the study defines).

Held-back subjects are reported with the reason each was excluded. The rest of the dataset can still be exported. The held-back subjects can be resolved individually by returning to the mapping table and assigning sessions, then re-running the export.

### 13.10 Informational Notes

The validator reports the following as informational rather than as errors or warnings, because the tool has already applied automatic handling:

**Same series present twice.** The tool identified two copies of the same acquisition in the same folder and exported one copy. See Section 12.5.

**Same filename in multiple sessions.** A file with the same name appears in multiple sessions for the same subject. This is expected in longitudinal studies where the same scan protocol runs at every visit. The tool assigns run entities to keep filenames unique in the export.

**Scanner-computed derivatives routed to `derivatives/scanner/`.** ADC, FA, TRACEW, or mIP files were identified in the source and routed to the derivatives folder rather than `primary/`. See Section 9.

### 13.11 What the Tool Does NOT Enforce

- Clinical accuracy of metadata content
- Image quality (blurry MRIs upload successfully; image quality is a site QC concern)
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

---

**Source documents:**

- `public/docs/gov-001.md` (GOV-001, currently v1.15)
- `public/docs/sop-gui.md` (SOP-GUI-001, currently v2.0)
- BIDS Specification: https://bids-specification.readthedocs.io
- iEEG-BIDS Extension: https://bids-specification.readthedocs.io/en/stable/modality-specific-files/intracranial-electroencephalography.html
