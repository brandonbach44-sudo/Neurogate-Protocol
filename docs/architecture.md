# Architecture

How NeuroGate is put together. For *what* it does (every check, field and output), see [`capabilities.md`](./capabilities.md); that file is the source of truth for behavior and is updated first whenever behavior changes.

## High-level picture

NeuroGate ships as one Electron desktop app (macOS Apple Silicon, Windows, Linux) with a CLI binary bundled inside it. Both run the same TypeScript libraries in `src/lib/` for detection, validation, BIDS naming and de-identification. Everything runs on the user's computer; the only network requests are the update check (GitHub) and Google Fonts.

```
┌──────────────────────── Electron desktop app ────────────────────────┐
│                                                                      │
│  Main process (electron/main.cjs)                                    │
│   ├─ in-process Express server (server/index.js) on 127.0.0.1:3001   │
│   │    serves the built frontend (dist/); upload routes not mounted  │
│   ├─ IPC: install-cli, choose/export/write/reveal export folder      │
│   ├─ desktop export writer (electron/desktop-export.cjs, bundled)    │
│   └─ update check (electron-updater, GitHub Releases)                │
│                                                                      │
│  Preload (electron/preload.cjs) → window.neurogateDesktop            │
│                                                                      │
│  Renderer: React app (src/), same code as the web build              │
│   └─ src/lib: detection · validation · BIDS naming · de-id · audit   │
└──────────────────────────────────────────────────────────────────────┘

CLI (src/cli/) ── esbuild → dist-cli/cli.cjs ── Node SEA → dist-cli/neurogate(.exe)
   └─ same src/lib, files read through NodeFileAdapter, streamed export
```

## Electron main process (`electron/main.cjs`)

- **Plain CommonJS, no build step.** The main process is small, and `.cjs` avoids ESM/Electron interop problems even though the repo root is `"type": "module"`.
- **In-process server, not a child process.** On launch it sets `PORT=3001`, `NEUROGATE_DESKTOP=1` and `SERVE_STATIC=true`, then `require()`s `server/index.js` and calls its exported `start(3001, '127.0.0.1')`. The window loads `http://127.0.0.1:3001`. Serving the frontend from the same origin means the renderer needs no Electron-specific loading code.
  - An earlier design spawned a second copy of the app as a child process to run the server. That failed on real installed Windows builds (`spawn … ENOENT`), most likely because antivirus blocks an unsigned `.exe` launching itself. Running the server in-process removed that failure mode.
  - `NEUROGATE_DESKTOP` tells the server not to mount its `/api/deidentify` and `/api/download` routes; the desktop app exports by streaming to disk instead.
  - The server binds to loopback only. If port 3001 is taken, the app shows an error and quits.
- **Fast dev loop.** When `ELECTRON_START_URL` is set (by `scripts/dev-electron.mjs`, `npm run electron:dev:fast`), the window loads the Vite dev server instead and the server runs with `SERVE_STATIC=false`.
- **Window security:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. External links open in the system browser.
- **App name** is forced to `NeuroGate` so `userData` (and therefore the CLI install folder) isn't named after `package.json`'s old `"name"`.

### Install CLI

The `install-cli` IPC handler copies the bundled CLI (`resources/cli/neurogate[.exe]` in a packaged build, `dist-cli/` in dev) to `<userData>/bin`. On Windows it then adds that folder to the **User** PATH through PowerShell and .NET's `[Environment]::SetEnvironmentVariable(..., 'User')`, not `setx`, which can silently truncate PATH at 1024 characters. On macOS and Linux it makes the binary executable and the UI shows the folder for the user to add. Doing this from an explicit button click is the consent for touching PATH.

### Folder export

The desktop Export step writes to a folder instead of building a ZIP:

1. `choose-export-folder` shows a native picker ("Export Here") and reserves `<PREFIX>_bids_export_<date>` inside it, adding `-2`, `-3`, … if needed.
2. `export-to-folder` passes the export plan to `runDesktopExport()` in `electron/desktop-export.cjs`, which streams every file and sends `export-progress` events back to the renderer.
3. `write-export-file` saves the two audit logs next to `bids_output/`: the full log and the shareable copy. It only accepts names matching `audit_log_<timestamp>.json` or `audit_log_<timestamp>_shareable.json`.
4. `reveal-export-folder` opens the folder in Finder/Explorer.

The last three only accept an output folder that `choose-export-folder` handed out in the current session, so the renderer can't write anywhere the user didn't pick. `runDesktopExport()` also rejects any relative path that could escape `bids_output/`.

### Update check (`initAutoUpdater`)

