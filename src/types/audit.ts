/**
 * Types for the ALCOA+ audit log.
 *
 * ALCOA+ requires audit entries to be:
 *   A — Attributable (who did it)
 *   L — Legible (clearly readable)
 *   C — Contemporaneous (recorded at the time)
 *   O — Original (first recording)
 *   A — Accurate (correct and truthful)
 *   + Complete, Consistent, Enduring, Available
 *
 * Every significant action in the wizard generates an audit entry
 * with a timestamp, actor, action type, and details.
 */

// ── Action Categories ─────────────────────────────────────────

export type AuditAction =
  // File scanning
  | 'files-scanned'           // User dropped files, scanning completed
  | 'session-restored'        // Tool restored a saved session from sessionStorage
  // Detection
  | 'detection-completed'     // Auto-detection engine finished
  // User corrections in mapping table
  | 'session-corrected'       // User changed a file's session
  | 'modality-corrected'      // User changed a file's modality
  | 'subject-corrected'       // User changed a file's subject group
  | 'bulk-session-applied'    // User bulk-applied a session
  | 'bulk-modality-applied'   // User bulk-applied a modality
  // Metadata
  | 'institution-configured'  // User set institution prefix/starting number
  | 'subject-metadata-entered' // User entered session dates/ages for a subject
  | 'dataset-description-entered' // User filled in dataset description
  | 'defacing-attested'       // User confirmed defacing attestation
  | 'defacing-revoked'        // User unchecked defacing attestation
  // Validation
  | 'validation-run'          // Validation engine executed
  | 'validation-issue-dismissed' // User dismissed a warning/info issue
  // Upload (future)
  | 'upload-started'          // Upload process initiated
  | 'upload-completed'        // Upload finished successfully
  | 'upload-failed'           // Upload failed
  // Export
  | 'validation-passed'       // Validation passed, moving to export
  | 'export-completed'        // BIDS dataset exported as ZIP
  | 'audit-log-exported';     // User exported the audit log itself

// ── Single Audit Entry ────────────────────────────────────────

export interface AuditEntry {
  /** Auto-incrementing ID */
  id: number;
  /** ISO 8601 timestamp when the action occurred */
  timestamp: string;
  /** Who performed the action (username or "system") */
  actor: string;
  /** What action was performed */
  action: AuditAction;
  /** Short human-readable description */
  summary: string;
  /** Structured details (varies by action type) */
  details: Record<string, unknown>;
}

// ── Full Audit Log ────────────────────────────────────────────

export interface AuditLog {
  /** When this audit session started */
  sessionStarted: string;
  /** Tool version identifier */
  toolVersion: string;
  /** All entries in chronological order */
  entries: AuditEntry[];
}

// ── Export Formats ────────────────────────────────────────────

export interface AuditExportHeader {
  exportedAt: string;
  exportedBy: string;
  sessionStarted: string;
  toolVersion: string;
  totalEntries: number;
  /** Summary counts by action type */
  actionSummary: Record<string, number>;
}

// ── Factory ───────────────────────────────────────────────────

export function createAuditLog(): AuditLog {
  return {
    sessionStarted: new Date().toISOString(),
    toolVersion: '1.0.0-alpha',
    entries: [],
  };
}
