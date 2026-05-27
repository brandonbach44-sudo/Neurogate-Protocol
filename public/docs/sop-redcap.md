# Standard Operating Procedure: Metadata Requirements and REDCap Data Entry

| Field | Value |
|---|---|
| **Document ID** | SOP-REDCAP-001 |
| **Version** | 1.3 |
| **Effective Date** | May 9, 2026 |
| **Author** | Brandon Bach |
| **Advisor** | Nishant Sinha |
| **Status** | Draft -- Pending Advisor Review |
| **Parent Document** | GOV-001: Regulatory and Governance Framework (v1.10) |
| **Related Documents** | SOP-BIDS-001, SOP-PENNSIEVE-001, ONBOARD-001 |

---

## 1. Purpose

This Standard Operating Procedure (SOP) defines the metadata requirements for sites participating in the multi-site epilepsy data sharing initiative, and provides step-by-step instructions for entering that metadata into REDCap. Complete, standardized metadata ensures that datasets are findable, interpretable, and reusable across sites per FAIR principles and ALCOA+ data integrity standards.

This document covers three categories of metadata: clinical and demographic data (entered in REDCap), imaging acquisition parameters (stored in BIDS JSON sidecars), and dataset-level metadata (stored in BIDS TSV and JSON files). Together, these form the complete metadata package required for each subject shared through the initiative.

## 2. Governance Traceability

This SOP implements specific requirements from the Regulatory and Governance Framework (GOV-001). Every procedure in this document traces back to the framework:

| SOP Section | GOV-001 Section | Requirement |
|---|---|---|
| 4 (Clinical metadata fields) | 2.1 (FAIR Findable, Reusable), 4 (Metadata Completeness) | Rich standardized metadata for subject discovery and cross-site analysis |
| 5 (Imaging acquisition metadata) | 3 (Data Standards by Modality), 2.2 (ALCOA+ Accurate) | Acquisition parameters preserved in JSON sidecars; metadata matches source data |
| 6 (BIDS dataset-level metadata) | 4 (Metadata Completeness), 2.1 (FAIR) | participants.tsv, sessions.tsv, dataset_description.json required and complete |
| 7 (REDCap project setup) | 2.2 (ALCOA+ Attributable, Contemporaneous) | Structured data entry with audit trail; each record linked to identified contributor |
| 8 (REDCap data entry workflow) | 2.2 (ALCOA+ Complete, Consistent) | All required fields populated; identical definitions across sites |
| 9 (De-identification in metadata) | 2.3 (HIPAA/PHI Protection) | No direct identifiers in any metadata field; age ranges only; coded IDs |
| 10 (Quality checks) | 2.2 (ALCOA+ Accurate), 7.2 (Periodic Audits) | Validation rules, cross-field checks, and periodic review |
| 11 (Audit trail) | 6 (Audit Traceability) | REDCap automatic logging of all entries, modifications, and user actions |

## 3. Scope

This SOP applies to all sites participating in the multi-site epilepsy data sharing initiative. It covers:

- Required clinical and demographic metadata for each subject
- Imaging acquisition parameters stored in BIDS JSON sidecars (MRI, CT, DWI, EEG, iEEG)
- BIDS dataset-level metadata files (participants.tsv, sessions.tsv, dataset_description.json)
- REDCap project structure, access controls, and data entry workflow
- De-identification requirements specific to metadata fields
- Quality checks, validation rules, and periodic data review

This SOP does not cover BIDS folder structure or file naming (see SOP-BIDS-001), platform upload procedures (Pennsieve worked example is in SOP-PENNSIEVE-001; sites using other platforms produce their own equivalents), or DICOM conversion and facial defacing (see SOP-BIDS-001 Section 8).

## 4. Clinical and Demographic Metadata

This section defines the clinical metadata collected for each subject. These fields are entered into REDCap (Section 8) and also populate the BIDS `participants.tsv` file (Section 6.1).

### 4.1 Required Demographic Fields

These fields must be completed for every subject before data upload.

