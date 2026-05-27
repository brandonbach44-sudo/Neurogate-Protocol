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
import { detectFromExtension } from './extensionDetector';
import { detectFromFilename, detectFromSidecarText } from './filenameDetector';
import { detectFromFolderPath } from './folderDetector';
import { inferFromNeighbors } from './neighborInference';
import { groupIntoSubject } from './subjectGrouping';
import { getSidecarBaseName } from './sidecarReader';
import type { SidecarInfo } from './sidecarReader';
import { computeBidsNames } from '../bids/bidsNaming';

// BIDS filename and path generation lives in lib/bids/bidsNaming.ts, the
// single source of truth shared with the exporter and the validator.
// runDetection() calls computeBidsNames() over the whole result set
// before returning, so repeated modalities get unique run- entities.

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

  // Sidecars are scored on their own. A JSON / TSV sidecar inherits its
  // session from the data file it pairs with (see computeBidsNames in
  // lib/bids/bidsNaming.ts), so the engine should not penalise it for
  // not having found a session on its own. Classify it purely by the
  // strength of the modality evidence. This branch must come before the
  // session-aware branches below, otherwise a sidecar whose engine-time
  // session is still null would fall through to the modality-only path
  // and be capped at medium.
  if (modality === 'sidecar-json' || modality === 'sidecar-tsv') {
    if (totalWeight >= 0.8) return 'high';
    if (totalWeight >= 0.4) return 'medium';
    return 'low';
  }

  // Both modality and session detected with good evidence
  if (session) {
    if (totalWeight >= 1.2) return 'high';
    if (totalWeight >= 0.7) return 'medium';
    return 'low';
  }

  // Only modality detected (no session)
  if (modality) {
    if (totalWeight >= 1.0) return 'medium';
    return 'low';
  }

  return 'unclassified';
}

// ── Main detection pipeline ───────────────────────────────────────

/**
 * Run the full detection pipeline on a list of scanned files.
 * Returns a DetectionResult for every file.
 */
export function runDetection(
  files: ScannedFile[],
  /**
   * Optional map of base name -> JSON sidecar scan-name text, produced
   * by readJsonSidecars(). When provided, the engine uses the scanner's
   * own scan label to classify data files whose own filename is generic.
   */
  sidecarMap?: Map<string, SidecarInfo>,
): DetectionResult[] {
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

    // Layer 2b: JSON sidecar content
    // dcm2niix writes a .json sidecar next to every converted scan, and
    // that sidecar's SeriesDescription / ProtocolName carries the
    // scanner's original scan name even when the NIfTI filename itself
    // is generic (e.g. "sub-X_10.nii"). If a matching sidecar was read,
    // use its scan-name text as a high-signal modality/session clue.
    const isJsonFile = file.name.toLowerCase().endsWith('.json');
    if (sidecarMap && !isJsonFile) {
      const sidecar = sidecarMap.get(getSidecarBaseName(file.name));
      if (sidecar) {
        const scResult = detectFromSidecarText(sidecar.scanText);
        if (scResult.modality) {
          // Apply the sidecar's modality when the file's own name and
          // extension left it ambiguous, and only when the result is
          // compatible with what the extension says is possible.
          const fileNameAmbiguous = modality === 'other' || possibleModalities.length > 1;
          const compatible =
            possibleModalities.length === 0 ||
            possibleModalities.includes(scResult.modality);
          if (fileNameAmbiguous && compatible) {
            modality = scResult.modality;
          }
        }
        if (scResult.session && !session) {
          session = scResult.session;
        }
        // Keyword-match reasons from the sidecar text (modality/session).
        reasons.push(...scResult.reasons);
        // Record which sidecar was consulted, for transparency.
        reasons.push({
          layer: 'sidecar',
          message: `Read scan name from sidecar "${sidecar.sidecarName}": "${sidecar.scanText}"`,
          weight: 0,
        });
      }
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

    // ── Session fallback: default by modality ──────────────────
    // If no layer found a session, a file would be stranded with a
    // blank dropdown in the mapping table. Most structural and
    // functional imaging is acquired at the pre-implant baseline,
    // while CT and intracranial EEG (and their metadata) belong to
    // the post-implant monitoring session. Localizer scans are
    // excluded from the export but still receive a default session so
    // the mapping table is not cluttered with blank dropdowns; the
    // session value is cosmetic for them. JSON / TSV sidecars are
    // handled separately: they inherit their data file's session
    // during pairing (see computeBidsNames in lib/bids/bidsNaming.ts).
    // This is a deliberately low-confidence guess the user can
    // override in the mapping table.
    if (
      !session &&
      modality !== 'other' &&
      modality !== 'sidecar-json' &&
      modality !== 'sidecar-tsv'
    ) {
      const postImplantModalities: Modality[] = ['ct', 'ieeg', 'electrodes', 'channels', 'events'];
      if (postImplantModalities.includes(modality)) {
        session = 'ses-postimplant';
        reasons.push({
          layer: 'default',
          message: 'No session keyword found; defaulted to post-implant based on modality (CT / iEEG). Please verify.',
          weight: 0.1,
        });
      } else {
        session = 'ses-preimplant';
        reasons.push({
          layer: 'default',
          message: 'No session keyword found; defaulted to pre-implant baseline based on modality. Please verify.',
          weight: 0.1,
        });
      }
    }

    // ── Calculate final confidence ─────────────────────────────
    const confidence = calculateConfidence(modality, session, reasons);

    // ── Generate BIDS filename preview ─────────────────────────
    // The BIDS filename and path are assigned after this loop, in one
    // pass over the whole result set (see computeBidsNames below).

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
      bidsFilename: '',
      bidsPath: '',
    });
  }

  // Assign BIDS filenames and paths (run / field-map entities and sidecar
  // pairing) in one pass, so repeated modalities never collide.
  return computeBidsNames(finalResults);
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
