/**
 * Custom Timepoints Session Detector
 *
 * Phase 1 addition (July 2026). Separate from filenameDetector.ts and
 * folderDetector.ts on purpose: those two do fuzzy keyword matching
 * ("preop", "phase1", "baseline" -> ses-preimplant) that is specific to
 * the Implant sessions preset and doesn't generalize -- there's no
 * keyword vocabulary for an arbitrary study's custom timepoints.
 *
 * For Custom timepoints datasets, a session can only be one of the exact
 * labels the user defined in the structure-setup step (e.g. "ses-2mo").
 * So detection here is literal substring matching against that known
 * list, not fuzzy inference. This keeps the well-tested implant
 * detectors completely untouched and unaffected by this feature.
 */

import type { Session, DetectionReason } from '../../types/detection';

export interface CustomSessionResult {
  session: Session | null;
  reasons: DetectionReason[];
}

/**
 * Look for an exact session label (e.g. "ses-2mo") as a path segment or
 * substring of the filename/folder path. Longer labels are checked first
 * so "ses-12mo" isn't shadowed by a false match against "ses-1mo" -- not
 * possible with the current generator (numbers aren't prefixes of each
 * other across different units), but checking longest-first is a cheap
 * safeguard against future label formats.
 */
export function detectCustomSession(
  relativePath: string,
  knownSessionIds: string[],
): CustomSessionResult {
  const reasons: DetectionReason[] = [];

  const normalized = relativePath.toLowerCase();
  const sortedIds = [...knownSessionIds].sort((a, b) => b.length - a.length);

  for (const id of sortedIds) {
    // Match as a whole path segment (…/ses-2mo/…) or a standalone token
    // within the filename (sub-01_ses-2mo_T1w.nii.gz), not as a loose
    // substring that could accidentally match inside an unrelated word.
    const segmentPattern = new RegExp(`(^|[/_.-])${id}([/_.-]|$)`, 'i');
    if (segmentPattern.test(normalized)) {
      return {
        session: id,
        reasons: [
          {
            layer: 'folder',
            message: `Matched custom timepoint label "${id}" in path`,
            weight: 0.5,
          },
        ],
      };
    }
  }

  return { session: null, reasons };
}
