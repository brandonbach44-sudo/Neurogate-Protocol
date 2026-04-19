/**
 * Layer 5: Subject Grouping
 *
 * Groups files into subject clusters — "these files all belong
 * to the same patient." This is critical because a single dropped
 * folder might contain 20+ patients, each with 3 sessions.
 *
 * Grouping strategy:
 * 1. Use the top-level subfolder as the primary group key.
 *    Most sites organize as: parent_folder/patient_01/..., parent_folder/patient_02/...
 *
 * 2. If all files share the same top-level folder (flat structure),
 *    try to extract a subject identifier from filenames using
 *    common patterns (sub-XXX, patient_XXX, pt_XXX, etc.)
 *
 * 3. If no grouping can be determined, treat everything as one group.
 *
 * The grouping also tries to infer sessions within each subject
 * by looking at the subfolder structure.
 */

import type { Session, DetectionReason } from '../../types/detection';
import type { ScannedFile } from '../../types/files';

export interface SubjectGroupResult {
  /** Assigned subject group name */
  groupName: string;
  /** Session inferred from subject-level folder structure */
  session: Session | null;
  /** Reasons for the grouping */
  reasons: DetectionReason[];
}

// ── Common subject ID patterns in filenames ───────────────────────
const SUBJECT_ID_PATTERNS: RegExp[] = [
  // BIDS-style: sub-CHOP001, sub-PENN042
  /\b(sub[-_]?\w+\d+)\b/i,
  // Patient/Subject + number: Patient_01, subject12, pt003
  /\b((?:patient|subject|subj|pt|pat)[-_]?\d+)\b/i,
  // Institution prefix + number: CHOP001, PENN042, HUP015
  /\b([A-Z]{2,6}\d{2,4})\b/,
  // Generic ID patterns: ID_001, id-042
  /\b((?:id|case|study)[-_]?\d+)\b/i,
  // Just a number at a boundary: often used as subject number
  /\b(\d{3,4})\b/,
];

/**
 * Extract subject ID from a filename using common patterns.
 */
function extractSubjectIdFromFilename(fileName: string): string | null {
  const nameWithoutExt = fileName
    .replace(/\.nii\.gz$/i, '')
    .replace(/\.[^.]+$/i, '');

  for (const pattern of SUBJECT_ID_PATTERNS) {
    const match = nameWithoutExt.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Determine the top-level subfolder for a file.
 * Given "PatientFolder/session/modality/file.nii.gz", returns "PatientFolder".
 */
function getTopLevelFolder(relativePath: string): string | null {
  const parts = relativePath.split('/').filter(s => s.length > 0);
  // Need at least 2 parts (folder + filename)
  if (parts.length >= 2) {
    return parts[0];
  }
  return null;
}

/**
 * Check if the second-level folder suggests a session.
 * Given "Patient01/PreOp/MRI/file.nii.gz", checks "PreOp".
 */
function getSessionFromSubfolder(relativePath: string): { session: Session | null; folderName: string | null } {
  const parts = relativePath.split('/').filter(s => s.length > 0);
  if (parts.length < 3) {
    return { session: null, folderName: null };
  }

  const subfolder = parts[1].toLowerCase();

  // Pre-implant patterns
  if (/\b(pre[-_]?implant|preimplant|pre[-_]?op|preop|pre[-_]?surg|baseline|phase[-_]?1|session[-_]?1|ses[-_]?1)\b/i.test(subfolder)) {
    return { session: 'ses-preimplant', folderName: parts[1] };
  }

  // Post-implant patterns
  if (/\b(post[-_]?implant|postimplant|implant|monitoring|ictal|phase[-_]?2|session[-_]?2|ses[-_]?2)\b/i.test(subfolder)) {
    return { session: 'ses-postimplant', folderName: parts[1] };
  }

  // Post-surgery patterns
  if (/\b(post[-_]?surg|postsurg|post[-_]?op|postop|resection|post[-_]?surgery|phase[-_]?3|session[-_]?3|ses[-_]?3)\b/i.test(subfolder)) {
    return { session: 'ses-postsurgery', folderName: parts[1] };
  }

  return { session: null, folderName: null };
}

/**
 * Group a single file into a subject cluster and try to infer
 * session from the folder structure.
 */
export function groupIntoSubject(
  file: ScannedFile,
  allFiles: ScannedFile[],
): SubjectGroupResult {
  const reasons: DetectionReason[] = [];
  let groupName: string;
  let session: Session | null = null;

  // ── Strategy 1: Top-level subfolder as group key ────────────
  const topFolder = getTopLevelFolder(file.relativePath);

  if (topFolder) {
    // Check if there are multiple top-level folders (multi-patient structure)
    const allTopFolders = new Set(
      allFiles
        .map(f => getTopLevelFolder(f.relativePath))
        .filter((f): f is string => f !== null)
    );

    if (allTopFolders.size > 1) {
      // Multiple top-level folders → each is likely a different patient
      groupName = topFolder;
      reasons.push({
        layer: 'subject-grouping',
        message: `Grouped by top-level folder: "${topFolder}"`,
        weight: 0.6,
      });

      // Check second-level folder for session info
      const subfolderSession = getSessionFromSubfolder(file.relativePath);
      if (subfolderSession.session) {
        session = subfolderSession.session;
        reasons.push({
          layer: 'subject-grouping',
          message: `Session inferred from subfolder: "${subfolderSession.folderName}"`,
          weight: 0.4,
        });
      }

      return { groupName, session, reasons };
    }

    // Only one top-level folder — files might be organized by session under it
    // Try to find subject IDs in filenames
    const subjectId = extractSubjectIdFromFilename(file.name);
    if (subjectId) {
      groupName = subjectId;
      reasons.push({
        layer: 'subject-grouping',
        message: `Subject ID extracted from filename: "${subjectId}"`,
        weight: 0.5,
      });

      // Still check subfolder for session
      const subfolderSession = getSessionFromSubfolder(file.relativePath);
      if (subfolderSession.session) {
        session = subfolderSession.session;
        reasons.push({
          layer: 'subject-grouping',
          message: `Session inferred from subfolder: "${subfolderSession.folderName}"`,
          weight: 0.4,
        });
      }

      return { groupName, session, reasons };
    }

    // Fall through to using top folder even though there's only one
    groupName = topFolder;
    reasons.push({
      layer: 'subject-grouping',
      message: `Grouped under folder: "${topFolder}" (single folder structure)`,
      weight: 0.3,
    });

    const subfolderSession = getSessionFromSubfolder(file.relativePath);
    if (subfolderSession.session) {
      session = subfolderSession.session;
      reasons.push({
        layer: 'subject-grouping',
        message: `Session inferred from subfolder: "${subfolderSession.folderName}"`,
        weight: 0.4,
      });
    }

    return { groupName, session, reasons };
  }

  // ── Strategy 2: No folder structure — try filename ──────────
  const subjectId = extractSubjectIdFromFilename(file.name);
  if (subjectId) {
    groupName = subjectId;
    reasons.push({
      layer: 'subject-grouping',
      message: `Subject ID extracted from filename: "${subjectId}"`,
      weight: 0.4,
    });
    return { groupName, session, reasons };
  }

  // ── Strategy 3: Can't determine — single group ─────────────
  groupName = 'ungrouped';
  reasons.push({
    layer: 'subject-grouping',
    message: 'Could not determine subject grouping — manual assignment needed',
    weight: 0.1,
  });

  return { groupName, session, reasons };
}
