/**
 * Layer 3: Folder Name Session & Modality Detector
 *
 * Analyzes the full folder path (not the filename) for keywords
 * that indicate which clinical session or modality a file belongs to.
 *
 * This is medium-confidence because folder naming conventions vary
 * wildly between sites. One site might use "PreOp_MRI/", another
 * might use "Phase1/", another "baseline_scans/".
 *
 * We check every folder segment in the path — the clue might be
 * in the parent, grandparent, or even great-grandparent folder.
 */

import type { Modality, Session, DetectionReason } from '../../types/detection';
import { normalizeForKeywords } from './filenameDetector';

export interface FolderResult {
  session: Session | null;
  modality: Modality | null;
  reasons: DetectionReason[];
}

// ── Session patterns for folder names ─────────────────────────────
const FOLDER_SESSION_PATTERNS: [RegExp, Session, string][] = [
  // Pre-implant
  [/\b(pre[-_]?implant|preimplant|pre[-_]?op|preop|pre[-_]?surg|presurg|baseline|pre[-_]?surgical|phase[-_]?1|phase1|session[-_]?1|ses[-_]?1|pre[-_]?resection|initial[-_]?eval|pre[-_]?eval)\b/i, 'ses-preimplant', 'Folder suggests pre-implant session'],

  // Post-implant
  [/\b(post[-_]?implant|postimplant|implant|monitoring|ictal|intracranial[-_]?monitoring|seizure[-_]?monitoring|phase[-_]?2|phase2|session[-_]?2|ses[-_]?2|emu|epilepsy[-_]?monitoring|electrode[-_]?monitoring|invasive[-_]?monitoring)\b/i, 'ses-postimplant', 'Folder suggests post-implant session'],

  // Post-surgery
  [/\b(post[-_]?surg|postsurg|post[-_]?op|postop|post[-_]?resection|postresection|resection|post[-_]?surgery|postsurgery|phase[-_]?3|phase3|session[-_]?3|ses[-_]?3|follow[-_]?up)\b/i, 'ses-postsurgery', 'Folder suggests post-surgery session'],
];

// ── Modality patterns for folder names ────────────────────────────
const FOLDER_MODALITY_PATTERNS: [RegExp, Modality, string][] = [
  // Localizer / scout (check first so scout folders are not mislabeled)
  [/\b(localizer|localiser|scout)\b/i, 'localizer', 'Folder suggests localizer / scout'],

  // Anatomical MRI
  [/\b(anat|anatomical|structural|mri[-_]?structural|t1|t1w|mprage)\b/i, 'anat-T1w', 'Folder suggests anatomical MRI'],
  [/\b(flair)\b/i, 'anat-FLAIR', 'Folder suggests FLAIR MRI'],
  [/\b(t2|t2w)\b/i, 'anat-T2w', 'Folder suggests T2-weighted MRI'],

  // MR Angiography
  [/\b(tof|angio|angiography|mra)\b/i, 'anat-angio', 'Folder suggests MR angiography'],

  // CT
  [/\b(ct|ct[-_]?scan|computed[-_]?tomography)\b/i, 'ct', 'Folder suggests CT scan'],

  // Diffusion
  [/\b(dwi|dti|diffusion)\b/i, 'dwi', 'Folder suggests diffusion MRI'],

  // Perfusion / ASL
  [/\b(perf|perfusion|asl)\b/i, 'perf', 'Folder suggests perfusion / ASL'],

  // EEG types (check ieeg before eeg)
  [/\b(ieeg|intracranial[-_]?eeg|ecog|seeg|depth[-_]?electrode|subdural)\b/i, 'ieeg', 'Folder suggests intracranial EEG'],
  [/\b(eeg|scalp[-_]?eeg|surface[-_]?eeg)\b/i, 'eeg', 'Folder suggests scalp EEG'],

  // Functional MRI
  [/\b(func|functional|bold|fmri|resting[-_]?state)\b/i, 'func', 'Folder suggests functional MRI'],

  // Field map
  [/\b(fmap|fieldmap|field[-_]?map)\b/i, 'fmap', 'Folder suggests field map'],
];

/**
 * Analyze the folder path for session and modality clues.
 *
 * We split the path into segments and check each one,
 * because the relevant keyword could be at any level:
 *   "Patient01/PreOp/MRI/scan.nii.gz"
 *                ^     ^
 *          session   modality
 */
export function detectFromFolderPath(relativePath: string): FolderResult {
  const reasons: DetectionReason[] = [];
  let session: Session | null = null;
  let modality: Modality | null = null;

  // Get folder path (everything before the filename)
  const lastSlash = relativePath.lastIndexOf('/');
  if (lastSlash === -1) {
    // File is at the root of the dropped folder — no folder clues
    return { session: null, modality: null, reasons: [] };
  }

  const folderPath = relativePath.substring(0, lastSlash);
  // Split into individual folder segments
  const segments = folderPath.split('/').filter(s => s.length > 0);

  // Check each folder segment for session clues
  for (const segment of segments) {
    if (session !== null) break; // Already found a session

    // Normalize separators and split camelCase so \b word boundaries
    // and multi-word keywords work. Without this, "Session_preimplant"
    // or "PreImplantMRI" would not match the keyword patterns.
    const normalized = normalizeForKeywords(segment);

    for (const [pattern, ses, description] of FOLDER_SESSION_PATTERNS) {
      if (pattern.test(normalized)) {
        session = ses;
        reasons.push({
          layer: 'folder',
          message: `${description} (folder: "${segment}")`,
          weight: 0.4,
        });
        break;
      }
    }
  }

  // Check each folder segment for modality clues
  for (const segment of segments) {
    if (modality !== null) break; // Already found a modality

    const normalized = normalizeForKeywords(segment);

    for (const [pattern, mod, description] of FOLDER_MODALITY_PATTERNS) {
      if (pattern.test(normalized)) {
        modality = mod;
        reasons.push({
          layer: 'folder',
          message: `${description} (folder: "${segment}")`,
          weight: 0.3,
        });
        break;
      }
    }
  }

  return { session, modality, reasons };
}
