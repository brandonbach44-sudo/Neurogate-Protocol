/**
 * Audit Log Collector
 *
 * Accumulates audit entries throughout the app session. Entries are
 * kept in memory; subscribe() lets the GUI save them to tab storage on
 * every change so a reload doesn't lose them (auditPersistence.ts).
 *
 * The logger is designed to be used via React context so any
 * component can log actions without prop drilling.
 */

import type { AuditEntry, AuditLog, AuditAction, AuditExportHeader } from '../../types/audit';
import { createAuditLog } from '../../types/audit';
import type { DeidentificationSummary } from '../bids/exporter';
import type { ValidationIssue } from '../../types/validation';

let nextId = 1;

/** Entries that don't by themselves make the log worth saving (see hasUnsavedWork). */
const NOT_WORK = new Set<AuditAction>(['structure-selected', 'audit-log-restored', 'audit-log-exported']);

/**
 * Create a new audit logger instance.
 * Returns an object with methods to log entries and access the log.
 */
export function createAuditLogger() {
  const log: AuditLog = createAuditLog();
  nextId = 1;
  const listeners = new Set<() => void>();
  const notify = () => { for (const l of listeners) l(); };

  function addEntry(
    action: AuditAction,
    summary: string,
    details: Record<string, unknown> = {},
    actor: string = 'user',
  ): AuditEntry {
    const entry: AuditEntry = {
      id: nextId++,
      timestamp: new Date().toISOString(),
      actor,
      action,
      summary,
      details,
    };
    log.entries.push(entry);
    notify();
    return entry;
  }

  // ── Convenience methods for common actions ──────────────────

  function describePreset(presetId: string, sessionCount: number, sessionIds: string[]): string {
    return presetId === 'custom-timepoints'
      ? `Custom timepoints (${sessionCount} timepoint${sessionCount !== 1 ? 's' : ''}: ${sessionIds.join(', ')})`
      : presetId === 'single-session'
        ? 'Single session (no session folders)'
        : `Implant sessions (${sessionCount} fixed sessions: ${sessionIds.join(', ')})`;
  }

  function logStructureSelected(presetId: string, sessionCount: number, sessionIds: string[]) {
    addEntry('structure-selected', `Structure selected: ${describePreset(presetId, sessionCount, sessionIds)}`,
      { presetId, sessionCount, sessionIds },
    );
  }

  /** The user went back and switched structure; the files they had added were cleared. */
  function logStructureChanged(
    from: { presetId: string; sessionIds: string[] },
    to: { presetId: string; sessionIds: string[] },
  ) {
    addEntry('structure-changed',
      `Structure changed from ${describePreset(from.presetId, from.sessionIds.length, from.sessionIds)} to ${describePreset(to.presetId, to.sessionIds.length, to.sessionIds)}; added files were cleared`,
      { from, to },
    );
  }

  function logFilesScanned(fileCount: number, totalSizeBytes: number) {
    addEntry('files-scanned', `Scanned ${fileCount} files (${formatBytes(totalSizeBytes)})`, {
      fileCount,
      totalSizeBytes,
    }, 'system');
  }

  function logDetectionCompleted(
    totalFiles: number,
    highConfidence: number,
    mediumConfidence: number,
    lowConfidence: number,
    unclassified: number,
    subjectGroups: string[],
  ) {
    addEntry('detection-completed',
      `Auto-detection completed: ${highConfidence} high, ${mediumConfidence} medium, ${lowConfidence} low, ${unclassified} unclassified`,
      { totalFiles, highConfidence, mediumConfidence, lowConfidence, unclassified, subjectGroups },
      'system',
    );
  }

  function logSessionCorrected(fileName: string, fromSession: string | null, toSession: string) {
    addEntry('session-corrected',
      `Changed session for "${fileName}": ${fromSession || '(none)'} → ${toSession}`,
      { fileName, fromSession, toSession },
    );
  }

  function logModalityCorrected(fileName: string, fromModality: string, toModality: string) {
    addEntry('modality-corrected',
      `Changed modality for "${fileName}": ${fromModality} → ${toModality}`,
      { fileName, fromModality, toModality },
    );
  }

  function logSubjectCorrected(fileName: string, fromGroup: string, toGroup: string) {
    addEntry('subject-corrected',
      `Changed subject group for "${fileName}": ${fromGroup} → ${toGroup}`,
      { fileName, fromGroup, toGroup },
    );
  }

  function logBulkSessionApplied(fileCount: number, session: string) {
    addEntry('bulk-session-applied',
      `Bulk-applied session "${session}" to ${fileCount} files`,
      { fileCount, session },
    );
  }

  function logBulkModalityApplied(fileCount: number, modality: string) {
    addEntry('bulk-modality-applied',
      `Bulk-applied modality "${modality}" to ${fileCount} files`,
      { fileCount, modality },
    );
  }

  function logInstitutionConfigured(prefix: string, startingNumber: number) {
    addEntry('institution-configured',
      `Institution configured: prefix="${prefix}", starting number=${startingNumber}`,
      { prefix, startingNumber },
    );
  }

  function logSubjectMetadataEntered(bidsSubjectId: string, sessionCount: number) {
    addEntry('subject-metadata-entered',
      `Metadata entered for ${bidsSubjectId} (${sessionCount} sessions)`,
      { bidsSubjectId, sessionCount },
    );
  }

  function logDatasetDescriptionEntered(name: string, authorCount: number) {
    addEntry('dataset-description-entered',
      `Dataset description entered: "${name}" with ${authorCount} author(s)`,
      { name, authorCount },
    );
  }

  /** fileCount: how many structural MRI files the attestation covers (GUI). */
  function logDefacingAttested(fileCount?: number) {
    addEntry('defacing-attested',
      fileCount === undefined
        ? 'Defacing attestation confirmed'
        : `Defacing attestation confirmed (covers ${fileCount} structural MRI file${fileCount !== 1 ? 's' : ''})`,
      fileCount === undefined ? {} : { fileCount },
    );
  }

  /**
   * 'unticked': the user cleared the box. 'files-changed': an earlier
   * attestation no longer applies because the mapping now gives a
   * different set of structural MRI files.
   */
  function logDefacingRevoked(reason: 'unticked' | 'files-changed') {
    addEntry('defacing-revoked',
      reason === 'unticked'
        ? 'Defacing attestation was unticked'
        : 'Defacing attestation cleared: the structural MRI files changed since it was given',
      { reason },
      reason === 'unticked' ? 'user' : 'system',
    );
  }

  function logValidationRun(errorCount: number, warningCount: number, infoCount: number, passed: boolean) {
    addEntry('validation-run',
      `Validation ${passed ? 'PASSED' : 'FAILED'}: ${errorCount} errors, ${warningCount} warnings, ${infoCount} info`,
      { errorCount, warningCount, infoCount, passed },
      'system',
    );
  }

  /**
   * Records the issue's title, never its description: a description can
   * quote the matched text (e.g. a suspected name). Titles name only the
   * rule, and affected files are original paths, which the shareable
   * copy replaces like every other file name.
   */
  function logIssueDismissed(issue: ValidationIssue) {
    const n = issue.affectedFiles.length;
    addEntry('validation-issue-dismissed',
      `Dismissed ${issue.severity} "${issue.title}"` + (n ? ` (${n} file${n !== 1 ? 's' : ''})` : ''),
      {
        severity: issue.severity,
        category: issue.category,
        title: issue.title,
        affectedFiles: issue.affectedFiles,
        ...(issue.subjectGroup ? { subjectGroup: issue.subjectGroup } : {}),
        ...(issue.session ? { session: issue.session } : {}),
      },
    );
  }

  function logDismissalsCleared(count: number) {
    addEntry('validation-dismissals-cleared',
      `Checks re-run; ${count} dismissed issue${count !== 1 ? 's' : ''} shown again`,
      { count },
    );
  }

  /** The page was reloaded and the earlier entries came back from tab storage. */
  function logAuditLogRestored(restoredEntries: number) {
    addEntry('audit-log-restored',
      `Page reloaded; audit log restored with ${restoredEntries} earlier entr${restoredEntries !== 1 ? 'ies' : 'y'}`,
      { restoredEntries },
      'system',
    );
  }

  /**
   * Log what de-identification actions were taken during an export --
   * which EDF files contained detected PHI and had their headers
   * redacted, which JSON sidecar fields were stripped/shifted/blanked.
   * Deliberately excludes the actual per-subject date-shift day values:
   * this audit log downloads bundled with the de-identified dataset, so
   * including the real shift amount here would let anyone holding both
   * files reverse it back to the true date, defeating the point of
   * shifting. See DeidentificationSummary in lib/bids/exporter.ts for
   * the full rationale. Decided with Brandon 2026-08-02.
   */
  function logDeidentificationSummary(summary: DeidentificationSummary) {
    const edfWithPhi = summary.edfFiles.filter(f => f.containedPhi === true).length;
    const sidecarsWithFields = summary.jsonSidecars.filter(
      s => s.strippedFields.length > 0 || s.shiftedFields.length > 0 || s.unparseableDateFields.length > 0,
    ).length;
    const layCount = summary.layFiles?.length ?? 0;
    addEntry('deidentification-summary',
      `De-identified ${summary.edfFiles.length} EDF file(s) (${edfWithPhi} contained detected PHI), ${sidecarsWithFields} JSON sidecar(s) with identifying content` +
        (layCount ? ` and ${layCount} Persyst layout file(s)` : ''),
      {
        edfFiles: summary.edfFiles,
        jsonSidecars: summary.jsonSidecars,
        ...(layCount ? { layFiles: summary.layFiles } : {}),
      },
      'system',
    );
  }

  function logAuditExported(format: string) {
    addEntry('audit-log-exported',
      `Audit log exported as ${format}`,
      { format, entryCount: log.entries.length },
    );
  }

  // ── Accessors ──────────────────────────────────────────────

  function getLog(): AuditLog {
    return log;
  }

  function getEntries(): AuditEntry[] {
    return log.entries;
  }

  function getEntryCount(): number {
    return log.entries.length;
  }

  function getExportHeader(exportedBy: string): AuditExportHeader {
    const actionSummary: Record<string, number> = {};
    for (const entry of log.entries) {
      actionSummary[entry.action] = (actionSummary[entry.action] || 0) + 1;
    }

    return {
      exportedAt: new Date().toISOString(),
      exportedBy,
      sessionStarted: log.sessionStarted,
      toolVersion: log.toolVersion,
      totalEntries: log.entries.length,
      actionSummary,
    };
  }

  function reset() {
    log.entries = [];
    log.sessionStarted = new Date().toISOString();
    log.savedThroughId = undefined;
    nextId = 1;
    notify();
  }

  /**
   * Record that a copy of the log up to `throughId` (default: every entry
   * so far) has been saved, so closing the app needn't warn.
   */
  function markSaved(throughId: number = lastId()) {
    log.savedThroughId = Math.max(log.savedThroughId ?? 0, throughId);
    notify();
  }

  function lastId(): number {
    return log.entries.reduce((m, e) => Math.max(m, e.id), 0);
  }

  /**
   * True when something worth keeping happened since the last saved copy.
   * Choosing a structure, a restored log, and the "audit exported" entry
   * itself (written just after a save) don't count.
   */
  function hasUnsavedWork(): boolean {
    const through = log.savedThroughId ?? 0;
    return log.entries.some(e => e.id > through && !NOT_WORK.has(e.action));
  }

  /** Replace the log with a saved one (same session, before a reload). */
  function restore(saved: AuditLog) {
    log.sessionStarted = saved.sessionStarted;
    log.toolVersion = saved.toolVersion;
    log.savedThroughId = saved.savedThroughId;
    log.entries = [...saved.entries];
    nextId = log.entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    notify();
  }

  /** Called after every change. Returns an unsubscribe function. */
  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  return {
    // Raw entry
    addEntry,
    // Convenience loggers
    logStructureSelected,
    logStructureChanged,
    logFilesScanned,
    logDetectionCompleted,
    logSessionCorrected,
    logModalityCorrected,
    logSubjectCorrected,
    logBulkSessionApplied,
    logBulkModalityApplied,
    logInstitutionConfigured,
    logSubjectMetadataEntered,
    logDatasetDescriptionEntered,
    logDefacingAttested,
    logDefacingRevoked,
    logValidationRun,
    logIssueDismissed,
    logDismissalsCleared,
    logAuditLogRestored,
    logDeidentificationSummary,
    logAuditExported,
    // Accessors
    getLog,
    getEntries,
    getEntryCount,
    getExportHeader,
    reset,
    restore,
    subscribe,
    markSaved,
    lastId,
    hasUnsavedWork,
  };
}

export type AuditLogger = ReturnType<typeof createAuditLogger>;

// ── Utility ─────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
