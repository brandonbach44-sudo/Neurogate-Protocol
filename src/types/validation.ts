/**
 * Types for the validation engine (Step 4).
 *
 * The validation engine runs after metadata is collected and checks:
 * 1. BIDS structure compliance (folder hierarchy, naming)
 * 2. PHI detection (filenames, metadata with potential patient info)
 * 3. Required files per session
 * 4. Cross-session consistency
 */

// ── Validation Categories ─────────────────────────────────────────

export type ValidationCategory =
  | 'bids-structure'    // Folder/file naming doesn't match BIDS
  | 'phi-risk'          // Potential protected health information detected
  | 'required-files'    // Missing required files for a session
  | 'cross-session'     // Inconsistencies across sessions for a subject
  | 'file-format'       // File format issues (uncompressed NIfTI, DICOM, etc.)
  | 'metadata'          // Missing or invalid metadata fields
  | 'defacing';         // Structural MRI defacing concerns

// ── Severity Levels ───────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning' | 'info';

// ── Individual Validation Issue ───────────────────────────────────

export interface ValidationIssue {
  /** Unique ID for this issue (for UI keying) */
  id: string;
  /** Which validator produced this */
  category: ValidationCategory;
  /** How serious is this */
  severity: ValidationSeverity;
  /** Short summary (shown in the table) */
  title: string;
  /** Detailed explanation with guidance on how to fix */
  description: string;
  /** Which file(s) this relates to (relative paths) */
  affectedFiles: string[];
  /** Which subject group this relates to (if applicable) */
  subjectGroup?: string;
  /** Which session this relates to (if applicable) */
  session?: string;
  /** Can the user dismiss this issue? (warnings/info only) */
  dismissable: boolean;
}

// ── Validation Report ─────────────────────────────────────────────

export interface ValidationReport {
  /** When the validation was run */
  timestamp: string;
  /** All issues found */
  issues: ValidationIssue[];
  /** Quick counts by severity */
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** Overall pass/fail — fails if any errors exist */
  passed: boolean;
  /** Breakdown by category */
  categoryCounts: Record<ValidationCategory, number>;
}

// ── Dismissed Issues Tracking ─────────────────────────────────────

export interface DismissedIssue {
  issueId: string;
  dismissedAt: string;
  dismissedBy: string;
  reason?: string;
}

// ── Helper to create an empty report ──────────────────────────────

export function createEmptyReport(): ValidationReport {
  return {
    timestamp: new Date().toISOString(),
    issues: [],
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    passed: true,
    categoryCounts: {
      'bids-structure': 0,
      'phi-risk': 0,
      'required-files': 0,
      'cross-session': 0,
      'file-format': 0,
      'metadata': 0,
      'defacing': 0,
    },
  };
}

/** Finalize a report by computing counts from issues */
export function finalizeReport(issues: ValidationIssue[]): ValidationReport {
  const report = createEmptyReport();
  report.issues = issues;

  for (const issue of issues) {
    if (issue.severity === 'error') report.errorCount++;
    else if (issue.severity === 'warning') report.warningCount++;
    else report.infoCount++;

    report.categoryCounts[issue.category]++;
  }

  report.passed = report.errorCount === 0;
  return report;
}