| Field | Description | Format | PHI Note |
|---|---|---|---|
| participant_id | BIDS subject ID | `sub-{PREFIX}{###}` (e.g., sub-CHOP016) | Coded ID only; no link to real identity |
| age | Age at first session (pre-implant) | Integer (years); use 89+ for ages over 89 | Use ranges or cap at 89 per HIPAA Safe Harbor |
| sex | Biological sex | `M`, `F`, or `O` | Not considered PHI |
| handedness | Hand dominance | `R` (right), `L` (left), `A` (ambidextrous), or `U` (unknown) | Not considered PHI |

### 4.2 Required Epilepsy Clinical Fields

These fields capture the clinical context necessary for interpreting the neural data.

| Field | Description | Format | Notes |
|---|---|---|---|
| epilepsy_diagnosis | Primary epilepsy diagnosis | Controlled vocabulary (see 3.4) | Use ILAE 2017 classification |
| seizure_type | Primary seizure type(s) | Controlled vocabulary (see 3.4) | Use ILAE 2017 seizure classification |
| epilepsy_duration_years | Duration of epilepsy at time of evaluation | Integer (years) | Approximate is acceptable |
| age_at_onset | Age at first seizure | Integer (years) | Approximate is acceptable |
| seizure_frequency | Seizure frequency at time of evaluation | Controlled vocabulary (see 3.4) | Pre-surgical baseline |
| lateralization | Lateralization of epileptic focus | `left`, `right`, `bilateral`, `unknown` | Based on pre-surgical evaluation |
| localization | Lobe/region of epileptic focus | Controlled vocabulary (see 3.4) | Based on pre-surgical evaluation |
| etiology | Underlying cause if known | Free text (max 200 chars) | e.g., "hippocampal sclerosis", "cortical dysplasia" |
| prior_surgery | History of prior epilepsy surgery | `yes`, `no` | Include type in notes if yes |
| current_aeds | Current anti-epileptic drugs at time of monitoring | Free text (drug names, comma-separated) | Generic names preferred |
| num_aeds_tried | Number of AEDs tried (lifetime) | Integer | Indicates drug resistance |

### 4.3 Recommended Clinical Fields

These fields are strongly encouraged but not required for upload. They enhance the scientific value of the dataset.

| Field | Description | Format | Notes |
|---|---|---|---|
| mri_lesion | MRI-visible lesion present | `yes`, `no`, `equivocal` | Based on clinical radiology report |
| mri_lesion_location | Location of MRI lesion | Free text (max 200 chars) | e.g., "right mesial temporal" |
| pet_result | PET scan result | `hypometabolism`, `normal`, `not_done` | If PET was part of evaluation |
| neuropsych_iq | Full-scale IQ from neuropsych testing | Integer or `not_done` | Standardized score |
| wada_result | Wada test result for language lateralization | `left`, `right`, `bilateral`, `not_done` | If Wada was performed |
| surgical_procedure | Type of surgery performed | Controlled vocabulary (see 3.4) | Completed after post-surgery session |
| surgical_outcome | Engel classification at last follow-up | `I`, `II`, `III`, `IV`, or `not_available` | Minimum 6 months post-surgery |
| follow_up_duration_months | Duration of post-surgical follow-up | Integer (months) | At time of data entry |
| implant_type | Type of intracranial electrodes | `sEEG`, `subdural_grids`, `strips`, `combined` | Documents electrode configuration |
| num_electrodes | Total number of electrode contacts implanted | Integer | Helps interpret iEEG data |

### 4.4 Controlled Vocabularies

To ensure consistency across sites, the following fields use controlled vocabularies.

**epilepsy_diagnosis:**
- `focal_epilepsy` -- Focal (localization-related) epilepsy
- `generalized_epilepsy` -- Generalized epilepsy
- `combined_focal_generalized` -- Combined focal and generalized
- `unknown_epilepsy` -- Epilepsy of unknown type

**seizure_type** (select all that apply):
- `focal_aware` -- Focal onset, awareness retained
- `focal_impaired_awareness` -- Focal onset, impaired awareness
- `focal_to_bilateral_tc` -- Focal to bilateral tonic-clonic
- `generalized_tc` -- Generalized tonic-clonic
- `absence` -- Absence seizures
- `myoclonic` -- Myoclonic seizures
- `other` -- Other (specify in notes)

