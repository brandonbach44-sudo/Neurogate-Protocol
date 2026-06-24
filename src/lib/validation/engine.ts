/**
 * Validation Engine — Main Orchestrator
 *
 * Combines all validators into a single pipeline:
 *   1. BIDS structure validation
 *   2. PHI scanning
 *   3. Required files check
 *   4. Cross-session consistency
 *
 * Produces a ValidationReport with all issues, counts, and pass/fail.
 */

import type { DetectionResult } from '../../types/detection';
import type { SubjectMetadata, DatasetDescription, DefacingAttestation, InstitutionConfig } from '../../types/metadata';
import type { ValidationIssue, ValidationReport } from '../../types/validation';
import { finalizeReport } from '../../types/validation';
import { getEffectiveModality } from '../../types/detection';

import { validateBidsStructure } from './bidsValidator';
import { scanForPhi } from './phiScanner';
import { checkRequiredFiles } from './requiredFilesChecker';
import { checkCrossSessionConsistency } from './crossSessionChecker';

/** Everything the validation engine needs as input */
export interface ValidationInput {
  detectionResults: DetectionResult[];
  subjects: SubjectMetadata[];
  datasetDescription: DatasetDescription;
  defacingAttestation: DefacingAttestation;
  institutionConfig: InstitutionConfig;
}

/**
 * Run the full validation pipeline.
 *
 * Returns a ValidationReport with all issues found across all validators.
 */
export function runValidation(input: ValidationInput): ValidationReport {
  const allIssues: ValidationIssue[] = [];

  // ── 1. BIDS Structure ─────────────────────────────────────
  const bidsIssues = validateBidsStructure(input.detectionResults, input.subjects);
  allIssues.push(...bidsIssues);

  // ── 2. PHI Scanning ───────────────────────────────────────
  const phiIssues = scanForPhi(input.detectionResults, input.subjects);
  allIssues.push(...phiIssues);

  // ── 3. Required Files ─────────────────────────────────────
  const requiredIssues = checkRequiredFiles(input.detectionResults, input.subjects);
  allIssues.push(...requiredIssues);

  // ── 4. Cross-Session Consistency ──────────────────────────
  const crossIssues = checkCrossSessionConsistency(input.detectionResults, input.subjects);
  allIssues.push(...crossIssues);

  // ── 5. Metadata completeness checks ───────────────────────
  const metadataIssues = validateMetadata(input);
  allIssues.push(...metadataIssues);

  // ── 6. Sparse / single-file dataset warning ────────────────
  const sparseIssues = checkSparseDataset(input);
  allIssues.push(...sparseIssues);

  // ── Finalize report ───────────────────────────────────────
  return finalizeReport(allIssues);
}

// ── Metadata validation (inline — simple enough to keep here) ────

let metaCounter = 0;
function nextMetaId(): string {
  return `meta-${++metaCounter}`;
}

