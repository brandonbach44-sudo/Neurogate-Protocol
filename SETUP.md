# Developer Setup

First-time setup for working on NeuroGate from this repo.

## 1. Install Node.js

Install Node.js 20.19 or later from [nodejs.org](https://nodejs.org); Vite 8 needs `^20.19.0 || >=22.12.0`, and the release workflow builds on the latest Node 20. Check:

```bash
node --version   # v20.19 or later
npm --version
```

## 2. Clone and install

```bash
git clone https://github.com/brandonbach44-sudo/Neurogate-Protocol.git
cd Neurogate-Protocol
npm install
```

`npm install` also installs the `server/` workspace, which the desktop app loads in-process.

## 3. Run it

| What | Command | Notes |
|---|---|---|
| Web UI in a browser | `npm run dev` | Vite dev server at `http://localhost:5173`. Useful for UI work; the Export step here uses the browser ZIP path (files over 500 MB are left out), not the desktop folder export. |
| Desktop app | `npm run electron:dev` | Full `tsc -b && vite build`, bundles `electron/desktop-export.cjs`, then launches Electron. Closest to a real install. |
| Desktop app, fast loop | `npm run electron:dev:fast` | Bundles the export writer, starts Vite, and points Electron at it, so `src/` changes hot-reload. Changes to `electron/*.cjs` need a restart. |
| CLI | `npm run cli -- <folder>` | Runs `src/cli/index.ts` with tsx and prompts interactively. |
| CLI binary | `npm run cli:sea` | Builds `dist-cli/neurogate` (or `neurogate.exe`) with esbuild and Node's single-executable feature. Needed before **Install CLI** works in a dev desktop build. Run it from a normal terminal with a real Node binary. |
| Installers | `npm run electron:build` | Frontend, desktop export bundle, CLI binary, then `electron-builder` for the current OS, into `release/`. |

The update check is skipped in dev builds (it only runs in a packaged app).

## 4. Run the tests

```bash
npm run regression       # regression.ts, regression_deidentify.ts, regression_flywheel.ts,
                         # regression_generalization.ts, regression_pet.ts,
                         # regression_edf_annotations.ts, regression_docs.ts;
                         # CI and the release workflow run this
npm run verify:export    # streaming export writer and EDF de-identifier
npm run verify:cli       # CLI pipeline end to end on demo data
npm run verify:adapter   # NodeFileAdapter vs. the browser File path
npm run verify:cli-bundle  # the esbuild CLI bundle builds and still exports correctly

npm run desktop:bundle
npx tsx verify_desktop_export.ts           # desktop folder export, against the bundled file
npx tsx verify_desktop_export.ts --large   # with a 600 MB EDF
```

After an intended change to detection, validation or de-identification output, run `npm run regression:update` (it rewrites the `regression.ts`, `regression_deidentify.ts` and `regression_flywheel.ts` snapshots) and review the snapshot diff before committing it.

`regression_docs.ts` checks that each version in `src/docVersions.ts` matches the `| **Version** |` row of its `public/docs/*.md` file. When you bump a document's version, update `src/docVersions.ts` in the same commit.

All fixtures are synthetic (`demo-data/` or built in memory). Never commit real patient data. `baseline*.ts`, `test_*.ts`, `simulate.ts` and `audit_modality.ts` point at local-only data outside the repo and aren't part of the test suite.

`npm run lint` runs ESLint.

## 5. Where things live

| Path | What |
|---|---|
| `src/pages/`, `src/components/` | React UI. The 6-step tool is `src/pages/ToolPage.tsx`. |
| `src/lib/detection/` | Modality, subject and session detection. |
| `src/lib/validation/` | Validation checks. |
| `src/lib/bids/` | BIDS naming (`bidsNaming.ts`) and the export file list (`exporter.ts`), plus the browser ZIP. |
| `src/lib/deidentify/` | De-identification: EDF/BDF headers and annotations, Persyst `.lay` files, JSON sidecars. |
| `src/lib/audit/` | Audit log, including the shareable copy written with every export. |
| `src/lib/adapters/` | Node-only code: `NodeFileAdapter`, directory scan, streaming export writer, desktop export entry point. |
| `src/cli/` | CLI (`index.ts` prompts, `pipeline.ts` does the work). |
| `src/version.ts` | App version, read from `package.json` at build time; the single source for the footer, `dataset_description.json` and the audit log. |
| `src/docVersions.ts` | Versions of the `public/docs/` documents shown on the Documentation page (checked by `regression_docs.ts`). |
| `electron/` | Electron main process (`main.cjs`), preload bridge (`preload.cjs`), icons. `desktop-export.cjs` is generated. |
| `server/` | Express server the desktop app runs in-process to serve the built frontend. |
| `scripts/` | Build scripts (CLI bundle and binary, desktop bundle, fast dev loop, macOS ad-hoc signing). |
| `public/docs/` | GOV-001, SOP-BIDS-001, SOP-GUI-001 and the DICOM conversion helper script, shown in the app. |
| `docs/` | Internal notes. `docs/capabilities.md` is the source of truth for behavior; update it first whenever behavior changes. |
| `.github/workflows/ci.yml` | CI on every push and pull request: lint, build, regression, verify scripts, desktop export check. |
| `.github/workflows/release.yml` | Release pipeline (see the README's Releasing section). |

See [`docs/architecture.md`](./docs/architecture.md) for how these pieces fit together.

## Troubleshooting

- **`npm run dev` or `electron:dev` fails with missing modules:** run `npm install` again. If that doesn't help, delete `node_modules` and reinstall.
- **Desktop app says the local server could not start:** something else is using port 3001.
- **Install CLI says the binary wasn't found (dev build):** run `npm run cli:sea` first.
- **`git push` asks for a password:** GitHub needs a Personal Access Token or SSH key, not your account password.
