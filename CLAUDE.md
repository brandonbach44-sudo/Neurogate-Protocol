# CLAUDE.md — Epilepsy Data Uploader GUI

> This file is auto-loaded by Claude Code for every conversation in this repo. It contains everything Claude needs to know to work effectively on this project. Keep it current as the project evolves.

---

## Project Overview

A web-based tool that helps research staff at multiple epilepsy study sites organize their neuroimaging data into BIDS-compliant format, validate it against a governance framework, and upload it to their site's Pennsieve workspace.

This is **Phase 3 / Deliverable 3** of a UPenn MRA capstone project titled *"Standardized Protocols for Multimodal Data Sharing Across Sites in Epilepsy."* The governance framework (Deliverable 1) is the lead deliverable — the GUI exists to make that framework easy to follow.

**Timeline:** Active development April 2026 – December 2026. Functional prototype target: Fall 2026.

---

## Target Users

Research coordinators, study coordinators, and research staff at participating epilepsy study sites (e.g., CHOP, Penn). Most are **not technically trained** — no command line, no Python, no Docker. They should be able to open a web page, drag in a folder, and follow the wizard.

This constraint drives almost every design decision. If a feature requires technical knowledge to use, it needs a different design.

---

## What the Tool Does (End-to-End)

1. User visits a web URL (no install).
2. User authenticates to their site's Pennsieve workspace.
3. User drops a parent folder containing many patient folders (e.g., 20+ subjects).
4. Tool auto-scans files, proposes BIDS subject IDs and modality classifications.
5. User reviews/corrects a mapping table inline.
6. User fills out required metadata forms (per-subject or bulk-apply).
7. User attests defacing was performed (checkbox + audit log entry).
8. Tool validates: BIDS compliance, required metadata, PHI in filenames, cross-session consistency within the batch.
9. User reviews error/warning summary; fixes issues; re-validates.
10. Tool uploads the BIDS tree to the site's Pennsieve dataset (one dataset per site, many subjects inside).
11. Tool exports an ALCOA+ audit log of the upload.

---

## Architecture

### Tech Stack (planned)

- **Frontend:** React + Vite + TypeScript
- **Styling:** TailwindCSS (simple, avoids CSS bikeshedding)
- **BIDS Validation:** `bids-validator` npm package (runs in browser)
- **NIfTI inspection:** `nifti-reader-js` (read headers for sanity checks)
- **DICOM inspection (if needed):** `dcmjs` — only for metadata reading, NOT for DICOM→NIfTI conversion
- **Large table rendering:** `react-window` (virtualized scrolling for 100s of files)
- **State management:** React context + hooks for v1; Zustand if complexity grows

### Upload Architecture — TBD

The upload path is the one architectural piece not yet settled. Three options are documented in `docs/architecture.md`. The current plan is **Option A (thin backend proxy)** unless the Pennsieve team confirms direct browser uploads are supported.

**Important design principle:** Keep upload logic behind an abstract interface like `uploadToDestination(bidsTree, credentials)`. The rest of the app should not know or care which upload path is used. This lets us build ~80% of the app without resolving the upload question.

### Deployment

- Frontend: static hosting (Vercel, Cloudflare Pages, or GitHub Pages)
- Backend (if Option A): minimal serverless function (Cloudflare Workers or Vercel Functions)
- No database needed — all state is per-session in the browser

---

## Key Constraints (Don't Break These)

1. **Client-side preference.** Everything that *can* run in the browser *should* run in the browser. Only the final Pennsieve upload step may require a backend.
2. **Streaming for large files.** MRI sessions can be multi-GB. Never load a whole imaging file into a JS variable. Use the File API's `.slice()` for chunked reads.
3. **User responsibilities we do NOT replicate:**
   - Sites convert DICOM → NIfTI themselves before using the tool. We validate they did.
   - Sites deface/de-identify structural MRI themselves. We require attestation + log it.
   - Sites pick their own subject starting counter (e.g., "I've uploaded 15 patients, start at 16"). We do not query Pennsieve for the counter in v1, but may add that in v2.
4. **PHI never persists.** No user data is stored server-side. No logs contain PHI. Session storage only.
5. **Audit log everything.** Every validation result, every user action, every upload goes into an ALCOA+ compliant audit log that the site exports after upload.

---

## BIDS + Pennsieve Structure

