/**
 * Layer 2: Filename Keyword Detector
 *
 * Scans the filename (not the path, just the file itself) for keywords
 * that indicate modality. This is higher confidence than folder names
 * because filenames are closer to the actual data.
 *
 * We use case-insensitive matching and handle common variations:
 * - T1w, T1, t1_weighted, T1_MPRAGE, etc.
 * - CT, ct_scan, postimplant_CT, etc.
 * - dwi, DTI, diffusion, etc.
 */

import type { Modality, Session, DetectionReason } from '../../types/detection';

export interface FilenameResult {
  modality: Modality | null;
  session: Session | null;
  reasons: DetectionReason[];
}

// ── Modality keyword patterns ─────────────────────────────────────
// Each pattern is [regex, modality, human-readable description].
// Order matters: more specific patterns first.

const MODALITY_PATTERNS: [RegExp, Modality, string][] = [
  // Localizer / scout — checked FIRST so scout scans are not mislabeled
  // as anatomical (they sometimes carry "t1"/"3-plane" in the name).
  [/\b(localizer|localiser|scout|aahead[-_]?scout|aascout|3[-_]?plane[-_]?loc|survey[-_]?scan)\b/i, 'localizer', 'Localizer / scout scan keyword'],

  // Anatomical — T1-weighted (most common MRI type)
  [/\b(t1w|t1_w|t1[-_]?weighted|t1[-_]?mprage|mprage|t1[-_]?space|t1_sag|t1_ax|t1_cor|structural)\b/i, 'anat-T1w', 'T1-weighted MRI keyword'],
  [/\bt1\b/i, 'anat-T1w', 'T1 keyword (assumed T1-weighted)'],

  // Anatomical — FLAIR (check before T2 since FLAIR is a specific T2 variant)
  [/\b(flair|t2[-_]?flair|flair[-_]?3d|flair[-_]?sag|flair[-_]?ax|flair[-_]?cor)\b/i, 'anat-FLAIR', 'FLAIR MRI keyword'],

  // Anatomical — T2-weighted
  [/\b(t2w|t2_w|t2[-_]?weighted|t2[-_]?space|t2_sag|t2_ax|t2_cor)\b/i, 'anat-T2w', 'T2-weighted MRI keyword'],
  [/\bt2\b/i, 'anat-T2w', 'T2 keyword (assumed T2-weighted)'],

  // MR Angiography — Time-of-Flight
  [/\b(tof|angio|angiography|mra|time[-_]?of[-_]?flight)\b/i, 'anat-angio', 'MR angiography (TOF) keyword'],

  // CT scan
  [/\b(ct[-_]?scan|ct[-_]?head|ct[-_]?electrode|post[-_]?implant[-_]?ct|ct_with[-_]?electrode)\b/i, 'ct', 'CT scan keyword'],
  [/\bct\b/i, 'ct', 'CT keyword'],

  // Diffusion MRI
  [/\b(dwi|dti|diffusion|diffusion[-_]?weighted|diff[-_]?mri|hardi|multishell)\b/i, 'dwi', 'Diffusion MRI keyword'],

  // Perfusion — Arterial Spin Labeling
  [/\b(asl|pcasl|pasl|m0|m0scan|perfusion|meanperf|mean[-_]?perf|cbf)\b/i, 'perf', 'Perfusion / ASL keyword'],

  // Functional MRI
  [/\b(bold|fmri|func[-_]?mri|functional|resting[-_]?state|task[-_]?fmri|rest)\b/i, 'func', 'Functional MRI keyword'],

  // Field map
  [/\b(fieldmap|fmap|field[-_]?map|phasediff|phase[-_]?diff|magnitude[12]?|b0[-_]?map)\b/i, 'fmap', 'Field map keyword'],

  // Intracranial EEG (check before scalp EEG — more specific)
  [/\b(ieeg|i[-_]?eeg|intracranial|ecog|seeg|s[-_]?eeg|depth[-_]?electrode|grid[-_]?electrode|subdural|stereo[-_]?eeg)\b/i, 'ieeg', 'Intracranial EEG keyword'],

  // Scalp EEG
  [/\b(eeg|scalp[-_]?eeg|surface[-_]?eeg|routine[-_]?eeg|video[-_]?eeg|veeg)\b/i, 'eeg', 'Scalp EEG keyword'],

  // Electrode metadata
  [/\b(electrode[s]?[-_]?(pos|loc|coord|position|location)?)\b/i, 'electrodes', 'Electrode metadata keyword'],

  // Channel metadata
  [/\b(channel[s]?[-_]?(desc|info|label)?)\b/i, 'channels', 'Channel metadata keyword'],

  // Events
  [/\b(event[s]?[-_]?(timing|marker|annotation)?|trigger[s]?|annotation[s]?)\b/i, 'events', 'Events keyword'],
];

