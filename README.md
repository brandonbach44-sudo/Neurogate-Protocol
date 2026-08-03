# NeuroGate

A browser-based tool and governance framework for organizing multi-site neural data into BIDS-compliant format, ready for sharing through cloud and on-premise standardized data infrastructure toward building a learning health system. "Neural data" covers structural and functional MRI, CT, DWI, scalp EEG, and intracranial EEG.

## Status

Beta, in active development. Tool is functional; documentation is in draft, pending review.

## What It Does

Anyone can drag a folder of patient data into the web app, independently, with no requirement to coordinate through a central team. The tool:

1. Lets the user choose a session structure: the Implant sessions preset, or a Custom timepoints preset for other longitudinal study designs
2. Auto-detects imaging modalities and proposes BIDS-compliant names
3. Lets users correct the mapping inline
4. Collects required metadata per modality
5. Validates the dataset against BIDS plus a governance framework (PHI scan, metadata completeness, session consistency)
6. Exports a BIDS-organized folder ready for upload, with EDF headers and scan JSON sidecars automatically de-identified (date-shift, not blank, per subject) and an ALCOA+ compliant audit log

Users are assumed to have already converted DICOM to NIfTI and de-identified structural MRI. The tool validates and attests; it does not perform those steps. After the tool exports the BIDS folder, the site uploads it to its chosen data infrastructure -- upload itself is out of scope for the tool.

## Development

```bash
npm install
npm run dev
```

## Documentation

User-facing documentation lives on the deployed site under `/docs` and is sourced from the markdown files in `public/docs/`:

- GOV-001: Regulatory Governance Framework
- SOP-BIDS-001: BIDS Data Structure
- SOP-GUI-001: NeuroGate Compliance Tool User Guide

Internal developer notes in this repo:

- [`docs/architecture.md`](./docs/architecture.md): Architecture decisions and open questions
- [`docs/governance-requirements.md`](./docs/governance-requirements.md): Validation rules from the governance framework

## Project Lead

Brandon Bach

Paper draft link (Insert below)
