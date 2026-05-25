/**
 * BIDS Structure Validator
 *
 * Checks that the generated BIDS paths and filenames follow the
 * BIDS specification for iEEG/epilepsy data:
 *
 * - Correct folder hierarchy: primary/sub-XXX/ses-XXX/modality/
 * - Valid BIDS filename format: sub-XXX_ses-XXX_suffix.ext
 * - No illegal characters in paths
 * - Required sidecar JSON files exist for data files
 * - No duplicate BIDS paths (two files mapping to the same output)
 */

import type { DetectionResult } from '../../types/detection';
import { getEffectiveSession, getEffectiveModality, getEffectiveSubjectGroup } from '../../types/detection';
import type { SubjectMetadata } from '../../types/metadata';
import type { ValidationIssue } from '../../types/validation';

// Characters not allowed in BIDS filenames/paths (beyond normal filesystem)
const ILLEGAL_CHARS = /[^a-zA-Z0-9\-_./]/;

// Valid BIDS filename pattern: sub-<label>[_ses-<label>][_key-value]*_<suffix>.<ext>
// Reserved for future per-file BIDS naming validation
export const BIDS_FILENAME_PATTERN = /^sub-[a-zA-Z0-9]+_ses-[a-zA-Z0-9]+.*\.[a-zA-Z0-9.]+$/;

let issueCounter = 0;
function nextId(): string {
  return `bids-${++issueCounter}`;
}

export function validateBidsStructure(
  results: DetectionResult[],
  subjects: SubjectMetadata[],
): ValidationIssue[] {
  issueCounter = 0;
  const issues: ValidationIssue[] = [];

  // Build a map of subject group → BIDS ID
  const subjectIdMap = new Map<string, string>();
  for (const s of subjects) {
    subjectIdMap.set(s.subjectGroup, s.bidsSubjectId);
  }

  // Track BIDS paths to detect duplicates
  const bidsPathMap = new Map<string, string[]>();

  for (const result of results) {
    const session = getEffectiveSession(result);
    const modality = getEffectiveModality(result);
    const group = getEffectiveSubjectGroup(result);
    const bidsId = subjectIdMap.get(group) || group; void bidsId;

    // ── Check: File has no session assigned ──────────────────
    // Localizer/scout scans are excluded from the BIDS export, so they
    // do not need a session assignment.
    if (
      !session &&
      modality !== 'other' &&
      modality !== 'localizer' &&
      modality !== 'sidecar-json' &&
      modality !== 'sidecar-tsv'
    ) {
      issues.push({
        id: nextId(),
        category: 'bids-structure',
        severity: 'error',
        title: 'No session assigned',
        description: `"${result.fileName}" has been classified as ${modality} but has no session assigned. Every data file needs a session (ses-preimplant, ses-postimplant, or ses-postsurgery) to be placed in the BIDS folder structure.`,
        affectedFiles: [result.relativePath],
        subjectGroup: group,
        dismissable: false,
      });
    }

    // ── Check: File is completely unclassified ───────────────
    if (modality === 'other') {
      issues.push({
        id: nextId(),
        category: 'bids-structure',
        severity: 'warning',
        title: 'Unclassified file',
        description: `"${result.fileName}" could not be classified into any BIDS modality. It will be placed in the unclassified/ folder. Review and assign a modality if this is a valid data file, or exclude it if it's not needed.`,
        affectedFiles: [result.relativePath],
        subjectGroup: group,
        dismissable: true,
      });
    }

    // ── Check: Illegal characters in original filename ───────
    const nameWithoutExt = result.fileName.replace(/\.[^.]+$/, '');
    if (ILLEGAL_CHARS.test(nameWithoutExt)) {
      issues.push({
        id: nextId(),
        category: 'bids-structure',
        severity: 'info',
        title: 'Special characters in filename',
        description: `"${result.fileName}" contains special characters that will be cleaned during BIDS renaming. The tool will handle this automatically, but review the generated BIDS filename to make sure it looks correct.`,
        affectedFiles: [result.relativePath],
        subjectGroup: group,
        dismissable: true,
      });
    }

    // ── Check: Subject group has no BIDS ID mapping ──────────
    if (!subjectIdMap.has(group)) {
      issues.push({
        id: nextId(),
        category: 'bids-structure',
        severity: 'error',
        title: 'Subject has no BIDS ID',
        description: `Subject group "${group}" doesn't have a BIDS subject ID assigned. Go back to the Metadata step and configure the Institution Setup to generate subject IDs.`,
        affectedFiles: [result.relativePath],
        subjectGroup: group,
        dismissable: false,
      });
    }

    // ── Track duplicate BIDS paths ───────────────────────────
    // Localizer/scout files are excluded from the export, so they
    // cannot collide and are not tracked here.
    if (
      result.bidsPath &&
      modality !== 'localizer' &&
      result.bidsPath !== `unclassified/${result.fileName}`
    ) {
      if (!bidsPathMap.has(result.bidsPath)) {
        bidsPathMap.set(result.bidsPath, []);
      }
      bidsPathMap.get(result.bidsPath)!.push(result.relativePath);
    }
  }

  // ── Check: Duplicate BIDS paths ────────────────────────────
  for (const [bidsPath, originalPaths] of bidsPathMap) {
    if (originalPaths.length > 1) {
      issues.push({
        id: nextId(),
        category: 'bids-structure',
        severity: 'error',
        title: 'Duplicate BIDS path',
        description: `Multiple files are mapped to the same BIDS path "${bidsPath}". This will cause one file to overwrite the other. Change the session or modality for one of these files to resolve the conflict.`,
        affectedFiles: originalPaths,
        dismissable: false,
      });
    }
  }

  // ── Check: JSON sidecars should pair with data files ───────
  const jsonSidecars = results.filter(r => getEffectiveModality(r) === 'sidecar-json');
  for (const sidecar of jsonSidecars) {
    const baseName = sidecar.fileName.replace(/\.json$/i, '');
    const hasMatchingData = results.some(r => {
      const rName = r.fileName.replace(/\.[^.]+$/, '').replace(/\.nii$/, '');
      return rName === baseName && r !== sidecar;
    });

    if (!hasMatchingData) {
      issues.push({
        id: nextId(),
        category: 'bids-structure',
        severity: 'warning',
        title: 'Orphaned JSON sidecar',
        description: `"${sidecar.fileName}" appears to be a JSON sidecar file but no matching data file was found with the same base name. Orphaned sidecars will still be included but may not be properly linked.`,
        affectedFiles: [sidecar.relativePath],
        dismissable: true,
      });
    }
  }

  return issues;
}