Runs only in a packaged build. `autoDownload` is off, so nothing downloads without the user agreeing.

- **Windows and Linux:** ask → download (taskbar progress) → ask to restart. "Later" installs on quit.
- **macOS:** ask → open `…/releases/tag/v<version>`. Squirrel.Mac only installs updates signed with the same Developer ID as the installed app, and NeuroGate's macOS build is only ad-hoc signed, so in-place update isn't possible there.
- Every failure (offline, rate limit, no release) is logged and otherwise ignored.

## Preload bridge (`electron/preload.cjs`)

Exposes one object, `window.neurogateDesktop`, with a fixed set of methods and no generic IPC channel:

| Method | Purpose |
|---|---|
| `installCli()` | Install the bundled CLI (above). |
| `getPathForFile(file)` | On-disk path of a dropped or browsed `File` (`webUtils.getPathForFile`), so export can stream from disk. |
| `chooseExportFolder`, `exportToFolder`, `writeExportFile`, `revealExportFolder` | Folder export IPC. |
| `onExportProgress(cb)` | Subscribe to per-file progress; returns an unsubscribe function. |

A plain browser never loads the preload script, so the React app checks for `window.neurogateDesktop` to decide between desktop and browser behavior (Install CLI button, file caching, folder export vs. ZIP).

## Renderer (React app, `src/`)

- React 19 + React Router + Tailwind, built by Vite into `dist/`.
- Pages: Home, Documentation (renders `public/docs/*.md` with react-markdown), Pre-Processing, About, and the 6-step tool (`src/pages/ToolPage.tsx`: Structure · Drop Files · Mapping · Metadata · Validate · Export).
- **State** is React state in `ToolPage` plus an audit-log context (`src/lib/audit/AuditContext.tsx`). No external state library.
- **Saved progress** (`src/lib/session/toolSession.ts`): file signatures (name, size, relative path) and detection results go to `sessionStorage` for 12 hours. Dropping the exact same file set again restores the mapping. File contents and Metadata entries are never saved.
- **File contents in memory:** in the desktop app only file locations are kept; in a browser, files up to 500 MB are cached (`src/lib/fileCache.ts`).

## Shared libraries (`src/lib/`)

Used unchanged by the GUI, the CLI and the desktop export bundle.

| Folder | Role |
|---|---|
| `detection/` | Extension classification, sidecar and EDF header reading (both keyed by folder + base name via `sidecarKey()`, so subjects with same-named files don't get each other's metadata), filename/folder/neighbour inference, subject grouping, custom-timepoint date and folder clustering, PET vocabulary. `engine.ts` combines the signals. |
| `validation/` | `bidsValidator.ts` (NeuroGate's own structure checks for its BIDS-based layout; the official bids-validator isn't used, since the layout deliberately differs from the official spec), `phiScanner.ts`, `requiredFilesChecker.ts`, `crossSessionChecker.ts`, `petChecker.ts`, and metadata/defacing checks in `engine.ts`. |
| `bids/` | `bidsNaming.ts` (entities, runs, collisions, and `tableFolder`, which puts electrodes/channels/events tables in `eeg/` or `ieeg/` beside their recording) and `exporter.ts` (`buildFileEntries()` produces the export file list; `generateZip()` is the browser ZIP path). |
| `deidentify/` | `edfDeidentifier.ts` (256-byte header transform, per-subject date shifts, whole-buffer path); `edfStructure.ts` (pure EDF/BDF layout parsing for any signal count, EDF+/BDF+ annotation redaction in place at the same byte length, and the per-signal transducer/prefiltering check, shared by the whole-buffer and streaming paths); `persystLayDeidentifier.ts` (Persyst `.lay`: `File=` pointed at the renamed `.dat`, `[Patient]` reduced to Sex/Hand/TestTime with TestDate shifted, `[Comments]` redacted with the annotation rules); `jsonSidecarDeidentifier.ts` (identifying fields blanked and dates shifted at any depth; returns not-ok for anything that isn't a JSON object, so it's never exported). |
| `audit/` | Audit logger, context and JSON/CSV exporter; `auditRedaction.ts` builds the shareable copy (original file names and paths become exported BIDS paths or `file-N`, subject groups become `sub-` IDs or `subject-N`, word-bounded matching) and `auditJsonFiles()` returns both files for an export. |
| `metadata/` | Reading dropped `dataset_description.json` and `sessions.tsv`. |
| `adapters/` | **Node-only** (never imported by the web build): `NodeFileAdapter`, `scanDirectory`, the streaming export writer, the streaming EDF de-identifier and `desktopExport.ts`. |

