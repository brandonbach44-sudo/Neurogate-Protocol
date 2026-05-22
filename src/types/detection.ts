/**
 * Types for the auto-detection engine.
 *
 * The detection engine analyzes dropped files and infers:
 * - Which clinical session each file belongs to
 * - What imaging/recording modality each file is
 * - Which subject group each file belongs to
 * - How confident the engine is in each guess
 */

// ── Clinical Sessions ──────────────────────────────────────────────
// These are the three phases of epilepsy surgical evaluation.
// They are NOT numbered — they use clinical labels per SOP-BIDS-001.

export type Session = 'ses-preimplant' | 'ses-postimplant' | 'ses-postsurgery';

export const SESSIONS: { value: Session; label: string; description: string }[] = [
  { value: 'ses-preimplant', label: 'Pre-Implant', description: 'Baseline pre-surgical evaluation' },
  { value: 'ses-postimplant', label: 'Post-Implant', description: 'Intracranial monitoring (CT + iEEG)' },
  { value: 'ses-postsurgery', label: 'Post-Surgery', description: 'Post-resection imaging' },
];

// ── Modalities ─────────────────────────────────────────────────────
// Each modality corresponds to a BIDS subfolder within a session.

export type Modality =
  | 'anat-T1w'
  | 'anat-T2w'
  | 'anat-FLAIR'
  | 'anat-angio'
  | 'ct'
  | 'dwi'
  | 'perf'
  | 'eeg'
  | 'ieeg'
  | 'func'
  | 'fmap'
  | 'localizer'
  | 'electrodes'
  | 'channels'
  | 'events'
  | 'sidecar-json'
  | 'sidecar-tsv'
  | 'other';

export const MODALITIES: { value: Modality; label: string; bidsFolder: string }[] = [
  { value: 'anat-T1w', label: 'Anatomical MRI (T1w)', bidsFolder: 'anat' },
  { value: 'anat-T2w', label: 'Anatomical MRI (T2w)', bidsFolder: 'anat' },
  { value: 'anat-FLAIR', label: 'Anatomical MRI (FLAIR)', bidsFolder: 'anat' },
  { value: 'anat-angio', label: 'MR Angiography (TOF)', bidsFolder: 'anat' },
  { value: 'ct', label: 'CT Scan', bidsFolder: 'ct' },
  { value: 'dwi', label: 'Diffusion MRI', bidsFolder: 'dwi' },
  { value: 'perf', label: 'Perfusion / ASL', bidsFolder: 'perf' },
  { value: 'eeg', label: 'Scalp EEG', bidsFolder: 'eeg' },
  { value: 'ieeg', label: 'Intracranial EEG', bidsFolder: 'ieeg' },
  { value: 'func', label: 'Functional MRI', bidsFolder: 'func' },
  { value: 'fmap', label: 'Field Map', bidsFolder: 'fmap' },
  { value: 'localizer', label: 'Localizer / Scout (excluded from export)', bidsFolder: '' },
  { value: 'electrodes', label: 'Electrodes Metadata', bidsFolder: 'ieeg' },
  { value: 'channels', label: 'Channels Metadata', bidsFolder: 'ieeg' },
  { value: 'events', label: 'Events Metadata', bidsFolder: 'ieeg' },
  { value: 'sidecar-json', label: 'JSON Sidecar', bidsFolder: '' },
  { value: 'sidecar-tsv', label: 'TSV Metadata', bidsFolder: '' },
  { value: 'other', label: 'Other / Unknown', bidsFolder: '' },
];

// ── Confidence Levels ──────────────────────────────────────────────

export type Confidence = 'high' | 'medium' | 'low' | 'unclassified';

// ── Detection Reasons ──────────────────────────────────────────────
// Every detection decision carries a list of reasons so the user
// can understand WHY the engine made a particular guess.

export interface DetectionReason {
  /** Which detection layer produced this reason */
  layer: 'extension' | 'filename' | 'sidecar' | 'folder' | 'neighbor' | 'subject-grouping' | 'default';
  /** Human-readable explanation */
  message: string;
  /** How much this reason contributes to confidence (0-1) */
  weight: number;
}

// ── Detection Result (per file) ────────────────────────────────────

export interface DetectionResult {
  /** Original relative path from the dropped folder */
  relativePath: string;
  /** Original file name */
  fileName: string;
  /** File size in bytes */
  fileSize: number;
  /** The underlying File object */
  file: File;

  /** Detected subject group (e.g., "patient_01" or folder-based grouping) */
  subjectGroup: string;

  /** Detected clinical session */
  detectedSession: Session | null;
  /** Detected modality */
  detectedModality: Modality;
  /** Overall confidence in the detection */
  confidence: Confidence;
  /** All reasons that contributed to this detection */
  reasons: DetectionReason[];

  /** User-corrected session (null = user hasn't changed it) */
  userSession: Session | null;
  /** User-corrected modality (null = user hasn't changed it) */
  userModality: Modality | null;
  /** User-corrected subject group (null = user hasn't changed it) */
  userSubjectGroup: string | null;

  /** Preview of what the BIDS-compliant filename will be */
  bidsFilename: string;
  /** Preview of the full BIDS path */
  bidsPath: string;
}

// ── Helpers ────────────────────────────────────────────────────────

/** Get the effective session (user override or detected) */
export function getEffectiveSession(result: DetectionResult): Session | null {
  return result.userSession ?? result.detectedSession;
}

/** Get the effective modality (user override or detected) */
export function getEffectiveModality(result: DetectionResult): Modality {
  return result.userModality ?? result.detectedModality;
}

/** Get the effective subject group (user override or detected) */
export function getEffectiveSubjectGroup(result: DetectionResult): string {
  return result.userSubjectGroup ?? result.subjectGroup;
}

/** Summary stats for a batch of detection results */
export interface DetectionSummary {
  totalFiles: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  unclassified: number;
  subjectGroups: string[];
  missingRequired: string[];  // e.g., "ses-preimplant: no T1w detected"
  warnings: string[];         // e.g., "Persyst .dat without matching .lay"
}
