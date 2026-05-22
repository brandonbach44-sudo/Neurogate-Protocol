/**
 * Layer 1: File Extension Detector
 *
 * The most reliable detection layer. File extensions in neuroimaging
 * are standardized — .nii.gz is always imaging, .edf is always
 * electrophysiology, etc.
 *
 * This layer determines the broad FILE TYPE but sometimes can't
 * distinguish within a category (e.g., .nii.gz could be T1w, T2w,
 * CT, DWI, or fMRI — other layers resolve that).
 */

import type { Modality, DetectionReason } from '../../types/detection';

export interface ExtensionResult {
  /** Possible modalities this extension could indicate */
  possibleModalities: Modality[];
  /** If we can narrow it to exactly one, this is set */
  bestGuess: Modality | null;
  /** Reason for the detection */
  reason: DetectionReason;
}

/**
 * Analyze a file's extension and return possible modalities.
 */
export function detectFromExtension(fileName: string, _relativePath: string): ExtensionResult {
  const lower = fileName.toLowerCase();

  // ── NIfTI (gzipped) — imaging file ──────────────────────────
  // Could be anatomical MRI (T1w, T2w), CT, DWI, fMRI, or field map.
  // Extension alone can't tell which — other layers will refine.
  if (lower.endsWith('.nii.gz')) {
    return {
      possibleModalities: ['anat-T1w', 'anat-T2w', 'anat-FLAIR', 'anat-angio', 'ct', 'dwi', 'perf', 'func', 'fmap', 'localizer'],
      bestGuess: null, // need filename/folder keywords to narrow down
      reason: {
        layer: 'extension',
        message: 'NIfTI gzipped file — imaging data (MRI or CT)',
        weight: 0.3,
      },
    };
  }

  // ── Uncompressed NIfTI — auto-compressed on export ──────────
  // BIDS requires .nii.gz. An uncompressed .nii is no longer an error:
  // the exporter gzips it automatically, so this is just informational.
  if (lower.endsWith('.nii') && !lower.endsWith('.nii.gz')) {
    return {
      possibleModalities: ['anat-T1w', 'anat-T2w', 'anat-FLAIR', 'anat-angio', 'ct', 'dwi', 'perf', 'func', 'fmap', 'localizer'],
      bestGuess: null,
      reason: {
        layer: 'extension',
        message: 'Uncompressed NIfTI (.nii) — will be compressed to .nii.gz automatically on export',
        weight: 0.3,
      },
    };
  }

  // ── EDF/BDF — electrophysiology ─────────────────────────────
  // Could be scalp EEG or intracranial EEG. Need context to decide.
  if (lower.endsWith('.edf') || lower.endsWith('.bdf')) {
    return {
      possibleModalities: ['eeg', 'ieeg'],
      bestGuess: null, // need filename/folder to distinguish eeg vs ieeg
      reason: {
        layer: 'extension',
        message: 'EDF/BDF file — electrophysiology recording (EEG or iEEG)',
        weight: 0.4,
      },
    };
  }

  // ── NWB — always intracranial EEG ──────────────────────────
  // Neurodata Without Borders is only used for iEEG in this context.
  if (lower.endsWith('.nwb')) {
    return {
      possibleModalities: ['ieeg'],
      bestGuess: 'ieeg',
      reason: {
        layer: 'extension',
        message: 'NWB file — intracranial EEG (Neurodata Without Borders)',
        weight: 0.9,
      },
    };
  }

  // ── Persyst .dat — intracranial EEG ─────────────────────────
  // Must have a matching .lay file (checked in neighbor inference layer).
  if (lower.endsWith('.dat')) {
    return {
      possibleModalities: ['ieeg'],
      bestGuess: 'ieeg',
      reason: {
        layer: 'extension',
        message: 'Persyst .dat file — intracranial EEG (requires matching .lay file)',
        weight: 0.8,
      },
    };
  }

  // ── Persyst .lay — companion to .dat ────────────────────────
  if (lower.endsWith('.lay')) {
    return {
      possibleModalities: ['ieeg'],
      bestGuess: 'ieeg',
      reason: {
        layer: 'extension',
        message: 'Persyst .lay layout file — companion to iEEG .dat file',
        weight: 0.8,
      },
    };
  }

  // ── b-values file — always DWI ─────────────────────────────
  if (lower.endsWith('.bval')) {
    return {
      possibleModalities: ['dwi'],
      bestGuess: 'dwi',
      reason: {
        layer: 'extension',
        message: 'b-values file — diffusion MRI companion',
        weight: 0.9,
      },
    };
  }

  // ── b-vectors file — always DWI ────────────────────────────
  if (lower.endsWith('.bvec')) {
    return {
      possibleModalities: ['dwi'],
      bestGuess: 'dwi',
      reason: {
        layer: 'extension',
        message: 'b-vectors file — diffusion MRI companion',
        weight: 0.9,
      },
    };
  }

  // ── JSON — sidecar metadata ─────────────────────────────────
  // JSON files are sidecars that accompany imaging/recording files.
  // Their modality is inherited from the file they pair with.
  if (lower.endsWith('.json')) {
    return {
      possibleModalities: ['sidecar-json'],
      bestGuess: 'sidecar-json',
      reason: {
        layer: 'extension',
        message: 'JSON sidecar — metadata for an imaging or recording file',
        weight: 0.5,
      },
    };
  }

  // ── TSV — tabular metadata ──────────────────────────────────
  // Could be electrodes.tsv, channels.tsv, events.tsv, sessions.tsv,
  // or participants.tsv. Check filename to narrow down.
  if (lower.endsWith('.tsv')) {
    // Check for specific TSV types by filename
    if (lower.includes('electrode')) {
      return {
        possibleModalities: ['electrodes'],
        bestGuess: 'electrodes',
        reason: {
          layer: 'extension',
          message: 'TSV file with "electrode" in name — electrode position metadata',
          weight: 0.9,
        },
      };
    }
    if (lower.includes('channel')) {
      return {
        possibleModalities: ['channels'],
        bestGuess: 'channels',
        reason: {
          layer: 'extension',
          message: 'TSV file with "channel" in name — channel description metadata',
          weight: 0.9,
        },
      };
    }
    if (lower.includes('event')) {
      return {
        possibleModalities: ['events'],
        bestGuess: 'events',
        reason: {
          layer: 'extension',
          message: 'TSV file with "event" in name — event timing metadata',
          weight: 0.9,
        },
      };
    }
    return {
      possibleModalities: ['sidecar-tsv'],
      bestGuess: 'sidecar-tsv',
      reason: {
        layer: 'extension',
        message: 'TSV metadata file',
        weight: 0.4,
      },
    };
  }

  // ── CSV — wrong format, should be TSV ───────────────────────
  if (lower.endsWith('.csv')) {
    return {
      possibleModalities: ['sidecar-tsv'],
      bestGuess: 'sidecar-tsv',
      reason: {
        layer: 'extension',
        message: 'WARNING: CSV file detected — BIDS requires TSV format, not CSV',
        weight: 0.3,
      },
    };
  }

  // ── DICOM — should have been converted ──────────────────────
  if (lower.endsWith('.dcm') || lower.endsWith('.dicom') || lower.endsWith('.ima')) {
    return {
      possibleModalities: ['other'],
      bestGuess: 'other',
      reason: {
        layer: 'extension',
        message: 'WARNING: DICOM file detected — must be converted to NIfTI (.nii.gz) before upload',
        weight: 0.9,
      },
    };
  }

  // ── Unknown extension ───────────────────────────────────────
  return {
    possibleModalities: ['other'],
    bestGuess: 'other',
    reason: {
      layer: 'extension',
      message: `Unrecognized file extension: ${fileName.split('.').pop() || 'none'}`,
      weight: 0.1,
    },
  };
}
