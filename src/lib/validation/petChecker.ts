/**
 * PET sidecar completeness check.
 *
 * BIDS requires a PET image's JSON sidecar to state the tracer, injected
 * dose, timing and reconstruction (PET_REQUIRED_SIDECAR_FIELDS in
 * lib/detection/petVocabulary.ts). Users generally can't supply these by
 * hand, and dcm2niix fills only some of them (TracerName,
 * TracerRadionuclide, InjectedRadioactivity, Units, ...), so this never
 * blocks export. It warns, names what's missing, and points to PET2BIDS
 * (dcm2niix4pet), which fills the rest from the DICOM headers.
 *
 * Only exported PET images are checked; files routed to unclassified/
 * aren't in the dataset.
 */

import type { DetectionResult } from '../../types/detection';
import { getEffectiveModality, getEffectiveSubjectGroup } from '../../types/detection';
import type { ValidationIssue } from '../../types/validation';
import { isExportedPath } from '../bids/bidsNaming';
import { PET_REQUIRED_SIDECAR_FIELDS } from '../detection/petVocabulary';

const FIX_HINT =
  'Re-converting the DICOM with PET2BIDS (dcm2niix4pet) fills most of these from the scanner headers. ' +
  'The export is not blocked, but the dataset will not pass the official BIDS validator until they are present.';

export function checkPetSidecars(results: DetectionResult[]): ValidationIssue[] {
  const noSidecar: DetectionResult[] = [];
  const noPetDetails: DetectionResult[] = [];
  // Files grouped by their exact set of missing fields, so a cohort
  // converted the same way produces one warning, not one per file.
  const byMissing = new Map<string, DetectionResult[]>();

  for (const r of results) {
    if (getEffectiveModality(r) !== 'pet' || !isExportedPath(r.bidsPath)) continue;
    if (!r.pet) {
      noPetDetails.push(r);
      continue;
    }
    if (r.pet.sidecarFields === null) {
      noSidecar.push(r);
      continue;
    }
    const present = new Set(r.pet.sidecarFields);
    const missing = PET_REQUIRED_SIDECAR_FIELDS.filter(f => !present.has(f));
    if (missing.length === 0) continue;
    const key = missing.join(', ');
    const list = byMissing.get(key);
    if (list) list.push(r);
    else byMissing.set(key, [r]);
  }

  const issues: ValidationIssue[] = [];
  let n = 0;
  const subjectOf = (files: DetectionResult[]) => {
    const groups = new Set(files.map(getEffectiveSubjectGroup));
    return groups.size === 1 ? [...groups][0] : undefined;
  };

  if (noSidecar.length > 0) {
    issues.push({
      id: `pet-${++n}`,
      category: 'metadata',
      severity: 'warning',
      title: `PET image${noSidecar.length === 1 ? '' : 's'} without a JSON sidecar`,
      description:
        'BIDS requires a JSON sidecar for every PET image, stating the tracer, injected dose, timing and reconstruction. ' +
        'Without one, nothing about how the scan was acquired travels with the data. ' + FIX_HINT,
      affectedFiles: noSidecar.map(r => r.relativePath),
      subjectGroup: subjectOf(noSidecar),
      dismissable: true,
    });
  }

  for (const [missing, files] of byMissing) {
    issues.push({
      id: `pet-${++n}`,
      category: 'metadata',
      severity: 'warning',
      title: 'PET sidecar missing BIDS-required fields',
      description: `Missing: ${missing}. ${FIX_HINT}`,
      affectedFiles: files.map(r => r.relativePath),
      subjectGroup: subjectOf(files),
      dismissable: true,
    });
  }

  if (noPetDetails.length > 0) {
    issues.push({
      id: `pet-${++n}`,
      category: 'metadata',
      severity: 'warning',
      title: 'Set to PET, but no PET details found',
      description:
        'These files were set to PET in the mapping table, but neither their name nor a sidecar identified them as PET, ' +
        'so the tracer and acquisition details are unknown. Check that each has a JSON sidecar with the BIDS-required PET fields. ' +
        FIX_HINT,
      affectedFiles: noPetDetails.map(r => r.relativePath),
      subjectGroup: subjectOf(noPetDetails),
      dismissable: true,
    });
  }

  return issues;
}
