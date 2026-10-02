/**
 * JSON Sidecar De-identification
 *
 * dcm2niix (and similar DICOM-to-NIfTI converters) writes a .json sidecar
 * next to every converted scan. Depending on the site's conversion
 * settings, that sidecar can carry DICOM header fields straight through:
 * PatientName, PatientBirthDate, InstitutionName, ReferringPhysicianName,
 * device serial numbers, and absolute acquisition dates. Unlike EDF files
 * (see edfDeidentifier.ts), nothing in this pipeline previously touched
 * that content -- sidecars were copied byte-for-byte into the export.
 *
 * This module closes that gap using the same two strategies already
 * established for EDF headers:
 *   1. Known-identifying fields (patient name, birthdate, institution,
 *      staff names, device serials) are blanked outright.
 *   2. Known date fields are shifted by the same per-subject random
 *      offset used for that subject's EDF files, not zeroed -- so
 *      relative timing between sessions (which Custom timepoints
 *      datasets depend on) is preserved, only the absolute calendar
 *      date is removed. See generateSubjectDateShifts() in
 *      edfDeidentifier.ts for why shifting was chosen over blanking.
 *
 * Fields that are purely descriptive of the scan itself (SeriesDescription,
 * ProtocolName, sequence parameters, etc.) are left untouched -- these are
 * required for BIDS documentation and are already surfaced to the
 * detection engine via sidecarReader.ts. If a site's scanner operator
 * typed a patient name into one of those free-text fields, that is a
 * scanner-workflow problem this module cannot see; the PHI scanner's
 * filename/path checks are a separate, complementary safeguard.
 */

// ── Fields blanked outright (known-identifying, not needed for BIDS) ──

export const BLANK_STRING_FIELDS = [
  'PatientName',
  'PatientID',
  'PatientBirthDate',
  'PatientAddress',
  'PatientTelephoneNumbers',
  'OtherPatientIDs',
  'OtherPatientNames',
  'InstitutionName',
  'InstitutionAddress',
  'InstitutionalDepartmentName',
  'ReferringPhysicianName',
  'PerformingPhysicianName',
  'RequestingPhysician',
  'OperatorsName',
  'StationName',
  'DeviceSerialNumber',
];

// ── Fields shifted (not blanked) by the subject's date-shift offset ───

export const DATE_FIELDS = [
  'AcquisitionDateTime',
  'AcquisitionDate',
  'StudyDate',
  'SeriesDate',
  'ContentDate',
  'InstanceCreationDate',
  // PET: ScanDate is deprecated in BIDS but older PET2BIDS output and
  // hand-built sidecars still carry it. Times of day (TimeZero,
  // InjectionStart, AcquisitionTime) are not dates and stay as they are.
  'ScanDate',
  'RadiopharmaceuticalStartDateTime',
];

export interface JsonSidecarDeidentifyOptions {
  /**
   * Days to shift every recognized date field (positive = forward,
   * negative = backward). Should be the same per-subject value used for
   * that subject's EDF files (see generateSubjectDateShifts), so a date
   * compared across a subject's EDF and MRI sidecars stays consistent.
   */
  dateShiftDays: number;
  /**
   * The sidecar's IntendedFor, rewritten for the export (see
   * lib/bids/intendedFor.ts): set to this list, or removed when it's
   * empty. Left unset, an existing IntendedFor is kept as is.
   */
  intendedFor?: string[];
}

export interface JsonSidecarDeidentifyResult {
  /**
   * False when the content isn't a JSON object (invalid JSON, or valid
   * JSON that is null, a number, a string or an array). Such a file can't
   * be de-identified, so callers must not export it: `text` is then empty.
   * Before 2026-10-02 invalid JSON was copied through unchanged, so a
   * broken sidecar kept every identifying field.
   */
  ok: boolean;
  /** The de-identified JSON, pretty-printed with the same 2-space indent BIDS tooling expects. */
  text: string;
  /** Paths of fields that were blanked because they contained identifying content ("PatientName", or "Source.PatientName" when nested). */
  strippedFields: string[];
  /** Paths of date fields that were shifted. */
  shiftedFields: string[];
  /**
   * Names of DATE_FIELDS present with a non-empty value that didn't match
   * any recognized date format and were therefore blanked to "X" rather
   * than shifted. Tracked separately from strippedFields/shiftedFields so
   * this is distinguishable in the audit trail: this is a "fail closed"
   * safety fallback, not a normal known-identifying-field strip or a
   * successful shift. Fail closed (blank) rather than fail open (leave
   * the real, unshifted absolute date in the export) because the cost of
   * losing one field's relative-timing value is far lower than the cost
   * of a silent PHI-adjacent date leak. Decided with Brandon 2026-08-02.
   */
  unparseableDateFields: string[];
}

