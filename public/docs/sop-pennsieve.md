# Standard Operating Procedure: Uploading Data to Pennsieve

| Field | Value |
|---|---|
| **Document ID** | SOP-PENNSIEVE-001 |
| **Version** | 2.2 |
| **Effective Date** | May 28, 2026 |
| **Author** | Brandon Bach |
| **Advisor** | Nishant Sinha |
| **Status** | Draft -- Pending Advisor Review |
| **Parent Document** | GOV-001: Regulatory and Governance Framework (v1.10) |
| **Related Documents** | SOP-BIDS-001, SOP-REDCAP-001, ONBOARD-001 |

---

## 1. Purpose

This Standard Operating Procedure (SOP) provides step-by-step instructions for uploading BIDS-formatted neuroimaging data to the Pennsieve platform. It covers two upload methods: the Pennsieve web interface (drag and drop) and the Pennsieve Agent command-line interface (CLI). This document is intended for researchers and data managers at sites participating in the multi-site epilepsy data sharing initiative.

## 2. Governance Traceability

This SOP implements specific requirements from the Regulatory and Governance Framework (GOV-001). Every procedure in this document traces back to the framework:

| SOP Section | GOV-001 Section | Requirement |
|---|---|---|
| 4 (Account setup, workspace access) | 2.1 (FAIR Accessible), 7.3 (Site Onboarding) | Authenticated access via Pennsieve credentials; workspace permissions verified before upload |
| 5-6 (Upload methods) | 2.4 (NIH DMSP), 2.1 (FAIR Accessible) | Data preserved on Pennsieve per NIH sharing requirements; standardized retrieval with authentication |
| 7 (Pre-upload validation) | 2.2 (ALCOA+ Accurate), 7.1 (Pre-Upload Checklist) | BIDS validator must report zero errors; all required files present before upload |
| 8 (Post-upload verification) | 2.2 (ALCOA+ Complete) | All files verified present and intact after upload |
| 9 (Audit and logging) | 2.2 (ALCOA+), 6 (Audit Traceability) | Upload logs attributable, contemporaneous, and available for audit |

## 3. Scope

This SOP covers:

- Pennsieve account creation and workspace access
- Uploading data via the Pennsieve web interface (drag and drop)
- Pennsieve Agent installation and configuration
- API key generation and authentication
- Uploading data via the Pennsieve Agent CLI (manifest-based workflow)
- Verification and troubleshooting

## 4. Prerequisites

Before beginning, ensure you have:

- Data organized in BIDS format per SOP-BIDS-001, either manually or using the GUI tool
- BIDS validation passed with zero errors (see Section 7)
- De-identification completed per SOP-BIDS-001 Section 8 (DICOM headers stripped, defacing applied, EEG headers cleaned)
- A Pennsieve account with access to your site's workspace (see Section 5)
- A signed data use agreement on file with the project team (per GOV-001 Section 7.3)
- Stable internet connection (neuroimaging uploads can be large, often several GB per subject)

For CLI uploads only:

- Administrative access to install software on your machine
- Terminal/command-line familiarity

## 5. Account Setup

### 5.1 Create a Pennsieve Account

1. Navigate to https://app.pennsieve.io
2. Click **Sign Up**
3. Enter your institutional email address and create a password
4. Complete email verification
5. Notify the project lead (Brandon Bach, brandon.bach44@gmail.com) with your registered email to be added to the workspace

### 5.2 Generate API Key (Required for CLI Uploads Only)

An API key is required to authenticate the Pennsieve Agent. If you plan to upload using only the web interface, you can skip this step.

1. Log in to Pennsieve at https://app.pennsieve.io
2. Click your profile icon (top right), then select **Account Settings**
3. Navigate to the **API Keys** section
4. Click **Create API Key**
5. Enter a descriptive name (e.g., "Site-Upload-Key")
6. Copy both the **API Key** and **API Secret**

> **Important:** Save both the API Key and API Secret securely. The secret is only shown once and cannot be retrieved later. If lost, you must generate a new key.

