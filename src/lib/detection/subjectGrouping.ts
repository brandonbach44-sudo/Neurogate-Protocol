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
  /**
   * Set when a session-level subfolder matched the bare "post-op"/"postop"
   * pattern and nothing else resolved a session. See
   * folderDetector.ts's FolderResult.ambiguousSessionCandidate for the
   * full rationale -- same deferred-to-modality-evidence resolution,
   * applied here for the folder-depth patterns this module checks.
   */
  ambiguousSessionCandidate: Session | null;
}

/**
 * Bare "post-op"/"postop" -- ambiguous between post-implant and
 * post-surgery. Mirrors AMBIGUOUS_POSTOP_PATTERN in folderDetector.ts.
 */
const AMBIGUOUS_POSTOP_PATTERN = /\b(post[-\s]?op|postop)\b/i;

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
 * True for a bare 4-digit number that falls in a plausible calendar-year
 * range (1900-2099). Scan filenames very commonly embed the study/
 * acquisition year (e.g. "scan_2026_alpha.nii.gz"), and that year is far
 * more likely to appear in a flat (no-folder) drop than a real subject ID
 * is. Used to guard the last-resort generic \b(\d{3,4})\b pattern below,
 * which otherwise happily grabs the year and silently merges two
 * different patients' files into one fake subject group. Bug found and
 * confirmed 2026-08-02 via adversarial testing: two unrelated flat files
 * sharing only a study year ("scan_2026_alpha.nii.gz",
 * "scan_2026_beta.nii.gz") were both grouped under subject "2026".
 * 3-digit matches are unaffected since no calendar year is 3 digits.
 */
function looksLikeCalendarYear(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return year >= 1900 && year <= 2099;
}

/**
 * True if a filename stem looks like a DICOM UID -- a dotted sequence of
 * numeric segments like "2.16.124.113543.6006.99.14956571". DICOM UIDs
 * routinely contain 3-4 digit numbers (e.g. "124") that perfectly match
 * the last-resort \b(\d{3,4})\b subject ID pattern and the
 * [A-Z]{2,6}\d{2,4} institution prefix pattern, producing spurious
 * subject groups from scanner-generated filenames. If the stem starts
 * with four or more dot-separated numeric segments, we skip all subject
 * ID extraction and return null rather than pulling a meaningless UID
 * fragment. Found via adversarial testing 2026-08-16: a Flywheel download
 * with DICOM UID filenames was being grouped under subject "124" (from the
 * third segment of the UID).
 */
function looksLikeDicomUid(fileNameStem: string): boolean {
  // Match at least four dot-separated numeric segments at the start, which
  // is the minimum signature of a real DICOM UID. Short dotted decimals
  // (e.g. "v1.2") won't match, avoiding false positives on version strings.
  return /^\d+(\.\d+){3,}/.test(fileNameStem);
}

/**
 * Extract subject ID from a filename using common patterns.
 */
