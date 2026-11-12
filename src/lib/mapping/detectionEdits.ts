/**
 * User edits to the mapping table: single-file corrections, bulk task /
 * session / modality changes, and file removal.
 *
 * Every edit reads the latest results from `ctx.results.current` and hands
 * the new array to `ctx.commit()`, which must update that same ref before
 * returning. Two edits fired before React re-renders therefore chain: the
 * second one sees the first one's output instead of the stale array from the
 * last render, so neither is lost.
 *
 * Side effects (audit entries, the summary) run once per edit, after the
 * commit, never inside a React state updater (Strict Mode calls those twice).
 *
 * No React here, so tests/regression_detection_edits.ts can drive these
 * functions directly.
 */

import type { DetectionResult, DetectionSummary, Session, Modality } from '../../types/detection';
import { getEffectiveSession, getEffectiveModality, taskInBidsName } from '../../types/detection';
import type { DatasetStructure } from '../../types/sessionStructure';
import type { AuditLogger } from '../audit/auditLogger';
import { generateSummary } from '../detection';
import { computeBidsNames } from '../bids/bidsNaming';
import { removeResults } from './removeResults';

export interface DetectionEditContext {
  /** Latest results. Read at the start of every edit. */
  results: { current: DetectionResult[] };
  /** Store the new results. Must set `results.current` before returning. */
  commit: (next: DetectionResult[]) => void;
  setSummary: (summary: DetectionSummary) => void;
  audit: Pick<
    AuditLogger,
    | 'addEntry'
    | 'logSessionCorrected'
    | 'logModalityCorrected'
    | 'logSubjectCorrected'
    | 'logTaskCorrected'
    | 'logBulkTaskApplied'
    | 'logBulkSessionApplied'
    | 'logBulkModalityApplied'
  >;
  structure: DatasetStructure;
}

/** Recompute BIDS names so the preview, run- entities and sidecar pairing stay correct. */
function rename(ctx: DetectionEditContext, next: DetectionResult[]): DetectionResult[] {
  return computeBidsNames(next, undefined, ctx.structure);
}

/** Apply a user correction to one result and log what changed. */
export function updateResult(
  ctx: DetectionEditContext,
  index: number,
  updates: Partial<DetectionResult>,
): void {
  const next = [...ctx.results.current];
  const old = next[index];
  next[index] = { ...old, ...updates };
  const renamed = rename(ctx, next);
  ctx.commit(renamed);

  const { audit } = ctx;
  if (updates.userSession && updates.userSession !== getEffectiveSession(old)) {
    audit.logSessionCorrected(old.fileName, getEffectiveSession(old), updates.userSession);
  }
  if (updates.userModality && updates.userModality !== getEffectiveModality(old)) {
    audit.logModalityCorrected(old.fileName, getEffectiveModality(old), updates.userModality);
  }
  if (updates.userSubjectGroup && updates.userSubjectGroup !== old.subjectGroup) {
    audit.logSubjectCorrected(old.fileName, old.subjectGroup, updates.userSubjectGroup);
  }
  if ('userTask' in updates) {
    const from = taskInBidsName(old.bidsFilename);
    const to = taskInBidsName(renamed[index].bidsFilename);
    if (to && from !== to) audit.logTaskCorrected(old.fileName, from, to);
  }
  ctx.setSummary(generateSummary(renamed, ctx.structure));
}

/** Set the same field on several results, then commit and summarize. */
function bulkUpdate(
  ctx: DetectionEditContext,
  indices: number[],
  patch: Partial<DetectionResult>,
): void {
  const next = [...ctx.results.current];
  for (const i of indices) next[i] = { ...next[i], ...patch };
  const renamed = rename(ctx, next);
  ctx.commit(renamed);
  ctx.setSummary(generateSummary(renamed, ctx.structure));
}

export function bulkUpdateTask(ctx: DetectionEditContext, indices: number[], task: string): void {
  bulkUpdate(ctx, indices, { userTask: task });
  ctx.audit.logBulkTaskApplied(indices.length, task);
}

export function bulkUpdateSession(ctx: DetectionEditContext, indices: number[], session: Session): void {
  bulkUpdate(ctx, indices, { userSession: session });
  ctx.audit.logBulkSessionApplied(indices.length, session);
}

export function bulkUpdateModality(ctx: DetectionEditContext, indices: number[], modality: Modality): void {
  bulkUpdate(ctx, indices, { userModality: modality });
  ctx.audit.logBulkModalityApplied(indices.length, modality);
}

/**
 * Remove results (and the companions of any selected data files). Each
 * removed result is appended to `removedLog` once, so the shareable audit
 * log can still redact its name.
 */
export function removeFromMapping(
  ctx: DetectionEditContext,
  indices: number[],
  removedLog: DetectionResult[],
): void {
  if (indices.length === 0) return;
  const { kept, removed } = removeResults(ctx.results.current, indices);
  const renamed = rename(ctx, kept);
  ctx.commit(renamed);
  for (const r of removed) {
    if (!removedLog.includes(r)) removedLog.push(r);
    ctx.audit.addEntry('file-removed', `Removed from mapping: ${r.fileName}`);
  }
  ctx.setSummary(generateSummary(renamed, ctx.structure));
}
