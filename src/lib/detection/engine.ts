/**
 * Detection Engine — Main Orchestrator
 *
 * Combines all 5 detection layers into a single pipeline:
 *   1. Extension detector  → file type (highest reliability)
 *   2. Filename keywords   → modality + session
 *   3. Folder path keywords → session + modality
 *   4. Neighbor inference  → context from nearby files
 *   5. Subject grouping    → which patient this file belongs to
 *
 * Each layer produces partial results with confidence weights.
 * The engine merges them, resolves conflicts, and assigns a
 * final confidence level to each file.
 *
 * The output is an array of DetectionResult objects, one per file,
 * ready to be displayed in the mapping table.
 */

import type { ScannedFile } from '../../types/files';
import type {
  DetectionResult,
  DetectionSummary,
  Modality,
  Session,
  Confidence,
  DetectionReason,
} from '../../types/detection';
import { MODALITIES } from '../../types/detection';
import { detectFromExtension } from './extensionDetector';
import { detectFromFilename } from './filenameDetector';
import { detectFromFolderPath } from './folderDetector';
import { inferFromNeighbors } from './neighborInference';
import { groupIntoSubject } from './subjectGrouping';

// ── BIDS filename generation ──────────────────────────────────────

/**
 * Generate a BIDS-compliant filename based on detected/assigned values.
 */
function generateBidsFilename(
  subjectId: string,
  session: Session | null,
  modality: Modality,
  originalFileName: string,
): string {
  if (!session || modality === 'other' || modality === 'sidecar-json' || modality === 'sidecar-tsv') {
    return originalFileName; // Can't generate BIDS name without session
  }

  const sub = subjectId.startsWith('sub-') ? subjectId : `sub-${subjectId}`;
  const ext = getFileExtension(originalFileName);

  // Map modality to BIDS suffix
  const suffixMap: Record<string, string> = {
    'anat-T1w': 'T1w',
    'anat-T2w': 'T2w',
    'ct': 'ct',
    'dwi': 'dwi',
    'eeg': 'eeg',
    'ieeg': 'ieeg',
    'func': 'bold',
    'fmap': 'fmap',
    'electrodes': 'electrodes',
    'channels': 'channels',
    'events': 'events',
  };

  const suffix = suffixMap[modality] || modality;

  // Build BIDS filename
  if (modality === 'electrodes') {
    return `${sub}_${session}_electrodes.tsv`;
  }
  if (modality === 'channels') {
    return `${sub}_${session}_task-monitor_channels.tsv`;
  }
  if (modality === 'events') {
    return `${sub}_${session}_task-monitor_events.tsv`;
  }
  if (modality === 'eeg' || modality === 'ieeg') {
    return `${sub}_${session}_task-monitor_${suffix}${ext}`;
  }

  return `${sub}_${session}_${suffix}${ext}`;
}

/**
 * Generate the full BIDS path for a file.
 */
function generateBidsPath(
  subjectId: string,
  session: Session | null,
  modality: Modality,
  originalFileName: string,
): string {
  if (!session || modality === 'other') {
    return `unclassified/${originalFileName}`;
  }

  const sub = subjectId.startsWith('sub-') ? subjectId : `sub-${subjectId}`;
  const bidsFolder = MODALITIES.find(m => m.value === modality)?.bidsFolder || '';
  const bidsFilename = generateBidsFilename(subjectId, session, modality, originalFileName);

  if (!bidsFolder) {
    return `primary/${sub}/${session}/${bidsFilename}`;
  }

  return `primary/${sub}/${session}/${bidsFolder}/${bidsFilename}`;
}

function getFileExtension(fileName: string): string {
  if (fileName.toLowerCase().endsWith('.nii.gz')) return '.nii.gz';
  const lastDot = fileName.lastIndexOf('.');
  return lastDot === -1 ? '' : fileName.substring(lastDot);
}

// ── Confidence calculation ────────────────────────────────────────

/**
 * Calculate overall confidence from the accumulated detection reasons.
 */
