/**
 * Cross-Session Consistency Checker
 *
 * Validates consistency across sessions for each subject:
 *
 * - Subject should ideally have files in multiple sessions
 * - No duplicate files across sessions (same file in two sessions)
 * - Session dates should be chronologically ordered
 * - Electrode/channel files should be consistent across sessions
 * - Subject IDs should not conflict across groups
 */

import type { DetectionResult } from '../../types/detection';
import { getEffectiveSession, getEffectiveModality, getEffectiveSubjectGroup } from '../../types/detection';
import type { SubjectMetadata } from '../../types/metadata';
import type { ValidationIssue } from '../../types/validation';
import { isOsJunkFile } from '../detection/extensionDetector';
import type { DatasetStructure } from '../../types/sessionStructure';

let issueCounter = 0;
function nextId(): string {
  return `cross-${++issueCounter}`;
}

/**
 * Fixed chronological rank for the Implant sessions preset's 3 known
 * session ids. Used by checkChronologicalOrder below. Custom timepoints
 * session ids (e.g. "ses-2mo") have no universal order derivable from
 * the string alone -- that would need the dataset's DatasetStructure,
 * which isn't currently threaded through ValidationInput. Scoped
 * deliberately to Implant sessions only for now; flagged to Brandon as a
 * possible follow-up if Custom timepoints chronological checking is
 * wanted later. Found via adversarial validation testing 2026-08-02:
 * this file's own header comment promised chronological-order checking
 * that was never actually implemented.
 */
const IMPLANT_SESSION_ORDER: Record<string, number> = {
  'ses-preimplant': 0,
  'ses-postimplant': 1,
  'ses-postsurgery': 2,
};

/**
 * Flag a subject whose recorded session acquisition dates (entered in the
 * Metadata step) run out of order relative to the Implant preset's fixed
 * clinical sequence -- e.g. a "post-implant" date earlier than the same
 * subject's "pre-implant" date. This is physically impossible (you can't
 * be monitored post-implant before the pre-implant baseline happened) and
 * strongly indicates a typo in one of the entered dates.
 */
function checkChronologicalOrder(subjects: SubjectMetadata[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const subject of subjects) {
    const dated = subject.sessions
      .filter(s => s.sessionId in IMPLANT_SESSION_ORDER && s.acqTime && s.acqTime.trim())
      .map(s => ({ sessionId: s.sessionId, acqTime: s.acqTime, rank: IMPLANT_SESSION_ORDER[s.sessionId], date: new Date(s.acqTime) }))
      .filter(s => !isNaN(s.date.getTime()))
      .sort((a, b) => a.rank - b.rank);

    for (let i = 1; i < dated.length; i++) {
      if (dated[i].date.getTime() < dated[i - 1].date.getTime()) {
        issues.push({
          id: nextId(),
          category: 'cross-session',
          severity: 'error',
          title: 'Session dates out of chronological order',
          description: `${subject.bidsSubjectId}: "${dated[i - 1].sessionId}" is dated ${dated[i - 1].acqTime}, but "${dated[i].sessionId}" (which should come later in the clinical sequence) is dated ${dated[i].acqTime} -- earlier than the session before it. This usually indicates a typo in one of the acquisition dates. Verify both dates in the Metadata step.`,
          affectedFiles: [],
          subjectGroup: subject.subjectGroup,
          dismissable: false,
        });
      }
    }
  }

  return issues;
}

