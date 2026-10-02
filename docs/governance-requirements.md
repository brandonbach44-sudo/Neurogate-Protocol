# Governance Requirements: Extracted for Implementation

> Internal developer notes. This file extracts the enforceable rules in GOV-001 and SOP-BIDS-001 (`public/docs/gov-001.md`, `public/docs/sop-bids.md`) and records, for each one, whether the tool implements it or whether it is a site responsibility the tool does not enforce. What the tool actually does is defined by `docs/capabilities.md`; if this file and capabilities.md disagree, capabilities.md wins and this file is wrong. Update this file whenever either governance document or capabilities.md changes.

**Last sync:** 2026-10-02, against GOV-001 v2.1, SOP-BIDS-001 v3.1, `docs/capabilities.md` (verified 2026-09-30) and the owner's policy decisions in §0. Where GOV-001 v2.1 or SOP-BIDS-001 v3.1 text still says otherwise (for example, requiring an official bids-validator pass), §0 governs and the document is due for revision.

**How to read this file.** Every rule is tagged:

- **[TOOL]** implemented in the tool, with the file that implements it.
- **[TOOL, partial]** implemented, but narrower than the policy; the gap is stated.
- **[SITE]** a policy requirement the tool does not enforce or check. The site is responsible. Do not describe these as tool features in any user-facing document.

---

## 0. Owner Policy Decisions

These settle questions the governance documents left open. They override any conflicting wording in GOV-001 or SOP-BIDS-001.

1. **Audit log stays at the site.** It is never shared, uploaded or bundled with the dataset.
2. **Demographics are optional.** NeuroGate collects none. A site that wants them adds them to `participants.tsv` after export (GOV-001 Section 2.3 rules apply).
3. **`README`, `CHANGES`, `participants.json`** are written by the site after export, if needed. They are not a tool requirement.
4. **Date shift is not recorded anywhere**: not in the audit log, the dataset or any tool output.
5. **PET is exempt from defacing.**
6. **Persyst (`.dat` + `.lay`) is an accepted iEEG format.**
7. **The 48-hour iEEG minimum is a site rule.** The tool doesn't check recording duration.
8. **Sites record operator identity themselves.** The tool has no accounts; the audit log's actor is only "user"/"system" (GUI) or the OS username (CLI).
9. **NeuroGate's own layout replaces any official-bids-validator requirement.** The export is a BIDS-based dataset: BIDS naming conventions, but a root layout (`bids_output/` → `primary/sub-*`, `derivatives/scanner/`) that deliberately differs from the official spec, so the official bids-validator doesn't apply to the dataset as a whole. The requirement is that **NeuroGate's own validation step passes with no errors** (GUI: no undismissed errors; CLI: no errors for the exported subjects).

---

## 1. Regulatory Foundations

GOV-001 grounds the framework in FAIR, ALCOA+, HIPAA/PHI, the NIH Data Management and Sharing Policy (2023) and QMS practice. The tool supports parts of these (BIDS naming in a BIDS-based layout, de-identification on export, an audit log); it does not by itself make a dataset compliant with any of them. Compliance is the site's, verified through the GOV-001 Section 6.1 pre-upload checklist.

QMS change tracking is done in each document's Revision History table. There is no `VERSION_LOG.md`.

---

## 2. Distribution and Processing

- **[TOOL]** Desktop app (macOS Apple Silicon, Windows, Linux) and bundled CLI, from GitHub Releases. No hosted website. (`electron/main.cjs`, `src/cli/`)
- **[TOOL]** All processing is local; no patient data leaves the computer. The only network requests are the update check and Google Fonts. The `server/` upload API is not mounted in the desktop app.
- **[SITE]** Uploading the exported dataset to a data infrastructure, and access control on that infrastructure.

---

## 3. Structure Presets (three)

Chosen in Step 1 (`src/components/StructureSetupStep.tsx`, `src/types/sessionStructure.ts`) or the CLI structure prompt (`src/cli/index.ts`). A dataset uses exactly one.

