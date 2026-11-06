/**
 * Pure helper for removing files from the mapping table.
 *
 * A single remove may bring companions along: a JSON sidecar, a TSV
 * sidecar, or a gradient table (.bval / .bvec) is always removed with its
 * paired data file. The pairing rule mirrors bidsNaming.ts:
 *   same folder AND same base name (everything before the first dot).
 *
 * Bulk removal resolves ALL primaries and their companions in one pass so
 * indices never shift mid-loop.
 */

import type { DetectionResult } from '../../types/detection';
import { getEffectiveModality } from '../../types/detection';

/** Files that travel with a primary when it is removed. */
const COMPANION_MODALITIES = new Set(['sidecar-json', 'sidecar-tsv', 'gradient-bval', 'gradient-bvec']);

function folderOf(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/');
  return slash === -1 ? '' : relativePath.slice(0, slash);
}

function baseName(fileName: string): string {
  const dot = fileName.indexOf('.');
  return dot === -1 ? fileName : fileName.slice(0, dot);
}

/** True when `candidate` is a companion of `primary` (same folder, same base name, companion modality). */
function isCompanionOf(candidate: DetectionResult, primary: DetectionResult): boolean {
  return (
    COMPANION_MODALITIES.has(getEffectiveModality(candidate)) &&
    folderOf(candidate.relativePath) === folderOf(primary.relativePath) &&
    baseName(candidate.fileName) === baseName(primary.fileName)
  );
}

export interface RemoveResultsOutput {
  /** Results that remain after removal. */
  kept: DetectionResult[];
  /** Results that were removed (primaries + their companions). */
  removed: DetectionResult[];
}

/**
 * Remove the results at `indices` from `results`, together with any
 * companions of those primaries.  Works in one pass — indices never shift.
 *
 * Passing a single-element array is equivalent to the old per-file remove,
 * but companion collection is now guaranteed even in bulk.
 */
export function removeResults(
  results: DetectionResult[],
  indices: number[],
): RemoveResultsOutput {
  if (indices.length === 0) return { kept: results, removed: [] };

  // Collect the primaries first.
  const primarySet = new Set(indices);
  const primaryItems = new Set(indices.map(i => results[i]).filter(Boolean));

  // Build the full set of indices to drop (primaries + their companions).
  const dropSet = new Set<number>(primarySet);
  results.forEach((r, i) => {
    if (!dropSet.has(i) && [...primaryItems].some(p => isCompanionOf(r, p))) {
      dropSet.add(i);
    }
  });

  const kept: DetectionResult[] = [];
  const removed: DetectionResult[] = [];
  results.forEach((r, i) => {
    if (dropSet.has(i)) removed.push(r);
    else kept.push(r);
  });

  return { kept, removed };
}
