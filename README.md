# NeuroGate

A browser-based tool and governance framework for organizing multi-site epilepsy neuroimaging data into BIDS-compliant format for sharing through Pennsieve.

## Status

Beta, in active development. Tool is functional; documentation is in draft, pending review.

## What It Does

Research staff at participating epilepsy study sites drag a folder of patient data into the web app. The tool:

1. Auto-detects imaging modalities and proposes BIDS-compliant names
2. Lets users correct the mapping inline
3. Collects required metadata per modality
4. Validates the dataset against BIDS plus a governance framework (PHI scan, metadata completeness, session consistency)
5. Exports a BIDS-organized folder ready for upload to Pennsieve
6. Generates an ALCOA+ compliant audit log

Users are assumed to have already converted DICOM to NIfTI and de-identified structural MRI. The tool validates and attests; it does not perform those steps. Pennsieve upload is performed by the user separately following SOP-PENNSIEVE-001.

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS
- `bids-validator` for BIDS compliance
- `nifti-reader-js` for NIfTI header inspection
- Hosted on Vercel

## Development

```bash
npm install
npm run dev
```

## Documentation

User-facing documentation lives on the deployed site under `/docs` and is sourced from the markdown files in `public/docs/`:

- GOV-001: Regulatory Governance Framework
- SOP-BIDS-001: BIDS Data Structure
- SOP-PENNSIEVE-001: Pennsieve Upload Procedures
- SOP-REDCAP-001: REDCap Metadata Entry
- SOP-GUI-001: NeuroGate Compliance Tool User Guide
- ONBOARD-001: Site Onboarding Checklist

Internal developer notes in this repo:

- [`docs/architecture.md`](./docs/architecture.md): Architecture decisions and open questions
- [`docs/governance-requirements.md`](./docs/governance-requirements.md): Validation rules from the governance framework

## Project Lead

Brandon Bach, brandon.bach44@gmail.com

## License

TBD; not yet published.
