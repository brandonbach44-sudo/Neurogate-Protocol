# NeuroGate

A desktop tool and governance framework for organizing multi-site neural data into a BIDS-based dataset, ready for sharing through cloud or on-premise data infrastructure toward a learning health system. "Neural data" covers structural and functional MRI, CT, PET, diffusion, perfusion, field maps, scalp EEG and intracranial EEG.


**Website:** https://epilepsy-gui.vercel.app hosts these pages and documents and a browser version of the tool. It also processes everything locally, but can't export files over 500 MB; use the desktop app or CLI for those. It redeploys automatically on every push to `main`.
## Status

Beta, in active development. The tool works; the documentation is a draft pending review.

## What It Does

Anyone at a site can organize a folder of patient data on their own computer, without coordinating through a central team. NeuroGate is a desktop app for macOS (Apple Silicon only), Windows and Linux, plus a command-line tool (`neurogate`) bundled with it. **Everything runs locally; no patient data is uploaded anywhere.**

The desktop app walks through six steps:

1. **Structure:** choose one of three session-structure presets: **Single session** (no `ses-` level), **Implant sessions** (`ses-preimplant`, `ses-postimplant`, `ses-postsurgery`), or **Custom timepoints** (1–24 timepoints such as `ses-2wk`, `ses-6mo`).
2. **Drop Files:** drag in a folder in any layout. Files are scanned in place.
3. **Mapping:** NeuroGate detects each file's subject, session and modality (T1w, T2w, FLAIR, PDw, T2*w, MR angiography, CT, PET, diffusion, perfusion/ASL, functional MRI, field maps, scalp EEG, iEEG, and electrodes/channels/events tables) and proposes a BIDS name. You can correct any of it inline.
4. **Metadata:** institution prefix (for `sub-<PREFIX>001` IDs), study name, authors, and a defacing attestation when structural MRI is present.
5. **Validate:** checks BIDS structure, PHI in file and folder names and in sidecar text, required files (Implant sessions), cross-session consistency, PET sidecars and metadata completeness. Errors block export.
6. **Export:** writes a `bids_output/` folder plus a JSON audit log to a folder you choose. Files are streamed, so there's no size limit.

The export layout is NeuroGate's own BIDS-based structure: files follow BIDS naming conventions, but the root layout (`primary/sub-*`, `derivatives/scanner/`) deliberately differs from the official BIDS specification, so the official bids-validator doesn't apply to the dataset as a whole. NeuroGate's own Validate step is the check that must pass.

On export, EDF/BDF headers, JSON sidecars and `sessions.tsv` dates are de-identified: identifying fields are replaced with `X`, and dates are shifted by one random offset per subject. NWB, Persyst, NIfTI header text, TSV table contents and image pixels are **not** de-identified. Sites convert DICOM to NIfTI and deface structural MRI before using NeuroGate; the tool records a defacing attestation but doesn't deface anything. Uploading the exported folder to the site's data infrastructure is outside the tool.

The audit log records setup, detection, mapping corrections, metadata, validation and export. It contains original file and folder names, so keep it at the site and don't share it with the dataset.

See [`docs/capabilities.md`](./docs/capabilities.md) for the full, exact list of what NeuroGate does and doesn't do.

## Download

Download it from the website's Download page, <https://epilepsy-gui.vercel.app/download>, which always offers the latest release with install steps for each system. The same files are on GitHub: <https://github.com/brandonbach44-sudo/Neurogate-Protocol/releases/latest>

| Platform | File |
|---|---|
| macOS (Apple Silicon only) | `NeuroGate-<version>-arm64.dmg` |
| Windows | `NeuroGate-Setup-<version>.exe` |
| Linux | `NeuroGate-<version>.AppImage` |

The builds aren't code-signed (the macOS build is ad-hoc signed only), so the first launch needs one extra step:

- **macOS:** open NeuroGate once. When macOS says it can't verify the developer, click **Done**, go to **System Settings → Privacy & Security** and click **Open Anyway**.
- **Windows:** if SmartScreen warns, click **More info → Run anyway**.
- **Linux:** `chmod +x NeuroGate-*.AppImage`, then run it.

Installed copies check for a newer release on every launch. On Windows and Linux NeuroGate asks, downloads the update, then asks to restart (choosing "Later" installs it on quit). On macOS it asks, then opens the release page so you can download the new `.dmg` and drag it into Applications.

## CLI

