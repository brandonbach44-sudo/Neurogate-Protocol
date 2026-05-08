# Site Onboarding Checklist

**Standardized Multi-Site Neuroimaging Data Sharing in Epilepsy**

| Field | Value |
|---|---|
| **Document ID** | ONBOARD-001 |
| **Version** | 2.1 |
| **Effective Date** | May 7, 2026 |
| **Author** | Brandon Bach |
| **Advisor** | Nishant Sinha |
| **Status** | Draft -- Pending Advisor Review |
| **Parent Document** | GOV-001: Regulatory and Governance Framework (v1.3) |
| **Related Documents** | SOP-BIDS-001, SOP-PENNSIEVE-001, SOP-REDCAP-001, SOP-GUI-001 |

---

> **How to use this document.** This is a procedural reference. It describes the structure of site onboarding but is not a fillable form. The actual tracking (subject IDs, dates, validation status, sign-offs) happens in the NeuroGate tool's audit log, in REDCap, and in the project's training records. The checkbox symbols (☐) in the phase tables mark tasks visually; they cannot be checked off in the rendered view.

---

## 1. Purpose

This document defines the procedure for onboarding a new external research site into the multi-site epilepsy neuroimaging data sharing initiative. It walks the site through every step required before they can independently share compliant data through the initiative on Pennsieve. Completion of this checklist is a prerequisite for any data sharing per GOV-001 Section 7.3 (Site Onboarding Verification).

## 2. Governance Traceability

This onboarding procedure implements specific requirements from the Regulatory and Governance Framework (GOV-001). Every phase below traces back to the framework:

| Onboarding Phase | GOV-001 Section | Requirement |
|---|---|---|
| Phase 1 (Agreements, IRB, Roles) | 5 (Roles), 7.3 (Onboarding Verification) | Site PI and Site Data Manager designated; IRB approval and data use agreement on file before any data work begins |
| Phase 2 (Accounts, Keys, Tools) | 2.1 (FAIR Accessible), 2.3 (PHI Key Management) | Authenticated platform access; secure local storage for the BIDS-ID-to-patient-ID key |
| Phase 3 (Training) | 2.5 (Training Records) | Site personnel must complete onboarding training before sharing data through the initiative |
| Phase 4 (First Subject, Supervised) | 2.2 (ALCOA+), 7.1 (Pre-Upload Checklist), 7.3 (Test Dataset) | The site's first real subject is uploaded under direct supervision from the project lead; this IS the validation upload required by GOV-001 7.3 |
| Phase 5 (Independent Operation) | 2.2 (ALCOA+ Complete, Consistent), 7.2 (Periodic Audits) | Subjects 2 and 3 uploaded independently and reviewed by the Quality Auditor before the site is marked fully onboarded |

## 3. Scope

This SOP applies to every external site joining the multi-site epilepsy data sharing initiative. It covers the full path from initial outreach through the first three independently uploaded subjects. After Phase 5 reviews pass, the site moves to the ongoing operation cadence (Section 10) and the onboarding record is filed as evidence of training completion.

This SOP does not cover the day-to-day execution of BIDS conversion (SOP-BIDS-001), Pennsieve uploads (SOP-PENNSIEVE-001), REDCap data entry (SOP-REDCAP-001), or use of the NeuroGate tool (SOP-GUI-001). It coordinates the introduction of those documents to the site.

## 4. Roles

The following roles are referenced throughout this checklist. Before Phase 1 closes, every named person below must be confirmed for the new site.

| Role | Held By | Onboarding Responsibility |
|---|---|---|
| Onboarding Lead | Project lead (currently Brandon Bach) | Owns the onboarding workflow; runs training; documents completion |
| Site PI | Site | Approves participation, signs the data use agreement, designates the Site Data Manager |
| Site Data Manager | Site | Executes SOPs day-to-day; primary contact for all data operations |
| Pennsieve Workspace Admin | Project administrator | Grants Pennsieve workspace access and shares the dataset node ID |
| REDCap Administrator | Project administrator | Grants REDCap project access and shares the data dictionary |
| Quality Auditor | Project quality lead | Reviews the supervised first subject and the first independent uploads |

---

## 5. Phase 1: Pre-Onboarding (Agreements, IRB, Documentation)

Before any account is created or any data is touched, the legal and governance prerequisites must be in place and the site must have read the framework.

