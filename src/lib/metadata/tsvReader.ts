/**
 * TSV Metadata Auto-Reader
 *
 * Detects and parses existing metadata files from the dropped folder:
 * - sessions.tsv → extract session dates and ages
 * - dataset_description.json → extract dataset metadata
 *
 * If these files exist in the user's data, we pre-fill the forms.
 * If not, the user fills everything in manually.
 */

import type { ScannedFile } from '../../types/files';
import type { SessionMetadata, DatasetDescription } from '../../types/metadata';
import type { Session } from '../../types/detection';

// ── TSV Parsing ───────────────────────────────────────────────────

/**
 * Parse a TSV string into an array of objects.
 * First row is headers, subsequent rows are data.
 */
function parseTsv(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t').map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, j) => {
      row[header] = values[j] || '';
    });
    rows.push(row);
  }

  return rows;
}

// ── Session Metadata Extraction ───────────────────────────────────

/**
 * Common column name variations for session-related fields.
 */
const SESSION_ID_COLUMNS = ['session_id', 'session', 'ses', 'ses_id', 'session_name'];
const ACQ_TIME_COLUMNS = ['acq_time', 'acquisition_time', 'date', 'scan_date', 'acq_date', 'acquisition_date'];
const AGE_COLUMNS = ['age', 'age_at_scan', 'age_years', 'age_at_visit', 'participant_age'];

/**
 * Try to find a column by checking multiple possible names.
 */
function findColumn(row: Record<string, string>, possibleNames: string[]): string | null {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== '') {
      return row[name];
    }
  }
  return null;
}

/**
 * Map a raw session name to our standard Session type.
 */
function normalizeSessionName(raw: string): Session | null {
  const lower = raw.toLowerCase().replace(/[-_\s]/g, '');

  if (lower.includes('preimplant') || lower.includes('preop') || lower.includes('presurg') || lower === 'ses1' || lower === 'session1' || lower === 'baseline') {
    return 'ses-preimplant';
  }
  if (lower.includes('postimplant') || lower.includes('implant') || lower.includes('monitoring') || lower === 'ses2' || lower === 'session2') {
    return 'ses-postimplant';
  }
  if (lower.includes('postsurg') || lower.includes('postop') || lower.includes('resection') || lower === 'ses3' || lower === 'session3') {
    return 'ses-postsurgery';
  }

  return null;
}

/**
 * Try to extract session metadata from a TSV file.
 * Returns an array of SessionMetadata if successful, null if the file
 * doesn't appear to contain session data.
 */
export async function extractSessionMetadata(file: File): Promise<SessionMetadata[] | null> {
  try {
    const content = await file.text();
    const rows = parseTsv(content);

    if (rows.length === 0) return null;

    const sessions: SessionMetadata[] = [];

    for (const row of rows) {
      const rawSessionId = findColumn(row, SESSION_ID_COLUMNS);
      const acqTime = findColumn(row, ACQ_TIME_COLUMNS);
      const age = findColumn(row, AGE_COLUMNS);

      if (rawSessionId) {
        const sessionId = normalizeSessionName(rawSessionId);
        if (sessionId) {
          sessions.push({
            sessionId,
            acqTime: acqTime || '',
            age: age || '',
          });
        }
      }
    }

    return sessions.length > 0 ? sessions : null;
  } catch {
    return null;
  }
}

// ── Dataset Description Extraction ────────────────────────────────

/**
 * Try to parse a dataset_description.json file.
 * Returns a DatasetDescription if successful, null otherwise.
 */