### FileLike

`src/types/fileLike.ts` defines the minimal file interface the libraries use: `name`, `size`, `arrayBuffer()`, `text()`, `slice()`. It's kept to exactly the methods some caller needs.

- In the renderer, the browser's own `File` satisfies it.
- In the CLI and desktop export, `NodeFileAdapter` implements it over a path on disk, reading lazily. `slice()` matters: EDF header reading only reads the 256-byte main header and then the channel labels (sized from the signal count, so any number of channels works), so a multi-GB recording is never loaded to classify it.
- `isFileLike()` replaces `instanceof File` checks, which would fail for the adapter.

`verify_adapter.ts` checks that scanning through `NodeFileAdapter` produces the same detection and validation output as the browser `File` path.

### Validation model (`src/types/validation.ts`)

Each check returns `ValidationIssue { id, category, severity, title, description, affectedFiles, subjectGroup?, session?, dismissable }`, and `finalizeReport()` counts them by severity and category. `passed` is false if any error exists.

- **Severities:** `error`, `warning`, `info`.
- **Categories produced:** `bids-structure`, `phi-risk`, `required-files`, `cross-session`, `metadata` (including the PET sidecar warning), `defacing`. The type also defines `file-format`, which no check currently emits.
- **GUI:** errors that aren't dismissed block export. Most errors aren't dismissable; the Implant required-file errors are.
- **CLI:** subject-scoped errors hold back that subject; other errors stop the export.

## Export

`buildFileEntries()` turns the mapping into `FileEntry[]`: generated metadata files as text, and each data file with its BIDS path plus flags for gzip (`.nii` → `.nii.gz`), EDF de-identification and JSON de-identification.

- **Streaming writer** (`adapters/nodeExportWriter.ts`, used by the CLI and the desktop app): plain files are stream-copied; `.nii` is piped through gzip; EDF/BDF go through `deidentifyEdfStream()`, which rewrites the full header and streams the data records, redacting annotation text in place; JSON sidecars are read as text, transformed and written (a sidecar that isn't a JSON object throws `SidecarNotJsonError`, so it's never copied); Persyst `.lay` files are read as text and rewritten by `deidentifyPersystLay()`. No size limit. The streaming EDF path uses the same header transform and `edfStructure.ts` logic as the whole-buffer one; `verify_export_writer.ts` diffs them byte for byte, and `regression_edf_annotations.ts` checks annotation redaction on both paths, with chunks that don't line up with data records.
- **Desktop:** the renderer flattens `FileEntry[]` into a serializable plan (data files as on-disk paths from `getPathForFile`), and `desktopExport.ts` rebuilds it with `NodeFileAdapter` and calls the same writer. A desktop export and a CLI export therefore produce the same layout and de-identification. `verify_desktop_export.ts` tests the bundled file.
- **Browser build:** `generateZip()` builds an uncompressed ZIP in memory and leaves out files over 500 MB. `src/lib/api/exportApi.ts` can instead send large EDFs to the `server/` de-identify routes when the frontend is built with `VITE_API_URL`; no current distribution sets it.

## Audit log (`src/lib/audit/`, `src/types/audit.ts`)

An append-only list kept for the whole app session, exported as JSON (or CSV from the Audit Log panel):

```json
{
  "_format": "ALCOA+ Audit Log",
  "_version": "1.0",
  "header": {
    "exportedAt": "...", "exportedBy": "...", "sessionStarted": "...",
    "toolVersion": "<APP_VERSION>", "totalEntries": 0, "actionSummary": { "<action>": 0 }
  },
  "entries": [
    { "id": 1, "timestamp": "ISO 8601", "actor": "user | system | <OS username>",
      "action": "<AuditAction>", "summary": "...", "details": {} }
  ]
}
```