**seizure_frequency:**
- `daily` -- One or more per day
- `weekly` -- One or more per week
- `monthly` -- One or more per month
- `less_than_monthly` -- Less than one per month
- `seizure_free` -- Seizure-free (if post-surgical)

**localization:**
- `temporal` -- Temporal lobe
- `frontal` -- Frontal lobe
- `parietal` -- Parietal lobe
- `occipital` -- Occipital lobe
- `insular` -- Insular cortex
- `multifocal` -- Multiple foci
- `unknown` -- Not localized

**surgical_procedure:**
- `anterior_temporal_lobectomy` -- Standard ATL
- `selective_amygdalohippocampectomy` -- SAH
- `lesionectomy` -- Lesion resection
- `focal_cortical_resection` -- Non-lesional focal resection
- `laser_ablation` -- Laser interstitial thermal therapy (LITT)
- `responsive_neurostimulation` -- RNS device placement
- `vagus_nerve_stimulation` -- VNS device placement
- `corpus_callosotomy` -- Corpus callosotomy
- `other` -- Other (specify in notes)
- `none` -- No surgery performed

## 5. Imaging Acquisition Metadata

Imaging acquisition parameters are stored in BIDS JSON sidecar files (one per acquisition). Most fields are auto-populated by dcm2niix during DICOM conversion; sites should verify completeness after conversion.

### 5.1 MRI Acquisition Fields (T1w, T2w, FLAIR)

| Field | Description | Unit | Source |
|---|---|---|---|
| Manufacturer | Scanner manufacturer | String | dcm2niix (auto) |
| ManufacturersModelName | Scanner model | String | dcm2niix (auto) |
| MagneticFieldStrength | Field strength | Tesla (e.g., 3) | dcm2niix (auto) |
| RepetitionTime | TR | Seconds | dcm2niix (auto) |
| EchoTime | TE | Seconds | dcm2niix (auto) |
| InversionTime | TI (T1w, FLAIR) | Seconds | dcm2niix (auto) |
| FlipAngle | Flip angle | Degrees | dcm2niix (auto) |
| SliceThickness | Slice thickness | Millimeters | dcm2niix (auto) |
| PixelBandwidth | Pixel bandwidth | Hz/pixel | dcm2niix (auto) |
| ParallelReductionFactorInPlane | GRAPPA/SENSE factor | Number | dcm2niix (auto) |
| InstitutionName | Acquiring institution | String | **Review for PHI** |
| AcquisitionDateTime | Date/time of scan | ISO 8601 | **Remove or shift per Section 8** |

### 5.2 CT Acquisition Fields

| Field | Description | Unit | Source |
|---|---|---|---|
| Manufacturer | Scanner manufacturer | String | dcm2niix (auto) |
| ManufacturersModelName | Scanner model | String | dcm2niix (auto) |
| AcquisitionVoltage | Tube voltage (kVp) | kV | dcm2niix (auto) |
| ExposureTime | Exposure time | Seconds | dcm2niix (auto) |
| SliceThickness | Slice thickness | Millimeters | dcm2niix (auto) |
| ConvolutionKernel | Reconstruction kernel | String | dcm2niix (auto) |

### 5.3 DWI Acquisition Fields

All MRI fields from Section 5.1 apply, plus:

| Field | Description | Unit | Source |
|---|---|---|---|
| PhaseEncodingDirection | Phase encoding direction | `i`, `j`, `k` (with +/-) | dcm2niix (auto) |
| TotalReadoutTime | Total readout time | Seconds | dcm2niix (auto) |
| DiffusionScheme | Diffusion weighting scheme | String (e.g., "Monopolar") | Manual or dcm2niix |

The `.bval` and `.bvec` files containing b-values and diffusion gradient directions are generated automatically by dcm2niix.

### 5.4 EEG/iEEG Acquisition Fields

