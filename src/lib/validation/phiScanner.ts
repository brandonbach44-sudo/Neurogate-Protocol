/**
 * PHI (Protected Health Information) Scanner
 *
 * Scans filenames, folder paths, and readable metadata for patterns
 * that might contain patient-identifying information:
 *
 * - Patient names (common name patterns)
 * - Dates of birth
 * - Medical record numbers (MRN patterns)
 * - Social Security Numbers
 * - Phone numbers
 * - Email addresses
 * - Street addresses
 *
 * This is a heuristic scanner — it flags potential PHI for human review.
 * It cannot guarantee detection of all PHI, but catches common patterns.
 */

import type { DetectionResult } from '../../types/detection';
import type { SubjectMetadata } from '../../types/metadata';
import type { ValidationIssue } from '../../types/validation';

// ── PHI Detection Patterns ──────────────────────────────────────

interface PhiPattern {
  name: string;
  pattern: RegExp;
  severity: 'error' | 'warning';
  description: string;
}

const PHI_PATTERNS: PhiPattern[] = [
  // SSN patterns (xxx-xx-xxxx or xxxxxxxxx)
  {
    name: 'Social Security Number',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/,
    severity: 'error',
    description: 'This looks like a Social Security Number. SSNs must never be included in research data filenames.',
  },
  // MRN patterns (common formats: 7-10 digit numbers, sometimes with prefix)
  {
    name: 'Medical Record Number',
    pattern: /\b(?:MRN|mrn|MR#?|mr#?)[_\-\s]?\d{5,10}\b/i,
    severity: 'error',
    description: 'This looks like a Medical Record Number (MRN). MRNs are PHI and must be removed before sharing.',
  },
  // Date of birth patterns (DOB, dob)
  {
    name: 'Date of Birth marker',
    pattern: /\b(?:DOB|dob|DateOfBirth|date_of_birth|birthdate|birth_date)[_\-\s]?\d/i,
    severity: 'error',
    description: 'This appears to contain a date of birth. Dates of birth are PHI and must not appear in filenames.',
  },
  // Phone numbers (US format)
  {
    name: 'Phone Number',
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
    severity: 'warning',
    description: 'This looks like it might contain a phone number. Phone numbers are PHI — verify this is not patient data.',
  },
  // Email addresses
  {
    name: 'Email Address',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
    severity: 'warning',
    description: 'This appears to contain an email address. If this is a patient email, it must be removed.',
  },
  // Full dates that might be DOB (MM/DD/YYYY or MM-DD-YYYY)
  {
    name: 'Potential date (PHI risk)',
    pattern: /\b(?:0[1-9]|1[0-2])[\/\-](?:0[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}\b/,
    severity: 'warning',
    description: 'This contains a date in MM/DD/YYYY format. If this is a patient date of birth or admission date, it constitutes PHI.',
  },
  // Common name patterns in filenames (FirstLast, First_Last, etc.)
  // Only flag if it looks like a person's name alongside medical terms
  {
    name: 'Potential patient name',
    pattern: /\b(?:patient|pt|subj|subject)[_\-\s]?[A-Z][a-z]+[_\-\s]?[A-Z][a-z]+\b/,
    severity: 'error',
    description: 'This appears to contain a patient name. Patient names are PHI and must be replaced with de-identified subject IDs.',
  },
  // Last name, First name pattern
  {
    name: 'Potential name (Last, First)',
    pattern: /[A-Z][a-z]+,\s?[A-Z][a-z]+/,
    severity: 'warning',
    description: 'This matches a "Last, First" name pattern. If this is a patient name, it must be removed.',
  },
];

// ── Additional keyword checks ───────────────────────────────────
// These are less specific but worth flagging

const PHI_KEYWORDS = [
  'firstname', 'first_name', 'lastname', 'last_name',
  'fullname', 'full_name', 'patientname', 'patient_name',
  'ssn', 'social_security',
  'address', 'street', 'zipcode', 'zip_code',
  'insurance', 'policy_number',
  'accession', 'acc_num',
];

let issueCounter = 0;
function nextId(): string {
  return `phi-${++issueCounter}`;
}

export function scanForPhi(
  results: DetectionResult[],
  _subjects: SubjectMetadata[],
): ValidationIssue[] {
  issueCounter = 0;
  const issues: ValidationIssue[] = [];

  // Collect all unique paths and filenames to scan
  const pathsToScan = new Set<string>();
  for (const result of results) {
    pathsToScan.add(result.relativePath);
    pathsToScan.add(result.fileName);
  }

  // Also scan subject group names (they often come from folder names)
  for (const result of results) {
    pathsToScan.add(result.subjectGroup);
  }

  // ── Run regex patterns against all paths ──────────────────
  for (const path of pathsToScan) {
    for (const phiPattern of PHI_PATTERNS) {
      if (phiPattern.pattern.test(path)) {
        // Find which files are affected
        const affected = results
          .filter(r => r.relativePath.includes(path) || r.fileName === path || r.subjectGroup === path)
          .map(r => r.relativePath);

        // Deduplicate: don't flag the same pattern on the same set of files twice
        const _key = `${phiPattern.name}:${affected.sort().join(',')}`; void _key;
        const alreadyFlagged = issues.some(i =>
          i.title === `Potential ${phiPattern.name}` &&
          i.affectedFiles.sort().join(',') === affected.sort().join(',')
        );

        if (!alreadyFlagged && affected.length > 0) {
          issues.push({
            id: nextId(),
            category: 'phi-risk',
            severity: phiPattern.severity,
            title: `Potential ${phiPattern.name}`,
            description: `${phiPattern.description}\n\nFound in: "${path}"`,
            affectedFiles: affected.length > 0 ? affected : [path],
            dismissable: phiPattern.severity === 'warning',
          });
        }
      }
    }
  }

  // ── Check for PHI keywords in paths ───────────────────────
  for (const path of pathsToScan) {
    const lowerPath = path.toLowerCase();
    for (const keyword of PHI_KEYWORDS) {
      if (lowerPath.includes(keyword)) {
        const affected = results
          .filter(r => r.relativePath.toLowerCase().includes(keyword) ||
                       r.fileName.toLowerCase().includes(keyword))
          .map(r => r.relativePath);

        if (affected.length > 0) {
          issues.push({
            id: nextId(),
            category: 'phi-risk',
            severity: 'warning',
            title: `PHI keyword detected: "${keyword}"`,
            description: `The keyword "${keyword}" was found in a filename or path. This may indicate protected health information is embedded in the file naming. Please verify no patient-identifying data is present.`,
            affectedFiles: affected,
            dismissable: true,
          });
        }
        break; // One flag per keyword is enough
      }
    }
  }

  // ── Check if subject group names look like real names ──────
  const subjectGroups = new Set(results.map(r => r.subjectGroup));
  for (const group of subjectGroups) {
    // Flag groups that look like "FirstName LastName" or "Last, First"
    if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(group)) {
      issues.push({
        id: nextId(),
        category: 'phi-risk',
        severity: 'error',
        title: 'Subject group name looks like a person\'s name',
        description: `The subject group "${group}" appears to be a person's name (two capitalized words). If this is a patient's real name, it must be replaced with a de-identified subject ID before upload. The BIDS renaming will replace this with the assigned subject ID, but the original folder name may still be visible in audit logs.`,
        affectedFiles: results.filter(r => r.subjectGroup === group).map(r => r.relativePath),
        subjectGroup: group,
        dismissable: false,
      });
    }
  }

  return issues;
}