| Done | Task | Responsible |
|---|---|---|
| ☐ | Initial contact email sent | Onboarding Lead |
| ☐ | Kickoff call scheduled and held | Onboarding Lead |
| ☐ | Site PI confirmed | Site |
| ☐ | Site Data Manager designated and confirmed | Site PI |
| ☐ | Local IRB approval verified (copy on file with the project) | Site |
| ☐ | Data Use Agreement signed and on file | Site PI / Legal |
| ☐ | Institution prefix assigned (2-6 uppercase letters, e.g., CHOP, HUP) | Onboarding Lead |
| ☐ | Starting subject number confirmed to avoid ID collisions | Onboarding Lead |
| ☐ | Documentation package sent to site: GOV-001, SOP-BIDS-001, SOP-PENNSIEVE-001, SOP-REDCAP-001, SOP-GUI-001 | Onboarding Lead |
| ☐ | Site reviews GOV-001 (Regulatory Governance Framework) | Site |
| ☐ | Site reviews SOP-BIDS-001 (BIDS Data Structure) | Site |
| ☐ | Site reviews SOP-PENNSIEVE-001 (Pennsieve Upload) | Site |
| ☐ | Site reviews SOP-REDCAP-001 (REDCap Metadata Entry) | Site |
| ☐ | Site reviews SOP-GUI-001 (NeuroGate Tool User Guide) | Site |

## 6. Phase 2: Account and Tooling Setup

The site provisions accounts, secures credentials, sets up the local subject ID key, and installs the two pre-processing tools.

### 6.1 Pennsieve and REDCap Accounts

| Done | Task | Responsible |
|---|---|---|
| ☐ | Pennsieve account requested for Site Data Manager (and any backups) | Onboarding Lead |
| ☐ | Pennsieve workspace access granted | Pennsieve Workspace Admin |
| ☐ | Pennsieve dataset node ID shared with site | Onboarding Lead |
| ☐ | Site can log in to Pennsieve and see the target dataset | Site |
| ☐ | REDCap project access granted | REDCap Administrator |
| ☐ | Site can log in to REDCap and view the data dictionary | Site |

### 6.2 API Key (only required if site will use the Pennsieve Agent CLI)

| Done | Task | Responsible |
|---|---|---|
| ☐ | Pennsieve API key and secret generated (per SOP-PENNSIEVE-001 Section 5.2) | Site |
| ☐ | API key and secret stored securely (the secret is shown only once) | Site Data Manager |
| ☐ | `pennsieve whoami` returns the site account from the Site Data Manager's machine | Site |

### 6.3 Pre-Processing Tools

The site must install dcm2niix and pydeface before they can convert and de-identify data. Install instructions are on the NeuroGate site at `/tools` and in SOP-BIDS-001 Section 4.

| Done | Task | Responsible |
|---|---|---|
| ☐ | dcm2niix installed; `dcm2niix --version` succeeds | Site |
| ☐ | pydeface installed (with FSL FLIRT available on PATH); `pydeface --help` succeeds | Site |
| ☐ | Site has reviewed `/tools` page on the NeuroGate site for usage examples | Site |

### 6.4 Subject ID Key Storage

Per GOV-001 Section 2.3, the key linking BIDS subject IDs to real patient identifiers must live only at the originating institution in a secure, access-controlled system. It is never uploaded to Pennsieve or shared externally.

| Done | Task | Responsible |
|---|---|---|
| ☐ | Secure local storage location for subject ID key identified (e.g., institutional REDCap, encrypted spreadsheet on access-controlled share) | Site Data Manager |
| ☐ | Access list for the key documented (Site PI + Site Data Manager only, plus any institutional backups) | Site Data Manager |
| ☐ | First test entry written and read back to confirm the system works | Site Data Manager |

## 7. Phase 3: Training Session

The Onboarding Lead runs a training session covering the framework, the four operational SOPs, and a live demonstration of the NeuroGate tool. Completion of this phase is the formal training record per GOV-001 Section 2.5.

| Done | Task | Responsible |
|---|---|---|
| ☐ | Training session scheduled | Onboarding Lead |
| ☐ | Project overview and governance framework presented | Onboarding Lead |
| ☐ | BIDS folder structure and naming walked through with examples | Onboarding Lead |
| ☐ | De-identification workflow demonstrated end-to-end (DICOM strip, defacing, EEG header cleaning, filename PHI check) | Onboarding Lead |
| ☐ | NeuroGate tool demonstration (drop, mapping, metadata, validation, export, audit log) | Onboarding Lead |
| ☐ | Pennsieve upload walkthrough (web and CLI methods) | Onboarding Lead |
| ☐ | REDCap data entry walkthrough (controlled vocabularies, required fields) | Onboarding Lead |
| ☐ | Q and A completed | Both |
| ☐ | Training session recording shared with site (if applicable) | Onboarding Lead |
| ☐ | Site Data Manager confirms readiness to attempt the first supervised upload | Site Data Manager |

