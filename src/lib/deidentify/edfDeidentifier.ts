/**
 * EDF / EDF+ De-identification
 *
 * Rewrites the EDF binary header in-place to remove protected health
 * information (PHI) before the file is included in a BIDS export.
 *
 * What this module does
 * ─────────────────────
 * 1. Patient ID field (bytes 8-87, 80 chars)
 *    EDF+ format: "patientCode sex birthdate patientName"
 *    e.g.  "HUP282 M 22-APR-1990 Smith_John"
 *    After:  "<anonymousId> X X X"
 *    - Patient code replaced with the BIDS sub-ID (e.g. "sub-HUP001")
 *    - Sex subfield set to X (not directly identifying but kept consistent)
 *    - Birthdate set to X
 *    - Patient name set to X
 *    Non-EDF+ or unparseable fields are fully blanked to "X X X X".
 *
 * 2. Recording ID field (bytes 88-167, 80 chars)
 *    EDF+ format: "Startdate dd-MMM-yyyy adminCode techCode equipCode"
 *    e.g.  "Startdate 22-APR-2024 X X Exported_with_Persyst_EEGSuite"
 *    After:  "Startdate 03-JUN-2024 X X Exported_with_Persyst_EEGSuite"
 *    - Date is shifted by the same offset as the start date
 *    - Admin and tech codes set to X if they are not already
 *    - Equipment code (software name) is kept -- not PHI
 *
 * 3. Start date (bytes 168-175, format dd.mm.yy)
 *    Shifted by dateShiftDays. The 2-digit year follows the EDF
 *    convention: yy 85-99 = 1985-1999, yy 00-84 = 2000-2084.
 *
 * 4. Start time (bytes 176-183, format hh.mm.ss)
 *    UNCHANGED. Intra-day timing must be preserved for clinical analysis.
 *
 * Date shifting rationale
 * ───────────────────────
 * Erasing dates entirely breaks temporal analyses (seizure timing, drug
 * response curves). Keeping exact dates is a HIPAA violation. Shifting
 * by a random per-patient offset preserves relative timing while making
 * the absolute date unrecoverable without the shift key. The shift key
 * is recorded in the export audit log and should be kept restricted.
 *
 * EDF spec: https://www.edfplus.info/specs/edf.html
 */

// ── Types ─────────────────────────────────────────────────────────

export interface EdfDeidentifyOptions {
  /**
   * Days to shift every date in the file (positive = forward, negative = backward).
   * Should be randomly generated per subject and recorded in the audit log.
   * Recommended range: -365 to +365.
   */
  dateShiftDays: number;
  /**
   * BIDS subject ID to write into the patient code subfield of the
   * patient ID field (e.g. "sub-HUP001"). If omitted, the code subfield
   * is replaced with "X".
   */
  anonymousSubjectId?: string;
}

export interface DeidentifyResult {
  /**
   * De-identified file bytes (same bytes as input, only header modified).
   * Returned as an ArrayBuffer rather than a Blob so this module works
   * identically on web (where callers wrap it in a Blob for the ZIP) and
   * on CLI/desktop (where callers write it straight to disk with
   * fs.writeFile, no Blob involved).
   */
  bytes: ArrayBuffer;
  /** Original patient ID string, for the audit log. Never written to output. */
  originalPatientId: string;
  /** Original recording start date, for the audit log. */
  originalDate: string;
  /** The shifted date written into the output. */
  shiftedDate: string;
  /** Whether the patient ID field appeared to contain real PHI. */
  containedPhi: boolean;
}

import { readFileBuffer } from '../fileCache';
import type { FileLike } from '../../types/fileLike';

// ── Month name tables ─────────────────────────────────────────────

const MONTH_ABBR = [
  'JAN','FEB','MAR','APR','MAY','JUN',
  'JUL','AUG','SEP','OCT','NOV','DEC',
];