export function checkCrossSessionConsistency(
  results: DetectionResult[],
  subjects: SubjectMetadata[],
  /**
   * The dataset's chosen session structure. Optional so existing callers
   * that don't pass it see identical behavior to before Phase 2. Only
   * consulted to route the iEEG-without-electrodes check below through a
   * per-subject path (Section below) instead of the per-session path when
   * the Single session preset is active, since every session-keyed check
   * in this file is naturally a no-op for a dataset where every file has
   * session = null.
   */
  structure?: DatasetStructure,
): ValidationIssue[] {
  issueCounter = 0;
  const issues: ValidationIssue[] = [];

  // OS junk files pad out affectedFiles lists ("Single session only",
  // duplicate-ID, etc.) without being relevant to any of these checks.
  // Excluded up front, same as requiredFilesChecker.ts and
  // bidsValidator.ts.
  results = results.filter(r => !isOsJunkFile(r.fileName));

  // ── Check: Subjects with only one session ─────────────────
  const subjectSessions = new Map<string, Set<string>>();
  for (const result of results) {
    const group = getEffectiveSubjectGroup(result);
    const session = getEffectiveSession(result);
    if (!session) continue;

    if (!subjectSessions.has(group)) {
      subjectSessions.set(group, new Set());
    }
    subjectSessions.get(group)!.add(session);
  }

  for (const [group, sessions] of subjectSessions) {
    if (sessions.size === 1) {
      const sessionName = Array.from(sessions)[0];
      const affectedFiles = results
        .filter(r => getEffectiveSubjectGroup(r) === group)
        .map(r => r.relativePath);

      issues.push({
        id: nextId(),
        category: 'cross-session',
        severity: 'info',
        title: `Single session only: ${sessionName}`,
        description: `Subject "${group}" only has data for one session (${sessionName}). This is fine if you're only uploading partial data, but longitudinal studies typically include multiple sessions. You can add more sessions later.`,
        affectedFiles,
        subjectGroup: group,
        dismissable: true,
      });
    }
  }

  // ── Check: Duplicate files across sessions ────────────────
  // (same filename appearing in multiple sessions for one subject)
  const fileSessionMap = new Map<string, { session: string; path: string }[]>();

  for (const result of results) {
    const group = getEffectiveSubjectGroup(result);
    const session = getEffectiveSession(result);
    if (!session) continue;

    const key = `${group}::${result.fileName}`;
    if (!fileSessionMap.has(key)) {
      fileSessionMap.set(key, []);
    }
    fileSessionMap.get(key)!.push({ session, path: result.relativePath });
  }

  for (const [key, entries] of fileSessionMap) {
    if (entries.length > 1) {
      const sessions = new Set(entries.map(e => e.session));
      if (sessions.size > 1) {
        const group = key.split('::')[0];
        const fileName = key.split('::')[1];

        issues.push({
          id: nextId(),
          category: 'cross-session',
          severity: 'warning',
          title: `Same filename in multiple sessions`,
          description: `"${fileName}" appears in ${sessions.size} different sessions for subject "${group}" (${Array.from(sessions).join(', ')}). This might be the same file accidentally assigned to multiple sessions. Verify each copy is actually from a different session.`,
          affectedFiles: entries.map(e => e.path),
          subjectGroup: group,
          dismissable: true,
        });
      }
    }
  }

  // ── Check: Duplicate BIDS subject IDs ─────────────────────
  const bidsIdMap = new Map<string, string[]>();
  for (const subject of subjects) {
    if (!bidsIdMap.has(subject.bidsSubjectId)) {
      bidsIdMap.set(subject.bidsSubjectId, []);
    }
    bidsIdMap.get(subject.bidsSubjectId)!.push(subject.subjectGroup);
  }

  for (const [bidsId, groups] of bidsIdMap) {
    if (groups.length > 1) {
      const affectedFiles = results
        .filter(r => groups.includes(getEffectiveSubjectGroup(r)))
        .map(r => r.relativePath);

      issues.push({
        id: nextId(),
        category: 'cross-session',
        severity: 'error',
        title: `Duplicate BIDS subject ID: ${bidsId}`,
        description: `Multiple subject groups (${groups.join(', ')}) are mapped to the same BIDS ID "${bidsId}". Each subject must have a unique ID. Adjust the institution setup or manually rename subjects.`,
        affectedFiles,
        dismissable: false,
      });
    }
  }

  // ── Check: iEEG without matching electrode data ──────────
  // Single session preset: every file has session = null, so the
  // subjectSessions map above (built only from non-null sessions) is
  // always empty and the per-session loop below would silently never
  // run this check at all. It's a real check independent of session
  // structure, so it gets an equivalent per-subject (not per-session)
  // pass here instead.
  if (structure?.presetId === 'single-session') {
    const subjectGroups = new Set(results.map(r => getEffectiveSubjectGroup(r)));
    for (const group of subjectGroups) {
      const subjectFiles = results.filter(r => getEffectiveSubjectGroup(r) === group);
      const hasIeeg = subjectFiles.some(r => getEffectiveModality(r) === 'ieeg');
      const hasElectrodes = subjectFiles.some(r => getEffectiveModality(r) === 'electrodes');

      if (hasIeeg && !hasElectrodes) {
        issues.push({
          id: nextId(),
          category: 'cross-session',
          severity: 'warning',
          title: 'iEEG recording without electrode coordinates',
          description: `Subject "${group}" has iEEG recordings but no electrodes.tsv file. Electrode coordinates are important for localizing recording sites. If you have this data, go back and make sure it's properly classified.`,
          affectedFiles: subjectFiles
            .filter(r => getEffectiveModality(r) === 'ieeg')
            .map(r => r.relativePath),
          subjectGroup: group,
          dismissable: true,
        });
      }
    }
  } else {
    for (const [group, sessions] of subjectSessions) {
      for (const session of sessions) {
        const sessionFiles = results.filter(r =>
          getEffectiveSubjectGroup(r) === group &&
          getEffectiveSession(r) === session
        );

        const hasIeeg = sessionFiles.some(r => getEffectiveModality(r) === 'ieeg');
        const hasElectrodes = sessionFiles.some(r => getEffectiveModality(r) === 'electrodes');

        if (hasIeeg && !hasElectrodes) {
          issues.push({
            id: nextId(),
            category: 'cross-session',
            severity: 'warning',
            title: 'iEEG recording without electrode coordinates',
            description: `Subject "${group}" / ${session} has iEEG recordings but no electrodes.tsv file. Electrode coordinates are important for localizing recording sites. If you have this data, go back and make sure it's properly classified.`,
            affectedFiles: sessionFiles
              .filter(r => getEffectiveModality(r) === 'ieeg')
              .map(r => r.relativePath),
            subjectGroup: group,
            session,
            dismissable: true,
          });
        }
      }
    }
  }

  // ── Check: chronological order of session acquisition dates ──
  issues.push(...checkChronologicalOrder(subjects));

  return issues;
}