## 8. Phase 4: First Subject (Supervised)

The site uploads its first real subject end-to-end under direct supervision from the project lead. This is the validation run that satisfies GOV-001 Section 7.3 ("successfully upload and validate a test dataset"); the site's first real subject serves as the test case. Sites are not expected to generate synthetic data; this phase exists to catch problems with the live workflow before the site is trusted to upload independently. Subjects do not need a separate consent step here because consent for sharing was obtained at the original IRB protocol.

| Done | Task | Responsible |
|---|---|---|
| ☐ | First subject selected for upload | Site |
| ☐ | Subject ID assigned per institution prefix and starting number | Site Data Manager |
| ☐ | Subject ID-to-patient mapping recorded in the local key store (Section 6.4) | Site Data Manager |
| ☐ | dcm2niix conversion completed; JSON sidecars verified PHI-free | Site |
| ☐ | pydeface applied to all anatomical scans (T1w, T2w, FLAIR); visual QA confirms face removed and brain intact | Site |
| ☐ | EEG/iEEG headers cleaned per SOP-BIDS-001 Section 8.3 | Site |
| ☐ | NeuroGate tool used end-to-end (drop, mapping, metadata, validation, export) | Site |
| ☐ | NeuroGate validation step shows zero errors | Site |
| ☐ | Defacing attestation confirmed in NeuroGate metadata step | Site Data Manager |
| ☐ | PHI Clearance Form signed for this subject (per GOV-001 Section 2.3 and 6) | Site Data Manager |
| ☐ | First subject uploaded to Pennsieve under supervision (project lead on call or screen-share) | Site (with project lead watching) |
| ☐ | ALCOA+ audit log downloaded and archived alongside the BIDS export | Site Data Manager |
| ☐ | REDCap metadata entered for first subject | Site Data Manager |
| ☐ | First subject upload + REDCap entry validated by Quality Auditor | Quality Auditor |
| ☐ | Issues identified during the supervised run logged and resolved | Both |

## 9. Phase 5: Independent Operation

The site uploads two more subjects independently. The Quality Auditor reviews each. Once both pass review, the site is marked fully onboarded.

| Done | Task | Responsible |
|---|---|---|
| ☐ | Second subject prepared, uploaded, and REDCap entry completed independently | Site |
| ☐ | PHI Clearance Form signed for second subject | Site Data Manager |
| ☐ | Quality audit performed on second subject | Quality Auditor |
| ☐ | Third subject prepared, uploaded, and REDCap entry completed independently | Site |
| ☐ | PHI Clearance Form signed for third subject | Site Data Manager |
| ☐ | Quality audit performed on third subject | Quality Auditor |
| ☐ | Any non-conformances classified (Critical / Major / Minor per GOV-001 Section 7.2) and resolved | Both |
| ☐ | Onboarding Lead documents completion in the project training records (per GOV-001 Section 2.5) | Onboarding Lead |

---

## 10. Ongoing Site Support

Once Phase 5 reviews pass and onboarding completion is documented, the site is fully onboarded. They share data independently, enter the quarterly audit cycle (Section 11), and rely on the resources below for ongoing support.

| Item | Detail |
|---|---|
| Primary contact | Brandon Bach (bach2@seas.upenn.edu) |
| Reference docs (always-current versions) | NeuroGate site `/docs` page (GOV-001, SOP-BIDS-001, SOP-PENNSIEVE-001, SOP-REDCAP-001, SOP-GUI-001) |
| Pre-processing tool guides | NeuroGate site `/tools` page (dcm2niix and pydeface install + usage) |
| Issue reporting | Email Onboarding Lead; track in site's local issues log |
| Document version updates | Onboarding Lead notifies sites when a referenced doc is revised |

## 11. Quarterly Audit Cadence

Per GOV-001 Section 7.2, every active site is included in a quarterly audit. A sample of uploaded datasets is reviewed for BIDS validity, metadata completeness, de-identification, and audit trail integrity. Findings are classified Critical / Major / Minor and tracked to closure.

| Done | Task | Responsible |
|---|---|---|
| ☐ | Site notified of inclusion in quarterly audit cycle | Onboarding Lead |
| ☐ | First post-onboarding quarterly audit scheduled | Quality Auditor |
| ☐ | Audit findings reviewed with site | Both |
| ☐ | Corrective actions (if any) tracked to closure | Both |

---

## 12. Quick Reference