// ── Date helpers ──────────────────────────────────────────────────

/**
 * Parse an EDF global header date string "dd.mm.yy" into a Date.
 * EDF year convention: 85-99 = 1985-1999, 00-84 = 2000-2084.
 */
function parseHeaderDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const dd = parseInt(m[1]);
  const mm = parseInt(m[2]) - 1; // 0-indexed
  const yy = parseInt(m[3]);
  const yyyy = yy >= 85 ? 1900 + yy : 2000 + yy;
  const d = new Date(yyyy, mm, dd);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Format a Date back into EDF global header date format "dd.mm.yy".
 */
function formatHeaderDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

/**
 * Parse a recording ID date string "dd-MMM-yyyy" into a Date.
 * e.g. "22-APR-2024" -> Date(2024, 3, 22)
 */
function parseRecordingDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const dd = parseInt(m[1]);
  const mm = MONTH_ABBR.findIndex(mo => mo === m[2].toUpperCase());
  const yyyy = parseInt(m[3]);
  if (mm === -1) return null;
  const d = new Date(yyyy, mm, dd);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Format a Date into recording ID date format "dd-MMM-yyyy".
 * e.g. Date(2024, 5, 3) -> "03-JUN-2024"
 */
function formatRecordingDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = MONTH_ABBR[d.getMonth()];
  const yyyy = d.getFullYear();
  return `${dd}-${mmm}-${yyyy}`;
}

/**
 * Add shiftDays to a Date and return the result.
 */
function shiftDate(d: Date, shiftDays: number): Date {
  const shifted = new Date(d.getTime());
  shifted.setDate(shifted.getDate() + shiftDays);
  return shifted;
}

// ── Field write helper ────────────────────────────────────────────

/**
 * Write a string into a fixed-width ASCII field in a Uint8Array,
 * right-padding with spaces and truncating to length.
 */
function writeField(bytes: Uint8Array, start: number, length: number, value: string): void {
  const padded = value.padEnd(length, ' ').slice(0, length);
  for (let i = 0; i < length; i++) {
    bytes[start + i] = padded.charCodeAt(i);
  }
}

// ── Patient ID de-identification ──────────────────────────────────

/**
 * De-identify the EDF patient ID field.
 *
 * EDF+ defines the field as four space-separated subfields:
 *   patientCode  sex  birthdate  patientName
 *
 * Strategy:
 *   - Replace patientCode with anonymousSubjectId (or "X" if none given)
 *   - Replace sex with "X" (conservative -- not directly identifying
 *     but consistent with full anonymization)
 *   - Replace birthdate with "X"
 *   - Replace patientName with "X"
 *
 * If the field does not follow the 4-subfield EDF+ structure (e.g. it's
 * a free-text patient name from an older system), the entire 80-byte
 * field is replaced with "X X X X".
 */
function buildAnonymousPatientId(
  originalField: string,
  anonymousSubjectId: string | undefined,
): string {
  const code = anonymousSubjectId ?? 'X';
  // EDF+ anonymous format: all four subfields present
  // Try to parse as 4+ space-separated tokens
  const tokens = originalField.trim().split(/\s+/);
  if (tokens.length >= 4) {
    // tokens[0] = patientCode, tokens[1] = sex, tokens[2] = birthdate,
    // tokens[3..] = patientName (spaces in name replaced by underscores)
    return `${code} X X X`;
  }
  // Non-EDF+ or malformed -- blank everything
  return 'X X X X';
}

/**
 * Return true if the patient ID field looks like it contains real PHI
 * (i.e. has content beyond the EDF+ "X X X X" placeholder).
 */
function patientIdHasPhi(field: string): boolean {
  const clean = field.trim();
  if (!clean) return false;
  // Fully anonymized: all tokens are "X"
  if (/^(x\s*)+$/i.test(clean)) return false;
  // Contains any letter that isn't X -> real content
  return /[a-wyz]/i.test(clean);
}