| Field | Description | Unit | Source |
|---|---|---|---|
| SamplingFrequency | Sampling rate | Hz | Manual entry required |
| EEGReference / iEEGReference | Reference electrode | String | Manual entry required |
| PowerLineFrequency | Power line frequency | Hz (50 or 60) | Manual entry required |
| RecordingDuration | Total recording duration | Seconds | Manual entry required |
| RecordingType | Continuous or epoched | `continuous` or `epoched` | Manual entry required |
| ElectrodeManufacturer | Electrode manufacturer (iEEG only) | String | Manual entry required |
| iEEGPlacementScheme | Placement method (iEEG only) | String (e.g., "sEEG") | Manual entry required |
| SoftwareFilters | Online filters applied | Object (see BIDS spec) | Manual entry required |
| TaskName | Task performed during recording | String | Manual entry required |

> **Note:** Unlike MRI/CT, EEG and iEEG sidecar fields are typically not auto-populated by conversion tools. Sites must manually create or verify these JSON files. See SOP-BIDS-001 Section 7 for file templates.

### 5.5 Verifying Auto-Populated Fields

After running dcm2niix, verify that the generated JSON sidecars contain all required fields:

1. Open each `.json` sidecar in a text editor
2. Check that all fields listed in Sections 4.1 through 4.3 are present
3. Verify numeric values are reasonable (e.g., MagneticFieldStrength should be 1.5 or 3, not 1500 or 3000)
4. Check for PHI in `InstitutionName` and date fields (see Section 9)
5. If any required fields are missing, add them manually using values from the scanner protocol or imaging technologist

## 6. BIDS Dataset-Level Metadata

These files live at the dataset root or subject level and are required for BIDS compliance. Full details are in SOP-BIDS-001 Sections 7.1 through 7.5; this section summarizes the metadata content requirements.

### 6.1 participants.tsv

One row per subject. This file is the bridge between REDCap clinical data and the BIDS dataset.

| Column | Required | Description | Source |
|---|---|---|---|
| participant_id | Yes | BIDS subject ID (`sub-{PREFIX}{###}`) | Assigned per SOP-BIDS-001 Section 4.1 |
| age | Yes | Age at first session | REDCap field: age |
| sex | Yes | Biological sex | REDCap field: sex |
| handedness | Yes | Hand dominance | REDCap field: handedness |
| epilepsy_diagnosis | Recommended | Primary diagnosis (ILAE 2017) | REDCap field: epilepsy_diagnosis |
| seizure_type | Recommended | Primary seizure type | REDCap field: seizure_type |
| lateralization | Recommended | Side of epileptic focus | REDCap field: lateralization |
| localization | Recommended | Lobe of epileptic focus | REDCap field: localization |

A corresponding `participants.json` data dictionary must define each column with a `Description` and, where applicable, `Levels` (for categorical variables) and `Units` (for numeric variables).

### 6.2 sessions.tsv (Per Subject)

One row per session, stored at `sub-<ID>/sub-<ID>_sessions.tsv`.

| Column | Required | Description |
|---|---|---|
| session_id | Yes | `ses-preimplant`, `ses-postimplant`, or `ses-postsurgery` |
| acq_time | Recommended | Acquisition date (shifted if needed; format `YYYY-MM-DD`) |
| age | Recommended | Age at time of this session (may differ from baseline) |

### 6.3 dataset_description.json

Provided by the project team for the root dataset. Sites do not need to create this file but should be aware of its contents:

