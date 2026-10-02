/**
 * EDF/BDF structure and annotation redaction.
 *
 * The 256-byte main header is de-identified by transformEdfHeader()
 * (edfDeidentifier.ts). This module handles what that never touched:
 *
 *   - EDF+ / BDF+ annotations. The "EDF Annotations" signal (BDF:
 *     "BDF Annotations") stores free text typed during the recording
 *     ("Seizure onset", "pt John Smith moved", a date) inside every data
 *     record, as Time-stamped Annotation Lists (TALs):
 *       +onset[0x15 duration]0x14 text 0x14 [text 0x14 ...] 0x00
 *     The first TAL of each record is a time-keeping entry with no text.
 *   - The per-signal free-text header fields "transducer type" and
 *     "prefiltering" (normally "AgAgCl electrode", "HP:0.1Hz LP:70Hz").
 *
 * Redaction replaces identifying text with "X" in place, byte for byte,
 * so every record keeps its exact size and every onset and duration
 * stays as it was: event markers like "Seizure onset" survive, the
 * patient's name in a note doesn't. Only TAL text is ever changed, never
 * the timestamps or separators.
 *
 * Pure (buffer in, buffer out, no I/O), shared by the whole-buffer path
 * (edfDeidentifier.ts) and the Node streaming path
 * (adapters/nodeEdfDeidentifyStream.ts) so they can't drift.
 */

/** Byte layout of one EDF/BDF file, from its full header. */
export interface EdfLayout {
  /** Total header size: 256 + 256 * number of signals. */
  headerBytes: number;
  numSignals: number;
  labels: string[];
  /** Bytes per data record (sum of samples per record x bytes per sample). */
  recordBytes: number;
  /** Where each annotation signal sits inside a data record. */
  annotationSpans: { offset: number; length: number }[];
  /** Header byte ranges of the per-signal transducer and prefiltering text fields. */
  freeTextFields: { offset: number; length: number }[];
}

/** Largest channel count accepted as a real header (guards against garbage values). */
const MAX_SIGNALS = 4096;

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let s = '';
  for (let i = start; i < start + length && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s.trim();
}

/** Number of signals from the 256-byte main header, or null if the field isn't a plausible count. */
export function readSignalCount(mainHeader: Uint8Array): number | null {
  if (mainHeader.length < 256) return null;
  const ns = Number(ascii(mainHeader, 252, 4));
  return Number.isInteger(ns) && ns > 0 && ns <= MAX_SIGNALS ? ns : null;
}

/**
 * Parse the full header (main header plus signal headers). Returns null
 * when the header isn't a well-formed EDF/BDF header (missing signal
 * headers, a header-size field that disagrees with the signal count,
 * non-numeric sample counts): callers then fall back to cleaning the main
 * header only, exactly as before this module existed.
 */
export function parseEdfLayout(header: Uint8Array): EdfLayout | null {
  const ns = readSignalCount(header);
  if (ns === null) return null;
  const headerBytes = 256 + ns * 256;
  if (header.length < headerBytes) return null;
  const declared = Number(ascii(header, 184, 8));
  if (Number.isFinite(declared) && declared > 0 && declared !== headerBytes) return null;

  // BDF stores 24-bit samples and starts with byte 0xFF ("\xFFBIOSEMI").
  const bytesPerSample = header[0] === 0xff ? 3 : 2;

  // Signal header fields, each an array of ns entries, in this order.
  const fieldOffset = (before: number) => 256 + ns * before;
  const labelsAt = fieldOffset(0);                // 16 each
  const transducerAt = fieldOffset(16);           // 80 each
  const prefilterAt = fieldOffset(16 + 80 + 8 + 8 + 8 + 8 + 8); // 80 each
  const samplesAt = fieldOffset(16 + 80 + 8 + 8 + 8 + 8 + 8 + 80); // 8 each

  const labels: string[] = [];
  const samples: number[] = [];
  for (let i = 0; i < ns; i++) {
    labels.push(ascii(header, labelsAt + i * 16, 16));
    const n = Number(ascii(header, samplesAt + i * 8, 8));
    if (!Number.isInteger(n) || n < 0) return null;
    samples.push(n);
  }

  const annotationSpans: EdfLayout['annotationSpans'] = [];
  let offset = 0;
  for (let i = 0; i < ns; i++) {
    const length = samples[i] * bytesPerSample;
    if (/^(EDF|BDF) Annotations$/i.test(labels[i])) annotationSpans.push({ offset, length });
    offset += length;
  }

  const freeTextFields: EdfLayout['freeTextFields'] = [];
  for (let i = 0; i < ns; i++) {
    freeTextFields.push({ offset: transducerAt + i * 80, length: 80 });
    freeTextFields.push({ offset: prefilterAt + i * 80, length: 80 });
  }

  return { headerBytes, numSignals: ns, labels, recordBytes: offset, annotationSpans, freeTextFields };
}

