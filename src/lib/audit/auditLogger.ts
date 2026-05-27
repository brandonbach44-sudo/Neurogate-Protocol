/**
 * Audit Log Collector
 *
 * Accumulates audit entries throughout the wizard session.
 * This is a simple in-memory store — entries are collected as the
 * user progresses through the wizard and exported at the end.
 *
 * The logger is designed to be used via React context so any
 * component can log actions without prop drilling.
 */

import type { AuditEntry, AuditLog, AuditAction, AuditExportHeader } from '../../types/audit';
import { createAuditLog } from '../../types/audit';

let nextId = 1;

/**
 * Create a new audit logger instance.
 * Returns an object with methods to log entries and access the log.
 */
export function createAuditLogger() {
  const log: AuditLog = createAuditLog();
  nextId = 1;

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
    return entry;
  }

  // ── Convenience methods for common actions ──────────────────

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

  function logDefacingAttested() {
    addEntry('defacing-attested', 'Defacing attestation confirmed', {});
  }

  function logDefacingRevoked() {
    addEntry('defacing-revoked', 'Defacing attestation was unchecked', {});
  }

  function logValidationRun(errorCount: number, warningCount: number, infoCount: number, passed: boolean) {
    addEntry('validation-run',
      `Validation ${passed ? 'PASSED' : 'FAILED'}: ${errorCount} errors, ${warningCount} warnings, ${infoCount} info`,
      { errorCount, warningCount, infoCount, passed },
      'system',
    );
  }

  function logIssueDismissed(issueId: string, issueTitle: string) {
    addEntry('validation-issue-dismissed',
      `Dismissed validation issue: "${issueTitle}"`,
      { issueId, issueTitle },
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
    nextId = 1;
  }

  return {
    // Raw entry
    addEntry,
    // Convenience loggers
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
    logAuditExported,
    // Accessors
    getLog,
    getEntries,
    getEntryCount,
    getExportHeader,
    reset,
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
