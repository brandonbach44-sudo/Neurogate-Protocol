# NeuroGate — Deployment & Release Workflow Plan

**Project:** NeuroGate  
**Repo:** github.com/brandonbach44-sudo/Neurogate-Protocol  
**Date:** 2026-08-31  

---

## Overview

NeuroGate is a desktop-first tool. The public website (AWS S3 + CloudFront) serves documentation and directs users to download the Electron app. All file processing happens locally on the user's machine — no compute costs per user.

```
Public Website (AWS S3 + CloudFront)
    │
    ├─ Landing page
    ├─ Documentation (GOV-001, SOP-BIDS-001, SOP-GUI-001)
    │
    └─ "Launch Tool" → Download Modal
                            │
                            ├─ macOS (.dmg)
                            ├─ Windows (.exe)
                            └─ Linux (.AppImage)
                            
                    Binaries hosted on GitHub Releases (free)
```

---

## Phase 1 — Fix the Existing Deploy Pipeline

**Problem:** The current `.github/workflows/deploy.yml` deploys to S3 + CloudFront but CloudFront permissions are not available. It is likely failing on every push to main.

**Tasks:**

- [ ] Audit current GitHub Actions runs — confirm `deploy.yml` is failing
- [ ] Decide: fix CloudFront permissions in AWS IAM, or remove CloudFront and serve directly from S3
- [ ] If removing CloudFront: update `deploy.yml` to skip the invalidation step and configure S3 bucket for static website hosting with a public endpoint
- [ ] If keeping CloudFront: request the correct IAM permissions (`cloudfront:CreateInvalidation`) from whoever manages the AWS account
- [ ] Confirm the site is live and the docs pages render correctly after a push

**Files to touch:**
```
.github/workflows/deploy.yml
```

---

## Phase 2 — Build the Public Landing Page

**Problem:** Right now the site serves the React app UI directly. The public site needs to be a separate landing page — not the tool itself.

**Tasks:**

- [ ] Create a `/landing` route or a separate static `index.html` as the public entry point
- [ ] Landing page content:
  - What NeuroGate is (one paragraph)
  - Who it is for (research sites, clinical coordinators)
  - How it works (3-step summary: drop data → validate → export BIDS ZIP)
  - Link to documentation
  - "Download the App" button (primary CTA)
- [ ] "Launch Tool" button triggers a modal explaining the tool is desktop-only and why (local processing = no data leaves the machine, no cost per user)
- [ ] Modal contains platform download links (populated once Phase 3 is complete)
- [ ] Documentation pages route to the existing `public/docs/` markdown files already in the repo

**Files to touch:**
```
src/pages/Landing.tsx          (new)
src/components/DownloadModal.tsx   (new)
src/App.tsx                    (add landing route)
public/docs/                   (already exists — wire into nav)
```

---

## Phase 3 — Automated Electron Release Builds

**Problem:** There is no workflow to automatically build and publish the desktop app binaries. Releases have to be built and uploaded manually.

**Tasks:**

- [ ] Create `.github/workflows/release.yml` that triggers on a version tag push (`v*.*.*`)
- [ ] Workflow builds the Electron app for all three platforms:
  - macOS → `.dmg`
  - Windows → `.exe` (NSIS installer)
  - Linux → `.AppImage`
- [ ] Workflow uploads all three binaries to a GitHub Release automatically
- [ ] Update the download modal on the website to point to the GitHub Release download URLs

**Workflow outline:**

```yaml
name: Release Desktop App

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - Checkout
      - Setup Node 20
      - npm ci
      - npm run regression        # must pass before any release ships
      - npm run electron:build    # builds + packages for the current OS
      - Upload artifact to GitHub Release
```

**Files to create:**
```
.github/workflows/release.yml   (new)
```

---

## Phase 4 — Wire Downloads to GitHub Releases

**Tasks:**

- [ ] After first release is published, get the stable GitHub Release download URL pattern:
  ```
  https://github.com/brandonbach44-sudo/Neurogate-Protocol/releases/latest/download/NeuroGate-mac.dmg
  https://github.com/brandonbach44-sudo/Neurogate-Protocol/releases/latest/download/NeuroGate-win.exe
  https://github.com/brandonbach44-sudo/Neurogate-Protocol/releases/latest/download/NeuroGate-linux.AppImage
  ```
- [ ] Update `DownloadModal.tsx` with the correct URLs
- [ ] Confirm all three platform downloads work end-to-end

---

## Phase 5 — Versioning and Release Process

**The release flow once everything is set up:**

```
1. Make changes on a feature branch
2. PR → main (CI runs regression tests)
3. Merge to main → AWS site auto-deploys (Phase 1 workflow)
4. When ready to release a new app version:
      git tag v1.2.0
      git push origin v1.2.0
   → GitHub Actions builds all three binaries
   → Publishes GitHub Release automatically
   → Download modal on the site picks up the new version via /releases/latest/
```

**Tasks:**

- [ ] Decide on versioning convention (suggest semantic versioning: `v<major>.<minor>.<patch>`)
- [ ] Document the release process in `docs/release-process.md` so future contributors know the flow
- [ ] Consider adding a `CHANGELOG.md` to track what changed per version

---

## Current State Summary

| Component | Status | Notes |
|---|---|---|
| AWS S3 bucket | Exists | Confirmed in code |
| CloudFront distribution | Exists but permission issue | May need IAM fix |
| Frontend deploy workflow | Failing | CloudFront invalidation step |
| Vercel | Active fallback | Current live site |
| Electron build | Works locally | `npm run electron:build` |
| Electron release workflow | Does not exist | Phase 3 |
| Landing page | Does not exist | Phase 2 |
| Download modal | Does not exist | Phase 2 |
| GitHub Releases | Not set up | Phase 3 |

---

## Open Questions

1. **CloudFront vs S3-only:** Do you have or can you get `cloudfront:CreateInvalidation` IAM permission? If not, S3 static hosting alone works fine for a low-traffic site.
2. **Vercel:** Once AWS is confirmed working, do you want to keep Vercel as a backup or remove it?
3. **Code signing:** macOS and Windows will warn users about unsigned apps. Apple notarization and Windows code signing require paid certificates. Worth planning for once the tool reaches wider distribution.
4. **CLI distribution:** The CLI binary is bundled inside the Electron app. Do you also want a standalone CLI download on the releases page for users who don't want the desktop UI?