function extractSubjectIdFromFilename(fileName: string): string | null {
  const nameWithoutExt = fileName
    .replace(/\.nii\.gz$/i, '')
    .replace(/\.[^.]+$/i, '');

  // Normalize underscores to spaces so \b word boundaries work correctly.
  // Without this, "_001_" won't match \b(\d{3,4})\b because _ is a word char.
  const normalized = nameWithoutExt.replace(/_/g, ' ');

  // DICOM UID filenames (e.g. "2.16.124.113543.6006.99.MR") contain short
  // numeric segments that spuriously match subject ID patterns. Bail out
  // immediately rather than returning a meaningless UID fragment as a
  // "subject ID" that silently merges or splits patient groups.
  if (looksLikeDicomUid(nameWithoutExt)) return null;

  // Flywheel/Scitran packages DICOM series into .dicom.zip archives named
  // after the scan protocol, which includes scanner acquisition parameters
  // like bandwidth ("BW2264"), echo time ("te122"), b-values ("b3000"), etc.
  // These look like "ep2d_diff_sms3_b3000_te122_d64_duty68_BW2264_pF68" --
  // 9 underscore-separated segments. A subject-ID-bearing filename would
  // rarely have more than 5 (e.g. "sub-01_ses-preimplant_task-rest_bold").
  // If the stem has 7 or more segments, skip all subject ID extraction.
  // Confirmed via real-data testing 2026-08-16: BW2264 (a bandwidth value)
  // was being picked up as a subject ID from Flywheel scan-parameter filenames.
  const underscoreSegments = nameWithoutExt.split(/[_\s]+/);
  if (underscoreSegments.length >= 7) return null;

  for (let i = 0; i < SUBJECT_ID_PATTERNS.length; i++) {
    const match = normalized.match(SUBJECT_ID_PATTERNS[i]);
    if (!match) continue;

    // The last pattern in the list is the generic "any bare 3-4 digit
    // number" last resort. When it matches a 4-digit number that looks
    // like a calendar year, skip it rather than risk merging unrelated
    // patients -- a false "ungrouped" split is far safer than a silent
    // false merge. Skipping this pattern's match still lets us try
    // nothing further (it's already last), so we fall through to null.
    const isLastResortGenericNumber = i === SUBJECT_ID_PATTERNS.length - 1;
    if (isLastResortGenericNumber) {
      if (looksLikeCalendarYear(match[1])) continue;

      // Skip DWI b-values, echo times, gradient directions, and other scan
      // parameter numbers. A bare 3-4 digit number following a known MRI
      // acquisition parameter token (simple or compound) is a scan setting,
      // not a subject ID. Examples caught:
      //   "DTI 64 dir b 1300"         → "b" prefix     → skip 1300
      //   "ep2d diff SliceAcc b5k 128" → "b5k" prefix  → skip 128
      //   "CMRR 5k 128 SBRef"          → "5k" prefix   → skip 128 (bare SI suffix)
      //   "ep2d diff te94 d 64"        → "te94" prefix → skip 64
      if (match.index !== undefined && match.index > 0) {
        const before = normalized.slice(0, match.index).trimEnd();
        // Match simple (b, te, tr, bw) OR compound (b5k, b3k, te94, tr2000) prefixes.
        if (/\b(b\d*[kmgM]?|\d+[kmgM]|te\d*|tr\d*|bw\d*|ti\d*|fa\d*|flip\d*|d\d+|duty\d+)$/i.test(before)) continue;
      }
    }

    return match[1];
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
 * Determine the second-level subfolder for a file.
 * Given "StudyFolder/Patient_001/session/modality/file.nii.gz", returns "Patient_001".
 */
function getSecondLevelFolder(relativePath: string): string | null {
  const parts = relativePath.split('/').filter(s => s.length > 0);
  // Need at least 3 parts (parent + patient folder + filename)
  if (parts.length >= 3) {
    return parts[1];
  }
  return null;
}

/**
 * Check the third-level folder for session info.
 * Given "StudyFolder/Patient_001/Session_preimplant/modality/file.nii.gz",
 * checks "Session_preimplant".
 */
function getSessionFromThirdLevel(relativePath: string): { session: Session | null; folderName: string | null; ambiguousSessionCandidate: Session | null } {
  const parts = relativePath.split('/').filter(s => s.length > 0);
  if (parts.length < 4) {
    return { session: null, folderName: null, ambiguousSessionCandidate: null };
  }

  // Normalize underscores to spaces for word boundary matching
  const subfolder = parts[2].replace(/_/g, ' ').toLowerCase();

  if (/\b(pre[-\s]?implant|preimplant|pre[-\s]?op|preop|pre[-\s]?surg|baseline|phase[-\s]?1|session[-\s]?1|ses[-\s]?1)\b/i.test(subfolder)) {
    return { session: 'ses-preimplant', folderName: parts[2], ambiguousSessionCandidate: null };
  }
  if (/\b(post[-\s]?implant|postimplant|implant|monitoring|ictal|phase[-\s]?2|session[-\s]?2|ses[-\s]?2)\b/i.test(subfolder)) {
    return { session: 'ses-postimplant', folderName: parts[2], ambiguousSessionCandidate: null };
  }
  // Bare "post-op"/"postop" excluded here -- ambiguous, see AMBIGUOUS_POSTOP_PATTERN.
  if (/\b(post[-\s]?surg|postsurg|resection|post[-\s]?surgery|phase[-\s]?3|session[-\s]?3|ses[-\s]?3)\b/i.test(subfolder)) {
    return { session: 'ses-postsurgery', folderName: parts[2], ambiguousSessionCandidate: null };
  }
  if (AMBIGUOUS_POSTOP_PATTERN.test(subfolder)) {
    return { session: null, folderName: parts[2], ambiguousSessionCandidate: 'ses-postsurgery' };
  }

  return { session: null, folderName: null, ambiguousSessionCandidate: null };
}

/**
 * Check if the second-level folder suggests a session.
 * Given "Patient01/PreOp/MRI/file.nii.gz", checks "PreOp".
 */
function getSessionFromSubfolder(relativePath: string): { session: Session | null; folderName: string | null; ambiguousSessionCandidate: Session | null } {
  const parts = relativePath.split('/').filter(s => s.length > 0);
  if (parts.length < 3) {
    return { session: null, folderName: null, ambiguousSessionCandidate: null };
  }

  // Normalize underscores to spaces so \b word boundaries work correctly
  const subfolder = parts[1].replace(/_/g, ' ').toLowerCase();

  // Pre-implant patterns
  if (/\b(pre[-\s]?implant|preimplant|pre[-\s]?op|preop|pre[-\s]?surg|baseline|phase[-\s]?1|session[-\s]?1|ses[-\s]?1)\b/i.test(subfolder)) {
    return { session: 'ses-preimplant', folderName: parts[1], ambiguousSessionCandidate: null };
  }

  // Post-implant patterns
  if (/\b(post[-\s]?implant|postimplant|implant|monitoring|ictal|phase[-\s]?2|session[-\s]?2|ses[-\s]?2)\b/i.test(subfolder)) {
    return { session: 'ses-postimplant', folderName: parts[1], ambiguousSessionCandidate: null };
  }

  // Post-surgery patterns. Bare "post-op"/"postop" excluded -- ambiguous,
  // see AMBIGUOUS_POSTOP_PATTERN.
  if (/\b(post[-\s]?surg|postsurg|resection|post[-\s]?surgery|phase[-\s]?3|session[-\s]?3|ses[-\s]?3)\b/i.test(subfolder)) {
    return { session: 'ses-postsurgery', folderName: parts[1], ambiguousSessionCandidate: null };
  }
  if (AMBIGUOUS_POSTOP_PATTERN.test(subfolder)) {
    return { session: null, folderName: parts[1], ambiguousSessionCandidate: 'ses-postsurgery' };
  }

  return { session: null, folderName: null, ambiguousSessionCandidate: null };
}

/**
 * True if a folder name looks like a session/timepoint label rather than
 * a patient identifier. Used to disambiguate the single-top-level-folder
 * case in groupIntoSubject below: "PatientFolder/ses-X/modality/file"
 * (one patient, several session subfolders) and
 * "StudyFolder/Patient01/session/modality/file" wrapped one level
 * shallower, i.e. "Patient01/session/modality/file" with no separate
 * study-root wrapper, look identical in raw folder depth -- both have
 * exactly one top-level folder and multiple distinct second-level
 * folders. Only the subfolder NAMES tell them apart. Bug found and
 * confirmed 2026-08-02: without this check, a single patient dropped
 * alone with the standard session-subfolder structure was being split
 * into one fake "subject" per session folder. Multi-patient drops (2+
 * top-level folders) never hit this code path and were unaffected.
 *
 * @param customSessionIds When set (Custom timepoints datasets), matches
 *   exactly against the dataset's own defined labels instead of the
 *   implant fuzzy vocabulary, since custom labels have no fixed keyword
 *   set to pattern-match against.
 */
function looksLikeSessionFolder(folderName: string, customSessionIds?: string[]): boolean {
  const trimmed = folderName.trim();

  // Flywheel-style session folder names: "2weeks", "6months", "12mo", "1year" etc.
  // These are used by Flywheel/Scitran as session labels in downloaded data.
  if (/^\d+\s*(weeks?|months?|days?|years?|wks?|mos?|yrs?|d)$/i.test(trimmed)) return true;

  // Date-format session folders: YYYYMMDD (e.g. "20180510" = May 10, 2018).
  // OrthoControls and similar cohorts use scan dates as session folder names.
  if (/^\d{8}$/.test(trimmed)) {
    const month = parseInt(trimmed.slice(4, 6), 10);
    const day   = parseInt(trimmed.slice(6, 8), 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return true;
  }

  if (customSessionIds && customSessionIds.length > 0) {
    return customSessionIds.some(id => id.toLowerCase() === trimmed.toLowerCase());
  }
  const normalized = trimmed.replace(/_/g, ' ').toLowerCase();
  return /\b(pre[-\s]?implant|preimplant|pre[-\s]?op|preop|pre[-\s]?surg|baseline|post[-\s]?implant|postimplant|implant|monitoring|ictal|post[-\s]?surg|postsurg|post[-\s]?op|postop|resection|post[-\s]?surgery|phase[-\s]?[123]|session[-\s]?[123]|ses[-\s]?[123])\b/i.test(normalized)
    || /^ses[-_]\w+$/i.test(trimmed);
}

/**
 * Group a single file into a subject cluster and try to infer
 * session from the folder structure.
 *
 * @param customSessionIds A Custom timepoints dataset's defined session
 *   ids (e.g. ["ses-0mo", "ses-2mo"]), used only by
 *   looksLikeSessionFolder's single-top-folder disambiguation above.
 *   Omit for the Implant sessions preset, where the fuzzy vocabulary
 *   already covers it.
 */
export function groupIntoSubject(
  file: ScannedFile,
  allFiles: ScannedFile[],
  customSessionIds?: string[],
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

    // If every top-level folder looks like a session label (Flywheel names like
    // "2weeks"/"6months", YYYYMMDD dates, or named ses-* labels), do NOT treat
    // them as different patients — they are sessions of one subject. Fall through
    // to the second-level folder / filename extraction logic below.
    const allTopLookLikeSessions =
      allTopFolders.size > 0 &&
      [...allTopFolders].every(f => looksLikeSessionFolder(f, customSessionIds));

    if (allTopFolders.size > 1 && !allTopLookLikeSessions) {
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

      return { groupName, session, reasons, ambiguousSessionCandidate: subfolderSession.ambiguousSessionCandidate };
    }

    // When ALL top-level folders are session labels (Flywheel "2weeks"/"6months",
    // YYYYMMDD dates, etc.), second-level folders are SCAN SERIES names, not
    // patient identifiers. Skip second-level patient detection entirely and go
    // straight to filename-based subject ID extraction.
    if (allTopLookLikeSessions) {
      const subjectId = extractSubjectIdFromFilename(file.name);
      if (subjectId) {
        groupName = subjectId;
        reasons.push({
          layer: 'subject-grouping',
          message: `Subject ID from filename: "${subjectId}" (top-level folders are sessions)`,
          weight: 0.5,
        });
      } else {
        groupName = 'ungrouped';
        reasons.push({
          layer: 'subject-grouping',
          message: `Single subject — all top-level folders are session labels, no ID in filenames`,
          weight: 0.3,
        });
      }
      return { groupName, session, reasons, ambiguousSessionCandidate: null };
    }

    // Only one top-level folder (the dropped parent, e.g., "EpilepsyStudy_Raw").
    // Check if there are multiple SECOND-level folders (patient subfolders).
    const secondLevelFolders = new Set(
      allFiles
        .map(f => getSecondLevelFolder(f.relativePath))
        .filter((f): f is string => f !== null)
    );

    // Multiple second-level folders alone is ambiguous: it's consistent
    // both with "several patient folders under a shared study root" AND
    // "one patient with several session subfolders." Only treat it as
    // multiple patients when the second-level folder names DON'T all
    // look like session labels -- if they do, fall through to the
    // single-top-folder branch below, which correctly treats topFolder
    // as the one patient and looks for a session at the second level.
    const allSecondLevelLookLikeSessions =
      secondLevelFolders.size > 0 &&
      [...secondLevelFolders].every(f => looksLikeSessionFolder(f, customSessionIds));

    if (secondLevelFolders.size > 1 && !allSecondLevelLookLikeSessions) {
      // Multiple second-level folders → likely patient folders under a study parent
      const secondFolder = getSecondLevelFolder(file.relativePath);
      if (secondFolder) {
        groupName = secondFolder;
        reasons.push({
          layer: 'subject-grouping',
          message: `Grouped by patient folder: "${secondFolder}" (under "${topFolder}")`,
          weight: 0.6,
        });

        // Check third-level folder for session info (Patient_001/Session_preimplant/...)
        const thirdLevelSession = getSessionFromThirdLevel(file.relativePath);
        if (thirdLevelSession.session) {
          session = thirdLevelSession.session;
          reasons.push({
            layer: 'subject-grouping',
            message: `Session inferred from subfolder: "${thirdLevelSession.folderName}"`,
            weight: 0.4,
          });
        }

        return { groupName, session, reasons, ambiguousSessionCandidate: thirdLevelSession.ambiguousSessionCandidate };
      }
    }

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

      return { groupName, session, reasons, ambiguousSessionCandidate: subfolderSession.ambiguousSessionCandidate };
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

    return { groupName, session, reasons, ambiguousSessionCandidate: subfolderSession.ambiguousSessionCandidate };
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
    return { groupName, session, reasons, ambiguousSessionCandidate: null };
  }

  // ── Strategy 3: Can't determine — single group ─────────────
  groupName = 'ungrouped';
  reasons.push({
    layer: 'subject-grouping',
    message: 'Could not determine subject grouping — manual assignment needed',
    weight: 0.1,
  });

  return { groupName, session, reasons, ambiguousSessionCandidate: null };
}