function calculateConfidence(
  modality: Modality,
  session: Session | null,
  reasons: DetectionReason[],
): Confidence {
  if (modality === 'other') return 'unclassified';

  // Sum up all weights
  const totalWeight = reasons.reduce((sum, r) => sum + r.weight, 0);

  // Both modality and session detected with good evidence
  if (session && modality !== 'sidecar-json' && modality !== 'sidecar-tsv') {
    if (totalWeight >= 1.2) return 'high';
    if (totalWeight >= 0.7) return 'medium';
    return 'low';
  }

  // Only modality detected (no session)
  if (modality && !session) {
    if (totalWeight >= 1.0) return 'medium';
    return 'low';
  }

  // Sidecars inherit confidence from what they're paired with
  if (modality === 'sidecar-json' || modality === 'sidecar-tsv') {
    if (totalWeight >= 0.8) return 'high';
    if (totalWeight >= 0.4) return 'medium';
    return 'low';
  }

  return 'unclassified';
}

// ── Main detection pipeline ───────────────────────────────────────

/**
 * Run the full detection pipeline on a list of scanned files.
 * Returns a DetectionResult for every file.
 */
export function runDetection(files: ScannedFile[]): DetectionResult[] {
  // ── Pass 1: Run layers 1-3 on every file individually ───────
  // These layers only need the file itself, not context from others.

  const intermediateResults: {
    file: ScannedFile;
    modality: Modality;
    session: Session | null;
    reasons: DetectionReason[];
    possibleModalities: Modality[];
  }[] = [];

  for (const file of files) {
    const reasons: DetectionReason[] = [];
    let modality: Modality = 'other';
    let session: Session | null = null;
    let possibleModalities: Modality[] = [];

    // Layer 1: Extension
    const extResult = detectFromExtension(file.name, file.relativePath);
    reasons.push(extResult.reason);
    possibleModalities = extResult.possibleModalities;
    if (extResult.bestGuess) {
      modality = extResult.bestGuess;
    }

    // Layer 2: Filename keywords
    const fnResult = detectFromFilename(file.name);
    reasons.push(...fnResult.reasons);
    if (fnResult.modality) {
      // Filename keywords override extension guess if available
      // (more specific than just knowing it's a .nii.gz)
      if (modality === 'other' || possibleModalities.length > 1) {
        modality = fnResult.modality;
      }
      // If extension already gave a specific answer, only override
      // if the filename match is compatible
      else if (possibleModalities.includes(fnResult.modality)) {
        modality = fnResult.modality;
      }
    }
    if (fnResult.session) {
      session = fnResult.session;
    }

    // Layer 3: Folder path
    const folderResult = detectFromFolderPath(file.relativePath);
    reasons.push(...folderResult.reasons);
    if (folderResult.modality && modality === 'other') {
      modality = folderResult.modality;
    }
    // Folder path can also narrow down ambiguous extension results
    if (folderResult.modality && possibleModalities.includes(folderResult.modality) && modality === 'other') {
      modality = folderResult.modality;
    }
    if (folderResult.session && !session) {
      session = folderResult.session;
    }

    // If we still have an ambiguous .nii.gz with no modality clues,
    // default to anat-T1w (most common type)
    if (modality === 'other' && possibleModalities.length > 1 &&
        file.name.toLowerCase().endsWith('.nii.gz')) {
      modality = 'anat-T1w';
      reasons.push({
        layer: 'extension',
        message: 'Defaulting ambiguous NIfTI to T1w (most common) — please verify',
        weight: 0.1,
      });
    }

    intermediateResults.push({ file, modality, session, reasons, possibleModalities });
  }

  // ── Build known modalities map for neighbor inference ────────
  const knownModalities = new Map<string, Modality>();
  for (const result of intermediateResults) {
    if (result.modality !== 'other') {
      knownModalities.set(result.file.name, result.modality);
    }
  }

  // ── Pass 2: Run layers 4-5 with context ─────────────────────

  const finalResults: DetectionResult[] = [];

  for (const intermediate of intermediateResults) {
    const { file } = intermediate;
    let { modality, session } = intermediate;
    const reasons = [...intermediate.reasons];

    // Layer 4: Neighbor inference
    const neighborResult = inferFromNeighbors(file, files, knownModalities);
    reasons.push(...neighborResult.reasons);
    if (neighborResult.modality && (modality === 'other' || modality === 'sidecar-json')) {
      if (modality === 'sidecar-json' && neighborResult.modality) {
        // JSON sidecars: keep sidecar-json as modality but note what it pairs with
        // (we don't change the modality, just add the reason)
      } else {
        modality = neighborResult.modality;
      }
    }
    if (neighborResult.session && !session) {
      session = neighborResult.session;
    }

    // Layer 5: Subject grouping
    const groupResult = groupIntoSubject(file, files);
    reasons.push(...groupResult.reasons);
    if (groupResult.session && !session) {
      session = groupResult.session;
    }

    // ── Calculate final confidence ─────────────────────────────
    const confidence = calculateConfidence(modality, session, reasons);

    // ── Generate BIDS filename preview ─────────────────────────
    const subjectId = groupResult.groupName;
    const bidsFilename = generateBidsFilename(subjectId, session, modality, file.name);
    const bidsPath = generateBidsPath(subjectId, session, modality, file.name);

    // ── Add any neighbor warnings as low-weight reasons ────────
    for (const warning of neighborResult.warnings) {
      reasons.push({
        layer: 'neighbor',
        message: `WARNING: ${warning}`,
        weight: 0,
      });
    }

    finalResults.push({
      relativePath: file.relativePath,
      fileName: file.name,
      fileSize: file.size,
      file: file.file,
      subjectGroup: groupResult.groupName,
      detectedSession: session,
      detectedModality: modality,
      confidence,
      reasons,
      userSession: null,
      userModality: null,
      userSubjectGroup: null,
      bidsFilename,
      bidsPath,
    });
  }

  return finalResults;
}