export async function extractDatasetDescription(file: File): Promise<Partial<DatasetDescription> | null> {
  try {
    const content = await file.text();
    const json = JSON.parse(content);

    const result: Partial<DatasetDescription> = {};

    if (json.Name) result.name = json.Name;
    if (json.BIDSVersion) result.bidsVersion = json.BIDSVersion;
    if (json.DatasetType) result.datasetType = json.DatasetType;
    if (json.Authors && Array.isArray(json.Authors)) result.authors = json.Authors;
    if (json.Acknowledgements) result.acknowledgements = json.Acknowledgements;
    if (json.Funding && Array.isArray(json.Funding)) result.funding = json.Funding;

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

// ── Sidecar JSON Helpers ──────────────────────────────────────────

/**
 * Extract session ID from a file path (matches the first ses-* segment).
 */
function sessionFromPath(relativePath: string): string | null {
  const match = relativePath.match(/\b(ses-[a-zA-Z0-9]+)\b/i);
  return match ? match[1].toLowerCase() : null;
}

// ── Auto-Detection from Scanned Files ─────────────────────────────

export interface AutoFilledMetadata {
  /** Session metadata found per subject group */
  sessionsBySubject: Map<string, SessionMetadata[]>;
  /** Dataset description if found */
  datasetDescription: Partial<DatasetDescription> | null;
  /** Which files were used for auto-fill (for transparency) */
  sourceFiles: string[];
}

/**
 * Scan the dropped files for any metadata files that can be
 * used to pre-fill the forms. Looks for:
 * - *sessions.tsv files (per-subject session data)
 * - dataset_description.json (dataset-level metadata)
 */
export async function autoFillFromDroppedFiles(
  files: ScannedFile[],
  subjectGroups: Map<string, ScannedFile[]>,
): Promise<AutoFilledMetadata> {
  const result: AutoFilledMetadata = {
    sessionsBySubject: new Map(),
    datasetDescription: null,
    sourceFiles: [],
  };

  for (const file of files) {
    const lower = file.name.toLowerCase();

    // Look for sessions.tsv files
    if (lower.includes('session') && lower.endsWith('.tsv')) {
      const sessions = await extractSessionMetadata(file.file);
      if (sessions) {
        // Figure out which subject this sessions.tsv belongs to
        // by checking which subject group folder it's in
        for (const [group, groupFiles] of subjectGroups) {
          if (groupFiles.some(gf => gf.relativePath === file.relativePath)) {
            result.sessionsBySubject.set(group, sessions);
            result.sourceFiles.push(file.relativePath);
            break;
          }
        }
        // If we couldn't match to a group, store under the file's top folder
        if (!result.sourceFiles.includes(file.relativePath)) {
          const topFolder = file.relativePath.split('/')[0] || 'unknown';
          result.sessionsBySubject.set(topFolder, sessions);
          result.sourceFiles.push(file.relativePath);
        }
      }
    }

    // Look for dataset_description.json
    if (lower === 'dataset_description.json') {
      const desc = await extractDatasetDescription(file.file);
      if (desc) {
        result.datasetDescription = desc;
        result.sourceFiles.push(file.relativePath);
      }
    }
  }

  // Second pass: fill acqTime from dcm2niix JSON sidecars where still missing.
  // dcm2niix emits AcquisitionDateTime in ISO 8601; we use it directly.
  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.json') || lower === 'dataset_description.json') continue;

    try {
      const content = await file.file.text();
      const json = JSON.parse(content) as Record<string, unknown>;
      const acqDateTime = json['AcquisitionDateTime'];
      if (typeof acqDateTime !== 'string' || !acqDateTime) continue;

      const sesRaw = sessionFromPath(file.relativePath);
      if (!sesRaw) continue;
      const sessionId = normalizeSessionName(sesRaw);
      if (!sessionId) continue;

      for (const [group, groupFiles] of subjectGroups) {
        if (!groupFiles.some(gf => gf.relativePath === file.relativePath)) continue;

        const sessions = result.sessionsBySubject.get(group) ?? [];
        const existing = sessions.find(s => s.sessionId === sessionId);
        if (existing && !existing.acqTime) {
          existing.acqTime = acqDateTime;
        } else if (!existing) {
          sessions.push({ sessionId, acqTime: acqDateTime, age: '' });
          result.sessionsBySubject.set(group, sessions);
        }
        break;
      }
    } catch {
      // Unparseable JSON — skip
    }
  }

  return result;
}