**Pennsieve layout:**
- **Workspace** = one per institution (e.g., "CHOP Workspace")
- **Dataset** = one per site's epilepsy study, containing many patients
- **Inside the dataset** root = `primary/` (sites' contributions) and `derivatives/` (Penn-only processing outputs — sites NEVER touch this)

**Dataset root files (in the Pennsieve dataset root):**
- `dataset_description.json` — generated by the tool on first upload from user-supplied study name, authors, funding, BIDS version
- `participants.json` — schema for the participants table
- `participants.tsv` — list of all subjects with demographics, appended on each upload
- `derivatives/` — IGNORED by the tool; Penn-managed

**Per-subject layout (3 clinical sessions per patient):**
```
primary/
  sub-CHOP001/
    sub-CHOP001_sessions.tsv     # session metadata (date, age at visit)
    ses-preimplant/              # baseline pre-surgical
      anat/                      # T1w, T2w
      dwi/                       # diffusion MRI
      eeg/                       # scalp EEG
      fmap/                      # field maps
      func/                      # functional MRI (BOLD)
    ses-postimplant/             # intracranial monitoring
      ct/                        # CT with electrodes
      ieeg/                      # intracranial EEG + electrodes.tsv
    ses-postsurgery/             # post-resection
      anat/                      # post-op T1w
```

**Critical session names:** sessions are NOT numbered. They use clinical labels:
- `ses-preimplant` — baseline pre-surgical evaluation
- `ses-postimplant` — intracranial monitoring (CT + iEEG)
- `ses-postsurgery` — post-resection imaging

**Subject ID convention:** `sub-{INSTITUTION_PREFIX}{3-digit-counter}` — e.g., `sub-CHOP001`, `sub-PENN042`. Counter scoped per institution. Starting number is user-supplied. Zero-padded to 3 digits minimum.

**Source of truth:** `SOP_BIDS_Data_Structure.docx` (SOP-BIDS-001). When in doubt, defer to that document. Update `docs/governance-requirements.md` whenever the SOP changes.

---

## Validation Requirements

The tool's validation is its primary differentiator. Be thorough here.

**Structural:**
- BIDS folder hierarchy matches spec
- Filenames match BIDS regex (e.g., `sub-CHOP001_ses-01_T1w.nii.gz`)
- Required modalities present per session (per governance framework)

**Metadata:**
- Every JSON sidecar present and valid JSON
- Every required field populated (no blanks)
- Field types correct (numbers are numbers, not strings)

**PHI:**
- Filename scan for name-like patterns, DOBs, MRN-like strings
- DICOM tag scrub if any `.dcm` files slipped through

**Content:**
- NIfTI headers open without error
- Dimensions reasonable (non-zero, non-absurd)

**Cross-session consistency (within the batch):**
- Same subject ID across ses-01/02/03
- Acquisition dates in chronological order
- Metadata that should be constant (site, scanner model) doesn't contradict

**Defacing:**
- Attestation checkbox + timestamp + tool used, logged to audit trail
- Optional v2 enhancement: low-res T1 preview for visual confirmation

---

## UX Principles

1. **One screen at a time.** Wizard flow beats a dashboard for non-technical users.
2. **Inline corrections everywhere.** If the tool guesses wrong, the user should fix it on the same screen in one click — not navigate elsewhere.
3. **Clear progress indicator.** User should always know what step they're on and how many remain.
4. **No dead-ends.** Every error message has a "fix this" action that jumps to the right place.
5. **Preview before commit.** Nothing is uploaded or written until the user clicks the final button.
6. **Bulk operations.** "Apply modality X to all matching files" saves huge time for large batches.

---

## File Structure (current)

```
/
  src/
    components/
      FileDropZone.tsx          # Drag-and-drop folder input
      FileList.tsx              # Scanned file table display
      MappingTable.tsx          # Detection results review table
      MetadataStep.tsx          # Tabbed metadata interface
      SubjectMetadataForm.tsx   # Per-subject session date/age form
      DatasetDescriptionForm.tsx # BIDS dataset_description.json form
      DefacingAttestation.tsx   # HIPAA defacing confirmation
      ValidationStep.tsx        # Validation results display
    hooks/                     # Custom React hooks
    lib/
      detection/
        extensionDetector.ts   # Layer 1: file extension mapping
        filenameDetector.ts    # Layer 2: filename keyword patterns
        folderDetector.ts      # Layer 3: folder path analysis
        neighborInference.ts   # Layer 4: co-located file context
        subjectGrouping.ts     # Layer 5: subject group detection
        engine.ts              # Detection pipeline orchestrator
        index.ts               # Public exports
      metadata/
        tsvReader.ts           # TSV/JSON metadata auto-fill
        index.ts               # Public exports
      validation/
        bidsValidator.ts       # BIDS structure checks
        phiScanner.ts          # PHI pattern detection
        requiredFilesChecker.ts # Per-session required files
        crossSessionChecker.ts # Cross-session consistency
        engine.ts              # Validation orchestrator
        index.ts               # Public exports
      pennsieve/               # Upload abstraction (TBD)
      audit/                   # ALCOA+ audit log generator (TBD)
    types/
      files.ts                 # ScannedFile type + formatFileSize util
      detection.ts             # Detection engine types
      metadata.ts              # Metadata types & defaults
      validation.ts            # Validation types & report
    App.tsx                    # Main app shell & wizard state machine
    main.tsx
    index.css                  # Tailwind import + Penn Blue theme vars
  CLAUDE.md                    # This file
  package.json
  vite.config.ts
  tsconfig.json
```

---

## Build Status & Next Steps

**Completed (April 2026):**
- [x] Project scaffolded: React 19 + Vite + TypeScript + TailwindCSS
- [x] Folder structure created per architecture plan
- [x] FileDropZone component: drag-and-drop + click-to-browse folder input
- [x] FileList component: displays scanned files with path and size
- [x] App shell with Penn Blue header + 5-step wizard indicator
- [x] GitHub repo live: github.com/brandonbach44-sudo/Epilepsy_GUI
- [x] Clickable HTML prototype (11 screens)
- [x] Governance requirements extracted from SOP-BIDS-001
- [x] Auto-detection engine (5-layer scoring pipeline): extension → filename → folder → neighbor → subject grouping
- [x] MappingTable component: editable session/modality dropdowns, confidence badges, bulk operations, expandable detection reasons
- [x] Metadata forms (4 tabs): Institution Setup, Subject Sessions, Dataset Description, Defacing Attestation
- [x] TSV/JSON auto-fill: reads sessions.tsv and dataset_description.json from dropped files
- [x] Validation engine (4 checkers): BIDS structure, PHI scanning, required files, cross-session consistency
- [x] ValidationStep UI: pass/fail banner, category cards, severity filters, expandable issues, dismissable warnings

**Next up:**
- [ ] Upload to Pennsieve (pending Pennsieve team meeting outcome)
- [ ] ALCOA+ audit log export

**Key design decision (auto-detection):**
Site data will NOT arrive in BIDS-compliant format. Folder names and file names vary wildly between sites. The auto-detection engine must handle arbitrary folder structures by scoring multiple clues (file extension, filename keywords, folder name keywords, co-located file types) and always falling back to "unclassified" when confidence is low. The mapping table is the safety net — the detector saves time, the user has final say.

---

## Anti-Goals (What We Are NOT Building)

- A general-purpose BIDS tool — scope is epilepsy-specific modalities only.
- A DICOM→NIfTI converter — sites do this themselves.
- A defacing tool — sites do this themselves.
- A clinical data repository — Pennsieve is that.
- A statistical analysis tool.
- A mobile app.
- An iOS native app (despite the user's general React Native preference, this specific project is web-based).

---

## Related Documents

- Governance framework: `/Capstone Project/Regulatory_Governance_Framework.docx` (document ID: GOV-001)
- Capstone proposal: `/Capstone Project/Capstone_Proposal_V2.docx`
- Pennsieve upload architecture options: `/Capstone Project/Pennsieve_Upload_Architecture_Options.docx`
- Extracted governance requirements for coding: `docs/governance-requirements.md`
- Architecture & upload options: `docs/architecture.md`

---

## Development Conventions

- **Language:** TypeScript everywhere in `src/`. No untyped JS.
- **Component style:** Function components with hooks. No class components.
- **Testing:** Vitest for unit tests, Playwright for end-to-end (when we get there).
- **Commits:** Short, descriptive. Reference governance section if relevant (e.g., "Add PHI filename scan per GOV-001 §5").
- **Comments:** Comment *why*, not *what*. Code explains what.

---

## People & Context

- **Developer:** Brandon Bach (bach2@seas.upenn.edu) — UPenn MRA student
- **Capstone advisor:** Nishant Sinha, PhD — Penn Epilepsy Center
- **Governance philosophy:** Governance-first — framework leads, tools follow. Compliance is the point.

---

## How to Work on This Project with Claude

When starting a session, Claude should:
1. Read this file (auto-loaded).
2. Read `docs/governance-requirements.md` if touching validation or metadata.
3. Read `docs/architecture.md` if touching upload, backend, or deployment.
4. Ask clarifying questions before writing code if requirements are ambiguous.
5. Default to small, reviewable changes rather than large rewrites.
6. Favor library solutions (`bids-validator`, `nifti-reader-js`) over custom implementations of standard things.
