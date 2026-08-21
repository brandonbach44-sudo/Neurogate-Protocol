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
  /**
   * Full relative path, used as the assignment key -- see the identical
   * note on DatedFile in dateClusterDetector.ts. Bare file names are not
   * unique within a longitudinal subject, so keying on them collapsed
   * every repeated scan name onto one session.
   */
  relativePath: string;
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

  // Find the folder DEPTH that partitions this subject's files into
  // exactly one group per defined timepoint, instead of assuming the
  // session folder is each file's immediate parent.
  //
  // The immediate parent is the SCAN folder in every layout that puts one
  // folder per series under the visit, which is what both Flywheel and a
  // plain dcm2niix run produce:
  //
  //   01_1522/20180510/MP-RAGE/file.nii.gz
  //   ^sub    ^session ^scan
  //
  // Grouping on the immediate parent gave 38 distinct folders for a
  // subject with 2 timepoints, the count never matched, and the layer
  // could not fire at all -- the entire OrthoControls cohort (3 subjects,
  // 105 files) resolved no session and exported nothing. Found
  // 2026-08-17.
  //
  // Depths are tried shallowest-first and the first exact match wins,
  // because the session folder is always shallower than the scan folders
  // beneath it. A single defined timepoint correctly matches at the
  // subject root (one group, one session).
  const pathSegments = (folder: string): string[] => folder.split('/').filter(Boolean);
  const prefixAtDepth = (folder: string, depth: number): string =>
    pathSegments(folder).slice(0, depth).join('/');

  const maxDepth = Math.max(...folderedFiles.map(f => pathSegments(f.folder).length));

  let groupingDepth: number | null = null;
  const distinctCountsTried: number[] = [];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const distinct = new Set(folderedFiles.map(f => prefixAtDepth(f.folder, depth)));
    distinctCountsTried.push(distinct.size);
    if (distinct.size === sortedSessionIds.length) {
      groupingDepth = depth;
      break;
    }
  }

  if (groupingDepth === null) {
    // The common real-world case deserves its own wording: a subject with
    // FEWER visit folders than the study defines timepoints has almost
    // certainly missed a visit, which is routine in longitudinal work.
    //
    // No session is assigned for them on purpose. With one visit folder
    // and two defined timepoints there is no evidence for WHICH timepoint
    // it is -- picking the first would be a coin flip that could label a
    // 6-month scan as the 2-week baseline. Dates cannot break the tie
    // either: a lone visit has no interval to compare against. So this
    // reports precisely what it found and leaves the choice to the user.
    const plausibleVisitCounts = distinctCountsTried.filter(n => n < sortedSessionIds.length);
    const likelyMissedVisit =
      plausibleVisitCounts.length > 0 && Math.max(...plausibleVisitCounts) >= 1;

    const message = likelyMissedVisit
      ? `This subject has ${Math.max(...plausibleVisitCounts)} visit folder${Math.max(...plausibleVisitCounts) !== 1 ? 's' : ''} but the study defines ${sortedSessionIds.length} timepoints (${sortedSessionIds.join(', ')}) -- most likely a missed or not-yet-acquired visit. Which timepoint this is cannot be determined from the folder structure alone, so assign it manually.`
      : `No folder level splits this subject's files into ${sortedSessionIds.length} group${sortedSessionIds.length !== 1 ? 's' : ''} to match the ${sortedSessionIds.length} defined timepoint${sortedSessionIds.length !== 1 ? 's' : ''} (found ${distinctCountsTried.join(', ')} distinct folders at depths 1..${maxDepth}) -- sessions were not auto-assigned by folder structure. Assign manually.`;

    const mismatchReason: DetectionReason = {
      layer: 'folder-cluster',
      message,
      weight: 0,
    };
    return { assignments, mismatchReason };
  }

  // Re-key every file to its session-level folder at the chosen depth, so
  // ordering and assignment below operate on visit folders rather than
  // individual scan folders.
  const groupedFiles: FolderedFile[] = folderedFiles.map(f => ({
    fileName: f.fileName,
    relativePath: f.relativePath,
    folder: prefixAtDepth(f.folder, groupingDepth as number),
  }));
  const distinctFolders = [...new Set(groupedFiles.map(f => f.folder))];

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
    for (const f of groupedFiles.filter(ff => ff.folder === folder)) {
      assignments.set(f.relativePath, { session, reasons: [reason] });
    }
  });

  return { assignments, mismatchReason: null };
}
