/**
 * EDF Header Reader
 *
 * Reads the standard EDF (European Data Format) file header to extract:
 *   - Patient identification string (bytes 8-87)    -- often contains PHI
 *   - Recording identification string (bytes 88-167) -- often contains PHI
 *   - Start date (bytes 168-175, dd.mm.yy)
 *   - Start time (bytes 176-183, hh.mm.ss)
 *   - Number of signals (bytes 252-255)
 *   - Signal labels from the signal header (first ns*16 bytes after byte 256)
 *
 * Signal labels are used to distinguish scalp EEG from intracranial EEG
 * (iEEG), which cannot be determined from the .edf extension alone.
 *
 * EDF specification: https://www.edfplus.info/specs/edf.html
 *
 * All header fields are ASCII, fixed-width, right-padded with spaces.
 */

import type { ScannedFile } from '../../types/files';

// ── Types ─────────────────────────────────────────────────────────

export interface EdfHeaderInfo {
  /** Raw patient ID field from the EDF header (may contain PHI). */
  patientId: string;
  /** Raw recording ID field from the EDF header (may contain PHI). */
  recordingId: string;
  /** Start date string as stored in the header (dd.mm.yy). */
  startDate: string;
  /** Start time string as stored in the header (hh.mm.ss). */
  startTime: string;
  /** Total number of signal channels in the recording. */
  numSignals: number;
  /** Raw signal labels read from the signal header, trimmed of whitespace. */
  signalLabels: string[];
  /**
   * Modality inferred from signal labels.
   * 'ieeg' if labels match depth/grid/strip electrode patterns.
   * 'eeg'  if labels match scalp 10-20 channel names.
   * null   if too ambiguous to determine.
   */
  modalityHint: 'ieeg' | 'eeg' | null;
  /**
   * True if the patient ID or recording ID fields appear to contain
   * non-anonymized data (real patient name / date of birth / etc.).
   * Used to surface a PHI warning in the validation step.
   */
  phiLikely: boolean;
}

// ── Scalp EEG channel set (standard 10-20 and extended 10-10) ─────
// Lowercase for case-insensitive comparison.
const SCALP_EEG_LABELS = new Set([
  'fp1', 'fp2', 'f7', 'f8', 'f3', 'f4', 'fz',
  'fc3', 'fc4', 'fcz', 'fc1', 'fc2', 'fc5', 'fc6',
  't3', 't4', 't7', 't8', 't5', 't6', 'tp7', 'tp8',
  'c3', 'c4', 'cz', 'c1', 'c2', 'c5', 'c6',
  'cp3', 'cp4', 'cpz', 'cp1', 'cp2', 'cp5', 'cp6',
  'p3', 'p4', 'pz', 'p7', 'p8', 'p1', 'p2',
  'po3', 'po4', 'poz', 'po7', 'po8',
  'o1', 'o2', 'oz',
  'af3', 'af4', 'afz', 'af7', 'af8',
  'f1', 'f2', 'f5', 'f6', 'f9', 'f10',
  'ft7', 'ft8', 'ft9', 'ft10',
  'a1', 'a2', // earlobes -- scalp EEG references
]);

/**
 * Strip a label of common prefixes/suffixes so it can be matched
 * against the canonical sets above.
 *
 * Many systems write labels like:
 *   "EEG Fp1"      -> "fp1"    (scalp EEG)
 *   "EEG LA1-REF"  -> "la1"    (iEEG depth electrode)
 *   "LA1"          -> "la1"
 */
function normalizeLabel(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^eeg\s+/i, '')      // remove "EEG " prefix
    .replace(/[-_](ref|avg|le|re|bipolar|car)$/i, '')  // remove reference suffixes
    .replace(/\s+/g, '');         // collapse any remaining whitespace
}

/**
 * Determine modality from a list of channel labels.
 *
 * iEEG recordings (SEEG/ECoG) frequently include a small number of scalp
 * reference channels (e.g. Fz, Cz, C3, C4) alongside hundreds of depth
 * electrode contacts. Checking scalp count first would misclassify these
 * as scalp EEG. Instead we use a majority/dominance approach:
 *
 *   - Count iEEG-pattern channels (1-4 letters + 1-3 digits, not in scalp set)
 *     e.g. LA1, LB3, G7, RA12 -- depth/grid/strip contacts
 *   - Count scalp 10-20 channels (Fp1, C3, Fz, etc.)
 *   - iEEG wins if ieegCount >= 3 AND ieegCount > scalpCount
 *   - Scalp wins if scalpCount >= 3 AND scalpCount > ieegCount
 *   - Tie or neither threshold met -> null (ambiguous)
 *
 * Real example (HUP282): 266 iEEG channels, 4 scalp refs -> 'ieeg' ✓
 */
function inferModalityFromLabels(labels: string[]): 'ieeg' | 'eeg' | null {
  if (labels.length === 0) return null;

  // iEEG depth/grid/strip label pattern: 1-4 letters followed by 1-3 digits
  // e.g. LA1, G3, LH10, RA2, LOf1, ATD2
  const ieegPattern = /^[a-z]{1,4}\d{1,3}$/;

  let scalpCount = 0;
  let ieegCount = 0;

  for (const raw of labels) {
    const norm = normalizeLabel(raw);
    if (!norm) continue;

    if (SCALP_EEG_LABELS.has(norm)) {
      scalpCount++;
    } else if (ieegPattern.test(norm)) {
      ieegCount++;
    }
  }

  // Dominant modality wins -- iEEG recordings routinely include a few
  // scalp reference channels so pure threshold checks are unreliable.
  if (ieegCount >= 3 && ieegCount > scalpCount) return 'ieeg';
  if (scalpCount >= 3 && scalpCount > ieegCount) return 'eeg';
  return null;
}

