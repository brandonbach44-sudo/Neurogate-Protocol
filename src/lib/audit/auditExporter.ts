/**
 * Audit Log Exporter
 *
 * Exports the audit log in two formats:
 * 1. JSON — full structured data for machine processing
 * 2. CSV — flat table for human review in Excel/Sheets
 *
 * Both formats include a header section with session metadata
 * and a body with all audit entries in chronological order.
 */

import type { AuditLogger } from './auditLogger';

// ── JSON Export ─────────────────────────────────────────────────

export function exportAsJson(logger: AuditLogger, exportedBy: string): string {
  const header = logger.getExportHeader(exportedBy);
  const log = logger.getLog();

  const output = {
    _format: 'ALCOA+ Audit Log',
    _version: '1.0',
    header,
    entries: log.entries.map(entry => ({
      id: entry.id,
      timestamp: entry.timestamp,
      actor: entry.actor,
      action: entry.action,
      summary: entry.summary,
      details: entry.details,
    })),
  };

  return JSON.stringify(output, null, 2);
}

// ── CSV Export ───────────────────────────────────────────────────

export function exportAsCsv(logger: AuditLogger, exportedBy: string): string {
  const header = logger.getExportHeader(exportedBy);
  const entries = logger.getEntries();

  const lines: string[] = [];

  // Header comment rows
  lines.push(`# ALCOA+ Audit Log Export`);
  lines.push(`# Exported At: ${header.exportedAt}`);
  lines.push(`# Exported By: ${header.exportedBy}`);
  lines.push(`# Session Started: ${header.sessionStarted}`);
  lines.push(`# Tool Version: ${header.toolVersion}`);
  lines.push(`# Total Entries: ${header.totalEntries}`);
  lines.push('');

  // Column headers
  lines.push('ID,Timestamp,Actor,Action,Summary,Details');

  // Data rows
  for (const entry of entries) {
    const detailsStr = JSON.stringify(entry.details).replace(/"/g, '""');
    lines.push([
      entry.id,
      entry.timestamp,
      csvEscape(entry.actor),
      csvEscape(entry.action),
      csvEscape(entry.summary),
      `"${detailsStr}"`,
    ].join(','));
  }

  return lines.join('\n');
}

// ── File Download Trigger ───────────────────────────────────────

/**
 * Triggers a browser download of the given content as a file.
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export and download audit log as JSON.
 */
export function downloadAuditJson(logger: AuditLogger, exportedBy: string) {
  const json = exportAsJson(logger, exportedBy);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadFile(json, `audit_log_${timestamp}.json`, 'application/json');
  logger.logAuditExported('JSON');
}

/**
 * Export and download audit log as CSV.
 */
export function downloadAuditCsv(logger: AuditLogger, exportedBy: string) {
  const csv = exportAsCsv(logger, exportedBy);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadFile(csv, `audit_log_${timestamp}.csv`, 'text/csv');
  logger.logAuditExported('CSV');
}

// ── Utility ─────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