`id` is an auto-incrementing integer. The actor is `user` or `system` in the GUI (there's no login) and the OS username in the CLI. The de-identification summary never includes date-shift values or redacted text, only counts.

Every export writes two files: the full log (`audit_log_<timestamp>.json`, CLI `audit_log.json`), which keeps original names and stays at the site, and a shareable copy (`audit_log_<timestamp>_shareable.json`, CLI `audit_log_shareable.json`) passed through `redactAuditValue()` with `exportedBy` set to "site" and a `_copy` note at the top. The Audit Log panel's Export JSON / CSV buttons save the full log. What is and isn't logged is listed in `capabilities.md` §10.

## CLI (`src/cli/`)

- `index.ts` asks the prompts (`prompts.ts`) and builds a `NeuroGateRunOptions`; `pipeline.ts` does scan → detect → validate → export with no terminal dependency, so it can be tested directly (`verify_cli_pipeline.ts`).
- **Packaging:** `scripts/build-cli-bundle.mjs` flattens it with esbuild into `dist-cli/cli.cjs` (Node built-ins left as `require`). `scripts/build-cli-sea.mjs` uses Node's single-executable-application feature: it copies the running `node` binary, removes its signature, injects the blob with `postject`, and ad-hoc re-signs on macOS. No V8 snapshot or code cache, to avoid Node-version-specific breakage. `scripts/verify-cli-bundle.mjs` checks the bundle builds and still exports correctly.
- electron-builder copies the binary into each installer as `resources/cli/neurogate[.exe]`.

## Version (`src/version.ts`)

`package.json` `version` is the only place a release sets it. Vite (app) and esbuild (CLI and desktop bundles) replace `__APP_VERSION__` at build time; under tsx, `npm_package_version` is used. It appears in `dataset_description.json` `GeneratedBy`, the audit log header, the page footer (`src/components/Footer.tsx`), and the Home and About pages.

Document versions are separate: `src/docVersions.ts` lists each `public/docs/*.md` document and its version for the Documentation page, and `regression_docs.ts` fails if one disagrees with the document's own `| **Version** |` row.

## Release pipeline

- `.github/workflows/release.yml` runs on a `v*.*.*` tag push (or manually). It checks the tag against `package.json`, then on Windows, macOS and Linux runners (Node 20): `npm ci` → `npm run regression` (all seven suites, including `regression_pet.ts`, `regression_edf_annotations.ts` and `regression_docs.ts`) → `npm run build` → `npm run cli:sea` → `npm run desktop:bundle` → `electron-builder --publish always` into a draft release. A final job adds download notes and publishes the release (a manual run leaves it as a draft). electron-updater ignores drafts, so nobody is offered a release that's missing a platform.
- electron-builder targets: NSIS `.exe` (Windows), `.dmg` + `.zip` (macOS, arm64), `.AppImage` (Linux). `"identity": null` disables macOS signing; the `afterPack` hook `scripts/adhoc-sign-mac.cjs` ad-hoc signs the whole `.app` so Gatekeeper shows the ordinary "unidentified developer" block (cleared with Open Anyway) instead of "damaged".
- `.github/workflows/ci.yml` runs on every push (any branch) and pull request, on Ubuntu with Node 20: `npm ci` → `npm run lint` → `npm run build` → `npm run regression` → `verify:export`, `verify:cli`, `verify:adapter` → `npm run desktop:bundle` and `verify_desktop_export.ts`. It doesn't build installers or publish anything.
- `.github/workflows/deploy.yml` (an old AWS website deploy) still exists but is disabled in GitHub's settings. The website is hosted on Vercel instead (`vercel.json`), through Vercel's GitHub integration: every push to `main` builds and deploys https://epilepsy-gui.vercel.app, with no workflow in this repo and without waiting for CI. That build sets no `VITE_API_URL`, so the browser version never uploads files.

See [`../neurogate_deployment_workflow.md`](../neurogate_deployment_workflow.md) for the release reference and open questions.

## Design decisions

- **Local only, export to disk.** Most data-sharing platforms don't allow browser-initiated uploads, and uploading patient data through a NeuroGate server would add a PHI-handling service. NeuroGate writes a validated, BIDS-based dataset folder and audit log locally, and the site uploads it by its own procedure.
- **Own BIDS-based layout.** Files follow BIDS naming conventions, but the root layout (`bids_output/` → `primary/sub-*`, `derivatives/scanner/`) is deliberately NeuroGate's own and differs from the official BIDS spec. The official bids-validator therefore doesn't apply to the dataset as a whole; NeuroGate's own Validate step is the check that must pass.
- **Validate and attest, don't convert or deface.** DICOM conversion and defacing happen before NeuroGate (the Pre-Processing page gives guidance). The tool checks for and records them.
- **One set of libraries for GUI and CLI.** The `FileLike` abstraction and the Node adapters let the same detection, validation and de-identification code run in the renderer, the CLI and the desktop export, so the two front ends can't drift apart.
- **Stream, never buffer, large files.** Multi-GB EDF recordings are common; header-only reads for detection and a streaming writer for export keep memory flat.

## Open questions

1. How should sites manage the mapping between their BIDS subject IDs and internal MRNs? The tool never sees it; the recommended workflow still needs documenting.
2. When the governance framework changes (for example a new required field), how do sites with older installed versions stay in step? The update check offers new releases but doesn't force them.
