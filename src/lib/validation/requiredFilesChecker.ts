/**
 * Required Files Checker
 *
 * Verifies that each subject/session combination has the required
 * files for the Implant sessions preset:
 *
 * ses-preimplant:
 *   - Required: T1w MRI (anat/)
 *   - Recommended: T2w MRI, DWI, fMRI
 *
 * ses-postimplant:
 *   - Required: CT scan (ct/), iEEG recording (ieeg/)
 *   - Required: electrodes.tsv, channels.tsv (ieeg/)
 *   - Recommended: events.tsv
 *
 * ses-postsurgery:
 *   - Required: T1w MRI (anat/)
 *   - Recommended: T2w MRI
 *
 * Also checks for orphaned sidecar files (JSON without matching data).
 */

import type { DetectionResult } from '../../types/detection';
import { getEffectiveSession, getEffectiveModality, getEffectiveSubjectGroup } from '../../types/detection';
import type { SubjectMetadata } from '../../types/metadata';
import type { ValidationIssue } from '../../types/validation';
import { isOsJunkFile } from '../detection/extensionDetector';

interface RequiredFile {
  modality: string;
  label: string;
  severity: 'error' | 'warning';  // error = required, warning = recommended
}

const SESSION_REQUIREMENTS: Record<string, RequiredFile[]> = {
  'ses-preimplant': [
    { modality: 'anat-T1w', label: 'T1w MRI', severity: 'error' },
    { modality: 'anat-T2w', label: 'T2w MRI', severity: 'warning' },
  ],
  'ses-postimplant': [
    { modality: 'ct', label: 'CT scan', severity: 'error' },
    { modality: 'ieeg', label: 'iEEG recording', severity: 'error' },
    { modality: 'electrodes', label: 'Electrodes metadata (electrodes.tsv)', severity: 'error' },
    { modality: 'channels', label: 'Channels metadata (channels.tsv)', severity: 'error' },
    { modality: 'events', label: 'Events file (events.tsv)', severity: 'warning' },
  ],
  'ses-postsurgery': [
    { modality: 'anat-T1w', label: 'T1w MRI', severity: 'error' },
    { modality: 'anat-T2w', label: 'T2w MRI', severity: 'warning' },
  ],
};

let issueCounter = 0;
function nextId(): string {
  return `reqfile-${++issueCounter}`;
}