- **Single session**: no `ses-` level and no `sessions.tsv`.
- **Implant sessions**: `ses-preimplant`, `ses-postimplant`, `ses-postsurgery`. The only preset with per-session required-file checks.
- **Custom timepoints**: 1–24 timepoints, each a number 0–99 plus a unit (days, weeks, months, years, or "sessions"), giving labels such as `ses-2wk`, `ses-6mo`, `ses-1d`, `ses-1yr`, `ses-1`. No free text. Sorted by elapsed time; duplicates blocked in the GUI (the CLI has no duplicate or range check).

The structure can't be changed on screen once the user continues (the Step 1 text "You can change this later" is inaccurate; see capabilities.md §3).

**Repeated acquisitions [TOOL]:** `run-N` is assigned automatically when a modality repeats within a session; companion files share the run number (`src/lib/bids/bidsNaming.ts`). Examples below omit `run-`.

---

## 4. Dataset Output (what the tool writes)

**[TOOL]** `src/lib/bids/exporter.ts`. This is NeuroGate's own BIDS-based layout (§0.9): BIDS file naming, with a deliberately non-standard root (`primary/`, `derivatives/scanner/`).

```
<PREFIX>_bids_export_<YYYY-MM-DD>/        (GUI desktop; CLI default <PREFIX>_bids_export)
├── bids_output/
│   ├── dataset_description.json          Name, BIDSVersion, DatasetType, Authors, GeneratedBy
│   ├── participants.tsv                  participant_id only
│   ├── primary/
│   │   └── sub-<ID>/
│   │       ├── sub-<ID>_sessions.tsv      session_id, acq_time (not for Single session)
│   │       └── ses-<label>/<datatype>/...
│   └── derivatives/scanner/              only when scanner-derived maps exist
└── audit_log_<YYYY-MM-DDTHH-MM-SS>.json  (CLI: audit_log.json)
```

Not generated by the tool:

- **[SITE]** `participants.json` (data dictionary), `README`, `CHANGES`: written by the site after export, if needed (§0.3). GOV-001 v2.1 Section 4 still lists them as required, marked site-authored.
- **[SITE]** Demographics (age, sex, handedness): optional (§0.2). The tool collects none; `participants.tsv` has `participant_id` only. If a site adds demographics after export, GOV-001 Section 2.3 applies (age ranges, no direct identifiers).
- **[SITE]** An `age` column in `sessions.tsv`. The tool writes `session_id` and `acq_time` only.
- **[SITE]** A `dataset_description.json` inside `derivatives/scanner/`. The tool doesn't write one.
- `dataset_description.json` optional fields (`Acknowledgements`, `Funding`, `License`, `DatasetDOI`) are not captured by the tool.

**Subject IDs [TOOL]:** `sub-<PREFIX><number padded to at least 3 digits>`, prefix 2–6 uppercase letters, starting number ≥ 1 (`src/components/MetadataStep.tsx`). GUI numbers subjects in detection order; CLI numbers them in alphabetical order of their groups.

**[SITE]** Keep the key linking coded IDs to patients at the originating institution; never upload it.

---

## 5. Modalities and Naming

**[TOOL]** 14 exported scan types in 9 BIDS folders (`src/types/detection.ts`, `MODALITIES`; `src/lib/bids/bidsNaming.ts`):

| Folder | Scan types / suffixes |
|---|---|
| `anat/` | `_T1w`, `_T2w`, `_FLAIR`, `_PDw`, `_T2starw` (includes SWI), `_angio` |
| `ct/` | `_ct` |
| `pet/` | `_pet` (with `trc-<tracer>`, and `rec-ac*`/`rec-nac*` when a session has both AC and NAC images) |
| `dwi/` | `_dwi` + `.bval`/`.bvec` |
| `perf/` | `_asl` |
| `func/` | `_bold`, always `task-rest` |
| `fmap/` | `_magnitude1/2`, `_phasediff`, `_phase1/2` |
| `eeg/`, `ieeg/` | scalp EEG, iEEG, always `task-monitor` |

