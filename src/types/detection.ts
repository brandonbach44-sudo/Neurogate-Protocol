/**
 * Types for the auto-detection engine.
 *
 * The detection engine analyzes dropped files and infers:
 * - Which clinical session each file belongs to
 * - What imaging/recording modality each file is
 * - Which subject group each file belongs to
 * - How confident the engine is in each guess
 */

import type { FileLike } from './fileLike';

// ── Clinical Sessions ──────────────────────────────────────────────
// A session is a BIDS session id string (e.g. "ses-preimplant",
// "ses-2mo"). Which ids are valid for a given dataset depends on the
// dataset's chosen session structure (see types/sessionStructure.ts,
// added Phase 1 July 2026) -- this type does not enumerate them, so
// both the built-in Implant sessions preset and user-defined Custom
// timepoints can share the same Session type throughout the app.
//
// ImplantSession names the three specific ids used by the Implant
// sessions preset (NeuroGate's original built-in structure, not a
// universal BIDS standard). Code that specifically means "one of the
// three implant sessions" should use ImplantSession; general detection
// results, validation, and export code should use the wider Session.

export type ImplantSession = 'ses-preimplant' | 'ses-postimplant' | 'ses-postsurgery';
export type Session = string;

export const SESSIONS: { value: ImplantSession; label: string; description: string }[] = [
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
  | 'anat-PDw'
  | 'anat-T2starw'
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
  // Proton-density weighted. Siemens names these "pd_tse_tra" / "PD_TSE".
  // Before this existed they fell to the blind T1w default and were
  // exported as fabricated T1w anatomicals (30 files in the Phase2_MRI
  // corpus). BIDS suffix: _PDw.
  { value: 'anat-PDw', label: 'Anatomical MRI (Proton Density)', bidsFolder: 'anat' },
  // T2*-weighted, which is what SWI and gradient-echo T2* series actually
  // are. They used to be folded into anat-T2w -- a different contrast
  // entirely -- because no closer type existed. Covers "Sag_SWI_3D",
  // "3D_T2star_GRE", "SWI_Images" and the derived magnitude / phase /
  // minimum-intensity-projection images the SWI reconstruction emits.
  // BIDS suffix: _T2starw.
  { value: 'anat-T2starw', label: 'Anatomical MRI (T2*/SWI)', bidsFolder: 'anat' },
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
  layer: 'extension' | 'filename' | 'sidecar' | 'folder' | 'neighbor' | 'subject-grouping' | 'default' | 'date-cluster' | 'folder-cluster';
  /** Human-readable explanation */
  message: string;
  /** How much this reason contributes to confidence (0-1) */
  weight: number;
  /**
   * Which detection dimension this reason is evidence FOR.
   *
   * Confidence used to be a single sum of every reason's weight, which
   * meant strong evidence about one dimension silently vouched for a
   * different one. A file whose session was certain (a "2weeks" Flywheel
   * folder, 0.45) and whose subject was certain (0.30) but whose modality
   * came only from the blind "Defaulting ambiguous NIfTI to T1w -- please
   * verify" fallback (0.10) summed to 1.45 and was graded "high", which
   * is the gate for writing a file into the BIDS export. Real field maps,
   * proton-density and diffusion scans were exported as _T1w anatomicals
   * with no warning. Found 2026-08-17 auditing 868 real scans: 416 files
   * (48%) took their modality from that fallback and 371 of them were
   * exported as fabricated T1w images.
   *
   * Tagging is opt-in: an untagged reason keeps counting toward the
   * overall total exactly as before, so nothing regresses, but a reason
   * marked 'modality' also counts toward the separate modality-evidence
   * budget that calculateConfidence() now requires before it will grade a
   * file high enough to export. Tag every reason that genuinely asserts
   * what KIND of scan a file is.
   */
  supports?: 'modality' | 'session' | 'subject';
}

// ── Detection Result (per file) ────────────────────────────────────

export interface DetectionResult {
  /** Original relative path from the dropped folder */
  relativePath: string;
  /** Original file name */
  fileName: string;
  /** File size in bytes */
  fileSize: number;
  /** The underlying file -- a browser File on web, a NodeFileAdapter on CLI/desktop (see types/fileLike.ts) */
  file: FileLike;

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

  /**
   * True when detectedModality came only from the blind
   * "Defaulting ambiguous NIfTI to T1w -- please verify" fallback, i.e. no
   * layer ever actually identified what kind of scan this is.
   *
   * This exists because confidence turned out to be advisory: nothing in
   * lib/bids/bidsNaming.ts or lib/bids/exporter.ts ever reads it, so
   * grading a file 'low' did not stop it being written into the BIDS tree.
   * The only real gates were "has a session" and "modality is exportable".
   * A guessed T1w passes both, so 371 field-map / proton-density /
   * diffusion files in the Phase2_MRI corpus were exported as
   * sub-XX_ses-YY_run-N_T1w.nii.gz (audit 2026-08-17).
   *
   * computeBidsNames routes a file with this flag to unclassified/ instead
   * of primary/, so a guess is never written under a modality-specific
   * BIDS name. Setting userModality (the user picking a modality in the
   * mapping table) overrides the flag and the file exports normally --
   * the point is to require a human decision, not to discard data.
   */
  modalityIsGuess?: boolean;

  /**
   * Set when this file is the redundant copy of a series that appears
   * twice in the same folder, and names the copy being kept.
   *
   * Flywheel/Scitran exports routinely carry one acquisition under two
   * names: the bare series name, and dcm2niix's decorated
   * _<series>_<timestamp>_<seriesNumber>. Both are exportable, so without
   * this they receive separate run- entities and the dataset claims two
   * acquisitions where the scanner produced one -- double-counting the
   * series in any downstream analysis. 117 folders / 236 files in the
   * Phase2_MRI corpus (2026-08-17).
   *
   * computeBidsNames keeps the copy that carries the .json sidecar (the
   * decorated one in 118 of 119 real pairs, and the only one holding the
   * scanner metadata the engine reads ImageType from) and routes the
   * redundant copy to unclassified/. The detected modality is preserved so
   * the mapping table still shows what the file is, and setting
   * userModality overrides the exclusion if the user disagrees.
   */
  duplicateOf?: string;
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
