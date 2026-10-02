/**
 * Persyst .lay de-identification.
 *
 * A Persyst recording is a .dat file (raw samples) plus a .lay file: a
 * plain-text INI layout describing it. The .lay carries:
 *   [FileInfo]  File=<name of the .dat>, sampling rate, calibration, ...
 *   [Patient]   First, Middle, Last, ID, BirthDate, TestDate, TestTime, ...
 *   [Comments]  one event per line: time,duration,state,type,text
 *   [ChannelMap], [Sheets], [SampleTimes], ...
 *
 * On export:
 *   - File= is pointed at the .dat's exported (BIDS) file name. Without
 *     this the renamed pair is broken: the .lay names a file that no
 *     longer exists.
 *   - [Patient] keeps only Sex, Hand and TestTime; TestDate is shifted by
 *     the subject's date shift; every other key is dropped (fail closed:
 *     unknown keys may be identifying, and readers treat them as optional).
 *   - [Comments] event text keeps its markers but has the patient's name
 *     and ID (taken from [Patient] before it was cleaned) and other
 *     identifiers (dates, phone numbers, ...) replaced with X, using the
 *     same rules as EDF+ annotations (edfStructure.ts). Time, duration
 *     and the other fields are unchanged.
 *   - Everything else is copied as is.
 *
 * Pure text in, text out; line endings are preserved.
 */

import { makeRedactor, patientTokens } from './edfStructure';

export interface LayDeidentifyOptions {
  /** Exported file name of the paired .dat; File= is rewritten to it. Omitted when the .dat isn't exported. */
  datFileName?: string;
  dateShiftDays: number;
}

export interface LayDeidentifyResult {
  text: string;
  /** [Patient] keys that were dropped. */
  removedFields: string[];
  /** Date keys that were shifted. */
  shiftedFields: string[];
  /** Number of identifying strings replaced in [Comments]. */
  commentRedactions: number;
}

/** [Patient] keys kept as is (not identifying). TestDate is kept but shifted. */
const KEEP_PATIENT_KEYS = new Set(['sex', 'hand', 'testtime']);

/** Shift a Persyst date (m/d/yyyy, d-m-yyyy or yyyy.m.d), keeping its format. Null if unrecognized. */
export function shiftLayDate(value: string, days: number): string | null {
  const v = value.trim();
  const fmt = (y: number, m: number, d: number, pattern: 'mdy' | 'dmy' | 'ymd', sep: string) => {
    const date = new Date(y, m - 1, d + days);
    const yy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return pattern === 'mdy' ? [mm, dd, yy].join(sep) : pattern === 'dmy' ? [dd, mm, yy].join(sep) : [yy, mm, dd].join(sep);
  };
  let m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return fmt(+m[3], +m[1], +m[2], 'mdy', '/');
  m = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return fmt(+m[3], +m[2], +m[1], 'dmy', '-');
  m = v.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) return fmt(+m[1], +m[2], +m[3], 'ymd', '.');
  return null;
}

export function deidentifyPersystLay(text: string, options: LayDeidentifyOptions): LayDeidentifyResult {
  // Split keeping each line's ending, so CRLF files stay CRLF.
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(l => l.length > 0) ?? [];

  // First pass: collect the identifying [Patient] values for redacting comments.
  const tokens: string[] = [];
  let section = '';
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]/);
    if (header) { section = header[1].trim().toLowerCase(); continue; }
    if (section !== 'patient') continue;
    const kv = line.match(/^\s*([^=]+?)\s*=\s*(.*?)\s*$/);
    if (kv && !KEEP_PATIENT_KEYS.has(kv[1].toLowerCase()) && kv[1].toLowerCase() !== 'testdate' && kv[2]) {
      tokens.push(...patientTokens(kv[2]));
    }
  }
  const redact = makeRedactor(tokens);

  const removedFields: string[] = [];
  const shiftedFields: string[] = [];
  let commentRedactions = 0;
  const out: string[] = [];
  section = '';

  for (const line of lines) {
    const ending = line.match(/(\r\n|\r|\n)$/)?.[0] ?? '';
    const body = line.slice(0, line.length - ending.length);
    const header = body.match(/^\s*\[([^\]]+)\]/);
    if (header) {
      section = header[1].trim().toLowerCase();
      out.push(line);
      continue;
    }
    const kv = body.match(/^(\s*)([^=]+?)(\s*=\s*)(.*)$/);

    if (section === 'fileinfo' && kv && kv[2].toLowerCase() === 'file' && options.datFileName) {
      out.push(`${kv[1]}${kv[2]}${kv[3]}${options.datFileName}${ending}`);
      continue;
    }

    if (section === 'patient' && kv) {
      const key = kv[2].toLowerCase();
      if (key === 'testdate') {
        const shifted = shiftLayDate(kv[4], options.dateShiftDays);
        if (shifted) {
          out.push(`${kv[1]}${kv[2]}${kv[3]}${shifted}${ending}`);
          shiftedFields.push(kv[2]);
        } else if (kv[4].trim()) {
          // Unrecognized date format: drop it rather than export a real date.
          removedFields.push(kv[2]);
        } else {
          out.push(line);
        }
        continue;
      }
      if (KEEP_PATIENT_KEYS.has(key)) {
        out.push(line);
        continue;
      }
      removedFields.push(kv[2]);
      continue;
    }

    if (section === 'comments' && body.trim()) {
      // time,duration,state,type,text -- the text may itself contain commas.
      const parts = body.split(',');
      if (parts.length >= 5) {
        const head = parts.slice(0, 4).join(',');
        const { text: cleaned, count } = redact(parts.slice(4).join(','));
        commentRedactions += count;
        out.push(`${head},${cleaned}${ending}`);
        continue;
      }
      // Not the usual shape: redact the whole line's text to be safe.
      const { text: cleaned, count } = redact(body);
      commentRedactions += count;
      out.push(`${cleaned}${ending}`);
      continue;
    }

    out.push(line);
  }

  return { text: out.join(''), removedFields, shiftedFields, commentRedactions };
}