- **[TOOL]** electrodes/channels/events tables go beside their recording: `eeg/` for scalp EEG, `ieeg/` for iEEG. A table is matched to an EEG/iEEG recording in the same source folder first, then in the same subject + session; otherwise, or when both kinds are present, it goes to `ieeg/` (`bidsNaming.ts` `tableFolder`). channels and events get `task-monitor`; electrodes gets no task.
- **[TOOL]** Other entities: `part-mag`/`part-phase`, `rec-moco` (Siemens MoCoSeries), `_sbref`, `desc-<map>` for scanner-derived maps under `derivatives/scanner/`, `_dup-N` for leftover collisions.
- **[TOOL]** Not exported: localizers/scouts, PET attenuation CT / mu-map (user can reclassify to CT), unclassified files, guessed files (`.nii.gz` fallback to T1w until the user picks a modality), redundant double-converted copies.
- **[TOOL]** Gradient tables pair by base name, then by b-value + phase-encoding direction; unpaired tables get a warning and are not exported (`bidsNaming.ts` `pairGradientTables`, `src/lib/validation/bidsValidator.ts`).
- Not implemented: `IntendedFor` is never filled; task labels can't be changed; there is no `_epi` suffix for reverse-polarity EPI field maps (they are named under the magnitude/phase scheme).

**Inputs [TOOL]** (`src/lib/detection/extensionDetector.ts`): `.nii.gz`, `.nii` (gzipped on export), `.json`, `.edf`/`.bdf`, `.nwb`, `.dat`/`.lay` (Persyst, an accepted iEEG format, §0.6; every `.dat` counts as Persyst), `.bval`/`.bvec`, `.tsv`, `.csv` (warning; exported only alongside a same-name data file, renamed to `.tsv`, not converted). DICOM and ECAT get a "convert first" warning and are not exported.

**Not supported:** BrainVision (`.vhdr`/`.eeg`/`.vmrk`), DICOM input, ECAT, PET blood data (`_blood.tsv`).

**[SITE]** DICOM-to-NIfTI conversion (dcm2niix; the Pre-Processing page gives PHI-safe templates), ECAT-to-NIfTI conversion.

---

## 6. Required Files (Implant sessions preset only)

Policy source: SOP-BIDS-001 Section 6. **[TOOL]** `src/lib/validation/requiredFilesChecker.ts`, checked only for sessions where the subject has files; presence is judged by modality (a guessed file counts); every required-file issue is dismissable; a subject with fewer than 4 imaging/EEG/table files gets them as warnings instead.

| Session | Error if missing | Warning if missing |
|---|---|---|
| `ses-preimplant` | T1w | T2w |
| `ses-postimplant` | CT, iEEG, electrodes.tsv, channels.tsv | events.tsv |
| `ses-postsurgery` | T1w | T2w |

Also: "Subject has no sessions" (error); "Session has only sidecar/metadata files" (warning).

- **[SITE]** Everything else in SOP-BIDS-001's per-session tables that isn't in the table above (e.g. per-file JSON sidecar presence, FLAIR/DWI/scalp EEG content).
- **[SITE]** "Post-implant CT must clearly show electrode positions."
- **[SITE]** Custom timepoints and Single session have no required-file checks; completeness of whatever is present is the site's.

---

## 7. Metadata Files: Content Rules

