# NeuroGate capability inventory

**This file is the single source of truth for what NeuroGate does.** Every user-facing document (GOV-001, SOP-BIDS-001, SOP-GUI-001, README) and every page in the app describes only what's listed here. When a feature is added or changed, update this file first, then the documents.

It was verified line by line against the code on 2026-09-30 (version 1.0.1 plus that day's changes). File references are relative to the repo root.

---

## 1. Distribution

- **Desktop app** for macOS (Apple Silicon only), Windows and Linux, downloaded from GitHub Releases: <https://github.com/brandonbach44-sudo/Neurogate-Protocol/releases/latest>.
  - **Files:** `NeuroGate-<version>-arm64.dmg` (macOS), `NeuroGate-Setup-<version>.exe` (Windows), `NeuroGate-<version>.AppImage` (Linux).
  - **Signing:** no Developer ID or Windows certificate. The macOS build is ad-hoc signed.
  - **First launch:** on macOS, go to System Settings → Privacy & Security → Open Anyway. On Windows, SmartScreen → More info → Run anyway.
- **Update check** on every launch of an installed app (`electron/main.cjs`, `initAutoUpdater`). Failures are silent.
  - **Windows and Linux:** it asks, downloads, then asks to restart. "Later" installs the update on quit.
  - **macOS:** it asks, then opens the release page (`…/releases/tag/v<version>`) for a manual download.
- **CLI:** `neurogate <folder>`, bundled in every desktop build.
  - The **Install CLI** button is in the top navigation bar of the Home, Documentation, Pre-Processing and About pages. It isn't on the tool page, and it's hidden in narrow windows.
  - It copies the CLI into the app-data `bin` folder. On Windows it also adds that folder to the user PATH; on macOS and Linux it shows the folder to add.
- **No hosted website.** The AWS deploy workflow is disabled in GitHub's settings.
- **The version** appears in the footer of the Home, Documentation, Pre-Processing and About pages.

## 2. Where processing happens

- **Everything runs on the user's computer.** No patient data is uploaded anywhere.
- **Local server:** the desktop app runs an in-process web server on `127.0.0.1:3001`, reachable only from the same computer, to serve its own pages.
- **The only network requests** are the update check (GitHub) and Google Fonts (`index.html`).
- The upload/de-identification API in `server/` isn't mounted in the desktop app.

## 3. Workflow (GUI): 6 steps

The stepper labels are **Structure · Drop Files · Mapping · Metadata · Validate · Export** (`src/pages/ToolPage.tsx`). The stepper only shows progress and can't be clicked; the buttons at the bottom of each step move between steps.

**Going back loses work:**
- **Mapping → "Back to Drop Zone"** clears the files, the mapping and the saved progress. The chosen structure and the audit log are kept.
- **Back to Metadata** (from Mapping or from Validate) resets every Metadata entry: prefix, name, authors, attestation.
- **Export → Back to Validation** re-runs validation, which clears any dismissals.

### Step 1: Structure (`src/components/StructureSetupStep.tsx`, `src/types/sessionStructure.ts`)
- It first asks: "Does each subject have more than one session of data?"
  - **No** → **Single session**: no `ses-` level and no `sessions.tsv`.
  - **Yes** → choose one of:
    - **Implant sessions:** `ses-preimplant`, `ses-postimplant`, `ses-postsurgery`.
    - **Custom timepoints:** 1–24 timepoints. Each is a number 0–99 plus a unit: days, weeks, months, years, or "sessions (no time interval)".
      - Labels come out as `ses-2wk`, `ses-6mo`, `ses-1d`, `ses-1yr`, or `ses-1` for the "sessions" unit. 0 is shown as "(baseline)".
      - Timepoints are sorted by elapsed time (a month counts as 30 days, a year as 365), and duplicates are blocked.
- **The structure can't be changed on screen once you continue.** To change it, click "Back to Drop Zone" on Mapping, then reload the app.
  - The page currently says "You can change this later", which isn't accurate.

### Step 2: Drop Files (`src/components/FileDropZone.tsx`)
- Drag in a folder or files, or use the "browse folder" / "select files" links. Any folder layout works.
- OS junk (`.DS_Store`, `Thumbs.db`, dotfiles, `._` AppleDouble files, in-progress copy files) is dropped silently.
- **Memory use:**
  - **Desktop:** file contents aren't loaded into memory (only their locations), so files of any size work.
  - **Browser:** files up to 500 MB are cached in memory.
- **Saved progress** (browser tab storage, kept 12 hours): a "Saved progress from … ago" banner appears with **Discard**.
  - Adding the exact same folder again (same names, sizes and paths) restores the mapping automatically. Anything different discards it.
  - Metadata isn't saved.

### Step 3: Mapping (`src/components/MappingTable.tsx`)
- **Columns:** checkbox, Original File (BIDS path shown under it), Subject (free text), Session (dropdown; hidden for Single session), Modality (dropdown), Confidence.
- **Confidence badges:** High (green), Medium (yellow), Low (orange), Needs Review (red).
- **Badges under the file name:** "Guessed — pick a modality to export" (orange), "Duplicate of …" (yellow), "Derived: …" (blue).
- **Row detail:** clicking a row shows its Detection Reasons and File Info.
- **Filters, with counts:** All, High, Medium, Low, Needs Review, Needs your decision.
- **Bulk edits:** "Set session…" / "Set modality…" with **Apply**, and **Clear selection**.
  - With Custom timepoints and 2 or more rows ticked, **Assign in order to timepoints** assigns them in the order they were ticked.
- **Audit log:** corrections are logged, and subject edits are logged per keystroke. Bulk edits are logged as a count.
- "Continue to Metadata" is always enabled.

### Step 4: Metadata (`src/components/MetadataStep.tsx`)
Four tabs, each marked complete or incomplete ("N of 4 sections complete"):
- **Institution Setup:** a prefix of 2–6 uppercase letters and a starting number (integer ≥ 1). IDs are `sub-<PREFIX><number padded to at least 3 digits>`, e.g. `sub-PENN001`.
- **Subject Sessions:** read-only list of each subject's session labels.
- **Dataset Description:**
  - **Study name and authors:** required.
  - **Dataset type and BIDS version:** read-only, "raw" and 1.8.0, unless a dropped `dataset_description.json` supplies them.
- **Defacing Attestation:** one checkbox, required when any T1w, T2w, FLAIR, PDw or T2*w image is present (a guessed T1w counts). The time it was ticked is recorded.

"Continue to Validation" lists what's missing and won't continue until the prefix, study name, at least one author and (if required) the attestation are done.

**Auto-fill:**
- The study name and authors come from a dropped `dataset_description.json`.
- Session dates come from a dropped `sessions.tsv`, or from a sidecar's `AcquisitionDateTime` when the file sits in a `ses-<label>` folder. Auto-filled dates aren't shown, but they're used by the date-order check and exported, shifted, in `sessions.tsv`.

**No demographics** (age, sex, handedness) are collected.

### Step 5: Validate (`src/components/ValidationStep.tsx`, `src/lib/validation/`)
- **Screen:** category cards that filter the list, a severity filter (All / Error / Warning / Info, with counts), "Dismiss this issue" in an expanded card, and **Re-run Checks** (which clears dismissals).
- **What blocks:** any error that hasn't been dismissed blocks "Continue to Export"; the button then reads "Fix N Errors to Continue". Most errors can't be dismissed, but the Implant required-file errors can.
- The checks themselves are listed in §7.

### Step 6: Export (`src/components/ExportStep.tsx`)
- The screen shows the output tree, subject/file counts and total size, plus a list of the metadata files NeuroGate generates.
- **Desktop app:**
  - **Export to Folder** opens a folder picker ("Export Here").
  - It creates `<PREFIX>_bids_export_<YYYY-MM-DD>` there (adding `-2`, `-3`, … if that name exists), containing `bids_output/` and `audit_log_<YYYY-MM-DDTHH-MM-SS>.json`.
  - Files are streamed, with no size limit. It shows "Writing file N of M…", then the folder path with **Show Folder**. The button then reads **Export Again**.
- **Browser build:**
  - "Download" builds `<PREFIX>_bids_export_<date>.zip` (uncompressed, with `bids_output/` inside). A second "Download" saves it, and the audit log downloads separately.
  - Files over 500 MB are **left out** and listed as not included.
- **Warning:** a file that couldn't be read (e.g. a cloud-only OneDrive file) triggers a "File not locally available" warning.

## 4. CLI (`src/cli/`)

**Prompts, in order:**
1. The source folder, if it wasn't given as an argument. Quotes around a pasted path are removed.
2. Structure: Implant (default), Custom, or Single. For Custom it asks for the number of timepoints, then each number and unit. There's no duplicate or range check.
3. Prefix (asked again until valid) and starting number.
4. Study name.
5. Authors (asked again until at least one is given).
6. Defacing y/n, required, asked only when structural MRI is present.
7. Output folder. The default is `<PREFIX>_bids_export` next to the source folder. It isn't made unique.

**Output:** it writes `<out>/bids_output/` and `<out>/audit_log.json`, streaming every file with no size limit. Symlinks are skipped.
- `sessions.tsv` lists every session of the chosen structure, including ones with no data.
- Subjects are numbered in alphabetical order of their groups.

**Held-back subjects (CLI only):**
- A subject with errors is held back and the rest are exported.
- Errors not tied to a subject block the whole export and exit with code 1. That covers missing metadata or attestation, PHI errors, and an empty dataset.

**Warnings don't stop the CLI.** It exports, then lists each warning.

No per-file corrections are possible in the CLI.

## 5. Recognized inputs (`src/lib/detection/extensionDetector.ts`)

| Extension | Meaning |
|---|---|
| `.nii.gz`, `.nii` | Imaging. `.nii` is gzipped to `.nii.gz` on export. |
| `.json` | Sidecar, paired with the data file of the same base name. |
| `.edf`, `.bdf` | Scalp EEG or iEEG, told apart by the channel labels in the EDF header. |
| `.nwb`, `.dat`, `.lay` | iEEG. Every `.dat` counts as Persyst. |
| `.bval`, `.bvec` | Diffusion gradient tables |
| `.tsv` | electrodes / channels / events tables. Other `.tsv` files export only alongside a data file of the same base name. |
| `.csv` | Warning: BIDS needs `.tsv`. It exports only alongside a data file of the same base name, renamed (not converted) to `.tsv`. |
| `.dcm`, `.dicom`, `.ima` | Warning: convert DICOM to NIfTI first. Not exported. |
| `.v`, `.v.gz` (ECAT PET) | Warning: convert to NIfTI first (PET2BIDS). Not exported. |
| anything else | Other / Unknown. Not exported. |

**Not supported:** BrainVision (`.vhdr`/`.eeg`/`.vmrk`), DICOM input, ECAT, PET blood data (`_blood.tsv`).

## 6. Modalities (`src/types/detection.ts`, `MODALITIES`)

**Exported:**

| Modality | BIDS folder / suffix |
|---|---|
| T1w, T2w, FLAIR, PDw, T2*w (SWI), MR angiography | `anat/` `_T1w` `_T2w` `_FLAIR` `_PDw` `_T2starw` `_angio` |
| CT | `ct/` `_ct` |
| **PET** | `pet/` `_pet` |
| Diffusion | `dwi/` `_dwi`, plus `.bval`/`.bvec` |
| Perfusion / ASL | `perf/` `_asl` |
| Functional MRI | `func/` `_bold`, always `task-rest` |
| Field maps | `fmap/` `_magnitude1/2`, `_phasediff`, `_phase1/2` |
| Scalp EEG, iEEG | `eeg/`, `ieeg/`, always `task-monitor` |
| electrodes / channels / events tables | Beside their recording: `eeg/` for scalp EEG, `ieeg/` for iEEG. Tables are matched to an EEG/iEEG recording in the same source folder first, then in the same subject + session; otherwise, or when both kinds are present, they go to `ieeg/`. channels and events get `task-monitor`; electrodes gets no task. |

**Recognized but never exported:**
- Localizer / scout scans.
- PET attenuation CT / mu-map.
- Anything unclassified, guessed, or a redundant copy of a series.

**Detection signals, strongest first:**
1. The sidecar's DICOM `Modality` (`PT`, `CT`, `MR`) and PET-only fields.
2. Sidecar `ImageType`, which catches scanner-derived ADC/FA/TRACEW maps.
3. EDF channel labels.
4. Keywords in the sidecar scan name (SeriesDescription, ProtocolName, …).
5. Filename keywords.
6. Folder names.
7. Neighbouring files.
8. Subject grouping.
9. For Custom timepoints: date clusters and folder clusters.

**Fallback:** an unidentified `.nii.gz` defaults to T1w, marked as a guess and not exported until the user picks a modality. An unidentified `.nii` stays Other / Unknown.

**Naming details:**
- **Entity order:** `sub_ses_task_trc_rec_run_desc_part_suffix`.
- **Repeated acquisitions:** `run-N`.
- **Siemens MoCoSeries:** `rec-moco`.
- **Magnitude/phase pairs:** `part-mag` / `part-phase`.
- **Single-band references:** `_sbref`.
- **Scanner-derived maps** (ADC, FA, TRACEW, mIP): placed under `derivatives/scanner/` with `desc-<map>`.
- **Series converted twice** (a bare name plus dcm2niix's decorated `_<name>_<digits>_<n>` in the same folder): the decorated copy is kept and the bare copy isn't exported.
- **Leftover collision:** a name collision that survives all of this is renamed `…_dup-N`.
- **Not set:** `IntendedFor` isn't filled in, and task labels can't be changed.

**PET specifics** (`src/lib/detection/petVocabulary.ts`):
- **Detection:**
  - From the sidecar: `Modality: "PT"` or PET-only fields (TracerName, TracerRadionuclide, InjectedRadioactivity, RadionuclideHalfLife, …).
  - From names: PET, PETCT, PETMR, `trc-`, amyloid, tau-pet, and tracers FDG, PiB, florbetapir/AV45/Amyvid, florbetaben/FBB/Neuraceq, flutemetamol/Vizamyl, flortaucipir/AV1451/Tauvid, MK6240, PI2620, RO948, UCB-J, flumazenil/FMZ, FDOPA, raclopride.
- **`trc-<tracer>`** comes from the sidecar TracerName, or from the name. An unrecognized TracerName is kept (letters and digits only, up to 24 characters). It's left out when no tracer is found.
- **`rec-acstat` / `rec-nacstat` / `rec-acdyn` / `rec-nacdyn`:** used only when a session has both attenuation-corrected and uncorrected ("NAC") images. Dynamic means more than one frame; `rec-ac` / `rec-nac` are used when the framing is unknown, and an image that doesn't say is treated as corrected.
- **Attenuation CT:** a CT named CTAC / AC_CT / mu-map, or any CT inside a PET study folder, is the attenuation CT and isn't exported. The user can change it to CT.
- **Tracer names aren't subjects:** names like AV45 or MK6240 are never read as subject IDs.
- **Defacing:** PET isn't covered by the defacing requirement.

## 7. Validation checks (`src/lib/validation/`)

**BIDS structure:**
- **Errors (can't be dismissed):** no session assigned; subject has no BIDS ID.
- **Warnings:** unclassified file (not exported); orphaned JSON sidecar (not exported); duplicate sidecar; unmatched `.bval`/`.bvec`.
- **Info:** special characters in a name; same series present twice.
- Guessed and redundant-copy files get no validation message. They're flagged only in Mapping.

**PHI in file and folder names:**
- **Errors (can't be dismissed):** SSN; MRN (with an MRN/MR# prefix, 5–10 digits); a date-of-birth marker followed by digits; `patient|pt|subj|subject` followed by First Last; a subject group that looks like a person's name.
- **Warnings:**
  - Phone number, email, MM/DD/YYYY or MM-DD-YYYY dates, "Last, First".
  - The first match of these keywords: firstname, lastname, fullname, patientname, ssn, social_security, address, street, zipcode, insurance, policy_number, accession, acc_num (underscore variants included).
- **Sidecar content:** every string field that isn't already de-identified (nested objects included) is scanned with the same patterns, plus a two-capitalised-words name check (warning).
- **Not checked for PHI:** the contents of electrodes, channels, events and other TSVs. An EDF header that looks identifying is shown only as a warning in Mapping's detection reasons.

**Required files (Implant sessions only):**
- Checked for each session where the subject has files. Presence is judged by modality, so a guessed file counts.
- **Pre-implant:** T1w (error), T2w (warning).
- **Post-implant:** CT, iEEG, electrodes.tsv, channels.tsv (errors); events.tsv (warning).
- **Post-surgery:** T1w (error), T2w (warning).
- A subject with fewer than 4 imaging/EEG/table files gets these as warnings instead.
- Every required-file issue can be dismissed.
- **Other checks:** "Subject has no sessions" (error); "Session has only sidecar/metadata files" (warning).

**Cross-session:**
- **Implant, when dates were auto-filled:** sessions out of chronological order (error).
- **Other checks:** single-session subject (info); same filename in several sessions (warning); duplicate subject ID (error); iEEG without electrodes.tsv in that session (warning).

**PET:** a warning, which can be dismissed, when a PET image has no sidecar or its sidecar lacks BIDS-required PET fields. It never blocks export.

**Metadata:**
- Missing dataset name, authors or prefix, and a missing defacing attestation, are errors. In the GUI the Metadata step already prevents them.
- **Other checks:** sparse dataset (warning); empty dataset (error).

**Not checked:**
- Per-modality required JSON fields (other than PET).
- Matching channel names against electrodes.
- NIfTI headers or dimensions.
- iEEG minimum duration.
- Persyst `.dat`/`.lay` pairing.
- sessions.tsv against the folders.
- Scanner or site consistency.
- The official bids-validator isn't run.

## 8. De-identification on export (`src/lib/deidentify/`)

- **Date shift:** each subject gets one random shift of −365 to +365 days (0 is possible), applied to EDF headers, JSON sidecars and `sessions.tsv` `acq_time`. The shift value isn't recorded anywhere.
- **EDF/BDF headers:**
  - **Patient field:** becomes `<sub-ID> X X X` if it has EDF+ structure (4+ parts), otherwise `X X X X`.
  - **Recording field:** in EDF+ "Startdate" form, the date is shifted and admin/technician codes become X. Otherwise only `dd-MMM-yyyy` dates in it are shifted and other text is kept.
  - **Start date:** shifted. The start time is unchanged.
  - **Not changed:** dates that can't be parsed, signal headers and annotations. Files under 256 bytes are copied as-is.
- **JSON sidecars:**
  - **Set to "X"** (any non-empty value): PatientName, PatientID, PatientBirthDate, PatientAddress, PatientTelephoneNumbers, OtherPatientIDs, OtherPatientNames, InstitutionName, InstitutionAddress, InstitutionalDepartmentName, ReferringPhysicianName, PerformingPhysicianName, RequestingPhysician, OperatorsName, StationName, DeviceSerialNumber.
  - **Date-shifted:** AcquisitionDateTime, AcquisitionDate, StudyDate, SeriesDate, ContentDate, InstanceCreationDate, ScanDate, RadiopharmaceuticalStartDateTime. A date in an unrecognized format is blanked.
  - **Limits:** only top-level keys are processed, and a sidecar that isn't valid JSON is copied unchanged.
- **`sessions.tsv` `acq_time`:** shifted and written as ISO 8601. A value that can't be shifted becomes `n/a`.
- **Not de-identified:**
  - NWB, Persyst `.dat`/`.lay` and NIfTI header text.
  - The contents of electrodes, channels, events and other TSVs.
  - Free-text sidecar fields (these are PHI-scanned, §7).
  - Image pixels. Defacing is done before NeuroGate and attested.

## 9. Output (`src/lib/bids/exporter.ts`)

```
bids_output/
  dataset_description.json   Name, BIDSVersion, DatasetType, Authors,
                             GeneratedBy (NeuroGate, app version, structure used)
  participants.tsv           participant_id only (every detected subject)
  primary/
    sub-<ID>/
      sub-<ID>_sessions.tsv  session_id, acq_time (not for Single session)
      ses-<label>/<datatype>/...
  derivatives/scanner/       only when scanner-derived maps exist
                             (no dataset_description.json of its own)
```

No `participants.json`, `README` or `CHANGES` is generated. In the GUI, subjects are numbered in the order they were detected.

## 10. Audit log (`src/lib/audit/`, `src/types/audit.ts`)

- **Format:** JSON.
  - **Header:** session start, tool version, exported at/by, total entries, action counts.
  - **Entries:** `{id, timestamp, actor, action, summary, details}`. The actor is "user" or "system" in the GUI, and the OS username in the CLI.
- **Where it lives:**
  - **Audit Log button (tool header, with an entry count):** opens a panel with **Export JSON** and **Export CSV**, available at any time.
  - The log lasts for the whole app session, including across Back to Drop Zone and additional datasets. A reload loses it.
- **What's logged:**
  - **Setup:** structure selected, files scanned, session restored.
  - **Detection:** detection completed (counts).
  - **Mapping:** session, modality and subject corrections (old → new); bulk applies (count).
  - **Metadata:** institution configured, subject sessions, dataset description, defacing attested (when leaving Metadata with the box ticked).
  - **Validation:** validation passed (on Continue to Export, GUI); validation run (CLI).
  - **Export:** export completed (GUI); de-identification summary (fields stripped or shifted, whether EDF PHI was found; no shift values); audit exported. The "audit exported" entry is written after the file, so it isn't in the file.
- **Not logged:**
  - Dismissing a validation issue, or unticking the attestation.
  - Per-file detection reasons.
  - Export started, and errors.
  - User identity beyond the above.
  - A restore doesn't re-log files scanned or detection completed.
- **⚠ The audit log contains original file and folder names** (in corrections and subject names) and the study name. Those can identify patients. Keep it at the site; don't share it with the dataset.

## 11. Pre-processing guidance (in-app Pre-Processing page)

- dcm2niix commands with PHI-safe filename templates (`%p_%s`, never `%i` or `%n`).
- A conversion helper script (`public/docs/convert_dicom_auto.py`) with Siemens, GE and Philips branches.
- pydeface for defacing.
- The install scripts in `tools/` aren't referenced in the app.
- NeuroGate itself doesn't convert or deface anything.