export function checkRequiredFiles(
  results: DetectionResult[],
  subjects: SubjectMetadata[],
): ValidationIssue[] {
  issueCounter = 0;
  const issues: ValidationIssue[] = [];

  // OS junk files (Thumbs.db, .DS_Store, etc.) are never real data and
  // are already excluded from export at the detection layer. Keeping
  // them out of this checker's inputs entirely stops them from padding
  // out "Missing required" affectedFiles lists or spuriously triggering
  // "Subject has no sessions" for a junk-only file group.
  results = results.filter(r => !isOsJunkFile(r.fileName));

  const DATA_MODALITIES = new Set([
    'anat-T1w', 'anat-T2w', 'anat-FLAIR', 'anat-angio',
    'ct', 'dwi', 'perf', 'func', 'fmap',
    'ieeg', 'eeg', 'electrodes', 'channels', 'events',
  ]);

  // Build a map: subjectGroup → session → list of modalities present
  const subjectSessionModalities = new Map<string, Map<string, Set<string>>>();

  for (const result of results) {
    const group = getEffectiveSubjectGroup(result);
    const session = getEffectiveSession(result);
    const modality = getEffectiveModality(result);

    if (!session) continue;

    if (!subjectSessionModalities.has(group)) {
      subjectSessionModalities.set(group, new Map());
    }
    const sessionMap = subjectSessionModalities.get(group)!;
    if (!sessionMap.has(session)) {
      sessionMap.set(session, new Set());
    }
    sessionMap.get(session)!.add(modality);
  }

  // ── Check each subject's sessions against requirements ────
  for (const [group, sessionMap] of subjectSessionModalities) {
    // Find the BIDS ID for display
    const subject = subjects.find(s => s.subjectGroup === group);
    const displayId = subject?.bidsSubjectId || group;

    // Count data files for this subject across all sessions.
    // When a subject has very few files it is almost certainly an
    // intentional partial upload (e.g. a single EDF for de-identification).
    // Downgrade required-file errors to dismissable warnings in that case
    // so the user can still proceed to export.
    const subjectDataFileCount = results.filter(r =>
      getEffectiveSubjectGroup(r) === group &&
      DATA_MODALITIES.has(getEffectiveModality(r))
    ).length;
    const isSparseUpload = subjectDataFileCount < 4;

    for (const [session, modalities] of sessionMap) {
      const requirements = SESSION_REQUIREMENTS[session];
      if (!requirements) continue;

      for (const req of requirements) {
        if (!modalities.has(req.modality)) {
          const affectedFiles = results
            .filter(r => getEffectiveSubjectGroup(r) === group && getEffectiveSession(r) === session)
            .map(r => r.relativePath);

          // For sparse uploads, treat all missing-file issues as dismissable
          // warnings so the user is not blocked from exporting the files
          // they do have (e.g. a single EDF being de-identified).
          const effectiveSeverity: 'error' | 'warning' =
            isSparseUpload ? 'warning' : req.severity;

          issues.push({
            id: nextId(),
            category: 'required-files',
            severity: effectiveSeverity,
            title: effectiveSeverity === 'error'
              ? `Missing required: ${req.label}`
              : `Missing: ${req.label}`,
            description: isSparseUpload
              ? `${displayId} / ${session} is missing ${req.label}, but only ${subjectDataFileCount} file${subjectDataFileCount === 1 ? ' was' : 's were'} uploaded for this subject. If this is intentional (e.g. uploading a single file for de-identification), dismiss this warning and continue. Otherwise go back and verify all files were included.`
              : effectiveSeverity === 'error'
                ? `${displayId} / ${session} is missing a required ${req.label} file. This file must be present for a valid BIDS submission. If you have this file, go back to the mapping step and verify it's assigned to the correct session and modality.`
                : `${displayId} / ${session} does not include a ${req.label} file. This is recommended but not required. Your submission will still be valid without it.`,
            affectedFiles,
            subjectGroup: group,
            session,
            dismissable: true,
          });
        }
      }
    }
  }

  // ── Check: Subjects with no sessions at all ───────────────
  const allGroups = new Set(results.map(r => getEffectiveSubjectGroup(r)));
  for (const group of allGroups) {
    if (!subjectSessionModalities.has(group) ||
        subjectSessionModalities.get(group)!.size === 0) {
      const affectedFiles = results
        .filter(r => getEffectiveSubjectGroup(r) === group)
        .map(r => r.relativePath);

      issues.push({
        id: nextId(),
        category: 'required-files',
        severity: 'error',
        title: 'Subject has no sessions',
        description: `Subject group "${group}" has files but none are assigned to a session. Every file needs to be assigned to one of this dataset's sessions.`,
        affectedFiles,
        subjectGroup: group,
        dismissable: false,
      });
    }
  }

  // ── Check: Empty sessions (no data files) ─────────────────
  for (const subject of subjects) {
    for (const session of subject.sessions) {
      const sessionFiles = results.filter(r =>
        getEffectiveSubjectGroup(r) === subject.subjectGroup &&
        getEffectiveSession(r) === session.sessionId
      );

      // Filter to only "real" data files (not sidecars)
      const dataFiles = sessionFiles.filter(r => {
        const mod = getEffectiveModality(r);
        return mod !== 'sidecar-json' && mod !== 'sidecar-tsv' && mod !== 'other';
      });

      if (dataFiles.length === 0 && sessionFiles.length > 0) {
        issues.push({
          id: nextId(),
          category: 'required-files',
          severity: 'warning',
          title: 'Session has only sidecar/metadata files',
          description: `${subject.bidsSubjectId} / ${session.sessionId} contains only sidecar or metadata files with no primary data files. This session may be incomplete.`,
          affectedFiles: sessionFiles.map(r => r.relativePath),
          subjectGroup: subject.subjectGroup,
          session: session.sessionId,
          dismissable: true,
        });
      }
    }
  }

  return issues;
}