| Field | Description |
|---|---|
| Name | Dataset name (e.g., your site's dataset name) |
| BIDSVersion | BIDS specification version (e.g., "1.8.0") |
| DatasetType | Always "raw" for source data |
| Authors | List of contributing authors |
| GeneratedBy | Tools used for BIDS conversion (auto-filled by NeuroGate) |

### 6.4 Electrodes and Channels TSV Files

Required for EEG and iEEG sessions. See SOP-BIDS-001 Sections 7.4 and 7.5 for complete field definitions. Key requirements:

**electrodes.tsv** (iEEG): name, x, y, z (MNI coordinates), size, type, material, manufacturer

**channels.tsv** (EEG and iEEG): name, type, units, sampling_frequency, low_cutoff, high_cutoff, reference, status, status_description

Channel names in `channels.tsv` must exactly match electrode names in `electrodes.tsv` for the same session. This cross-validation is checked by the GUI tool and the BIDS validator.

## 7. REDCap Project Setup

REDCap (Research Electronic Data Capture) serves as the centralized metadata registry for the multi-site epilepsy data sharing initiative. It provides structured data entry, validation rules, and a complete audit trail per ALCOA+ requirements.

### 7.1 Project Structure

The REDCap project is organized into the following instruments (forms):

| Instrument | Fields | When Completed |
|---|---|---|
| Subject Registration | participant_id, participating_site, date_registered, registered_by | When subject is first enrolled |
| Demographics | age, sex, handedness | With registration |
| Epilepsy History | epilepsy_diagnosis, seizure_type, epilepsy_duration_years, age_at_onset, seizure_frequency, lateralization, localization, etiology, prior_surgery, current_aeds, num_aeds_tried | Before data upload |
| Pre-Implant Session | session date, modalities collected, scan parameters summary, EEG recording details | After pre-implant data organized |
| Post-Implant Session | session date, implant_type, num_electrodes, modalities collected, iEEG recording details | After post-implant data organized |
| Post-Surgery Session | session date, surgical_procedure, modalities collected | After post-surgery data organized |
| Clinical Outcomes | surgical_outcome (Engel class), follow_up_duration_months, seizure_freedom_status | When outcome data available |
| Additional Assessments | mri_lesion, mri_lesion_location, pet_result, neuropsych_iq, wada_result | When available |
| Upload Tracking | upload_date, upload_method, bids_validation_status, platform_dataset_id, uploaded_by | After each upload to the site's data infrastructure |

### 7.2 Access and Permissions

| Role | REDCap Rights | Assigned To |
|---|---|---|
| Project Admin | Full access; design rights; user management | REDCap Administrator (project team, per GOV-001) |
| Site Data Manager | Data entry for own site records; export for own site; no design rights | Site data managers completing onboarding |
| Site PI | Read-only access to own site records | Site PIs for oversight |
| Quality Auditor | Read-only access to all records; export rights | Designated auditor per GOV-001 |

Access is granted after completing site onboarding (ONBOARD-001) and signing the data use agreement.

### 7.3 Data Access Groups (DAGs)

Each participating site is assigned a Data Access Group in REDCap. This ensures that site personnel can only view and edit records from their own institution. The REDCap Administrator and Quality Auditor can view all records for coordination and quality oversight.

## 8. REDCap Data Entry Workflow

### 8.1 Step 1: Register a New Subject

1. Log in to REDCap at the URL provided during site onboarding
2. Navigate to the multi-site epilepsy project
3. Click **Add new record**
4. REDCap will assign a record ID automatically
5. Open the **Subject Registration** instrument
6. Enter the BIDS `participant_id` (e.g., `sub-CHOP016`) -- this must match the folder name in your BIDS dataset exactly
7. Select your site from the dropdown
8. Enter the registration date and your name
9. Click **Save & Go To Next Instrument**

> **Important:** The `participant_id` entered here is the link between REDCap and the BIDS dataset on the site's data infrastructure. Double-check that it matches your BIDS folder name exactly, including the `sub-` prefix.

### 8.2 Step 2: Enter Demographics

1. On the **Demographics** instrument, enter age, sex, and handedness
2. For age: enter the patient's age at the time of the pre-implant session
3. If the patient is over 89, enter `89` and check the "Age 89+" flag (HIPAA Safe Harbor requirement)
4. Click **Save & Go To Next Instrument**

### 8.3 Step 3: Enter Epilepsy History

1. On the **Epilepsy History** instrument, complete all required fields
2. Use the controlled vocabularies defined in Section 4.4 of this SOP
3. For seizure_type, you may select multiple values
4. If a field value is unknown, select "unknown" rather than leaving it blank -- blank fields trigger validation warnings
5. For free-text fields (etiology, current_aeds), do not include any patient-identifying information
6. Click **Save & Go To Next Instrument**

### 8.4 Step 4: Enter Session Details

Complete one session instrument for each session with available data.

**Pre-Implant Session:**
1. Enter the session date (shifted if required by your IRB; note the shift amount in your local records)
2. Check which modalities were collected (T1w, T2w, FLAIR, DWI, scalp EEG, fMRI, field maps)
3. Summarize key scan parameters (field strength, scanner model) or note "see JSON sidecars"
4. For EEG: enter sampling frequency, reference, recording duration, and task name

**Post-Implant Session:**
1. Enter the session date
2. Select implant type (sEEG, subdural grids, strips, combined)
3. Enter total number of electrode contacts
4. Check modalities collected (CT, iEEG)
5. For iEEG: enter sampling frequency, reference, electrode manufacturer, placement scheme

**Post-Surgery Session:**
1. Enter the session date
2. Select the surgical procedure from the controlled vocabulary
3. Check modalities collected (typically post-op T1w)

### 8.5 Step 5: Track Upload Status

After uploading data to the site's data infrastructure (if using Pennsieve, per SOP-PENNSIEVE-001):

1. Open the **Upload Tracking** instrument
2. Enter the upload date
3. Select the upload method (e.g., web interface, agent CLI, programmatic API)
4. Record the BIDS validation status (pass, pass with warnings, or fail with details)
5. Enter the platform dataset ID (Pennsieve node ID, S3 key, internal record ID, etc.)
6. Enter the name of the person who performed the upload

### 8.6 Step 6: Enter Outcomes (When Available)

Clinical outcome data may not be available at the time of initial data upload. Return to the record when follow-up data becomes available:

1. Open the **Clinical Outcomes** instrument
2. Select the Engel classification (I through IV) based on the most recent follow-up
3. Enter the follow-up duration in months
4. Enter seizure freedom status

### 8.7 Saving and Form Status

REDCap tracks form completion status with colored indicators:

| Status | Color | Meaning |
|---|---|---|
| Incomplete | Red | Form opened but not saved with data |
| Unverified | Yellow | Data entered but not reviewed |
| Complete | Green | Data entered and verified |

After entering data on each instrument, set the form status to **Complete** only after reviewing all entries for accuracy. Use **Unverified** for initial entry, then return to mark as **Complete** after review.

## 9. De-Identification Requirements for Metadata

All metadata, whether in REDCap, JSON sidecars, or TSV files, must be free of protected health information (PHI) before leaving the originating institution. This section supplements SOP-BIDS-001 Section 8 with metadata-specific guidance.

### 9.1 Fields That Must Not Contain PHI

| Field / Location | Risk | Required Action |
|---|---|---|
| participant_id (all files) | Could encode MRN or name | Use only the assigned `sub-{PREFIX}{###}` format |
| age (participants.tsv, REDCap) | Ages over 89 are identifying | Cap at 89; use "89+" flag |
| Dates (sessions.tsv, JSON) | Exact dates are HIPAA identifiers | Remove, shift, or use relative dates only |
| InstitutionName (JSON sidecars) | May be acceptable if study is public | Review with PI; may keep if site participation is public |
| Free-text fields (REDCap) | Could contain names, locations, MRN | Never include patient names, MRNs, room numbers, or provider names |
| Etiology / notes fields | Could reference unique clinical details | Keep descriptions general (e.g., "cortical dysplasia" not "lesion identified during 2019 admission to HUP") |

### 9.2 Date Handling

Dates require special attention because they appear in multiple locations:

| Location | Recommendation |
|---|---|
| JSON sidecar `AcquisitionDateTime` | Remove entirely, or shift by a consistent random offset (document shift in local records) |
| sessions.tsv `acq_time` | Use shifted dates with the same offset as JSON files, or omit |
| REDCap session dates | Enter shifted dates (same offset), or store actual dates only if your REDCap instance is behind institutional firewall with appropriate access controls |
| File modification timestamps | Not controlled by BIDS; do not rely on these for provenance |

> **Important:** If using date shifting, apply the same random offset (e.g., +/- 30-365 days) consistently to all dates for a given subject across all files. Document the offset in your local, secure records. Never upload the offset value to any data infrastructure or REDCap.

### 9.3 Pre-Upload Metadata PHI Checklist

Before uploading any data, verify:

- [ ] All `participant_id` values use coded format only
- [ ] No ages over 89 (capped or flagged)
- [ ] All dates removed, shifted, or appropriately controlled
- [ ] Free-text fields reviewed for names, MRNs, locations, provider names
- [ ] JSON sidecar `InstitutionName` reviewed with PI
- [ ] EEG/iEEG sidecar fields do not contain patient names or MRNs
- [ ] `electrodes.tsv` electrode names do not encode patient information

## 10. Quality Checks and Validation

### 10.1 REDCap Built-In Validation

The REDCap project uses the following validation rules to catch errors at entry time:

| Field | Validation Rule |
|---|---|
| participant_id | Must match pattern `sub-[A-Z]{2,6}[0-9]{3}` |
| age | Integer, range 0-89 |
| sex | Dropdown: M, F, O |
| handedness | Dropdown: R, L, A, U |
| epilepsy_duration_years | Integer, range 0-89 |
| age_at_onset | Integer, range 0-89 |
| num_aeds_tried | Integer, range 0-30 |
| num_electrodes | Integer, range 1-300 |
| SamplingFrequency (session forms) | Number, range 1-100000 |

### 10.2 Cross-Field Checks

The following logical checks should be verified manually or via REDCap data quality rules:

| Check | Rule | Action if Failed |
|---|---|---|
| Age consistency | `age_at_onset` <= `age` | Correct the entry |
| Duration consistency | `epilepsy_duration_years` approximately equals `age` minus `age_at_onset` | Verify and correct |
| Session completeness | Each session marked in REDCap has corresponding BIDS data on the data infrastructure | Upload missing data or correct REDCap |
| ID match | `participant_id` in REDCap matches the BIDS folder name on the data infrastructure | Correct before upload |
| Outcome timeline | `follow_up_duration_months` > 0 if `surgical_outcome` is entered | Verify follow-up period |

### 10.3 Periodic Data Quality Review

Per GOV-001 Section 7.2, metadata quality is reviewed as part of quarterly audits:

1. Export REDCap data and compare `participant_id` values against the data infrastructure's folder names
2. Check for records missing required fields (REDCap Missing Data report)
3. Verify that all uploaded subjects have corresponding REDCap records
4. Review free-text fields for potential PHI
5. Cross-check `participants.tsv` on the data infrastructure against REDCap demographics for consistency
6. Flag any discrepancies as Major non-conformances per GOV-001 Section 7.2

## 11. Audit Trail

REDCap automatically maintains a complete audit trail that satisfies ALCOA+ requirements:

| ALCOA+ Principle | REDCap Implementation |
|---|---|
| Attributable | Every entry and modification linked to a named user account |
| Legible | Structured forms with controlled vocabularies; no ambiguous entries |
| Contemporaneous | Timestamps automatically recorded for every save |
| Original | Full version history; original values preserved even after edits |
| Accurate | Validation rules prevent out-of-range or malformed entries |
| Complete | Required field flags; form completion status tracking |
| Consistent | Controlled vocabularies and dropdowns enforce uniform values across sites |
| Enduring | REDCap data stored on institutional servers with backup; exportable |
| Available | Web-based access with appropriate permissions; data export in CSV/XML |

To export the audit trail: navigate to **Logging** in the REDCap left menu. The log shows every data change, export, user login, and form status change with timestamps and user IDs.

## 12. Troubleshooting

| Issue | Cause | Resolution |
|---|---|---|
| Cannot add a new record | Insufficient permissions | Contact the REDCap Administrator to verify your Data Access Group assignment |
| participant_id validation fails | Format does not match `sub-[A-Z]{2,6}[0-9]{3}` | Check prefix is uppercase letters only and number is 3 digits zero-padded |
| Cannot see other site records | Data Access Groups restrict visibility | This is expected behavior; contact the project team if cross-site access is needed for auditing |
| Form shows "Incomplete" after saving | Form status not set manually | Set status dropdown to "Unverified" or "Complete" before saving |
| Uploaded subject not in REDCap | REDCap entry was skipped | Create the record immediately; note the delay in the registration date |
| REDCap and BIDS age values differ | Different age calculation or rounding | Reconcile to use the same value; age at pre-implant session is the standard |
| Free-text field contains PHI | Entered by mistake | Edit the field to remove PHI; the original value is preserved in the audit log (contact REDCap admin to discuss if the audit log entry itself is a concern) |

---

## 13. Contact and Support

For questions or assistance with metadata entry or REDCap:

- **Primary Contact:** Brandon Bach (brandon.bach44@gmail.com)
- **REDCap Documentation:** https://projectredcap.org/resources/
- **BIDS Specification:** https://bids-specification.readthedocs.io/
- **ILAE Classification:** https://www.ilae.org/guidelines/definition-and-classification

## 14. Quick-Reference Guide

This section provides a condensed reference for day-to-day use. For full details, see the sections referenced.

### Minimum Required Metadata Per Subject

| Category | Fields | Where Entered |
|---|---|---|
| Demographics | participant_id, age, sex, handedness | REDCap + participants.tsv |
| Epilepsy Clinical | epilepsy_diagnosis, seizure_type, epilepsy_duration_years, age_at_onset, seizure_frequency, lateralization, localization | REDCap |
| Session Info | session_id, acq_time (optional), age at session (optional) | sessions.tsv |
| MRI Params | Manufacturer, MagneticFieldStrength, RepetitionTime, EchoTime, FlipAngle, SliceThickness | JSON sidecars (auto from dcm2niix) |
| EEG/iEEG Params | SamplingFrequency, Reference, PowerLineFrequency, TaskName | JSON sidecars (manual entry) |
| Upload Record | upload_date, method, validation_status, platform_id | REDCap |

### REDCap Entry Checklist (Per Subject)

1. [ ] Register subject with correct `participant_id`
2. [ ] Enter demographics (age, sex, handedness)
3. [ ] Complete epilepsy history (all required fields)
4. [ ] Enter session details for each available session
5. [ ] Verify no PHI in any free-text field
6. [ ] Set form status to Unverified, then Complete after review
7. [ ] After upload: enter upload tracking details
8. [ ] When available: enter clinical outcomes

### PHI Quick Check

Before saving any record, verify:

- No patient names, MRNs, or provider names anywhere
- Age capped at 89
- Dates shifted or removed
- Free-text fields use general clinical terms only

### Controlled Vocabulary Quick Reference

| Field | Valid Values |
|---|---|
| sex | M, F, O |
| handedness | R, L, A, U |
| epilepsy_diagnosis | focal_epilepsy, generalized_epilepsy, combined_focal_generalized, unknown_epilepsy |
| seizure_frequency | daily, weekly, monthly, less_than_monthly, seizure_free |
| lateralization | left, right, bilateral, unknown |
| localization | temporal, frontal, parietal, occipital, insular, multifocal, unknown |
| implant_type | sEEG, subdural_grids, strips, combined |
| surgical_outcome | I, II, III, IV, not_available |

---

## 15. Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | May 1, 2026 | Brandon Bach | Initial release: clinical metadata requirements, imaging acquisition metadata, BIDS dataset-level metadata, REDCap project structure and entry workflow, de-identification guidance, quality checks, quick-reference section |
| 1.1 | May 7, 2026 | Brandon Bach | Reframed sites as "participating in the multi-site epilepsy data sharing initiative" rather than "contributing to the Penn Epilepsy Dataset"; renamed `contributing_site` field to `participating_site`; replaced "Penn team" references with project-role labels (REDCap Administrator for permissions issues, project team for the dataset_description.json and cross-site auditing); reframed REDCap as the centralized metadata registry for the initiative; replaced "your contributing site" with "your site" in DAG selection step |
| 1.2 | May 9, 2026 | Brandon Bach | Decoupled REDCap workflow from Pennsieve as the assumed data infrastructure. Renamed `pennsieve_dataset_id` and `pennsieve_id` fields to `platform_dataset_id` and `platform_id`. Reframed every "data on Pennsieve" / "uploaded to Pennsieve" reference to "data infrastructure" / "your platform." Upload Tracking workflow now accepts any platform (Pennsieve, S3, internal archive, etc.) with method examples broadened from "web interface or Pennsieve Agent CLI" to "e.g., web interface, agent CLI, programmatic API." |
| 1.3 | May 27, 2026 | Brandon Bach | Section 6.3 dataset_description.json table: dropped License and DatasetDOI rows (the NeuroGate tool does not capture them) and added DatasetType. Brought the parent GOV-001 reference up to v1.10. |