// ── Session keyword patterns ──────────────────────────────────────
// These detect clinical session from filename keywords.

const SESSION_PATTERNS: [RegExp, Session, string][] = [
  // Pre-implant (baseline, pre-surgical)
  [/\b(pre[-_]?implant|preimplant|pre[-_]?op|preop|pre[-_]?surg|presurg|baseline|pre[-_]?surgical|phase[-_]?1|phase1|pre[-_]?resection)\b/i, 'ses-preimplant', 'Pre-implant session keyword'],

  // Post-implant (intracranial monitoring)
  [/\b(post[-_]?implant|postimplant|implant|monitoring|ictal|intracranial[-_]?monitoring|seizure[-_]?monitoring|phase[-_]?2|phase2|emu|epilepsy[-_]?monitoring)\b/i, 'ses-postimplant', 'Post-implant session keyword'],

  // Post-surgery (post-resection)
  [/\b(post[-_]?surg|postsurg|post[-_]?op|postop|post[-_]?resection|postresection|resection|post[-_]?surgery|postsurgery|phase[-_]?3|phase3)\b/i, 'ses-postsurgery', 'Post-surgery session keyword'],
];

/**
 * Normalize a string for keyword matching.
 *
 * Every separator (spaces, underscores, hyphens, and camelCase
 * boundaries) is unified to a single hyphen. A hyphen is the right
 * canonical separator because:
 *  - it is a non-word character, so \b word boundaries still split
 *    tokens correctly ("flair_followup" -> "flair-followup");
 *  - it is exactly what the keyword patterns' [-_]? optional
 *    separators expect, so multi-word keywords like "pre-implant" and
 *    "resting-state" match regardless of how the source was spaced.
 *
 * camelCase boundaries are split first because dcm2niix concatenates
 * words in its output names ("restBOLD", "MeanPerf"); without splitting,
 * \bbold\b would never match inside "restBOLD".
 */
export function normalizeForKeywords(raw: string): string {
  return raw
    // Split camelCase / acronym boundaries.
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    // Unify every separator run to a single hyphen.
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Run modality + session keyword patterns against already-normalized
 * text. Shared by the filename detector and the JSON sidecar detector,
 * with the same patterns but a different layer label and confidence
 * weight (sidecar text is the scanner's own label, so it scores higher).
 */
function matchKeywords(
  normalized: string,
  layer: DetectionReason['layer'],
  messagePrefix: string,
  modalityWeight: number,
  sessionWeight: number,
): FilenameResult {
  const reasons: DetectionReason[] = [];
  let modality: Modality | null = null;
  let session: Session | null = null;

  // ── Check modality patterns ───────────────────────────────
  for (const [pattern, mod, description] of MODALITY_PATTERNS) {
    if (pattern.test(normalized)) {
      modality = mod;
      reasons.push({
        layer,
        message: `${messagePrefix}: ${description}`,
        weight: modalityWeight,
      });
      break; // Take first (most specific) match
    }
  }

  // ── Check session patterns ────────────────────────────────
  for (const [pattern, ses, description] of SESSION_PATTERNS) {
    if (pattern.test(normalized)) {
      session = ses;
      reasons.push({
        layer,
        message: `${messagePrefix}: ${description}`,
        weight: sessionWeight,
      });
      break; // Take first match
    }
  }

  return { modality, session, reasons };
}

/**
 * Analyze a filename for modality and session keywords.
 */
export function detectFromFilename(fileName: string): FilenameResult {
  // Strip extension for cleaner matching
  const nameWithoutExt = fileName
    .replace(/\.nii\.gz$/i, '')
    .replace(/\.[^.]+$/i, '');

  const normalized = normalizeForKeywords(nameWithoutExt);
  return matchKeywords(normalized, 'filename', 'Filename keyword match', 0.6, 0.5);
}

/**
 * Analyze JSON sidecar scan-name text (SeriesDescription / ProtocolName
 * pulled by the sidecar reader) for modality and session keywords.
 *
 * This is higher confidence than the filename detector: the text comes
 * straight from the scanner's own scan label, which survives even when
 * dcm2niix produces a generic NIfTI filename like "sub-X_10.nii".
 */
export function detectFromSidecarText(scanText: string): FilenameResult {
  const normalized = normalizeForKeywords(scanText);
  return matchKeywords(normalized, 'sidecar', 'JSON sidecar keyword match', 0.75, 0.55);
}