All **[SITE]** (the tool doesn't read or check these contents):

- **electrodes.tsv:** `name`, `x`, `y`, `z` required; `size` recommended.
- **channels.tsv:** `name`, `type`, `units`, `sampling_frequency` required; `status` recommended.
- **Cross-validation:** every channel name in channels.tsv exists in electrodes.tsv for the same subject/session. Not checked.
- **Per-modality JSON sidecar fields** (GOV-001 Section 3 "Key Metadata"). Not checked, except PET below.

**[TOOL, partial]** PET: a dismissable warning when a PET image has no sidecar or its sidecar lacks any BIDS-required PET field (`src/lib/validation/petChecker.ts`, field list `PET_REQUIRED_SIDECAR_FIELDS` in `src/lib/detection/petVocabulary.ts`). Never blocks export. Conditionally required PET fields are not checked.

**[TOOL]** Dataset-level metadata (`src/components/MetadataStep.tsx`, `src/lib/validation/engine.ts`): study name, at least one author, and prefix required; missing ones are errors. BIDSVersion `1.8.0` and DatasetType `raw` unless a dropped `dataset_description.json` supplies them. Sparse dataset (warning), empty dataset (error).

---

## 8. File Format Rules

- **[TOOL]** `.nii` is compressed to `.nii.gz` on export.
- **[TOOL, partial]** `.tsv` not `.csv`: `.csv` gets a warning and is renamed, not converted.
- **[TOOL]** Sidecars pair with the data file of the same base name; orphaned and duplicate sidecars are warned (`bidsValidator.ts`).
- **[TOOL]** Subject IDs are generated by the tool, so they are always alphanumeric.
- **[TOOL, partial]** DICOM/ECAT: warned and not exported; conversion is **[SITE]**.

---

## 9. PHI Checks in Names and Sidecars

**[TOOL]** `src/lib/validation/phiScanner.ts`:

- **Errors (not dismissable):** SSN; MRN (MRN/MR# prefix, 5–10 digits); DOB marker followed by digits; `patient|pt|subj|subject` followed by First Last; a subject group that looks like a person's name.
- **Warnings:** phone, email, MM/DD/YYYY or MM-DD-YYYY dates, "Last, First"; first match of the keyword list (firstname, lastname, fullname, patientname, ssn, social_security, address, street, zipcode, insurance, policy_number, accession, acc_num).
- **Sidecar content:** every string field not already de-identified, nested objects included, scanned with the same patterns plus a two-capitalised-words name check (warning).

Not implemented (remove from any doc that claims it): site-configurable MRN patterns, `YYYYMMDD` date detection, "long numeric string" warnings, DICOM tag checks (DICOM isn't accepted as input).

- **[SITE]** PHI review of electrodes/channels/events/other TSV contents. Not scanned.
- **[TOOL, partial]** An identifying-looking EDF header is shown only as a warning in Mapping's detection reasons, not as a validation issue.

---

## 10. Automatic De-identification on Export

**[TOOL]** `src/lib/deidentify/`, `src/lib/bids/exporter.ts`:

- **Date shift:** one random shift per subject, −365 to +365 days (0 possible), applied to EDF/BDF headers, JSON sidecars and `sessions.tsv` `acq_time`. **The shift value is deliberately not recorded anywhere, including the audit log (§0.4).**
- **EDF/BDF** (`edfDeidentifier.ts`): patient field becomes `<sub-ID> X X X` (EDF+ structure) or `X X X X`; recording field's EDF+ Startdate is shifted and admin/technician codes become X (otherwise only `dd-MMM-yyyy` dates are shifted); start date shifted, start time unchanged. Unparseable dates, signal headers and annotations are not changed; files under 256 bytes are copied as-is.
- **JSON sidecars** (`jsonSidecarDeidentifier.ts`): the fields listed in capabilities.md §8 are set to "X"; the listed date fields (including `RadiopharmaceuticalStartDateTime`) are shifted, and unrecognized date formats are blanked. Top-level keys only; invalid JSON is copied unchanged.
- **`sessions.tsv` `acq_time`:** shifted and written as ISO 8601; unshiftable values become `n/a`.

**Not de-identified by the tool, all [SITE]:**

- NWB and Persyst `.dat`/`.lay` files (exported unchanged), and NIfTI header text.
- electrodes/channels/events/other TSV contents.
- Nested sidecar fields and free-text sidecar fields (scanned, §9, but not rewritten).
- DICOM header stripping at conversion.
- Image pixels (defacing, §11).

---

## 11. Defacing

- **[TOOL]** One attestation checkbox, required when any T1w, T2w, FLAIR, PDw or T2*w image is present (a guessed T1w counts); the time it was ticked is recorded. CLI asks y/n when structural MRI is present (`src/components/MetadataStep.tsx`, `src/cli/index.ts`).
- **[TOOL]** Audit log gets a "defacing attested" entry when leaving Metadata with the box ticked. Unticking isn't logged. The entry doesn't record a named user (no accounts; sites record operator identity themselves, §0.8) or a defacing tool/version.
- **[SITE]** Performing defacing (pydeface/mri_deface), the Defacing Log (tool, version, files, QA) and visual inspection. The tool doesn't deface, inspect or preview images.
- PET is exempt from defacing (§0.5). MR angiography, fMRI and ASL are not covered by the attestation (GOV-001 recommends defacing them).

---

## 12. Audit Log

**[TOOL]** `src/lib/audit/`, `src/types/audit.ts`:

- JSON (Export JSON / Export CSV from the Audit Log panel). Header: session start, tool version, exported at/by, total entries, action counts. Entries `{id, timestamp, actor, action, summary, details}`; actor is "user"/"system" (GUI) or OS username (CLI).
- **Logged:** structure selected, files scanned, session restored; detection completed (counts); session/modality/subject corrections (old → new; subject edits per keystroke); bulk applies (count); institution configured, subject sessions, dataset description, defacing attested; validation passed (GUI) / validation run (CLI); export completed; de-identification summary (fields stripped/shifted, EDF PHI found; no shift values); audit exported (written after the file, so not in it).
- **Not logged:** dismissals, attestation unticking, per-file detection reasons, export started, errors, per-check validation results, per-field metadata values and their source, file sizes/byte totals, identity beyond the actor above. A restore doesn't re-log files scanned or detection completed.
- **[SITE]** Operator identity (who ran the export) is recorded by the site in its own records (§0.8).
- Lasts for the app session; a reload loses it.

**[SITE]** The audit log contains original file and folder names and the study name, which can identify patients. It stays in local site records and is never shared or uploaded with the dataset (§0.1; GOV-001 Sections 2.3, 5, 6.1).

---

## 13. Validation Pipeline

What the tool runs (`src/lib/validation/`), see capabilities.md §7 for full detail:

1. **[TOOL]** BIDS structure (`bidsValidator.ts`): errors for no session assigned / no BIDS ID; warnings for unclassified, orphaned sidecar, duplicate sidecar, unmatched gradient table; info for special characters and same series twice.
2. **[TOOL]** Required files, Implant sessions only (`requiredFilesChecker.ts`, §6).
3. **[TOOL]** PHI in names and sidecar text (`phiScanner.ts`, §9).
4. **[TOOL]** Cross-session (`crossSessionChecker.ts`): chronological order error for Implant when dates were auto-filled; single-session subject (info); same filename in several sessions (warning); duplicate subject ID (error); iEEG without electrodes.tsv in that session (warning).
5. **[TOOL, partial]** PET sidecar required fields, warning only (`petChecker.ts`).
6. **[TOOL]** Metadata completeness (`engine.ts`, §7).

**Pass requirement (§0.9):** NeuroGate's own validation must pass with no errors. GUI: any undismissed error blocks Export. CLI: a subject with errors is held back and the rest exported; errors not tied to a subject exit with code 1; warnings don't stop it (`src/cli/pipeline.ts`, `src/cli/index.ts`).

The official bids-validator isn't run and isn't required (§0.9).

**Not implemented, all [SITE]:**

- Per-modality required JSON fields (other than PET).
- channels.tsv ↔ electrodes.tsv name matching.
- NIfTI header parsing or dimension checks.
- iEEG minimum recording duration (the 48-hour minimum is a site rule, §0.7).
- Persyst `.dat` + `.lay` pairing.
- sessions.tsv against session folders.
- Scanner/site consistency.

---

## 14. Outside the Tool Entirely

- Clinical accuracy of metadata; image quality.
- IRB, consent, data use agreements.
- Anything under `derivatives/` other than `derivatives/scanner/`.
- Conversion, defacing and their logs; upload and upload logs; PHI clearance; quarterly audits (GOV-001 Sections 5 and 6).

---

**Source documents:**
- `public/docs/gov-001.md` (GOV-001 v2.1)
- `public/docs/sop-bids.md` (SOP-BIDS-001 v3.1)
- `docs/capabilities.md` (tool capability inventory, verified 2026-09-30)
- BIDS Specification: https://bids-specification.readthedocs.io
- iEEG-BIDS Extension: https://bids-specification.readthedocs.io/en/stable/modality-specific-files/intracranial-electroencephalography.html
