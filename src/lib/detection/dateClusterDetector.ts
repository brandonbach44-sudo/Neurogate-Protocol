/**
 * Custom Timepoints Date-Cluster Detector (Layer A)
 *
 * See Documents/Phase1b_Custom_Timepoint_Detection_Spec.md Section 3.1.
 *
 * The literal label match in customSessionDetector.ts only works when a
 * file's name or folder path already contains the exact timepoint label
 * (e.g. "ses-2mo"). Real-world messy datasets rarely have that. This
 * layer uses real acquisition timestamps instead -- already read by
 * edfHeaderReader.ts (EDF/BDF) and sidecarReader.ts (dcm2niix JSON
 * sidecars) for other purposes, now also consulted here.
 *
 * Deliberately does NOT try to compute an absolute duration ("is this
 * really 2 months after baseline"). It only orders a subject's own files
 * relative to each other: cluster files by calendar visit, sort the
 * clusters chronologically, then map them onto the dataset's own
 * chronologically-sorted timepoint list in order. This sidesteps the
 * "what counts as day zero" problem entirely -- there's no reference
 * date needed, just relative order.
 *
 * Auto-assignment only fires when the number of date-clusters found for
 * a subject exactly matches the number of defined timepoints. A mismatch
 * (missed visit, extra rescan, stray bad timestamp) is left unresolved
 * with an explanatory reason rather than guessed -- consistent with how
 * every other low-confidence case in this engine works.
 */

import type { DetectionReason } from '../../types/detection';

/** Files acquired within this window of each other are treated as the same clinical visit. */
const CLUSTER_WINDOW_HOURS = 24;

export interface DatedFile {
  fileName: string;
  date: Date;
}

export interface DateClusterAssignment {
  session: string;
  reasons: DetectionReason[];
}

export interface DateClusterResult {
  /** fileName -> resolved session + reasons, for every file that got one. */
  assignments: Map<string, DateClusterAssignment>;
  /**
   * Set when this subject's cluster count didn't match its timepoint
   * count, so the caller can surface why auto-assignment didn't happen
   * for this subject rather than leaving an unexplained gap. Null when
   * there was nothing to report (no dated files, or a clean match).
   */
  mismatchReason: DetectionReason | null;
}

/**
 * Group dated files into chronological visit clusters. Files within
 * CLUSTER_WINDOW_HOURS of the first (earliest) file already placed in a
 * cluster join that cluster; anything further out starts a new one.
 * Input order doesn't matter -- this sorts first.
 */
function clusterByDate(files: DatedFile[]): DatedFile[][] {
  const sorted = [...files].sort((a, b) => a.date.getTime() - b.date.getTime());
  const windowMs = CLUSTER_WINDOW_HOURS * 60 * 60 * 1000;
  const clusters: DatedFile[][] = [];

  for (const file of sorted) {
    const current = clusters[clusters.length - 1];
    if (current && file.date.getTime() - current[0].date.getTime() <= windowMs) {
      current.push(file);
    } else {
      clusters.push([file]);
    }
  }
  return clusters;
}

/**
 * Assign sessions to one subject's dated files.
 *
 * @param datedFiles This subject's files that have a usable acquisition
 *   date (from EDF header or JSON sidecar). Files with no date aren't
 *   passed in at all -- they're not this layer's concern (Layer C,
 *   neighbor propagation, covers them separately).
 * @param sortedSessionIds The dataset's timepoint session ids, already
 *   in chronological order (e.g. from resolveSessionIds()).
 */
export function assignDateClusterSessions(
  datedFiles: DatedFile[],
  sortedSessionIds: string[],
): DateClusterResult {
  const assignments = new Map<string, DateClusterAssignment>();

  if (datedFiles.length === 0 || sortedSessionIds.length === 0) {
    return { assignments, mismatchReason: null };
  }

  const clusters = clusterByDate(datedFiles);

  if (clusters.length !== sortedSessionIds.length) {
    const mismatchReason: DetectionReason = {
      layer: 'date-cluster',
      message: `Found ${clusters.length} date-cluster${clusters.length !== 1 ? 's' : ''} of files (grouped by acquisition timestamp) but ${sortedSessionIds.length} timepoint${sortedSessionIds.length !== 1 ? 's are' : ' is'} defined -- counts don't match, so sessions were not auto-assigned by date. Assign manually, or check for a missed visit / extra rescan.`,
      weight: 0,
    };
    return { assignments, mismatchReason };
  }

  clusters.forEach((cluster, i) => {
    const session = sortedSessionIds[i];
    const reason: DetectionReason = {
      layer: 'date-cluster',
      message: `Assigned by acquisition date: visit ${i + 1} of ${clusters.length} (chronological order) matched to timepoint ${i + 1} of ${sortedSessionIds.length} ("${session}"). Verify this is correct.`,
      weight: 0.6,
    };
    for (const f of cluster) {
      assignments.set(f.fileName, { session, reasons: [reason] });
    }
  });

  return { assignments, mismatchReason: null };
}
