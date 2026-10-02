# NeuroGate: Release and Distribution Reference

**Project:** NeuroGate
**Repo:** github.com/brandonbach44-sudo/Neurogate-Protocol
**Last updated:** 2026-10-02

---

## Overview

NeuroGate is distributed only as a desktop app (with the CLI bundled inside) through GitHub Releases. All processing happens on the user's computer, so there's no server to run and no per-user compute cost.

```
git tag vX.Y.Z → release.yml (Windows, macOS, Linux runners)
                    │
                    └─ GitHub Release  ── /releases/latest
                         ├─ NeuroGate-Setup-<version>.exe   (Windows, NSIS)
                         ├─ NeuroGate-<version>-arm64.dmg   (macOS Apple Silicon; .zip also uploaded)
                         ├─ NeuroGate-<version>.AppImage    (Linux)
                         └─ latest*.yml                     (read by the in-app update check)
```

Download page: <https://github.com/brandonbach44-sudo/Neurogate-Protocol/releases/latest>

---

## What exists

| Component | Status | Where |
|---|---|---|
| CI (lint, build, regression, verify scripts, desktop export check) | Runs on every push and pull request | `.github/workflows/ci.yml` |
| Release workflow | Working | `.github/workflows/release.yml` |
| Installers for Windows, macOS (Apple Silicon), Linux | Built on every release | electron-builder config in `package.json` (`"build"`) |
| CLI binary bundled in each installer | Working | `scripts/build-cli-bundle.mjs`, `scripts/build-cli-sea.mjs`; `extraResources` in `package.json` |
| macOS ad-hoc signing | Working | `scripts/adhoc-sign-mac.cjs` (`afterPack` hook) |
| In-app update check | Working | `initAutoUpdater()` in `electron/main.cjs` |
| Version shown in the app footer, audit log, `dataset_description.json` | Working | `src/version.ts` (from `package.json` at build time) |
| Developer ID / Windows code signing | Not set up | See open questions |
| Intel macOS build | Not built | See open questions |
| Public website | https://epilepsy-gui.vercel.app on Vercel, redeployed automatically on every push to `main` | See "Website" |

---

## Release process

1. Bump `version` in `package.json`, commit, and push to `main`. It's the only place the version is set; `src/version.ts` reads it at build time.
2. Tag and push:

   ```bash
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```

3. `release.yml` runs:
   - **build** (matrix: `windows-latest`, `macos-latest`, `ubuntu-latest`, Node 20):
     1. Fail if the tag isn't `v` + `package.json` version (electron-builder names the release from `package.json`, not the tag).
     2. `npm ci`
     3. `npm run regression` (must pass, or nothing ships): `regression.ts`, `regression_deidentify.ts`, `regression_flywheel.ts`, `regression_generalization.ts`, `regression_pet.ts`, `regression_edf_annotations.ts`, `regression_docs.ts`. The last one fails if a version in `src/docVersions.ts` doesn't match its `public/docs/*.md` document's `| **Version** |` row, so a document version bump must update `src/docVersions.ts` too.
     4. `npm run build` (frontend)
     5. `npm run cli:sea` (standalone CLI binary for that OS)
     6. `npm run desktop:bundle` (`electron/desktop-export.cjs`)
     7. `npx electron-builder --publish always` with `CSC_IDENTITY_AUTO_DISCOVERY=false`, uploading into a **draft** release so all three jobs land in the same one.
   - **finalize** (after all builds succeed): writes the release notes (download table, update note, first-install steps) and publishes the release as latest.
4. A manual **Run workflow** (`workflow_dispatch`) leaves the release as a draft to review and publish by hand from the Releases page.

Because electron-updater ignores drafts, installed apps are never offered a release that's missing a platform.

---

## CI

`.github/workflows/ci.yml` runs on every push (any branch) and every pull request, on `ubuntu-latest` with Node 20: `npm ci`, `npm run lint`, `npm run build`, `npm run regression`, then `npm run verify:export`, `verify:cli` and `verify:adapter`, then `npm run desktop:bundle` and `npx tsx verify_desktop_export.ts`. It builds no installers and publishes nothing. Vercel deploys `main` to the website without waiting for it, so a red CI run on `main` means the website may already be serving the broken commit. Check that CI is green before tagging a release.

---

## Signing and first launch

- **macOS:** `"identity": null` turns off electron-builder's signing. The `afterPack` hook runs `codesign --force --deep --sign -` on the `.app`, so Gatekeeper shows the ordinary "can't verify the developer" block rather than "damaged and can't be opened". Users clear it once: **System Settings → Privacy & Security → Open Anyway**. The CLI binary is ad-hoc signed by `build-cli-sea.mjs`.
- **Windows:** unsigned. SmartScreen may warn: **More info → Run anyway**.
- **Linux:** `chmod +x NeuroGate-*.AppImage`, then run it.

These steps are in the release notes the finalize job writes.

---

## Updates

On every launch of a packaged app, `initAutoUpdater()` checks the latest published GitHub Release. Nothing downloads without the user agreeing (`autoDownload = false`), and failures are logged and ignored.

- **Windows and Linux:** prompt → download (with taskbar progress) → prompt to restart. "Later" installs the update on quit.
- **macOS:** prompt → opens `https://github.com/brandonbach44-sudo/Neurogate-Protocol/releases/tag/v<version>`; the user downloads the `.dmg` and drags NeuroGate into Applications. In-place update needs a Developer ID signature matching the installed app, which ad-hoc signing can't provide.

---

## Website

https://epilepsy-gui.vercel.app is hosted on Vercel, connected to this GitHub repo. Every push to `main` builds the web app (`npm run build`, routing in `vercel.json`) and deploys it to production within a minute or two; GitHub shows each one as a "Vercel" check on the commit. Nothing in this repo triggers it.

- It serves the same pages and documents as the desktop app, plus a browser version of the tool. The browser tool processes everything locally and has no upload code; files over 500 MB can't be exported there.
- So pushing to `main` updates the public website immediately, before any release; a release only updates the desktop app.
- Its Download page (`/download`, `src/pages/DownloadPage.tsx`) reads the latest release from GitHub's API and links directly to the installers, so a new release appears there automatically with no website change.
- The older AWS S3 + CloudFront plan was dropped, and its workflow and server upload code were removed in 1.4.0.

---

## Open questions

1. **Code signing.** Getting an Apple Developer ID (and notarization) would remove the macOS Open Anyway step and allow in-place macOS updates; `initAutoUpdater()`'s manual-macOS branch could then be dropped. A Windows code-signing certificate would stop SmartScreen warnings. Both cost money and haven't been budgeted.
2. **Intel macOS build.** Only an Apple Silicon (`arm64`) build is produced, from the `macos-latest` runner. Intel Macs would need an `x64` (or universal) target, and the bundled CLI binary would need an Intel build too, since `cli:sea` copies the Node binary of the machine it runs on.
3. **Standalone CLI download.** The CLI is only distributed inside the desktop installers. Whether to also attach standalone CLI binaries to each release is undecided.