The CLI ships inside every desktop build. Click **Install CLI** in the app's top navigation bar (Home, Documentation, Pre-Processing and About pages) to copy it into the app-data `bin` folder. On Windows that folder is added to your user PATH; on macOS and Linux the app shows the folder to add to your PATH yourself.

```bash
neurogate <folder>
```

It then prompts for:

1. The source folder, if you didn't pass one.
2. The structure: Implant (default), Custom (number of timepoints, then each number and unit), or Single.
3. Institution prefix and starting number.
4. Study name.
5. Authors.
6. Defacing confirmation (y/n), only when structural MRI is present.
7. Output folder (default `<PREFIX>_bids_export` next to the source folder).

Output:

```
<out>/
  bids_output/
    dataset_description.json
    participants.tsv
    primary/sub-<ID>/...
    derivatives/scanner/...   (only when scanner-derived maps exist)
  audit_log.json
```

**Held-back subjects:** a subject with validation errors is held back and the rest are exported. Errors not tied to a subject (missing metadata or attestation, PHI errors, an empty dataset) block the whole export and exit with code 1. Warnings don't stop the CLI; it exports and then lists them. The CLI has no per-file corrections; use the desktop app for those.

## Development

Requires Node.js 20.19 or later (Vite 8's minimum). See [`SETUP.md`](./SETUP.md) for first-time setup.

```bash
npm install
npm run dev                # web UI in the browser (Vite, http://localhost:5173)
npm run electron:dev       # full frontend build + desktop export bundle, then the desktop app
npm run electron:dev:fast  # desktop app on the Vite dev server, with hot reload
npm run cli -- <folder>    # CLI from the TypeScript source
```

Tests (all run on synthetic fixtures in `demo-data/` or on in-memory data):

```bash
npm run regression       # regression.ts, regression_deidentify.ts, regression_flywheel.ts,
                         # regression_generalization.ts, regression_pet.ts, regression_docs.ts
npm run verify:export    # streaming export writer and EDF de-identifier
npm run verify:cli       # CLI pipeline end to end
npm run verify:adapter   # NodeFileAdapter scans identically to the browser File path

npm run desktop:bundle
npx tsx verify_desktop_export.ts           # desktop folder export, against the bundled file
npx tsx verify_desktop_export.ts --large   # same, with a 600 MB EDF
```

`regression_docs.ts` checks that each version in `src/docVersions.ts` matches the `| **Version** |` row of its `public/docs/*.md` file. `npm run regression:update` rewrites the golden snapshots (detection, de-identification, Flywheel suites) after an intended behavior change.

## Releasing

1. Bump `version` in `package.json`, commit, and push to `main`. That's the only place the version is set: `src/version.ts` reads it at build time, and it appears in the page footer, `dataset_description.json` `GeneratedBy` and the audit log header.
2. Tag and push the tag:

   ```bash
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```

The **Release desktop app** workflow (`.github/workflows/release.yml`) then:

- fails unless the tag matches `package.json`'s version;
- on Windows, macOS and Linux runners, runs `npm ci`, `npm run regression`, the frontend build, the CLI binary build and the desktop export bundle, then `electron-builder --publish always` into a **draft** GitHub Release;
- once all three platforms have uploaded, adds download and first-install notes and publishes the release as latest.

A manual `workflow_dispatch` run leaves the release as a draft. Installed apps only see published releases, and update as described under [Download](#download).

## Documentation

User-facing documents live in `public/docs/` and are shown on the app's Documentation page:

- GOV-001 v2.1: Regulatory and Governance Framework
- SOP-BIDS-001 v3.1: BIDS Data Structure
- SOP-GUI-001 v3.0: NeuroGate Compliance Tool User Guide

The versions shown on the Documentation page come from `src/docVersions.ts`. When you bump a document's version (its `| **Version** |` row), update `src/docVersions.ts` too, or `npm run regression` (and so the release) fails.

Internal developer notes:

- [`docs/capabilities.md`](./docs/capabilities.md): the single source of truth for what NeuroGate does. **Whenever behavior changes, update this file first**, then the documents above and this README.
- [`docs/architecture.md`](./docs/architecture.md): how the desktop app, CLI and shared libraries fit together.
- [`docs/governance-requirements.md`](./docs/governance-requirements.md): validation rules extracted from the governance framework.
- [`neurogate_deployment_workflow.md`](./neurogate_deployment_workflow.md): release and distribution reference.

## Project Lead

Brandon Bach
