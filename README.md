# Epilepsy Data Uploader

A web-based tool for organizing and uploading multi-site epilepsy neuroimaging data to Pennsieve in BIDS-compliant format.

Built as part of a UPenn MRA capstone project on standardized protocols for multimodal data sharing in epilepsy research.

## Status

🚧 **Early development** — April 2026. Functional prototype target: Fall 2026.

## What It Does

Research staff at participating epilepsy study sites drag a folder of patient data into the web app. The tool:

1. Auto-detects imaging modalities and proposes BIDS-compliant names
2. Lets users correct the mapping inline
3. Collects required metadata per modality
4. Validates the dataset against BIDS + a governance framework (PHI scan, metadata completeness, session consistency)
5. Uploads to the site's Pennsieve workspace
6. Generates an ALCOA+ compliant audit log

Users are assumed to have already converted DICOM → NIfTI and de-identified structural MRI. The tool validates and attests, it does not perform those steps.

## Tech Stack

- React + Vite + TypeScript
- TailwindCSS
- `bids-validator` for BIDS compliance
- `nifti-reader-js` for NIfTI header inspection
- Pennsieve REST API for uploads

## Development

```bash
npm install
npm run dev
```

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — Project context for Claude Code
- [`docs/governance-requirements.md`](./docs/governance-requirements.md) — Validation rules from the governance framework
- [`docs/architecture.md`](./docs/architecture.md) — Architecture decisions and open questions

## Project Lead

Brandon Bach — bach2@seas.upenn.edu
UPenn MRA Capstone, advised by Nishant Sinha, PhD

## License

TBD — capstone project, not yet published.
