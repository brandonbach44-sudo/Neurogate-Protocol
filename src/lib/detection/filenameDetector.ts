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
  // Anatomical — T1-weighted (most common MRI type)
  [/\b(t1w|t1_w|t1[-_]?weighted|t1[-_]?mprage|mprage|t1[-_]?space|t1_sag|t1_ax|t1_cor|structural)\b/i, 'anat-T1w', 'T1-weighted MRI keyword'],
  [/\bt1\b/i, 'anat-T1w', 'T1 keyword (assumed T1-weighted)'],

  // Anatomical — FLAIR (check before T2 since FLAIR is a specific T2 variant)
  [/\b(flair|t2[-_]?flair|flair[-_]?3d|flair[-_]?sag|flair[-_]?ax|flair[-_]?cor)\b/i, 'anat-FLAIR', 'FLAIR MRI keyword'],

  // Anatomical — T2-weighted
  [/\b(t2w|t2_w|t2[-_]?weighted|t2[-_]?space|t2_sag|t2_ax|t2_cor)\b/i, 'anat-T2w', 'T2-weighted MRI keyword'],
  [/\bt2\b/i, 'anat-T2w', 'T2 keyword (assumed T2-weighted)'],

  // CT scan
  [/\b(ct[-_]?scan|ct[-_]?head|ct[-_]?electrode|post[-_]?implant[-_]?ct|ct_with[-_]?electrode)\b/i, 'ct', 'CT scan keyword'],
  [/\bct\b/i, 'ct', 'CT keyword'],

  // Diffusion MRI
  [/\b(dwi|dti|diffusion|diffusion[-_]?weighted|diff[-_]?mri|hardi|multishell)\b/i, 'dwi', 'Diffusion MRI keyword'],

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
 * Analyze a filename for modality and session keywords.
 */
export function detectFromFilename(fileName: string): FilenameResult {
  const reasons: DetectionReason[] = [];
  let modality: Modality | null = null;
  let session: Session | null = null;

  // Strip extension for cleaner matching
  const nameWithoutExt = fileName
    .replace(/\.nii\.gz$/i, '')
    .replace(/\.[^.]+$/i, '');

  // Replace underscores and hyphens with spaces so \b word boundaries
  // work correctly (regex treats _ as a word character, so \bflair\b
  // won't match "flair_followup" without this normalization)
  const normalized = nameWithoutExt.replace(/[-_]/g, ' ');

  // ── Check modality patterns ───────────────────────────────
  for (const [pattern, mod, description] of MODALITY_PATTERNS) {
    if (pattern.test(normalized)) {
      if (modality === null) {
        modality = mod;
      }
      reasons.push({
        layer: 'filename',
        message: `Filename keyword match: ${description}`,
        weight: 0.6,
      });
      break; // Take first (most specific) match
    }
  }

  // ── Check session patterns ────────────────────────────────
  for (const [pattern, ses, description] of SESSION_PATTERNS) {
    if (pattern.test(normalized)) {
      if (session === null) {
        session = ses;
      }
      reasons.push({
        layer: 'filename',
        message: `Filename keyword match: ${description}`,
        weight: 0.5,
      });
      break; // Take first match
    }
  }

  return { modality, session, reasons };
}
