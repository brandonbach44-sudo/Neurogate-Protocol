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
];

export interface JsonSidecarDeidentifyOptions {
  /**
   * Days to shift every recognized date field (positive = forward,
   * negative = backward). Should be the same per-subject value used for
   * that subject's EDF files (see generateSubjectDateShifts), so a date
   * compared across a subject's EDF and MRI sidecars stays consistent.
   */
  dateShiftDays: number;
}

export interface JsonSidecarDeidentifyResult {
  /** The de-identified JSON, pretty-printed with the same 2-space indent BIDS tooling expects. */
  text: string;
  /** Names of fields that were blanked because they contained identifying content. */
  strippedFields: string[];
  /** Names of date fields that were shifted. */
  shiftedFields: string[];
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
function shiftDateString(value: string, shiftDays: number): string | null {
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
 * Parses the JSON, blanks known-identifying fields, shifts known date
 * fields, and re-serializes. If the content isn't valid JSON (shouldn't
 * happen for a real sidecar, but a malformed file must not crash export),
 * the original text is returned unchanged with empty field lists.
 */
export function deidentifyJsonSidecar(
  jsonText: string,
  options: JsonSidecarDeidentifyOptions,
): JsonSidecarDeidentifyResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { text: jsonText, strippedFields: [], shiftedFields: [] };
  }

  const strippedFields: string[] = [];
  const shiftedFields: string[] = [];

  for (const field of BLANK_STRING_FIELDS) {
    if (field in parsed && parsed[field] !== '' && parsed[field] != null) {
      parsed[field] = 'X';
      strippedFields.push(field);
    }
  }

  for (const field of DATE_FIELDS) {
    const value = parsed[field];
    if (typeof value === 'string' && value) {
      const shifted = shiftDateString(value, options.dateShiftDays);
      if (shifted) {
        parsed[field] = shifted;
        shiftedFields.push(field);
      }
    }
  }

  return {
    text: JSON.stringify(parsed, null, 2),
    strippedFields,
    shiftedFields,
  };
}

/** True for a file that dcm2niix-style tooling would treat as a scan sidecar. */
export function isJsonSidecarFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.json');
}
