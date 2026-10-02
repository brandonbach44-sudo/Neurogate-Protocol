/**
 * Shareable audit log.
 *
 * The full audit log records original file names, folder paths and
 * subject-group names (often patient folder names), so it has to stay at
 * the site. The shareable copy replaces every one of those with what the
 * recipient already sees in the dataset: each file's exported BIDS path
 * (or "file-N" for a file that wasn't exported), and each subject group's
 * assigned sub- ID (or "subject-N"). Everything else (timestamps,
 * actions, counts, modality and session changes) is unchanged.
 */

import type { DetectionResult } from '../../types/detection';
import { getEffectiveSubjectGroup } from '../../types/detection';
import type { SubjectMetadata } from '../../types/metadata';
import { isExportedPath } from '../bids/bidsNaming';

/** [original text, replacement], applied longest first. */
export type RedactionPairs = [string, string][];

/**
 * Build the replacement list from detection results whose BIDS paths were
 * computed with the real subject IDs (computeBidsNames with the subject
 * ID map), plus the subjects from the Metadata step.
 */
export function buildAuditRedactionPairs(
  namedResults: DetectionResult[],
  subjects: SubjectMetadata[],
): RedactionPairs {
  const pairs = new Map<string, string>();
  let unexported = 0;
  for (const r of namedResults) {
    const exported = isExportedPath(r.bidsPath);
    const replacement = exported ? r.bidsPath : `file-${++unexported}`;
    pairs.set(r.relativePath, replacement);
    pairs.set(r.fileName, exported ? r.bidsFilename : replacement);
  }
  const idByGroup = new Map(subjects.map(s => [s.subjectGroup, s.bidsSubjectId]));
  let unnamed = 0;
  const groups = new Set(namedResults.map(getEffectiveSubjectGroup));
  for (const s of subjects) groups.add(s.subjectGroup);
  for (const g of groups) {
    if (!g) continue;
    pairs.set(g, idByGroup.get(g) ?? `subject-${++unnamed}`);
  }
  return [...pairs.entries()]
    .filter(([original]) => original.length > 0)
    .sort((a, b) => b[0].length - a[0].length);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace every original name in a string. Matches are bounded by
 * non-alphanumeric characters, so a short group name like "P1" can't
 * rewrite part of an unrelated word.
 */
function redactString(value: string, patterns: { re: RegExp; to: string }[]): string {
  let out = value;
  for (const { re, to } of patterns) out = out.replace(re, to);
  return out;
}

/** Deep-copy `value`, redacting every string (object keys included). */
export function redactAuditValue<T>(value: T, pairs: RedactionPairs): T {
  const patterns = pairs.map(([from, to]) => ({
    re: new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(from)}(?![A-Za-z0-9])`, 'g'),
    to,
  }));
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return redactString(v, patterns);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [redactString(k, patterns), walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}
