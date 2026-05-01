/**
 * Layer 4: Neighbor Inference
 *
 * Looks at what OTHER files are in the same folder to infer
 * session and modality for ambiguous files.
 *
 * Key inference rules:
 * - CT (.nii.gz) + iEEG (.edf/.nwb/.dat) in same group → ses-postimplant
 *   (only session that has both CT and iEEG)
 * - .bval/.bvec near a .nii.gz → that .nii.gz is DWI
 * - .dat without matching .lay → warning (Persyst requires both)
 * - .edf in a folder with electrode files → iEEG, not scalp EEG
 * - JSON file with same basename as an imaging file → inherits that modality
 */

import type { Modality, Session, DetectionReason } from '../../types/detection';
import type { ScannedFile } from '../../types/files';

export interface NeighborResult {
  /** Inferred session from neighbor analysis */
  session: Session | null;
  /** Inferred modality from neighbor analysis */
  modality: Modality | null;
  /** Reasons for the inference */
  reasons: DetectionReason[];
  /** Warnings about file pairing issues */
  warnings: string[];
}

/**
 * Get the folder path of a file (everything before the last /).
 */
function getFolderPath(relativePath: string): string {
  const lastSlash = relativePath.lastIndexOf('/');
  return lastSlash === -1 ? '' : relativePath.substring(0, lastSlash);
}

/**
 * Get the basename without extension (for sidecar matching).
 * Handles .nii.gz double extension.
 */
function getBasename(fileName: string): string {
  return fileName
    .replace(/\.nii\.gz$/i, '')
    .replace(/\.[^.]+$/i, '');
}

/**
 * Group files by their parent folder.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function groupByFolder(files: ScannedFile[]): Map<string, ScannedFile[]> {
  const groups = new Map<string, ScannedFile[]>();
  for (const file of files) {
    const folder = getFolderPath(file.relativePath);
    const existing = groups.get(folder) || [];
    existing.push(file);
    groups.set(folder, existing);
  }
  return groups;
}

/**
 * Analyze a single file in the context of its neighbors.
 */
