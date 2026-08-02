/**
 * Custom Timepoints Folder-Cluster Detector (Layer B)
 *
 * See Documents/Phase1b_Custom_Timepoint_Detection_Spec.md Section 3.2.
 *
 * For datasets organized as one subfolder per visit, without an embedded
 * timepoint label (customSessionDetector.ts already covers that) and
 * without a usable acquisition date on any file (dateClusterDetector.ts
 * already covers that): if a subject's files split cleanly into exactly
 * as many distinct immediate-parent folders as the dataset has defined
 * timepoints, order those folders -- by a number embedded in the folder
 * name if every folder has one, otherwise alphabetically as a
 * last-resort, lowest-confidence signal -- and map them onto the
 * dataset's own chronologically-sorted timepoint list, the same way
 * Layer A maps date clusters.
 *
 * Deliberately the lowest-confidence of the three new layers: folder
 * order alone (especially alphabetical) is a much weaker guarantee than
 * a real timestamp, and this only ever runs for files Layer A already
 * couldn't resolve.
 */

import type { DetectionReason } from '../../types/detection';

export interface FolderedFile {
  fileName: string;
  /** Immediate parent folder path, e.g. "pt01/visit1". */
  folder: string;
}

export interface FolderClusterAssignment {
  session: string;
  reasons: DetectionReason[];
}

export interface FolderClusterResult {
  assignments: Map<string, FolderClusterAssignment>;
  /** Set when this subject's distinct-folder count didn't match its timepoint count. */
  mismatchReason: DetectionReason | null;
}

/** A number found anywhere in the folder's own name (last path segment), for numeric ordering. */
function extractFolderNumber(folder: string): number | null {
  const lastSegment = folder.split('/').pop() ?? folder;
  const match = lastSegment.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

/** Numeric order when every folder has an embedded number; alphabetical otherwise. */
function sortFolders(folders: string[]): { ordered: string[]; numbered: boolean } {
  const withNumbers = folders.map(f => ({ folder: f, n: extractFolderNumber(f) }));
  const allNumbered = withNumbers.every(x => x.n !== null);
  if (allNumbered) {
    const ordered = [...withNumbers].sort((a, b) => (a.n as number) - (b.n as number)).map(x => x.folder);
    return { ordered, numbered: true };
  }
  return { ordered: [...folders].sort((a, b) => a.localeCompare(b)), numbered: false };
}

export function assignFolderClusterSessions(
  folderedFiles: FolderedFile[],
  sortedSessionIds: string[],
): FolderClusterResult {
  const assignments = new Map<string, FolderClusterAssignment>();

  if (folderedFiles.length === 0 || sortedSessionIds.length === 0) {
    return { assignments, mismatchReason: null };
  }

  const distinctFolders = [...new Set(folderedFiles.map(f => f.folder))];

  if (distinctFolders.length !== sortedSessionIds.length) {
    const mismatchReason: DetectionReason = {
      layer: 'folder-cluster',
      message: `Found ${distinctFolders.length} distinct subfolder${distinctFolders.length !== 1 ? 's' : ''} for this subject but ${sortedSessionIds.length} timepoint${sortedSessionIds.length !== 1 ? 's are' : ' is'} defined -- counts don't match, so sessions were not auto-assigned by folder structure. Assign manually.`,
      weight: 0,
    };
    return { assignments, mismatchReason };
  }

  const { ordered, numbered } = sortFolders(distinctFolders);

  ordered.forEach((folder, i) => {
    const session = sortedSessionIds[i];
    const reason: DetectionReason = {
      layer: 'folder-cluster',
      message: `Assigned by subfolder structure: folder "${folder.split('/').pop()}" (${i + 1} of ${ordered.length}, ordered ${numbered ? 'by a number embedded in the folder name' : 'alphabetically -- lowest-confidence ordering, no number or date to go on'}) matched to timepoint ${i + 1} of ${sortedSessionIds.length} ("${session}"). Verify this is correct.`,
      // Lower than Layer A's 0.6 either way; numeric folder order is more
      // trustworthy than a bare alphabetical fallback, so it scores higher
      // within this layer, but both stay below a real timestamp's weight.
      weight: numbered ? 0.4 : 0.25,
    };
    for (const f of folderedFiles.filter(ff => ff.folder === folder)) {
      assignments.set(f.fileName, { session, reasons: [reason] });
    }
  });

  return { assignments, mismatchReason: null };
}
