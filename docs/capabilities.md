# NeuroGate capability inventory

**This file is the single source of truth for what NeuroGate does.** Every user-facing document (GOV-001, SOP-BIDS-001, SOP-GUI-001, README) and every page in the app describes only what's listed here. When a feature is added or changed, update this file first, then the documents.

It was verified line by line against the code on 2026-09-30 (version 1.0.1 plus that day's changes) and updated for each release since; this revision is for 1.6.0 (2026-10-02). File references are relative to the repo root.

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
- **Project website:** <https://epilepsy-gui.vercel.app>, hosted on Vercel and redeployed automatically on every push to `main`. It serves the same pages and documents as the desktop app, and runs the same tool in the browser.
  - The browser version also processes everything on the visitor's computer. It has no upload code, so nothing is uploaded.
  - **Browser limits:** export is a ZIP download, files over 500 MB are left out (use the desktop app or CLI for those), files are held in memory, and there's no Install CLI button.
  - **Download page** (`/download`, linked as "Download" in the top navigation and footer; both links are hidden inside the desktop app): reads the latest release from GitHub's public API and links straight to the installer files, so visitors never need to use GitHub. It shows the version, release date, each file's size and per-platform install steps, and puts the visitor's detected system first. If the lookup fails, the buttons open the GitHub release page instead. Inside the desktop app the page says it updates itself.
- **The version** appears in the footer of the Home, Documentation, Pre-Processing and About pages.

## 2. Where processing happens

- **Everything runs on the user's computer.** No patient data is uploaded anywhere.
- **Local server:** the desktop app runs an in-process web server on `127.0.0.1:3001`, reachable only from the same computer, to serve its own pages.
- **The only network requests** are the update check (GitHub) and Google Fonts (`index.html`).
- The local server (`server/index.js`) only serves the app's pages. NeuroGate has no upload or remote processing code.

## 3. Workflow (GUI): 6 steps

The stepper labels are **Structure · Drop Files · Mapping · Metadata · Validate · Export** (`src/pages/ToolPage.tsx`). The stepper only shows progress and can't be clicked; the buttons at the bottom of each step move between steps.

**Going back:**
- **Metadata entries are kept** when you go back to Mapping or come back from Validate: prefix, starting number, study name, authors and the attestation. The attestation is kept only if the set of images that need defacing hasn't changed; otherwise it has to be ticked again. Coming back doesn't repeat audit entries: only values that changed are logged again.
- **Mapping → "Back to Drop Zone"** clears the files, the mapping, the Metadata entries and the saved progress. The chosen structure and the audit log are kept.
- **Export → Back to Validation** re-runs validation, which clears any dismissals.

### Step 1: Structure (`src/components/StructureSetupStep.tsx`, `src/types/sessionStructure.ts`)
- It first asks: "Does each subject have more than one session of data?"
  - **No** → **Single session**: no `ses-` level and no `sessions.tsv`.
  - **Yes** → choose one of:
    - **Implant sessions:** `ses-preimplant`, `ses-postimplant`, `ses-postsurgery`.
    - **Custom timepoints:** 1–24 timepoints. Each is a number 0–99 plus a unit: days, weeks, months, years, or "sessions (no time interval)".
      - Labels come out as `ses-2wk`, `ses-6mo`, `ses-1d`, `ses-1yr`, or `ses-1` for the "sessions" unit. 0 is shown as "(baseline)".
      - Timepoints are sorted by elapsed time (a month counts as 30 days, a year as 365), and duplicates are blocked.
- **Changing the structure later:** a **Change structure** link on Drop Files and a **Change structure** button on Mapping return to this step with the current structure selected.
  - If files have been added, it first asks "Change the structure?" (**Change structure and clear files** / **Keep working**). Changing clears the files, corrections, Metadata entries and saved progress; the audit log is kept.
  - **Cancel, keep the current structure** goes back without changing anything.
  - The change is logged as "Structure changed" (§10).
  - The page says: "You can change it later from the Drop Files or Mapping step; the files you've added are then cleared."

### Step 2: Drop Files (`src/components/FileDropZone.tsx`)
- Drag in a folder or files, or use the "browse folder" / "select files" links. Any folder layout works.
- OS junk (`.DS_Store`, `Thumbs.db`, dotfiles, `._` AppleDouble files, in-progress copy files) is dropped silently.
- **Memory use:**
  - **Desktop:** file contents aren't loaded into memory (only their locations), so files of any size work.
  - **Browser:** files up to 500 MB are cached in memory.
- **Saved progress** (browser tab storage, kept 12 hours): a "Saved progress from … ago" banner appears with **Discard**.
  - Adding the exact same folder again (same names, sizes and paths) restores the mapping automatically. Anything different discards it.
  - Metadata isn't saved across a reload.

### Step 3: Mapping (`src/components/MappingTable.tsx`)
- **Columns:** checkbox, Original File (BIDS path shown under it), Subject (free text), Session (dropdown; hidden for Single session), Modality (dropdown), Confidence.
- **Confidence badges:** High (green), Medium (yellow), Low (orange), Needs Review (red).
- **NIfTI header:** each image's dimensions are listed in its Detection Reasons, and a name that contradicts them (a 4D "T1w", a 3D "BOLD" or diffusion image) gets a WARNING reason there (§6).
- **Badges under the file name:** "Guessed: pick a modality to export" (orange), "Duplicate of …" (yellow), "Derived: …" (blue).
- **Row detail:** clicking a row shows its Detection Reasons and File Info.
- **Filters, with counts:** All, High, Medium, Low, Needs Review, Needs your decision.
- **Bulk edits:** "Set session…" / "Set modality…" with **Apply**, and **Clear selection**.
  - With Custom timepoints and 2 or more rows ticked, **Assign in order to timepoints** assigns them in the order they were ticked.
- **Audit log:** corrections are logged, and subject edits are logged per keystroke. Bulk edits are logged as a count.
- **Buttons:** "Back to Drop Zone", "Change structure" (Step 1) and "Continue to Metadata", which is always enabled.

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
- Session dates come from a dropped `sessions.tsv`, or from a sidecar's `AcquisitionDateTime` when the file sits in a `ses-<label>` folder. Session labels are matched against the chosen structure: its exact labels, with or without `ses-` (`ses-2wk`, `2wk`), and for Implant also keywords such as preop, monitoring or postop. Auto-filled dates aren't shown, but they're used by the date-order check and exported, shifted, in `sessions.tsv`.

**No demographics** (age, sex, handedness) are collected.

### Step 5: Validate (`src/components/ValidationStep.tsx`, `src/lib/validation/`)
- **Screen:** category cards that filter the list, a severity filter (All / Error / Warning / Info, with counts), "Dismiss this issue" in an expanded card, and **Re-run Checks** (which clears dismissals).
- **What blocks:** any error that hasn't been dismissed blocks "Continue to Export"; the button then reads "Fix N Errors to Continue". Most errors can't be dismissed, but the Implant required-file errors can.
- The checks themselves are listed in §7.

### Step 6: Export (`src/components/ExportStep.tsx`)
- The screen shows the output tree, subject/file counts and total size, plus a list of the metadata files NeuroGate generates.
- **Desktop app:**
  - **Export to Folder** opens a folder picker ("Export Here").
  - It creates `<PREFIX>_bids_export_<YYYY-MM-DD>` there (adding `-2`, `-3`, … if that name exists), containing `bids_output/`, `audit_log_<YYYY-MM-DDTHH-MM-SS>.json` (full log, keep at the site) and `audit_log_<YYYY-MM-DDTHH-MM-SS>_shareable.json` (see §10).
  - Files are streamed, with no size limit. It shows "Writing file N of M…", then the folder path with **Show Folder**. The button then reads **Export Again**.
- **Browser (project website):**
  - "Download" builds `<PREFIX>_bids_export_<date>.zip` (uncompressed, with `bids_output/` inside). A second "Download" saves it, and the two audit logs (full and shareable) download separately.
  - Files over 500 MB are **left out** and listed as not included.
- **Warning:** a file that couldn't be read (e.g. a cloud-only OneDrive file) triggers a "File not locally available" warning.

## 4. CLI (`src/cli/`)

**Prompts, in order:**
1. The source folder, if it wasn't given as an argument. Quotes around a pasted path are removed.
2. Structure: Implant (default), Custom, or Single. For Custom it asks for the number of timepoints (1 to 24), then each number (a whole number from 0 to 99) and unit, asking again on invalid answers and if two timepoints resolve to the same label.
3. Prefix (asked again until valid) and starting number.
4. Study name.
5. Authors (asked again until at least one is given).
6. Defacing y/n, required, asked only when structural MRI is present.
7. Output folder. The default is `<PREFIX>_bids_export` next to the source folder. It isn't made unique.

**Output:** it writes `<out>/bids_output/`, `<out>/audit_log.json` (full) and `<out>/audit_log_shareable.json`, streaming every file with no size limit. Symlinks are skipped.
- `participants.tsv` and `sessions.tsv` list only subjects and sessions with exported data, as in the GUI.
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
| `.json` | Sidecar, paired with the data file of the same base name in the same folder. |
| `.edf`, `.bdf` | Scalp EEG or iEEG, told apart by the channel labels in the EDF header. |
| `.nwb`, `.dat`, `.lay` | iEEG. Every `.dat` counts as Persyst. A `.lay` is rewritten on export (§8). |
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
   - The NIfTI header (`src/lib/detection/niftiHeaderReader.ts`) doesn't pick a modality by itself, but it's read for every `.nii` / `.nii.gz` (NIfTI-1 and NIfTI-2, header bytes only, never the image data). It gives the dimensions and number of volumes, used for the warnings in Mapping, the T1w fallback and PET framing below.
8. Subject grouping.
9. For Custom timepoints: date clusters and folder clusters.

**Fallback:** an unidentified `.nii.gz` defaults to T1w, marked as a guess and not exported until the user picks a modality. It isn't defaulted when its header shows more than one volume (a series such as fMRI, diffusion or dynamic PET); it stays Other / Unknown with the reason "Not defaulted to T1w". An unidentified `.nii` stays Other / Unknown.

**Naming details:**
- **Entity order:** `sub_ses_task_trc_rec_run_desc_part_suffix`.
- **Repeated acquisitions:** `run-N`.
- **Siemens MoCoSeries:** `rec-moco`.
- **Magnitude/phase pairs:** `part-mag` / `part-phase`.
- **Single-band references:** `_sbref`.
- **Scanner-derived maps** (ADC, FA, TRACEW, mIP): placed under `derivatives/scanner/` with `desc-<map>`.
- **Series converted twice** (a bare name plus dcm2niix's decorated `_<name>_<digits>_<n>` in the same folder): the decorated copy is kept and the bare copy isn't exported.
- **Leftover collision:** a name collision that survives all of this is renamed `…_dup-N` and reported in Validate as an error (§7), so it must be resolved before export.
- **`IntendedFor`** (`src/lib/bids/intendedFor.ts`): each exported field-map sidecar lists every EPI image exported in the same session (the images in `func/`, `dwi/` and `perf/`, single-band references included), as paths relative to the subject folder. An `IntendedFor` already in a source sidecar is replaced; on any other sidecar it's removed, since it names the original files.
  - It isn't matched by phase-encoding direction or by scan; a field map meant for only some of a session's scans has to be edited after export.
- **Not set:** task labels can't be changed.

**PET specifics** (`src/lib/detection/petVocabulary.ts`):
- **Detection:**
  - From the sidecar: `Modality: "PT"` or PET-only fields (TracerName, TracerRadionuclide, InjectedRadioactivity, RadionuclideHalfLife, …).
  - From names: PET, PETCT, PETMR, `trc-`, amyloid, tau-pet, and tracers FDG, PiB, florbetapir/AV45/Amyvid, florbetaben/FBB/Neuraceq, flutemetamol/Vizamyl, flortaucipir/AV1451/Tauvid, MK6240, PI2620, RO948, UCB-J, flumazenil/FMZ, FDOPA, raclopride.
- **`trc-<tracer>`** comes from the sidecar TracerName, or from the name. An unrecognized TracerName is kept (letters and digits only, up to 24 characters). It's left out when no tracer is found.
- **`rec-acstat` / `rec-nacstat` / `rec-acdyn` / `rec-nacdyn`:** used only when a session has both attenuation-corrected and uncorrected ("NAC") images. Dynamic means more than one frame (from the sidecar, or, without one, more than one volume in the NIfTI header); `rec-ac` / `rec-nac` are used when the framing is unknown, and an image that doesn't say is treated as corrected.
- **Attenuation CT:** a CT named CTAC / AC_CT / mu-map, or any CT inside a PET study folder, is the attenuation CT and isn't exported. The user can change it to CT.
- **Tracer names aren't subjects:** names like AV45 or MK6240 are never read as subject IDs.
- **Defacing:** PET isn't covered by the defacing requirement.

## 7. Validation checks (`src/lib/validation/`)

**BIDS structure:**
- **Errors (can't be dismissed):** no session assigned; subject has no BIDS ID; two files would get the same name (one was renamed `_dup-N`); a sidecar that would be exported isn't valid JSON, so it can't be de-identified.
- **Warnings:** files whose modality is only a guess and won't be exported (one per subject, listing them); unclassified file (not exported); orphaned JSON sidecar (not exported); duplicate sidecar; unmatched `.bval`/`.bvec`.
- **Info:** special characters in a name; same series present twice.

**PHI in file and folder names:**
- **Errors (can't be dismissed):** SSN; MRN (with an MRN/MR# prefix, 5–10 digits); a date-of-birth marker followed by digits; `patient|pt|subj|subject` followed by First Last; a subject group that looks like a person's name.
- **Warnings:**
  - Phone number, email, MM/DD/YYYY or MM-DD-YYYY dates, "Last, First".
  - The first match of these keywords: firstname, lastname, fullname, patientname, ssn, social_security, address, street, zipcode, insurance, policy_number, accession, acc_num (underscore variants included).
- **Sidecar content:** every string field that isn't already de-identified (nested objects included) is scanned with the same patterns, plus a two-capitalised-words name check (warning).
- **Table contents:** every cell of each exported TSV (electrodes, channels, events and others) is scanned with the same patterns and keywords. Purely numeric cells are skipped, and so is the two-capitalised-words name check, which would flag event labels such as "Seizure Onset". Tables are exported unchanged, so a finding has to be fixed in the source file.
- **NIfTI header text:** the free-text `descrip` (80 bytes) and `aux_file` (24 bytes) fields of each exported image are scanned with the same patterns plus the name check. dcm2niix's own `key=value` entries (such as `TE=96;Time=101502.425`) are ignored. The header is exported unchanged, so a finding has to be fixed in the source file.
- **Not checked for PHI:** an EDF header that looks identifying is shown only as a warning in Mapping's detection reasons (the header itself is always de-identified on export, §8).

**Required files (Implant sessions only):**
- Checked for each session where the subject has files. Only files that will be exported count, so a guessed or redundant file doesn't satisfy a requirement.
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

**Consistency** (`src/lib/validation/consistencyChecker.ts`; all can be dismissed):
- **channels.tsv against electrodes.tsv** (in the same exported folder): an electrode channel with no contact of the same name in the electrodes table is a warning, listing the names (up to 12) and pointing out names that differ only in letter case. Electrode channels are those of type SEEG, ECOG or DBS in `ieeg/` and EEG in `eeg/`; without a `type` column, every channel except ECG, EMG, EOG, trigger, status and similar names is checked. A bipolar channel (`LA1-LA2`) passes when both contacts are listed. An electrodes table without a `name` column is a warning.
- **Persyst pairs:** an exported `.dat` with no `.lay` of the same name in the same folder, or the reverse (warning).
- **A dropped sessions.tsv** (Implant and Custom timepoints): rows whose session matches none of the structure's sessions (warning: their dates aren't used); sessions listed with no exported files (info); sessions with files that the table doesn't list (info).

**Metadata:**
- Missing dataset name, authors or prefix, and a missing defacing attestation, are errors. In the GUI the Metadata step already prevents them.
- **Other checks:** sparse dataset (warning); empty dataset (error).

**Not checked:**
- Per-modality required JSON fields (other than PET).
- NIfTI dimensions beyond the warnings in Mapping (nothing in Validate checks them).
- iEEG minimum duration.
- Scanner or site consistency.
- The official bids-validator isn't run.

## 8. De-identification on export (`src/lib/deidentify/`)

- **Date shift:** each subject gets one random shift of −365 to +365 days (0 is possible), applied to EDF headers, JSON sidecars and `sessions.tsv` `acq_time`. The shift value isn't recorded anywhere.
- **EDF/BDF headers:**
  - **Patient field:** becomes `<sub-ID> X X X` if it has EDF+ structure (4+ parts), otherwise `X X X X`.
  - **Recording field:** in EDF+ "Startdate" form, the date is shifted and admin/technician codes become X. Otherwise only `dd-MMM-yyyy` dates in it are shifted and other text is kept.
  - **Start date:** shifted. The start time is unchanged.
  - **Not changed:** dates that can't be parsed. Files under 256 bytes are copied as-is.
- **EDF+/BDF+ annotations** (the "EDF Annotations" / "BDF Annotations" signal, `src/lib/deidentify/edfStructure.ts`):
  - Identifying text is replaced with X in place, at the same byte length: the patient's code, name parts and birth date and the recording's admin/technician codes (taken from the original header), plus SSNs, MRNs, dates, phone numbers and email addresses.
  - Event text such as "Seizure onset", every timestamp, the time-keeping entries, signal samples and the file size are unchanged.
  - The per-signal transducer and prefiltering fields are checked for the patient's name and ID only.
  - Both export paths (browser and streaming) give byte-identical results. The number of redactions is in the de-identification summary; the text itself is never recorded.
- **Persyst `.lay`** (`src/lib/deidentify/persystLayDeidentifier.ts`):
  - `File=` is pointed at the paired `.dat`'s exported name, so the renamed pair stays linked.
  - `[Patient]` keeps only Sex, Hand and TestTime; TestDate is shifted; every other key (name, ID, birth date, physician, ...) is removed.
  - `[Comments]` event text is redacted with the annotation rules above; times and durations are unchanged.
- **JSON sidecars:**
  - **Set to "X"** (any non-empty value): PatientName, PatientID, PatientBirthDate, PatientAddress, PatientTelephoneNumbers, OtherPatientIDs, OtherPatientNames, InstitutionName, InstitutionAddress, InstitutionalDepartmentName, ReferringPhysicianName, PerformingPhysicianName, RequestingPhysician, OperatorsName, StationName, DeviceSerialNumber.
  - **Date-shifted:** AcquisitionDateTime, AcquisitionDate, StudyDate, SeriesDate, ContentDate, InstanceCreationDate, ScanDate, RadiopharmaceuticalStartDateTime. A date in an unrecognized format is blanked.
  - These fields are handled at any depth: nested objects and arrays are walked too.
  - A sidecar that isn't a JSON object (invalid JSON, null, an array) can't be de-identified: validation blocks it (§7) and export refuses to copy it.
- **`sessions.tsv` `acq_time`:** shifted and written as ISO 8601. A value that can't be shifted becomes `n/a`.
- **Not de-identified:**
  - NWB, Persyst `.dat` and NIfTI header text (the NIfTI text is PHI-scanned, §7).
  - The contents of electrodes, channels, events and other TSVs (these are PHI-scanned, §7).
  - Free-text sidecar fields (these are PHI-scanned, §7).
  - Image pixels. Defacing is done before NeuroGate and attested.

## 9. Output (`src/lib/bids/exporter.ts`)

```
bids_output/
  dataset_description.json   Name, BIDSVersion, DatasetType, Authors,
                             GeneratedBy (NeuroGate, app version, structure used)
  participants.tsv           participant_id only (subjects with exported data)
  primary/
    sub-<ID>/
      sub-<ID>_sessions.tsv  session_id, acq_time for sessions with exported data
                             (not for Single session)
      ses-<label>/<datatype>/...
  derivatives/scanner/       only when scanner-derived maps exist
                             (no dataset_description.json of its own)
```

No `participants.json`, `README` or `CHANGES` is generated.

**This is NeuroGate's own BIDS-based layout, by design.** File names, entities, datatype folders and sidecars follow BIDS conventions, but the root layout deliberately differs from the official BIDS specification: subjects sit under `primary/` and scanner-derived maps under `derivatives/scanner/`. The official BIDS validator expects subjects at the dataset root, so it doesn't apply to the dataset as a whole. The layout is defined in SOP-BIDS-001. In the GUI, subjects are numbered in the order they were detected.

## 10. Audit log (`src/lib/audit/`, `src/types/audit.ts`)

- **Format:** JSON.
  - **Header:** session start, tool version, exported at/by, total entries, action counts.
  - **Entries:** `{id, timestamp, actor, action, summary, details}`. The actor is "user" or "system" in the GUI, and the OS username in the CLI.
- **Where it lives:**
  - **Audit Log button (tool header, with an entry count):** opens a panel with **Export JSON** and **Export CSV**, available at any time.
  - The log lasts for the whole app session, including across Back to Drop Zone, Change structure and additional datasets.
  - **Closing with an unsaved log asks first:** when the log has entries that no saved copy includes (an export, or Export JSON / CSV; choosing a structure alone doesn't count), closing the desktop app's window or quitting shows "This session's audit log hasn't been saved" with **Keep Open** / **Close Without Saving**. A browser tab shows the browser's own leave-page prompt (which also appears on a reload).
  - **Kept across a reload** (`src/lib/audit/auditPersistence.ts`): the log is saved to tab storage after every change and restored when the page reloads, with a "Page reloaded; audit log restored" entry; numbering continues. Closing the tab or quitting the app clears it, so export it before closing. If tab storage is unavailable or full, it isn't saved.
- **What's logged:**
  - **Setup:** structure selected, structure changed (from → to), files scanned, session restored.
  - **Detection:** detection completed (counts).
  - **Mapping:** session, modality and subject corrections (old → new); bulk applies (count).
  - **Metadata:** institution configured, subject sessions, dataset description (when leaving Metadata; after going back, only what changed).
  - **Defacing attestation** (when it changes): ticked (with the number of structural MRI files it covers), unticked, or cleared on return because the structural MRI files changed.
  - **Validation:** each dismissed issue (severity, category, title and affected files; never the description, which can quote the matched text); Re-run Checks when it brings dismissed issues back (count); validation passed (on Continue to Export, GUI, with the issues dismissed at that point); validation run (CLI).
  - **Export:** export completed (GUI); de-identification summary (fields stripped or shifted, whether EDF PHI was found, annotation and `.lay` redaction counts; no shift values or redacted text); audit exported. The "audit exported" entry is written after the file, so it isn't in the file.
- **Not logged:**
  - Per-file detection reasons.
  - Export started, and errors.
  - User identity beyond the above.
  - A restore doesn't re-log files scanned or detection completed.
- **⚠ The full audit log contains original file and folder names** (in corrections and subject names) and the study name. Those can identify patients. Keep it at the site; don't share it with the dataset.
- **Shareable copy** (`src/lib/audit/auditRedaction.ts`), written with every export: each original file name and path is replaced by its exported BIDS path (or `file-N` if it wasn't exported), each subject group by its assigned `sub-` ID (or `subject-N`), and the operator by "site". Matching is word-bounded. Everything else is the same as the full log. This is the copy to send with a dataset. The audit panel's Export JSON / CSV buttons still save the full log.

## 11. Pre-processing guidance (in-app Pre-Processing page)

- dcm2niix commands with PHI-safe filename templates (`%p_%s`, never `%i` or `%n`).
- A conversion helper script (`public/docs/convert_dicom_auto.py`) with Siemens, GE and Philips branches.
- PET2BIDS (`pip install pypet2bids`, `dcm2niix4pet`) for PET conversion with complete PET sidecars; `ecatpet2bids` for ECAT.
- pydeface for defacing (T1w, T2w, FLAIR, PDw, T2*w).
- Install commands: Homebrew, apt, dnf and conda-forge for dcm2niix, and the prebuilt binary on Windows. FSL comes from its official installer.
- The install scripts in `tools/` aren't referenced in the app.
- NeuroGate itself doesn't convert or deface anything.