// ── Summary generation ────────────────────────────────────────────

/**
 * Generate a summary of detection results for display in the UI.
 */
export function generateSummary(results: DetectionResult[]): DetectionSummary {
  const summary: DetectionSummary = {
    totalFiles: results.length,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    unclassified: 0,
    subjectGroups: [],
    missingRequired: [],
    warnings: [],
  };

  const groupSet = new Set<string>();

  for (const result of results) {
    switch (result.confidence) {
      case 'high': summary.highConfidence++; break;
      case 'medium': summary.mediumConfidence++; break;
      case 'low': summary.lowConfidence++; break;
      case 'unclassified': summary.unclassified++; break;
    }
    groupSet.add(result.subjectGroup);

    // Collect warnings from reasons
    for (const reason of result.reasons) {
      if (reason.message.startsWith('WARNING:')) {
        summary.warnings.push(reason.message);
      }
    }
  }

  summary.subjectGroups = Array.from(groupSet).sort();

  // ── Check for missing required files per subject/session ────
  for (const group of summary.subjectGroups) {
    const groupFiles = results.filter(r => r.subjectGroup === group);

    // Check ses-preimplant: T1w required
    const preimplantFiles = groupFiles.filter(r =>
      (r.detectedSession === 'ses-preimplant' || r.userSession === 'ses-preimplant')
    );
    if (preimplantFiles.length > 0) {
      const hasT1w = preimplantFiles.some(r =>
        (r.userModality ?? r.detectedModality) === 'anat-T1w'
      );
      if (!hasT1w) {
        summary.missingRequired.push(`${group} / ses-preimplant: No T1w MRI detected (required)`);
      }
    }

    // Check ses-postimplant: CT and iEEG required
    const postimplantFiles = groupFiles.filter(r =>
      (r.detectedSession === 'ses-postimplant' || r.userSession === 'ses-postimplant')
    );
    if (postimplantFiles.length > 0) {
      const hasCT = postimplantFiles.some(r =>
        (r.userModality ?? r.detectedModality) === 'ct'
      );
      const hasIEEG = postimplantFiles.some(r =>
        (r.userModality ?? r.detectedModality) === 'ieeg'
      );
      if (!hasCT) {
        summary.missingRequired.push(`${group} / ses-postimplant: No CT scan detected (required)`);
      }
      if (!hasIEEG) {
        summary.missingRequired.push(`${group} / ses-postimplant: No iEEG recording detected (required)`);
      }
    }
  }

  // Deduplicate warnings
  summary.warnings = [...new Set(summary.warnings)];

  return summary;
}