// ── Recording ID de-identification ────────────────────────────────

/**
 * De-identify the EDF recording ID field.
 *
 * EDF+ format: "Startdate dd-MMM-yyyy adminCode techCode equipCode"
 *
 * Strategy:
 *   - Shift the date by dateShiftDays
 *   - Replace adminCode and techCode with "X" (may contain staff names)
 *   - Keep equipCode (software / device name, not PHI)
 *   - If the field doesn't follow EDF+ format, replace date pattern
 *     inline using a regex.
 */
function buildAnonymousRecordingId(
  originalField: string,
  dateShiftDays: number,
): string {
  // Check for EDF+ "Startdate" header format
  const edfPlusMatch = originalField.trim().match(
    /^(Startdate)\s+(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(\S+)\s+(\S+)\s*(.*)/i,
  );

  if (edfPlusMatch) {
    const [, prefix, dateStr, , , equipCode] = edfPlusMatch;
    const parsed = parseRecordingDate(dateStr);
    const shifted = parsed
      ? formatRecordingDate(shiftDate(parsed, dateShiftDays))
      : dateStr; // Can't parse date -- leave as-is rather than corrupt
    // adminCode and techCode -> X, keep equipCode
    return `${prefix} ${shifted} X X ${equipCode}`.trim().slice(0, 80);
  }

  // Non-EDF+ format: try to find any dd-MMM-yyyy date and shift it inline
  const shifted = originalField.replace(
    /(\d{1,2}-[A-Za-z]{3}-\d{4})/g,
    (match) => {
      const d = parseRecordingDate(match);
      return d ? formatRecordingDate(shiftDate(d, dateShiftDays)) : match;
    },
  );
  return shifted.slice(0, 80);
}

// ── Pure header transform (shared by whole-buffer and streaming paths) ──

export interface EdfHeaderTransformResult {
  /** The modified 256-byte global header, as a new Uint8Array (input is not mutated). */
  headerBytes: Uint8Array;
  originalPatientId: string;
  originalRecordingId: string;
  originalDate: string;
  shiftedDate: string;
  containedPhi: boolean;
}

/**
 * Transform just the 256-byte EDF global header. This is the entire
 * de-identification logic, extracted so it has exactly one
 * implementation shared by:
 *   - deidentifyEdf() below (whole-buffer path: web export, and any
 *     small/in-memory CLI use)
 *   - deidentifyEdfStream() in lib/adapters/nodeEdfDeidentifyStream.ts
 *     (Node streaming path: reads only these 256 bytes from disk, writes
 *     them, then stream-copies the remainder of a multi-GB recording
 *     without ever holding the whole file in memory)
 *
 * Keeping this pure and buffer-in/buffer-out (no file I/O of its own)
 * means the streaming path can never drift from the whole-buffer path's
 * behavior -- there is nothing to keep in sync, since both call this.
 */
export function transformEdfHeader(
  headerBytes: Uint8Array,
  options: EdfDeidentifyOptions,
): EdfHeaderTransformResult {
  if (headerBytes.length < 256) {
    throw new Error(`transformEdfHeader requires at least 256 bytes, got ${headerBytes.length}`);
  }

  // Work on a copy -- callers must not have this function mutate a
  // buffer they still hold a reference to (the streaming path in
  // particular reads this directly off disk and expects the original
  // read buffer to stay whatever it wants it to be).
  const bytes = headerBytes.slice(0, 256);

  const decoder = new TextDecoder('ascii');
  function readField(start: number, length: number): string {
    return decoder.decode(bytes.slice(start, start + length)).trim();
  }

  // ── Read original fields ─────────────────────────────────────
  const originalPatientId = readField(8, 80);
  const originalRecordingId = readField(88, 80);
  const originalDate = readField(168, 8);

  const containedPhi = patientIdHasPhi(originalPatientId);

  // ── Build de-identified fields ───────────────────────────────
  const anonPatientId = buildAnonymousPatientId(
    originalPatientId,
    options.anonymousSubjectId,
  );

  const anonRecordingId = buildAnonymousRecordingId(
    originalRecordingId,
    options.dateShiftDays,
  );

  // Shift the global header start date
  const parsedDate = parseHeaderDate(originalDate);
  const shiftedDateObj = parsedDate ? shiftDate(parsedDate, options.dateShiftDays) : null;
  const shiftedDate = shiftedDateObj ? formatHeaderDate(shiftedDateObj) : originalDate;

  // ── Write modified fields back ───────────────────────────────
  writeField(bytes, 8,   80, anonPatientId);
  writeField(bytes, 88,  80, anonRecordingId);
  writeField(bytes, 168, 8,  shiftedDate);
  // bytes 176-183 (start time) are intentionally left unchanged

  return {
    headerBytes: bytes,
    originalPatientId,
    originalRecordingId,
    originalDate,
    shiftedDate,
    containedPhi,
  };
}

// ── Main de-identification function (whole-buffer path) ────────────

/**
 * De-identify an EDF or BDF file by rewriting its header.
 *
 * Reads the full file into memory, applies transformEdfHeader() to the
 * first 256 bytes, splices the result back in, and returns the whole
 * modified buffer. The original file/File is not modified.
 *
 * This is the right choice for the web export path (files already fit
 * in browser memory by definition, since they got dropped into the page
 * at all) and for small CLI files. For large local recordings where
 * avoiding a full read matters, use deidentifyEdfStream() instead (see
 * lib/adapters/nodeEdfDeidentifyStream.ts) -- it calls this same
 * transformEdfHeader() but never reads more than 256 bytes into memory.
 */
export async function deidentifyEdf(
  file: FileLike,
  options: EdfDeidentifyOptions,
): Promise<DeidentifyResult> {
  // Read the full file from the eager cache (populated at drop time on
  // web; irrelevant but harmless on CLI/desktop, where arrayBuffer()
  // always succeeds directly). Direct file.arrayBuffer() calls on
  // drag-and-drop Files fail with NotReadableError once the browser
  // revokes the stale file permission -- that's what the cache exists
  // to work around.

  if (file.size < 256) {
    return {
      bytes: await file.arrayBuffer(),
      originalPatientId: '',
      originalDate: '',
      shiftedDate: '',
      containedPhi: false,
    };
  }

  const fullBuffer = await readFileBuffer(file);
  const fullBytes = new Uint8Array(fullBuffer);

  const headerResult = transformEdfHeader(fullBytes.subarray(0, 256), options);
  fullBytes.set(headerResult.headerBytes, 0);

  return {
    bytes: fullBytes.buffer.slice(fullBytes.byteOffset, fullBytes.byteOffset + fullBytes.byteLength),
    originalPatientId: headerResult.originalPatientId,
    originalDate: headerResult.originalDate,
    shiftedDate: headerResult.shiftedDate,
    containedPhi: headerResult.containedPhi,
  };
}

// ── Date shift generation ─────────────────────────────────────────

/**
 * Generate a random date shift (in days) for a subject.
 * Range: -365 to +365 days (one year in either direction).
 *
 * The shift is derived from Math.random(), so it is not reproducible.
 * Record it in the audit log immediately -- it cannot be recovered later.
 */
export function generateDateShift(): number {
  return Math.floor(Math.random() * 731) - 365; // [-365, +365]
}

/**
 * Build a per-subject date shift map for all subjects in an export.
 * Returns a Map<subjectGroup, shiftDays>.
 *
 * Each subject gets a different random shift so the shifts cannot be
 * reversed by comparing two patients' recordings.
 */
export function generateSubjectDateShifts(
  subjectGroups: string[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const group of subjectGroups) {
    map.set(group, generateDateShift());
  }
  return map;
}
