/**
 * Custom Timepoints Neighbor Propagation (Layer C)
 *
 * See Documents/Phase1b_Custom_Timepoint_Detection_Spec.md Section 3.3.
 *
 * Backfill layer for files that carry no timestamp of their own --
 * channels.tsv, electrodes.tsv, a data file whose sidecar didn't parse --
 * and so can't be resolved by the literal label match (customSessionDetector.ts)
 * or the date-cluster layer (dateClusterDetector.ts). If another file in
 * the exact same folder already has a resolved session from either of
 * those layers, this one inherits it.
 *
 * Deliberately conservative: a folder is only a valid propagation source
 * when every already-resolved file in it agrees on one session. If a
 * folder has files resolved to two different sessions (e.g. an odd
 * folder layout that doesn't map to a single visit), propagating into it
 * would be a guess, not an inference -- so those files are left out of
 * the map and stay unresolved for manual assignment instead.
 */

import { getFolderPath } from './neighborInference';
import type { DetectionReason } from '../../types/detection';

export interface ResolvedFile {
  fileName: string;
  relativePath: string;
  session: string;
}

/**
 * Build folder path -> session, including only folders where every
 * already-resolved file agrees on a single session.
 */
export function buildFolderSessionMap(resolvedFiles: ResolvedFile[]): Map<string, string> {
  const byFolder = new Map<string, Set<string>>();
  for (const rf of resolvedFiles) {
    const folder = getFolderPath(rf.relativePath);
    const set = byFolder.get(folder) ?? new Set<string>();
    set.add(rf.session);
    byFolder.set(folder, set);
  }

  const result = new Map<string, string>();
  for (const [folder, sessions] of byFolder) {
    if (sessions.size === 1) {
      result.set(folder, [...sessions][0]);
    }
  }
  return result;
}

/** Reason attached to a file whose session was inherited from a folder neighbor. */
export function neighborPropagationReason(session: string): DetectionReason {
  return {
    layer: 'neighbor',
    message: `Inherited session "${session}" from another file already resolved (via literal label match or date-cluster ordering) in the same folder. Verify this is correct.`,
    weight: 0.3,
  };
}
