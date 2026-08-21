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
import { normalizeForKeywords, isDerivedDiffusionMap } from './filenameDetector';

export interface FolderResult {
  session: Session | null;
  modality: Modality | null;
  reasons: DetectionReason[];
  /**
   * Set when a folder segment matched the bare "post-op"/"postop" pattern
   * (see AMBIGUOUS_POSTOP_PATTERN below) and nothing else resolved a
   * session for this file. "Post-op" alone is genuinely ambiguous between
   * post-implant monitoring and post-surgery follow-up -- this candidate
   * is deliberately NOT assigned to `session` so that engine.ts's Layer 4
   * neighbor inference (CT + iEEG in the group -> post-implant) gets a
   * chance to resolve it correctly first. If nothing else resolves a
   * session, engine.ts falls back to this candidate as a last resort,
   * with a lower-confidence corrective reason. See
   * Documents/Phase1b note 2026-08-02 (ambiguous post-op resolution).
   */
  ambiguousSessionCandidate: Session | null;
}

// ── Session patterns for folder names ─────────────────────────────
const FOLDER_SESSION_PATTERNS: [RegExp, Session, string][] = [
  // Pre-implant. Bare "pre-op" stays here (not split out like "post-op"
  // below) because there's no "pre-surgery" session to confuse it with --
  // only post-implant vs. post-surgery is ambiguous.
  [/\b(pre[-_]?implant|preimplant|pre[-_]?op|preop|pre[-_]?surg|presurg|baseline|pre[-_]?surgical|phase[-_]?1|phase1|session[-_]?1|ses[-_]?1|pre[-_]?resection|initial[-_]?eval|pre[-_]?eval)\b/i, 'ses-preimplant', 'Folder suggests pre-implant session'],

  // Post-implant
  [/\b(post[-_]?implant|postimplant|implant|monitoring|ictal|intracranial[-_]?monitoring|seizure[-_]?monitoring|phase[-_]?2|phase2|session[-_]?2|ses[-_]?2|emu|epilepsy[-_]?monitoring|electrode[-_]?monitoring|invasive[-_]?monitoring)\b/i, 'ses-postimplant', 'Folder suggests post-implant session'],

  // Post-surgery -- UNAMBIGUOUS variants only. Bare "post-op"/"postop" is
  // deliberately excluded here: it's genuinely ambiguous between this
  // session and post-implant monitoring in real clinical shorthand.
  // Handled separately via AMBIGUOUS_POSTOP_PATTERN below so the decision
  // can defer to modality evidence instead of guessing blindly. Found via
  // adversarial full-pipeline testing 2026-08-02 (a "PostOp/CT" folder
  // was silently misclassified as post-surgery instead of post-implant).
  [/\b(post[-_]?surg|postsurg|post[-_]?resection|postresection|resection|post[-_]?surgery|postsurgery|phase[-_]?3|phase3|session[-_]?3|ses[-_]?3|follow[-_]?up)\b/i, 'ses-postsurgery', 'Folder suggests post-surgery session'],
];

/**
 * Bare "post-op"/"postop" -- not qualified by "implant", "surg", or
 * "resection" -- is ambiguous between post-implant and post-surgery.
 * See FolderResult.ambiguousSessionCandidate above for how the caller
 * resolves it.
 */
const AMBIGUOUS_POSTOP_PATTERN = /\b(post[-_]?op|postop)\b/i;

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

  // Field map -- kept above diffusion for the same ordering reason as in
  // filenameDetector.ts: the diffusion pattern below matches a bare
  // "diff" token, which would otherwise swallow "phase_diff".
  // "(?:ping)?" makes "gre_field_mapping" / "Field_mapping" match; see the
  // longer note in filenameDetector.ts.
  [/\b(fmap|fieldmap|field[-_]?map(?:ping)?)\b/i, 'fmap', 'Folder suggests field map'],

  // Diffusion. "ep2d_diff" / bare "diff" cover the stock Siemens EPI
  // diffusion series names; see filenameDetector.ts for the full note.
  [/\b(dwi|dti|diffusion|ep2d[-_]?diff|diff)\b/i, 'dwi', 'Folder suggests diffusion MRI'],

  // Perfusion / ASL
  [/\b(perf|perfusion|asl)\b/i, 'perf', 'Folder suggests perfusion / ASL'],

  // EEG types (check ieeg before eeg)
  [/\b(ieeg|intracranial[-_]?eeg|ecog|seeg|depth[-_]?electrode|subdural)\b/i, 'ieeg', 'Folder suggests intracranial EEG'],
  [/\b(eeg|scalp[-_]?eeg|surface[-_]?eeg)\b/i, 'eeg', 'Folder suggests scalp EEG'],

  // Functional MRI
  [/\b(func|functional|bold|fmri|resting[-_]?state)\b/i, 'func', 'Folder suggests functional MRI'],

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
  let ambiguousSessionCandidate: Session | null = null;

  // Get folder path (everything before the filename)
  const lastSlash = relativePath.lastIndexOf('/');
  if (lastSlash === -1) {
    // File is at the root of the dropped folder — no folder clues
    return { session: null, modality: null, reasons: [], ambiguousSessionCandidate: null };
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
          supports: 'session',
        });
        break;
      }
    }
  }

  // Only look for the ambiguous bare "post-op" pattern if no unambiguous
  // session keyword was found anywhere in the path -- an unambiguous match
  // always wins regardless of which segment it's in.
  if (session === null) {
    for (const segment of segments) {
      if (ambiguousSessionCandidate !== null) break;
      const normalized = normalizeForKeywords(segment);
      if (AMBIGUOUS_POSTOP_PATTERN.test(normalized)) {
        ambiguousSessionCandidate = 'ses-postsurgery';
        reasons.push({
          layer: 'folder',
          message: `Folder name is ambiguous ("post-op" could mean post-implant monitoring or post-surgery follow-up) (folder: "${segment}") -- deferring to nearby CT/iEEG evidence if available`,
          weight: 0,
        });
      }
    }
  }

  // Check each folder segment for modality clues
  for (const segment of segments) {
    if (modality !== null) break; // Already found a modality

    const normalized = normalizeForKeywords(segment);

    // A scanner-derived diffusion map (ADC/FA/TRACEW) sits in a folder
    // named after the series it was derived from, e.g.
    // "ep2d_diff_SliceAcc_b1k_64_ADC/". Without this guard the folder's
    // "ep2d_diff" token would classify the map as raw dwi and undo the
    // matching guard in filenameDetector.ts's matchKeywords. Skip the
    // segment entirely so the file stays unclassified for manual
    // placement; see isDerivedDiffusionMap for the ImageType evidence.
    if (isDerivedDiffusionMap(normalized)) continue;

    for (const [pattern, mod, description] of FOLDER_MODALITY_PATTERNS) {
      if (pattern.test(normalized)) {
        modality = mod;
        reasons.push({
          layer: 'folder',
          message: `${description} (folder: "${segment}")`,
          weight: 0.3,
          supports: 'modality',
        });
        break;
      }
    }
  }

  return { session, modality, reasons, ambiguousSessionCandidate };
}