/**
 * Shift a date string by shiftDays, preserving whatever format it was in.
 * Handles the formats BIDS/DICOM-derived sidecars commonly use:
 *   - "YYYY-MM-DD"                    (DICOM DA / BIDS AcquisitionDate)
 *   - "YYYY-MM-DDTHH:mm:ss[.ffffff]"  (DICOM DT / AcquisitionDateTime)
 *   - ...with an optional trailing timezone suffix ("Z", "+HH:MM", "+HHMM")
 *     -- dcm2niix frequently writes AcquisitionDateTime with one of these.
 *     The timezone suffix is preserved as-is; only the calendar date shifts.
 *   - "YYYYMMDD" (8 digits, no separators) -- the raw DICOM VR=DA format
 *     StudyDate/SeriesDate commonly carry directly. Mirrors the identical
 *     format handling already in sidecarReader.ts's parseSidecarDate() on
 *     the detection side.
 * Returns null if the string doesn't match any known format (left
 * untouched by the caller rather than risk corrupting an unexpected
 * value).
 *
 * BUG FIX 2026-08-02 (adversarial de-identification testing): the
 * original version of this function only matched the dashed ISO format
 * with no timezone suffix. A timezone-suffixed AcquisitionDateTime
 * ("2026-01-15T09:00:00Z") or a bare DICOM StudyDate ("20260115") -- both
 * extremely common in real sidecars -- silently failed to match and were
 * left completely unshifted, leaking the true absolute date into the
 * export. Both formats are now handled.
 */
export function shiftDateString(value: string, shiftDays: number): string | null {
  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}:\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (isoMatch) {
    const [, datePart, timePart, tzPart] = isoMatch;
    const [y, m, d] = datePart.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (isNaN(date.getTime())) return null;

    date.setDate(date.getDate() + shiftDays);

    const yyyy = String(date.getFullYear()).padStart(4, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const shiftedDate = `${yyyy}-${mm}-${dd}`;

    return `${shiftedDate}${timePart ?? ''}${tzPart ?? ''}`;
  }

  const dicomMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dicomMatch) {
    const [, yStr, mStr, dStr] = dicomMatch;
    const y = Number(yStr), m = Number(mStr), d = Number(dStr);
    const date = new Date(y, m - 1, d);
    if (isNaN(date.getTime())) return null;

    date.setDate(date.getDate() + shiftDays);

    const yyyy = String(date.getFullYear()).padStart(4, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }

  return null;
}

/**
 * De-identify a BIDS/dcm2niix JSON sidecar's text content.
 *
 * Parses the JSON, blanks known-identifying fields and shifts known date
 * fields wherever they appear (top level, nested objects, arrays), and
 * re-serializes. Content that isn't a JSON object returns ok: false and
 * must not be exported (fail closed; see JsonSidecarDeidentifyResult.ok).
 */
export function deidentifyJsonSidecar(
  jsonText: string,
  options: JsonSidecarDeidentifyOptions,
): JsonSidecarDeidentifyResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, text: '', strippedFields: [], shiftedFields: [], unparseableDateFields: [] };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, text: '', strippedFields: [], shiftedFields: [], unparseableDateFields: [] };
  }

  const strippedFields: string[] = [];
  const shiftedFields: string[] = [];
  const unparseableDateFields: string[] = [];
  const blank = new Set(BLANK_STRING_FIELDS);
  const dates = new Set(DATE_FIELDS);

  // Walk every object at any depth. Identifying fields are blanked and
  // dates shifted wherever they sit: converters and hand-edited sidecars
  // sometimes nest acquisition or patient details (e.g. under a source or
  // series block), and the PHI scanner skips these field names at every
  // depth on the understanding that they're handled here.
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (!isPlainObject(node)) return;
    for (const [key, value] of Object.entries(node)) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (blank.has(key)) {
        if (value !== '' && value != null) {
          node[key] = 'X';
          strippedFields.push(fieldPath);
        }
      } else if (dates.has(key) && typeof value === 'string' && value) {
        const shifted = shiftDateString(value, options.dateShiftDays);
        if (shifted) {
          node[key] = shifted;
          shiftedFields.push(fieldPath);
        } else {
          // Fail closed: a present date value in an unrecognized format
          // must not be left in the export with its real, unshifted
          // absolute value -- that would defeat the entire purpose of this
          // field's de-identification. Blank it instead, and track it
          // separately from strippedFields/shiftedFields so this specific
          // "unknown format, safety fallback" case is visible in the audit
          // trail rather than looking identical to a normal strip or a
          // successful shift. Decided with Brandon 2026-08-02.
          node[key] = 'X';
          unparseableDateFields.push(fieldPath);
        }
      } else {
        walk(value, fieldPath);
      }
    }
  };
  walk(parsed, '');

  if (options.intendedFor) {
    if (options.intendedFor.length > 0) parsed.IntendedFor = options.intendedFor;
    else delete parsed.IntendedFor;
  }

  return {
    ok: true,
    text: JSON.stringify(parsed, null, 2),
    strippedFields,
    shiftedFields,
    unparseableDateFields,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True for a file that dcm2niix-style tooling would treat as a scan sidecar. */
export function isJsonSidecarFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.json');
}