export function inferFromNeighbors(
  file: ScannedFile,
  allFiles: ScannedFile[],
  /** Previously detected modalities for other files (from layers 1-2) */
  knownModalities: Map<string, Modality>,
): NeighborResult {
  const reasons: DetectionReason[] = [];
  const warnings: string[] = [];
  let session: Session | null = null;
  let modality: Modality | null = null;

  const folder = getFolderPath(file.relativePath);
  const fileName = file.name.toLowerCase();
  const basename = getBasename(file.name);

  // Get all files in the same folder
  const neighbors = allFiles.filter(f => getFolderPath(f.relativePath) === folder && f !== file);
  const neighborNames = neighbors.map(n => n.name.toLowerCase());
  const neighborModalities = neighbors
    .map(n => knownModalities.get(n.name))
    .filter((m): m is Modality => m !== undefined);

  // ── Rule: JSON sidecar inherits modality from matching file ──
  if (fileName.endsWith('.json')) {
    const matchingFile = neighbors.find(n => {
      const nBasename = getBasename(n.name);
      return nBasename === basename && !n.name.toLowerCase().endsWith('.json');
    });
    if (matchingFile) {
      const matchedModality = knownModalities.get(matchingFile.name);
      if (matchedModality) {
        modality = matchedModality;
        reasons.push({
          layer: 'neighbor',
          message: `JSON sidecar matches "${matchingFile.name}" — inheriting modality`,
          weight: 0.7,
        });
      }
    }
  }

  // ── Rule: .bval/.bvec near .nii.gz → the .nii.gz is DWI ────
  if (fileName.endsWith('.nii.gz')) {
    const hasBval = neighborNames.some(n => n.endsWith('.bval'));
    const hasBvec = neighborNames.some(n => n.endsWith('.bvec'));
    if (hasBval || hasBvec) {
      modality = 'dwi';
      reasons.push({
        layer: 'neighbor',
        message: `Found ${hasBval ? '.bval' : ''}${hasBval && hasBvec ? ' and ' : ''}${hasBvec ? '.bvec' : ''} in same folder — this is a diffusion MRI`,
        weight: 0.8,
      });
    }
  }

  // ── Rule: .edf in folder with electrode/channel files → iEEG ──
  if (fileName.endsWith('.edf') || fileName.endsWith('.bdf')) {
    const hasElectrodes = neighborNames.some(n => n.includes('electrode'));
    const hasChannels = neighborNames.some(n => n.includes('channel'));
    if (hasElectrodes || hasChannels) {
      modality = 'ieeg';
      reasons.push({
        layer: 'neighbor',
        message: 'EDF/BDF file in folder with electrode/channel metadata — likely intracranial EEG',
        weight: 0.6,
      });
    }
  }

  // ── Rule: CT + iEEG in same subject group → ses-postimplant ──
  // This is the only session that has both CT and intracranial EEG.
  const hasCT = neighborModalities.includes('ct') ||
    (knownModalities.get(file.name) === 'ct');
  const hasIEEG = neighborModalities.includes('ieeg') ||
    neighborNames.some(n => n.endsWith('.nwb') || n.endsWith('.dat') || n.endsWith('.lay'));

  // Check broader context — sibling folders too
  const parentFolder = folder.substring(0, folder.lastIndexOf('/'));
  const siblingFiles = parentFolder
    ? allFiles.filter(f => getFolderPath(f.relativePath).startsWith(parentFolder))
    : [];
  const siblingModalities = siblingFiles
    .map(f => knownModalities.get(f.name))
    .filter((m): m is Modality => m !== undefined);

  const ctInGroup = hasCT || siblingModalities.includes('ct');
  const ieegInGroup = hasIEEG || siblingModalities.includes('ieeg');

  if (ctInGroup && ieegInGroup) {
    const currentModality = knownModalities.get(file.name);
    if (currentModality === 'ct' || currentModality === 'ieeg' ||
        fileName.endsWith('.dat') || fileName.endsWith('.lay') ||
        fileName.endsWith('.nwb')) {
      session = 'ses-postimplant';
      reasons.push({
        layer: 'neighbor',
        message: 'CT and iEEG found in same subject group — this is the post-implant session',
        weight: 0.7,
      });
    }
  }

  // ── Rule: Persyst .dat without .lay → warning ───────────────
  if (fileName.endsWith('.dat')) {
    const datBasename = getBasename(file.name);
    const hasLay = neighborNames.some(n =>
      n.endsWith('.lay') && getBasename(n) === datBasename.toLowerCase()
    );
    if (!hasLay) {
      // Also check with just any .lay in the folder
      const anyLay = neighborNames.some(n => n.endsWith('.lay'));
      if (!anyLay) {
        warnings.push(`Persyst .dat file "${file.name}" has no matching .lay file — both are required`);
      }
    }
  }

  // ── Rule: Persyst .lay without .dat → warning ───────────────
  if (fileName.endsWith('.lay')) {
    const layBasename = getBasename(file.name);
    const hasDat = neighborNames.some(n =>
      n.endsWith('.dat') && getBasename(n) === layBasename.toLowerCase()
    );
    if (!hasDat) {
      const anyDat = neighborNames.some(n => n.endsWith('.dat'));
      if (!anyDat) {
        warnings.push(`Persyst .lay file "${file.name}" has no matching .dat file — both are required`);
      }
    }
  }

  // ── Rule: Standalone T1w with no iEEG/CT neighbors → preimplant ──
  if (!session) {
    const currentModality = modality || knownModalities.get(file.name);
    if (currentModality === 'anat-T1w' || currentModality === 'anat-T2w' || currentModality === 'anat-FLAIR') {
      if (!ieegInGroup && !ctInGroup) {
        session = 'ses-preimplant';
        reasons.push({
          layer: 'neighbor',
          message: 'Anatomical MRI with no CT or iEEG in subject group — likely pre-implant baseline',
          weight: 0.3,
        });
      }
    }
  }

  return { session, modality, reasons, warnings };
}
