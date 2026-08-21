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
  // Single-letter forms ("W2", "M6", "Y1"), standard in clinical-trial
  // visit naming. Safe to accept because a parsed label is only ever used
  // when it matches one of the study's OWN defined session ids -- an
  // unrelated folder called "M3" in a study with no 3-month timepoint
  // resolves to nothing rather than inventing a session.
  { pattern: /^w$/i,         unit: 'week' },
  { pattern: /^m$/i,         unit: 'month' },
  { pattern: /^y$/i,         unit: 'year' },
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
  const trimmed = segment.trim();

  // Number-first ("2weeks", "2_weeks", "2 weeks", "02weeks") and
  // unit-first ("week2", "week_02", "wk2", "W2") are both common, and
  // which one a site uses is arbitrary. Separators may be absent, a
  // space, an underscore or a hyphen.
  //
  // Only number-first with no separator or a space parsed before, so
  // "2_weeks", "week2", "week_02", "wk2" and "W2" all fell through to
  // unclassified even when the study had defined exactly that timepoint
  // (probe, 2026-08-17).
  let numberStr: string | undefined;
  let unitStr: string | undefined;

  let match = trimmed.match(/^(\d+)[\s_-]*([a-z]+)$/i);
  if (match) {
    [, numberStr, unitStr] = match;
  } else {
    match = trimmed.match(/^([a-z]+)[\s_-]*(\d+)$/i);
    if (match) [, unitStr, numberStr] = match;
  }
  if (!numberStr || !unitStr) return null;

  const number = Number(numberStr);
  // Guard: must be a non-negative integer (fractional strings won't reach
  // here because the regex only matches \d+, but be explicit).
  if (!Number.isInteger(number) || number < 0) return null;

  for (const { pattern, unit } of FLYWHEEL_UNIT_MAP) {
    if (pattern.test(unitStr)) {
      return buildCustomSessionLabel({ number, unit });
    }
  }
  return null;
}

/**
 * Vocabulary for longitudinal visit folders that carry no number/unit pair
 * -- word labels and sequence numbers a site uses instead ("baseline",
 * "visit2", "V2", "timepoint1").
 *
 * Deliberately excludes "T<n>". Some trials do label visits T0/T1/T2, but
 * "T1" and "T2" are overwhelmingly MODALITY names in imaging data, so a
 * site with session-level "T1"/"T2" folders would have had its modality
 * folders mistaken for visits. Caught by probe before shipping.
 *
 * Also excludes two forms that collide with SUBJECT identifiers:
 * a bare number ("01", "02" are far more often patient folders than
 * visits), and bare "S<n>" ("S1" reads as subject 1 at least as readily as
 * session 1). Everything here is a form that would be odd as a patient id.
 */
const VISIT_LABEL_PATTERN =
  /^(baseline|base|screening|screen|enrol{1,2}ment|follow[-_\s]?up|endpoint|exit|final|(visit|timepoint|tp|tmpt|v)[-_\s]?\d+)$/i;

/**
 * True when a single path segment names a longitudinal timepoint, in any
 * of the conventions sites actually use.
 *
 * Exported so the subject-grouping layer can ask the same question this
 * module answers, instead of keeping its own copy of the vocabulary.
 * Those two copies had already drifted: subjectGrouping.ts recognised
 * "2weeks" and YYYYMMDD dates only, so a dataset using "week2", "W2",
 * "2_weeks", "visit1", "V1" or "baseline/followup" had every visit folder
 * treated as a separate PATIENT -- the same bug that was fixed for
 * "2weeks" alone, still live for every other spelling (probe 2026-08-17).
 */
export function looksLikeTimepointFolder(segment: string): boolean {
  const trimmed = segment.trim();
  if (parseFlywheelSegment(trimmed) !== null) return true;
  if (VISIT_LABEL_PATTERN.test(trimmed)) return true;
  // Date-stamped visit folders: YYYYMMDD, with a sanity check so an
  // arbitrary 8-digit id is not mistaken for a date.
  if (/^\d{8}$/.test(trimmed)) {
    const month = Number(trimmed.slice(4, 6));
    const day = Number(trimmed.slice(6, 8));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return true;
  }
  // ISO dates ("2018-05-10", "2018_05_10").
  const iso = trimmed.match(/^(\d{4})[-_](\d{2})[-_](\d{2})$/);
  if (iso) {
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return true;
  }
  return false;
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
