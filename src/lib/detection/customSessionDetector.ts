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
 *
 * Phase 1b addition (August 2026): Flywheel/Scitran folder name parser.
 * Scitran-downloaded datasets use human-readable folder names like
 * "2weeks" rather than BIDS session labels like "ses-2wk". A second
 * matching pass parses those folder names and maps them to the generated
 * session IDs so real-world Flywheel data doesn't fall through to
 * unclassified.
 */

import type { Session, DetectionReason } from '../../types/detection';
import { buildCustomSessionLabel } from '../../types/sessionStructure';
import type { TimepointUnit } from '../../types/sessionStructure';

export interface CustomSessionResult {
  session: Session | null;
  reasons: DetectionReason[];
}

/**
 * Map of Flywheel/human-readable suffixes to BIDS timepoint units.
 * Ordered longest-first so "weeks" doesn't short-circuit before "week".
 */
const FLYWHEEL_UNIT_MAP: Array<{ pattern: RegExp; unit: TimepointUnit }> = [
  { pattern: /^sessions?$/i, unit: 'session' },
  { pattern: /^years?$/i,    unit: 'year' },
  { pattern: /^yr$/i,        unit: 'year' },
  { pattern: /^months?$/i,   unit: 'month' },
  { pattern: /^mo$/i,        unit: 'month' },
  { pattern: /^weeks?$/i,    unit: 'week' },
  { pattern: /^wks?$/i,      unit: 'week' },
  { pattern: /^days?$/i,     unit: 'day' },
  { pattern: /^d$/i,         unit: 'day' },
];

/**
 * Try to parse a single path segment as a Flywheel-style timepoint folder
 * name (e.g. "2weeks", "6mo", "1year"). Returns the generated BIDS session
 * label (e.g. "ses-2wk") if it parses cleanly, or null if not.
 *
 * The number must be a non-negative integer (matching the constraint in
 * buildCustomSessionLabel). Floating-point values like "2.5weeks" are not
 * valid and return null rather than producing a malformed label.
 */
function parseFlywheelSegment(segment: string): string | null {
  // Allow optional whitespace between the number and the unit, though
  // Flywheel typically concatenates them ("2weeks" not "2 weeks").
  const match = segment.match(/^(\d+)\s*([a-z]+)$/i);
  if (!match) return null;

  const number = Number(match[1]);
  // Guard: must be a non-negative integer (fractional strings won't reach
  // here because the regex only matches \d+, but be explicit).
  if (!Number.isInteger(number) || number < 0) return null;

  const unitStr = match[2];
  for (const { pattern, unit } of FLYWHEEL_UNIT_MAP) {
    if (pattern.test(unitStr)) {
      return buildCustomSessionLabel({ number, unit });
    }
  }
  return null;
}

/**
 * Look for an exact session label (e.g. "ses-2mo") as a path segment or
 * substring of the filename/folder path. Longer labels are checked first
 * so "ses-12mo" isn't shadowed by a false match against "ses-1mo" -- not
 * possible with the current generator (numbers aren't prefixes of each
 * other across different units), but checking longest-first is a cheap
 * safeguard against future label formats.
 *
 * If no exact match is found, a second pass tries to parse each path
 * segment as a Flywheel/Scitran-style human-readable timepoint folder
 * (e.g. "2weeks" -> "ses-2wk") and checks whether the generated label
 * is one of the known session IDs.
 */
export function detectCustomSession(
  relativePath: string,
  knownSessionIds: string[],
): CustomSessionResult {
  const reasons: DetectionReason[] = [];

  const normalized = relativePath.toLowerCase();
  const sortedIds = [...knownSessionIds].sort((a, b) => b.length - a.length);

  // -- Pass 1: exact literal label in path ---------------------------------
  for (const id of sortedIds) {
    // Match as a whole path segment (.../ses-2mo/...) or a standalone token
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

  // -- Pass 2: Flywheel/Scitran human-readable folder names ----------------
  // Scitran downloads nest files under a folder named with the plain
  // timepoint description ("2weeks", "6mo", etc.) rather than a BIDS
  // session label. Parse each path segment and map it to the generated
  // session ID if possible.
  const knownIdSet = new Set(sortedIds);
  const segments = relativePath.split('/');

  for (const segment of segments) {
    const parsed = parseFlywheelSegment(segment);
    if (parsed && knownIdSet.has(parsed)) {
      return {
        session: parsed,
        reasons: [
          {
            layer: 'folder',
            message: `Matched Flywheel folder "${segment}" -> parsed as ${parsed}`,
            weight: 0.45,
          },
        ],
      };
    }
  }

  return { session: null, reasons };
}