function validateMetadata(input: ValidationInput): ValidationIssue[] {
  metaCounter = 0;
  const issues: ValidationIssue[] = [];

  // Dataset description checks
  if (!input.datasetDescription.name.trim()) {
    issues.push({
      id: nextMetaId(),
      category: 'metadata',
      severity: 'error',
      title: 'Missing study name',
      description: 'The dataset_description.json requires a study name. Go back to the Metadata step and fill in the Study Name field.',
      affectedFiles: [],
      dismissable: false,
    });
  }

  if (input.datasetDescription.authors.every(a => !a.trim())) {
    issues.push({
      id: nextMetaId(),
      category: 'metadata',
      severity: 'error',
      title: 'No authors listed',
      description: 'The dataset_description.json requires at least one author. Go back to the Metadata step and add author names.',
      affectedFiles: [],
      dismissable: false,
    });
  }

  // Institution config checks
  if (!input.institutionConfig.prefix || !/^[A-Z]{2,6}$/.test(input.institutionConfig.prefix)) {
    issues.push({
      id: nextMetaId(),
      category: 'metadata',
      severity: 'error',
      title: 'Invalid institution prefix',
      description: 'The institution prefix must be 2-6 uppercase letters (e.g., "CHOP", "PENN", "HUP"). Go back to the Metadata step to fix this.',
      affectedFiles: [],
      dismissable: false,
    });
  }

  // Defacing attestation (only if structural MRI present)
  const hasStructuralMri = input.detectionResults.some(r => {
    const mod = getEffectiveModality(r);
    return mod === 'anat-T1w' || mod === 'anat-T2w' || mod === 'anat-FLAIR';
  });

  if (hasStructuralMri) {
    if (!input.defacingAttestation.confirmed) {
      issues.push({
        id: nextMetaId(),
        category: 'defacing',
        severity: 'error',
        title: 'Defacing attestation not confirmed',
        description: 'Your upload includes structural MRI files (T1w/T2w) which must be defaced per HIPAA requirements. Go back to the Metadata step and confirm that all structural MRIs have been defaced.',
        affectedFiles: input.detectionResults
          .filter(r => {
            const mod = getEffectiveModality(r);
            return mod === 'anat-T1w' || mod === 'anat-T2w' || mod === 'anat-FLAIR';
          })
          .map(r => r.relativePath),
        dismissable: false,
      });
    }
  }

  return issues;
}

// ── Sparse dataset check ──────────────────────────────────────────

let sparseCounter = 0;
function nextSparseId(): string {
  return `sparse-${++sparseCounter}`;
}

/**
 * Warn when the dataset appears to be a single-file or very sparse upload.
 *
 * A full epilepsy BIDS dataset typically has 10+ files per subject
 * (T1w, CT, iEEG recording, electrodes.tsv, channels.tsv, sidecars, etc.).
 * If the entire upload contains only 1-3 data files, it almost certainly
 * represents an intentional single-file workflow (e.g. de-identifying one
 * iEEG recording before export), and the user should be reminded that the
 * rest of the session data is absent.
 *
 * The threshold is per-subject: if ANY subject has fewer than 4 data files
 * across all sessions, surface the warning. Sidecar-only files are not
 * counted as data files.
 */
function checkSparseDataset(input: ValidationInput): ValidationIssue[] {
  sparseCounter = 0;
  const issues: ValidationIssue[] = [];

  const DATA_MODALITIES = new Set([
    'anat-T1w', 'anat-T2w', 'anat-FLAIR', 'anat-angio',
    'ct', 'dwi', 'perf', 'func', 'fmap',
    'ieeg', 'eeg',
    'electrodes', 'channels', 'events',
  ]);

  // Group data files by subject
  const subjectFileCounts = new Map<string, number>();
  for (const result of input.detectionResults) {
    const mod = getEffectiveModality(result);
    if (!DATA_MODALITIES.has(mod)) continue;
    const group = result.userSubjectGroup ?? result.subjectGroup;
    subjectFileCounts.set(group, (subjectFileCounts.get(group) ?? 0) + 1);
  }

  for (const [group, count] of subjectFileCounts) {
    if (count < 4) {
      const fileNames = input.detectionResults
        .filter(r => (r.userSubjectGroup ?? r.subjectGroup) === group)
        .map(r => r.relativePath);

      issues.push({
        id: nextSparseId(),
        category: 'required-files',
        severity: 'warning',
        title: 'Sparse dataset: only a few files uploaded',
        description: `Subject "${group}" has only ${count} data file${count === 1 ? '' : 's'}. A complete epilepsy BIDS dataset typically includes a T1w MRI, CT scan, iEEG recording, and companion metadata files. If you intentionally uploaded a single file (e.g. to de-identify one recording), you can ignore this warning. Otherwise, verify that you selected the correct folder and that no files were accidentally left out.`,
        affectedFiles: fileNames,
        subjectGroup: group,
        dismissable: true,
      });
    }
  }

  return issues;
}