// ── Redaction rules ────────────────────────────────────────────────

/** Identifying patterns redacted wherever they appear in free text. */
const GENERIC_PATTERNS: RegExp[] = [
  /\b\d{3}-\d{2}-\d{4}\b/g,                                   // SSN
  /\b(?:MRN|MR#?)[_\-\s#:]?\d{4,10}\b/gi,                     // MRN with prefix
  /\b\d{1,2}[-/.](?:\d{1,2}|(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*)[-/.]\d{2,4}\b/gi, // 12/03/1980, 12-MAR-1980, 12.03.80
  /\b(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/g, // 1980-03-12
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,              // email
  /\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,                   // phone with separators
];

/** Words from the patient field that aren't identifying on their own. */
const NOT_IDENTIFYING = new Set(['X', 'M', 'F', 'MALE', 'FEMALE', 'UNKNOWN', 'NA', 'N/A', 'NONE']);

/**
 * Identifying tokens taken from the ORIGINAL patient field (before
 * de-identification), so they can be found again wherever someone typed
 * them into an annotation: the hospital code, the name parts and the
 * birth date. EDF+ writes the patient field as
 * "code sex birthdate name", with underscores for spaces in the name.
 */
export function patientTokens(originalPatientId: string): string[] {
  const tokens = new Set<string>();
  for (const raw of originalPatientId.split(/[\s_,^]+/)) {
    const t = raw.trim();
    if (t.length < 2 || NOT_IDENTIFYING.has(t.toUpperCase())) continue;
    tokens.add(t);
  }
  return [...tokens];
}

/**
 * Identifying tokens from the ORIGINAL recording field: in EDF+ form
 * ("Startdate dd-MMM-yyyy admincode technician equipment"), the hospital
 * administration code and the technician code. The header blanks them;
 * this finds them again in annotation text. The equipment code is kept.
 */
export function recordingTokens(originalRecordingId: string): string[] {
  const parts = originalRecordingId.trim().split(/\s+/);
  if (parts[0] !== 'Startdate') return [];
  return parts.slice(2, 4).filter(t => t.length >= 2 && !NOT_IDENTIFYING.has(t.toUpperCase()));
}

/**
 * Redact one file's annotations and per-signal free-text fields in place,
 * given its bytes from the start of the file. Used by the whole-buffer
 * path; the streaming path calls the same pieces record by record.
 */
export function redactEdfBody(
  bytes: Uint8Array,
  originalPatientId: string,
  originalRecordingId: string,
): { annotationRedactions: number; headerRedactions: number } {
  const layout = parseEdfLayout(bytes);
  if (!layout) return { annotationRedactions: 0, headerRedactions: 0 };
  const tokens = [...patientTokens(originalPatientId), ...recordingTokens(originalRecordingId)];
  const headerRedactions = redactHeaderFreeText(bytes, layout, makeRedactor(tokens, { generic: false }));
  const annotationRedactions = redactRecords(bytes.subarray(layout.headerBytes), 0, layout, makeRedactor(tokens));
  return { annotationRedactions, headerRedactions };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a redactor for one file. It works on a "latin1" view of the
 * bytes (one character per byte), so replacing a match with the same
 * number of X characters keeps the byte length exactly.
 */
export function makeRedactor(
  tokens: string[],
  { generic = true }: { generic?: boolean } = {},
): (text: string) => { text: string; count: number } {
  const tokenPatterns = tokens
    .map(t => new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(t)}(?![A-Za-z0-9])`, 'gi'));
  // Generic patterns (dates, phone numbers, ...) are for annotation text.
  // Header filter fields legitimately hold things like "N:50/60/120", so
  // those are only checked for the patient's own name and ID.
  const patterns = generic ? [...tokenPatterns, ...GENERIC_PATTERNS] : tokenPatterns;
  return (text: string) => {
    let count = 0;
    let out = text;
    for (const p of patterns) {
      p.lastIndex = 0;
      out = out.replace(p, m => {
        count++;
        return 'X'.repeat(m.length);
      });
    }
    return { text: out, count };
  };
}

type Redactor = ReturnType<typeof makeRedactor>;

/** Apply the redactor to one byte range in place. Returns the number of redactions. */
function redactRange(bytes: Uint8Array, start: number, end: number, redact: Redactor): number {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
  const { text, count } = redact(s);
  if (count > 0) for (let i = 0; i < text.length; i++) bytes[start + i] = text.charCodeAt(i);
  return count;
}

/**
 * Redact the TAL text inside one annotation span, in place. Timestamps
 * (from the start of each TAL up to its first 0x14) are skipped, so only
 * annotation text is ever changed.
 */
export function redactAnnotationSpan(bytes: Uint8Array, start: number, end: number, redact: Redactor): number {
  let count = 0;
  let i = start;
  while (i < end) {
    // Skip padding between TALs.
    while (i < end && bytes[i] === 0) i++;
    if (i >= end) break;
    // Timestamp: onset[0x15 duration] up to the first 0x14.
    while (i < end && bytes[i] !== 0x14 && bytes[i] !== 0) i++;
    if (i >= end || bytes[i] === 0) continue;
    i++; // past the 0x14 ending the timestamp
    // Text segments, each ended by 0x14, until the TAL's closing 0x00.
    while (i < end && bytes[i] !== 0) {
      const textStart = i;
      while (i < end && bytes[i] !== 0x14 && bytes[i] !== 0) i++;
      if (i > textStart) count += redactRange(bytes, textStart, i, redact);
      if (i < end && bytes[i] === 0x14) i++;
    }
  }
  return count;
}

/** Redact the per-signal transducer and prefiltering fields of a full header, in place. */
export function redactHeaderFreeText(header: Uint8Array, layout: EdfLayout, redact: Redactor): number {
  let count = 0;
  for (const f of layout.freeTextFields) count += redactRange(header, f.offset, f.offset + f.length, redact);
  return count;
}

/**
 * Redact every annotation span in a run of whole or partial data records,
 * in place. `firstRecordOffset` is where `chunk` starts relative to the
 * start of the data records (0 = first byte after the header), so a
 * streaming caller can pass consecutive records without re-aligning.
 */
export function redactRecords(chunk: Uint8Array, firstRecordOffset: number, layout: EdfLayout, redact: Redactor): number {
  if (layout.annotationSpans.length === 0 || layout.recordBytes === 0) return 0;
  let count = 0;
  const chunkEnd = firstRecordOffset + chunk.length;
  let recordStart = Math.floor(firstRecordOffset / layout.recordBytes) * layout.recordBytes;
  for (; recordStart < chunkEnd; recordStart += layout.recordBytes) {
    for (const span of layout.annotationSpans) {
      const a = Math.max(recordStart + span.offset, firstRecordOffset);
      const b = Math.min(recordStart + span.offset + span.length, chunkEnd);
      if (b > a) count += redactAnnotationSpan(chunk, a - firstRecordOffset, b - firstRecordOffset, redact);
    }
  }
  return count;
}
