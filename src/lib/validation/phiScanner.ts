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
import { isJsonSidecarFile, BLANK_STRING_FIELDS, DATE_FIELDS } from '../deidentify/jsonSidecarDeidentifier';

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
    name: 'date (PHI risk)',
    pattern: /\b(?:0[1-9]|1[0-2])[\/\-](?:0[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}\b/,
    severity: 'warning',
    description: 'This contains a date in MM/DD/YYYY format. If this is a patient date of birth or admission date, it constitutes PHI.',
  },
  // Common name patterns in filenames (FirstLast, First_Last, etc.)
  // Only flag if it looks like a person's name alongside medical terms
  {
    name: 'patient name',
    pattern: /\b(?:patient|pt|subj|subject)[_\-\s]?[A-Z][a-z]+[_\-\s]?[A-Z][a-z]+\b/,
    severity: 'error',
    description: 'This appears to contain a patient name. Patient names are PHI and must be replaced with de-identified subject IDs.',
  },
  // Last name, First name pattern
  {
    name: 'name (Last, First)',
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

/**
 * Normalize underscores to hyphens before testing PHI_PATTERNS regexes.
 * Nearly every pattern in PHI_PATTERNS relies on \b word-boundary anchors,
 * but JavaScript's \b treats underscore as a word character -- so a match
 * sitting immediately next to an underscore (extremely common in real
 * filenames, e.g. "123-45-6789_notes.nii.gz") silently fails to trigger
 * the boundary and the whole match is missed. Hyphen is already a
 * non-word character, so swapping preserves matchability without
 * otherwise changing what the patterns can match. Mirrors the identical
 * fix already used in filenameDetector.ts's normalizeForKeywords for the
 * same underlying JS regex quirk. Only used for the regex test itself --
 * all reporting still uses the original, unmodified path/filename/value.
 * Found via adversarial validation testing 2026-08-02: an SSN-pattern
 * filename immediately followed by "_" completely evaded detection.
 */
function normalizeForPhiMatching(text: string): string {
  return text.replace(/_/g, '-');
}

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
    const normalizedPath = normalizeForPhiMatching(path);
    for (const phiPattern of PHI_PATTERNS) {
      if (phiPattern.pattern.test(normalizedPath)) {
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

// ── Sidecar JSON content scanning ───────────────────────────────
//
// deidentifyJsonSidecar() (see jsonSidecarDeidentifier.ts) blanks a fixed
// list of known-identifying fields and shifts known date fields, but it
// deliberately leaves free-text descriptive fields (SeriesDescription,
// ProtocolName, ImageComments, etc.) untouched -- those are needed for
// BIDS documentation and can't be blanked outright. If a scanner operator
// typed a patient name or MRN into one of those free-text fields, nothing
// in the automatic de-identification pipeline would catch it.
//
// This scans every string value in every sidecar JSON (skipping the
// fields the de-identifier already handles) against the same PHI_PATTERNS
// and PHI_KEYWORDS used for filenames. Reading sidecar files is async
// (File.text()), so this is a separate async entry point rather than
// folded into the synchronous scanForPhi() above.

const FIELDS_HANDLED_BY_DEIDENTIFIER = new Set<string>([
  ...BLANK_STRING_FIELDS,
  ...DATE_FIELDS,
]);

// ── Bare-name heuristic for sidecar free text ───────────────────
//
// PHI_PATTERNS' name checks ("patient_John_Smith", "Smith, John") require
// a keyword or comma trigger, because that's how names show up in
// filenames. Sidecar free text is prose ("John Smith Brain MRI"), so a
// name can appear as a plain two-word Title Case phrase with no trigger
// at all. This checks for that pattern directly, but only in sidecar
// content -- doing this on filenames/paths would be far too noisy.
//
// False-positive risk: legitimate scan descriptions are also frequently
// Title Case ("Axial Flair", "Post Contrast"). SCAN_VOCAB is a stoplist
// of common radiology/imaging terms; a two-word match is only flagged if
// NEITHER word is in the stoplist. This is a heuristic, not a guarantee --
// uncommon scan vocabulary not in this list can still produce a false
// positive, and an uncommon real name can still slip through if either
// word happens to collide with the stoplist. Flagged as a dismissable
// warning (not an error) for that reason -- a human reviews it either way.

const SCAN_VOCAB = new Set([
  'axial', 'sagittal', 'coronal', 'oblique', 'volumetric', 'isotropic',
  'flair', 'weighted', 'contrast', 'enhanced', 'post', 'pre', 'gad',
  'fat', 'water', 'sat', 'saturation', 'suppression', 'diffusion',
  'perfusion', 'spin', 'echo', 'gradient', 'fast', 'spoiled', 'recalled',
  'interpolated', 'brain', 'spine', 'cervical', 'thoracic', 'lumbar',
  'head', 'neck', 'chest', 'abdomen', 'pelvis', 'whole', 'body',
  'research', 'study', 'clinical', 'protocol', 'standard', 'high',
  'resolution', 'thin', 'thick', 'slice', 'localizer', 'scout', 'survey',
  'calibration', 'reference', 'series', 'sequence', 'multi', 'single',
  'shot', 'turbo', 'susceptibility', 'imaging', 'angiography',
  'venography', 'tensor', 'functional', 'resting', 'state', 'task',
  'motor', 'language', 'memory', 'field', 'map', 'phase', 'magnitude',
  'short', 'long', 'inversion', 'recovery', 'dark', 'bright', 'blood',
  'vessel', 'wall', 'time', 'flight', 'dynamic', 'static', 'anatomical',
  'structural', 'localiser', 'repeat', 'redo', 'rescan', 'motion',
  'corrected', 'raw', 'processed', 'derived', 'left', 'right', 'bilateral',
  'anterior', 'posterior', 'superior', 'inferior', 'medial', 'lateral',
]);

/** True if a word is common scan/imaging vocabulary, not likely a name token. */
function isScanVocabWord(word: string): boolean {
  return SCAN_VOCAB.has(word.toLowerCase());
}

/** Find bare "Firstname Lastname"-shaped phrases not explained by scan vocabulary. */
function findBareNameCandidates(value: string): string[] {
  const matches: string[] = [];
  const re = /\b([A-Z][a-z]{1,15})\s+([A-Z][a-z]{1,15})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const [full, w1, w2] = m;
    if (isScanVocabWord(w1) || isScanVocabWord(w2)) continue;
    matches.push(full);
  }
  return matches;
}

/** Recursively collect {path, value} for every string in a parsed JSON value. */
function collectStringValues(
  value: unknown,
  path: string,
  out: { path: string; value: string }[],
): void {
  if (typeof value === 'string') {
    if (value.trim().length > 0) out.push({ path, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectStringValues(v, `${path}[${i}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (FIELDS_HANDLED_BY_DEIDENTIFIER.has(key)) continue; // already de-identified on export
      collectStringValues(v, path ? `${path}.${key}` : key, out);
    }
  }
}

/**
 * Scan sidecar JSON file content (not just filenames) for PHI patterns.
 * Complements scanForPhi(), which only looks at filenames/paths.
 */
export async function scanSidecarContentForPhi(
  results: DetectionResult[],
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const sidecarResults = results.filter(r => isJsonSidecarFile(r.fileName));
  if (sidecarResults.length === 0) return issues;

  const scans = await Promise.all(
    sidecarResults.map(async (result) => {
      try {
        const text = await result.file.text();
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const strings: { path: string; value: string }[] = [];
        collectStringValues(parsed, '', strings);
        return { result, strings };
      } catch {
        return { result, strings: [] as { path: string; value: string }[] };
      }
    }),
  );

  for (const { result, strings } of scans) {
    for (const { path, value } of strings) {
      const normalizedValue = normalizeForPhiMatching(value);
      for (const phiPattern of PHI_PATTERNS) {
        if (phiPattern.pattern.test(normalizedValue)) {
          issues.push({
            id: nextId(),
            category: 'phi-risk',
            severity: phiPattern.severity,
            title: `Potential ${phiPattern.name} in sidecar JSON`,
            description: `${phiPattern.description}\n\nFound in field "${path}" of ${result.fileName}. This field is a free-text descriptive field and is NOT touched by automatic de-identification -- if this is patient data, correct it in the source file before re-uploading.`,
            affectedFiles: [result.relativePath],
            dismissable: phiPattern.severity === 'warning',
          });
          break; // one flag per pattern per field is enough
        }
      }

      const lowerValue = value.toLowerCase();
      for (const keyword of PHI_KEYWORDS) {
        if (lowerValue.includes(keyword)) {
          issues.push({
            id: nextId(),
            category: 'phi-risk',
            severity: 'warning',
            title: `PHI keyword detected in sidecar JSON: "${keyword}"`,
            description: `The keyword "${keyword}" was found in field "${path}" of ${result.fileName}. This is a free-text field not covered by automatic de-identification. Please verify no patient-identifying data is present.`,
            affectedFiles: [result.relativePath],
            dismissable: true,
          });
          break;
        }
      }

      const bareNames = findBareNameCandidates(value);
      for (const candidate of bareNames) {
        issues.push({
          id: nextId(),
          category: 'phi-risk',
          severity: 'warning',
          title: 'Potential name in sidecar text (unconfirmed)',
          description: `The phrase "${candidate}" in field "${path}" of ${result.fileName} looks like it could be a person's name. This is a low-confidence heuristic check -- it also fires on uncommon scan-vocabulary phrases -- so review before dismissing. This field is not covered by automatic de-identification.`,
          affectedFiles: [result.relativePath],
          dismissable: true,
        });
      }
    }
  }

  return issues;
}