### 5.3 Locate Your Workspace Node ID

The workspace node ID identifies the target dataset on Pennsieve. The project administrator will provide this ID when you are granted workspace access. You can also find it in the Pennsieve web app by navigating to the dataset and checking the URL or dataset settings.

## 6. Method 1: Upload via Web Interface (Drag and Drop)

This is the simplest upload method and requires no software installation.

### 6.1 Navigate to the Dataset

1. Log in to https://app.pennsieve.io
2. Navigate to your site's workspace
3. Open the target dataset

### 6.2 Prepare Your Folder Structure

Before uploading, ensure your data follows the BIDS folder structure as described in SOP-BIDS-001. Your folder should look like:

```
primary/
└── sub-<ID>/
    ├── ses-preimplant/
    │   ├── anat/
    │   └── ...
    ├── ses-postimplant/
    │   ├── ct/
    │   ├── ieeg/
    │   └── ...
    └── ses-postsurgery/
        └── anat/
```

### 6.3 Upload Files

1. In the dataset's **Files** tab, create folders to match your BIDS structure if they do not already exist
2. Navigate to the target folder (e.g., `primary/`)
3. Drag your subject folder(s) from your local machine directly into the file browser panel
4. A popup window will show the files that will be uploaded
5. Click **Start Upload** to begin
6. You can safely minimize the popup window; files will continue uploading in the background
7. Once complete, uploaded files will appear in the file browser

### 6.4 Verify Upload

1. Browse through the uploaded folders in the web interface
2. Confirm all expected files are present
3. Check that file sizes match your local files

## 7. Method 2: Upload via Pennsieve Agent (CLI)

The Pennsieve Agent is recommended for large uploads or when uploading multiple subjects. It supports resumable uploads, meaning interrupted uploads can be continued without re-uploading completed files.

### 7.1 Install the Pennsieve Agent

Download the installer for your operating system from: https://github.com/Pennsieve/pennsieve-agent/releases

**macOS:**

```bash
# Download the latest release
curl -L -o pennsieve-agent.pkg \
  https://github.com/Pennsieve/pennsieve-agent/releases/latest/download/pennsieve-agent.pkg

# Install the package
sudo installer -pkg pennsieve-agent.pkg -target /

# Verify installation
pennsieve version
```

**Linux (Debian/Ubuntu):**

```bash
# Download the .deb package
wget https://github.com/Pennsieve/pennsieve-agent/releases/latest/download/pennsieve-agent.deb

# Install
sudo dpkg -i pennsieve-agent.deb

# Verify installation
pennsieve version
```

**Windows:**

1. Download `pennsieve-agent.msi` from the releases page
2. Double-click to run the installer
3. Follow the installation wizard
4. Open PowerShell and run: `pennsieve version`

### 7.2 Configure API Credentials

Run the configuration wizard:

```bash
pennsieve-agent config wizard
```

You will be prompted to enter your API Key and API Secret.

Alternatively, set credentials via environment variables:

```bash
# Linux/macOS
export PENNSIEVE_API_KEY="your-api-key"
export PENNSIEVE_API_SECRET="your-api-secret"

# Windows (PowerShell)
$env:PENNSIEVE_API_KEY="your-api-key"
$env:PENNSIEVE_API_SECRET="your-api-secret"
```

### 7.3 Verify Connection

```bash
pennsieve whoami
```

Expected output will show your email and organization name.

### 7.4 Select the Target Dataset

```bash
# List available datasets in your workspace
pennsieve dataset list

# Set the active dataset using its node ID
pennsieve dataset use <dataset-node-id>
```

The project administrator will provide you with the dataset node ID for your site's workspace.

### 7.5 Create an Upload Manifest

The Pennsieve Agent uses a two-step process: first you create a manifest (a list of files to upload), then you upload the manifest.

```bash
# Navigate to your BIDS dataset root
cd /path/to/your/bids_dataset

# Create a manifest for a single subject
pennsieve manifest create --files primary/sub-<ID>/

# Create a manifest for all subjects
pennsieve manifest create --files primary/
```