/**
 * Heuristic PHI check focused on the EDF patient ID field.
 *
 * EDF+ spec defines the patient ID field as four space-separated subfields:
 *   patientCode sex birthdate patientName
 *   e.g. "MCH-0234567 F 02-MAY-1951 Haagse_Harry"
 *
 * Properly anonymized files replace each subfield with "X":
 *   "X X X X"
 *
 * We only inspect the patient ID field -- the recording ID field routinely
 * contains non-PHI text like equipment names and export software
 * (e.g. "Exported_with_Persyst_EEGSuite") that would produce false positives.
 *
 * We flag if the patient ID is non-empty AND does not look like a fully
 * anonymized placeholder. We do NOT extract PHI, only surface a warning
 * so the user can review the file before sharing.
 */
function detectPhi(patientId: string, _recordingId: string): boolean {
  if (!patientId) return false;

  // EDF+ anonymized placeholder: all subfields set to "X"
  const fullyAnonymized = /^(x\s*)+$/i;
  if (fullyAnonymized.test(patientId)) return false;

  // Other common anonymized placeholders
  const genericAnon = /^(anonymous|unknown|n\/a|none|\d+)$/i;
  if (genericAnon.test(patientId.trim())) return false;

  // If it contains any letter that isn't X (case-insensitive), real content
  // is present -- could be a patient name, MRN, sex code, or DOB.
  return /[a-wyz]/i.test(patientId);
}

// ── EDF Header Parser ─────────────────────────────────────────────

/**
 * Parse an EDF file's header from a binary ArrayBuffer.
 * The buffer must contain at least the global header (256 bytes)
 * plus the signal label section (numSignals * 16 bytes).
 */
function parseEdfHeader(buffer: ArrayBuffer): EdfHeaderInfo {
  const decoder = new TextDecoder('ascii');
  const bytes = new Uint8Array(buffer);

  function readField(start: number, length: number): string {
    return decoder.decode(bytes.slice(start, start + length)).trim();
  }

  const patientId   = readField(8,  80);
  const recordingId = readField(88, 80);
  const startDate   = readField(168, 8);
  const startTime   = readField(176, 8);

  const numSignalsStr = readField(252, 4);
  const numSignals = parseInt(numSignalsStr, 10) || 0;

  // Signal labels are the first ns*16 bytes of the signal header
  // (which starts at byte 256).
  const signalLabels: string[] = [];
  const signalHeaderStart = 256;
  const labelSectionLength = numSignals * 16;

  if (buffer.byteLength >= signalHeaderStart + labelSectionLength && numSignals > 0) {
    for (let i = 0; i < numSignals; i++) {
      const offset = signalHeaderStart + i * 16;
      const label = readField(offset, 16);
      if (label) signalLabels.push(label);
    }
  }

  const modalityHint = inferModalityFromLabels(signalLabels);
  const phiLikely = detectPhi(patientId, recordingId);

  return {
    patientId,
    recordingId,
    startDate,
    startTime,
    numSignals,
    signalLabels,
    modalityHint,
    phiLikely,
  };
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Read EDF/BDF file headers for all EDF/BDF files in a ScannedFile list.
 *
 * Only the first (256 + numSignals*16) bytes are read -- typically
 * under 10 KB even for recordings with 256 channels -- so this is
 * fast even for large multi-GB recordings.
 *
 * Returns a Map keyed by filename -> EdfHeaderInfo.
 * Files that cannot be read (too small, read error) are silently skipped.
 */
export async function readEdfHeaders(
  files: ScannedFile[],
): Promise<Map<string, EdfHeaderInfo>> {
  const map = new Map<string, EdfHeaderInfo>();

  const edfFiles = files.filter(f => {
    const lower = f.name.toLowerCase();
    return lower.endsWith('.edf') || lower.endsWith('.bdf');
  });

  await Promise.all(
    edfFiles.map(async (ef) => {
      try {
        // Read enough bytes to get the global header + all signal labels.
        // We read the global header first to learn numSignals, then
        // read the full signal label section. Since browsers provide
        // File.slice(), we do a two-pass approach with a safe upper bound:
        // 256 (global header) + 512 channels * 16 bytes = 8448 bytes max.
        // This covers virtually all EEG/iEEG systems without loading the
        // entire (potentially GB-sized) recording.
        const MAX_READ = 256 + 512 * 16; // 8448 bytes
        const chunk = ef.file.slice(0, MAX_READ);
        const buffer = await chunk.arrayBuffer();

        // Must have at least the 256-byte global header
        if (buffer.byteLength < 256) return;

        const info = parseEdfHeader(buffer);
        map.set(ef.name, info);
      } catch {
        // Unreadable file -- skip, not fatal. Detection continues
        // using filename/folder heuristics alone.
      }
    }),
  );

  return map;
}
