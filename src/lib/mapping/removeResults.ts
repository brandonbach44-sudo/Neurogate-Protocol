/**
 * Pure helper for removing files from the mapping table.
 *
 * Removing a data file also removes its paired files: its JSON or TSV
 * sidecar and, for diffusion scans, its .bval / .bvec gradient tables.
 * Pairing uses the same rule as sidecar lookup (sidecarReader.ts): same
 * folder and same base name, with .nii.gz, .json and other extensions
 * stripped.
 *
 * Only data files bring companions along. Removing a sidecar or a
 * gradient table on its own removes just that file, so it can never pull
 * an image (or another companion) out of the mapping.
 *
 * Bulk removal resolves every selected file and its companions in one
 * pass, so indices never shift mid-loop.
 */

import type { DetectionResult } from '../../types/detection';
import { getEffectiveModality } from '../../types/detection';
import { getSidecarBaseName } from '../detection/sidecarReader';

const GRADIENT_TABLE = /\.(bval|bvec)$/i;

/** A file that travels with its data file: a sidecar or a gradient table. */
function isCompanionFile(r: DetectionResult): boolean {
  const m = getEffectiveModality(r);
  // .bval / .bvec are classified as dwi, so they are recognized by extension.
  return m === 'sidecar-json' || m === 'sidecar-tsv' || GRADIENT_TABLE.test(r.fileName);
}

function folderOf(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/');
  return slash === -1 ? '' : relativePath.slice(0, slash);
}

function pairKey(r: DetectionResult): string {
  return `${folderOf(r.relativePath)}/${getSidecarBaseName(r.fileName)}`;
}

export interface RemoveResultsOutput {
  /** Results that remain after removal. */
  kept: DetectionResult[];
  /** Results that were removed (selected files plus their companions). */
  removed: DetectionResult[];
}

/**
 * Remove the results at `indices` from `results`, together with the
 * companions of any selected data files. Works in one pass.
 */
export function removeResults(
  results: DetectionResult[],
  indices: number[],
): RemoveResultsOutput {
  const selected = new Set(indices.filter(i => i >= 0 && i < results.length));
  if (selected.size === 0) return { kept: results, removed: [] };

  // Pair keys of the selected data files (not of selected companions).
  const dataKeys = new Set<string>();
  for (const i of selected) {
    const r = results[i];
    if (!isCompanionFile(r)) dataKeys.add(pairKey(r));
  }

  const kept: DetectionResult[] = [];
  const removed: DetectionResult[] = [];
  results.forEach((r, i) => {
    const drop = selected.has(i) || (isCompanionFile(r) && dataKeys.has(pairKey(r)));
    (drop ? removed : kept).push(r);
  });
  return { kept, removed };
}