When you specify a path, all files under that path will be added recursively to the manifest.

### 7.6 Upload the Manifest

```bash
# Upload the manifest (use the manifest ID from the previous step)
pennsieve upload manifest <ManifestID>
```

The agent will upload files in the background. You can monitor progress with:

```bash
pennsieve agent subscribe
```

This shows a dynamic list of files and their upload progress.

### 7.7 Resume Interrupted Uploads

If an upload is interrupted (network issues, machine restart, etc.), simply re-run the upload command. The agent tracks upload state automatically and will skip files that have already been uploaded.

```bash
pennsieve upload manifest <ManifestID>
```

## 8. Pre-Upload Validation

Per GOV-001 Section 7.1, the following must be verified before every upload. Do not upload data that fails any of these checks.

### 8.1 If Using the GUI Tool

The GUI tool handles validation automatically. Before exporting:

1. Complete all 5 steps (File Drop, Mapping, Metadata, Validation, Export)
2. Validation step must show **zero errors** (warnings are acceptable if understood)
3. Confirm the defacing attestation checkbox
4. Export the BIDS ZIP file
5. Download the ALCOA+ audit log from the export screen
6. Unzip the exported file to get your BIDS-organized folder, then upload using Method 1 or 2 above

### 8.2 If Organizing Manually

Run the BIDS validator on your organized dataset before uploading:

```bash
npm install -g bids-validator
bids-validator /path/to/your/bids_dataset/
```

The validator must report **zero errors**. Warnings are acceptable if documented. Additionally, verify:

- [ ] All required files present per SOP-BIDS-001 Section 6
- [ ] All JSON sidecars present with required fields per SOP-BIDS-001
- [ ] De-identification complete (DICOM headers, defacing, EEG headers, filenames) per SOP-BIDS-001 Section 8
- [ ] PHI Clearance Form signed
- [ ] File sizes consistent with expected data volumes

## 9. Post-Upload Verification

After uploading (by either method), complete this checklist:

- [ ] All three session folders present (ses-preimplant, ses-postimplant, ses-postsurgery)
- [ ] T1w MRI file and JSON sidecar in ses-preimplant/anat/
- [ ] CT file and JSON sidecar in ses-postimplant/ct/
- [ ] iEEG files, channels.tsv, and electrodes.tsv in ses-postimplant/ieeg/
- [ ] File sizes match local files (no truncation during upload)
- [ ] Notify the project lead (brandon.bach44@gmail.com) that upload is complete

## 10. Audit and Logging Requirements

Per GOV-001 Section 6, every upload must be documented in the audit trail. The following records should be retained:

| Record | Source | What to Save |
|---|---|---|
| BIDS validation report | bids-validator or GUI tool | Full output (pass/fail, warnings, errors) |
| Upload log | Pennsieve Agent or web interface | Files uploaded, timestamps, completion status |
| ALCOA+ audit log | GUI tool (if used) | Auto-generated log covering detection, corrections, validation, defacing attestation |
| PHI Clearance Form | Site records | Signed confirmation that de-identification was completed |
| Defacing log | Site records | Tool name, version, files processed, visual QA result |

For CLI uploads, the Pennsieve Agent automatically logs upload activity. Save the agent output for your records:

```bash
pennsieve agent subscribe > upload_log_sub-CHOP016_$(date +%Y%m%d).txt
```

For web uploads, take a screenshot or note the file count and completion status after upload finishes.

All audit records should be stored locally at your site and a copy provided to Penn upon request. These records support ALCOA+ attributability (who uploaded), contemporaneity (when), and completeness (what was included).

## 11. Troubleshooting

| Issue | Solution |
|---|---|
| "Authentication failed" | Verify API key and secret are correct. Regenerate if necessary. |
| "Permission denied" | Contact the project administrator to verify workspace access permissions. |
| Upload stalls or times out | Check internet connection. For large files, try uploading in smaller batches or use the CLI method. |
| "Dataset not found" | Verify dataset node ID. Run `pennsieve dataset list` to see available datasets. |
| Files missing after upload | Re-upload missing files. Use the CLI with `--verbose` flag to monitor progress. |
| "Command not found: pennsieve" | Agent not in PATH. Reinstall or add installation directory to PATH. |
| Web upload fails for large files | Use the Pennsieve Agent CLI instead; it handles large files more reliably with chunked uploads. |

