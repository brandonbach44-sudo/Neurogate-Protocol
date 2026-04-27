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