This section summarizes the onboarding workflow for day-to-day use during an active onboarding.

### Five Phases at a Glance

| Phase | Focus | Exit Criteria |
|---|---|---|
| 1. Pre-Onboarding | Agreements, IRB, roles, doc review | Site PI and Data Manager named; IRB and DUA on file; institution prefix assigned; all 5 docs reviewed |
| 2. Account and Tooling Setup | Pennsieve, REDCap, API key, pre-processing tools, subject ID key store | Site can log in to both platforms; dcm2niix and pydeface installed; secure local key store ready |
| 3. Training | Walk through framework, SOPs, and tool | Site Data Manager confirms readiness for the supervised first upload |
| 4. First Subject (Supervised) | First real subject uploaded end-to-end with project lead watching | Subject 1 uploaded and validated; PHI Clearance Form signed; ALCOA+ audit log archived |
| 5. Independent Operation | Subjects 2 and 3 uploaded independently | Both reviewed by Quality Auditor; non-conformances resolved; site marked fully onboarded |

### Critical Hard Stops

The following must be true before advancing to each phase. Onboarding does not move forward otherwise.

- **Before Phase 2:** Site PI confirmed, Site Data Manager designated, IRB approval and Data Use Agreement on file, institution prefix assigned.
- **Before Phase 3:** Both platform accounts working; subject ID key store ready; both pre-processing tools verified.
- **Before Phase 4:** Training session held and Site Data Manager confirms readiness.
- **Before Phase 5:** First subject uploaded under supervision and validated end-to-end; PHI Clearance Form signed; ALCOA+ audit log archived.
- **Before being marked fully onboarded:** All three subjects uploaded; PHI Clearance Form signed for each; Quality Auditor has reviewed subjects 2 and 3.

### Documents the Site Receives in Phase 1

| ID | Title |
|---|---|
| GOV-001 | Regulatory Governance Framework |
| SOP-BIDS-001 | BIDS Data Structure |
| SOP-PENNSIEVE-001 | Pennsieve Upload Procedures |
| SOP-REDCAP-001 | REDCap Metadata Entry |
| SOP-GUI-001 | NeuroGate Compliance Tool User Guide |

### Tools the Site Must Install

| Tool | Purpose | Where to Find Install Steps |
|---|---|---|
| dcm2niix | DICOM to NIfTI conversion + JSON sidecar | NeuroGate `/tools` page; SOP-BIDS-001 Section 4 |
| pydeface (with FSL) | Facial de-identification of T1w / T2w / FLAIR | NeuroGate `/tools` page; SOP-BIDS-001 Section 8.2 |
| Pennsieve Agent (optional) | CLI uploads, resumable for large datasets | SOP-PENNSIEVE-001 Section 7 |

---

## 13. Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | February 2026 | Brandon Bach | Initial 5-phase checklist template |
| 1.1 | April 2026 | Brandon Bach | Converted to markdown, added document ID header, added institution prefix field, referenced related SOPs by ID |
| 2.0 | May 6, 2026 | Brandon Bach | Major revision: added Purpose, Governance Traceability, Scope, and Roles sections to match sibling SOPs; added Site PI / Site Data Manager designation; added institution prefix and starting subject number coordination; added pre-processing tools (dcm2niix, pydeface) install to Phase 2; added subject ID key storage setup (GOV-001 2.3); added API key handling per SOP-PENNSIEVE-001 5.2; reframed Phase 4 as the supervised first real-subject upload (this serves as the GOV-001 7.3 validation upload; sites are not expected to produce synthetic test data) and Phase 5 as independent operation for subjects 2 and 3; added PHI Clearance Form sign-off per subject; added Ongoing Site Support and Quarterly Audit Cadence sections (GOV-001 7.2); added Quick Reference section to match sibling SOPs; expanded documentation package to include GOV-001 and SOP-GUI-001 |
| 2.1 | May 7, 2026 | Brandon Bach | Removed Penn-team affiliation from project roles (Onboarding Lead, Pennsieve Workspace Admin, REDCap Administrator, Quality Auditor) since the tool is project-owned, not Penn-affiliated; removed Site Information block, Onboarding Sign-Off section, Notes and Issues Log, and the Notes/Date columns from phase tables (these implied fillability the rendered doc cannot support, and the tool already captures the actual data); added a "How to use this document" preamble clarifying that the doc is a procedural reference; removed consent line from Phase 4 (consent for sharing was obtained at the original IRB protocol; no separate consent step is needed for the upload); replaced sign-off mechanic with documenting completion in the project training records (Phase 5 final task) |