## 12. Which Method Should I Use?

| Scenario | Recommended Method |
|---|---|
| Small upload (a few files, under 1 GB) | Web interface (drag and drop) |
| Large upload (multiple subjects, several GB) | Pennsieve Agent CLI |
| Unreliable internet connection | Pennsieve Agent CLI (supports resume) |
| No terminal experience | Web interface (drag and drop) |
| Automated/scripted uploads | Pennsieve Agent CLI |

## 13. Contact and Support

- **Primary Contact:** Brandon Bach (brandon.bach44@gmail.com)
- **Pennsieve Documentation:** https://docs.pennsieve.io
- **Pennsieve Agent GitHub:** https://github.com/Pennsieve/pennsieve-agent
- **Pennsieve Support:** support@pennsieve.io

## 14. Quick Reference

This section summarizes the key steps from this SOP for day-to-day use.

### Web Upload (Simple)

1. Log in at https://app.pennsieve.io
2. Navigate to your site's workspace, open the target dataset
3. Go to `primary/` folder
4. Drag your `sub-<ID>/` folder into the file browser
5. Click **Start Upload**
6. Verify all files appear after upload completes

Best for: small uploads under 1 GB, single subjects, users without CLI experience.

### CLI Upload (Recommended for Large Data)

```bash
# One-time setup
pennsieve-agent config wizard    # Enter API key + secret
pennsieve whoami                 # Verify connection
pennsieve dataset use <ID>       # Set target dataset

# Each upload
pennsieve manifest create --files primary/sub-<ID>/
pennsieve upload manifest <ManifestID>
pennsieve agent subscribe        # Monitor progress
```

Best for: multi-subject uploads, large files, unreliable connections (supports resume).

### Post-Upload Verification

- [ ] All 3 session folders present (ses-preimplant, ses-postimplant, ses-postsurgery)
- [ ] T1w + JSON in ses-preimplant/anat/
- [ ] CT + JSON in ses-postimplant/ct/
- [ ] iEEG files + channels.tsv + electrodes.tsv in ses-postimplant/ieeg/
- [ ] File sizes match local files
- [ ] Notify the project lead at brandon.bach44@gmail.com

### Key Links

| Resource | URL |
|---|---|
| Pennsieve App | https://app.pennsieve.io |
| Pennsieve Docs | https://docs.pennsieve.io |
| Pennsieve Agent Downloads | https://github.com/Pennsieve/pennsieve-agent/releases |
| Support | support@pennsieve.io |

---

## 15. Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | February 2026 | Brandon Bach | Initial release |
| 1.1 | April 22, 2026 | Brandon Bach | Converted to markdown, added web upload method, updated CLI to manifest-based workflow, added method comparison table, removed Dataset 49 references |
| 1.2 | April 28, 2026 | Brandon Bach | Added quick-reference section (replaces separate quick-reference guide) |
| 2.0 | April 28, 2026 | Brandon Bach | Major update: added GOV-001 traceability section, added pre-upload validation section (GUI and manual workflows), added audit and logging requirements section (ALCOA+ records), added data use agreement to prerequisites, expanded post-upload verification, updated section numbering |
| 2.1 | May 7, 2026 | Brandon Bach | Replaced "Penn team" references with project-role labels (project lead for site notifications, project administrator for workspace access and node ID delivery, project team for the data use agreement) for consistency with the multi-site framing; updated workspace references from "Penn Epilepsy workspace" to "your site's workspace" so each site uploads to their own dataset |
| 2.2 | May 28, 2026 | Brandon Bach | Hygiene: updated parent document reference from GOV-001 v1.3 to v1.10 to reflect intervening framework revisions. No procedural changes. |
