/**
 * Save/resume helper for the /tool workflow.
 *
 * Scope (per "Option B" decision, May 8, 2026):
 *   - Persists: file signatures (name/size/path), detection results, summary
 *   - Does NOT persist: file contents, metadata step entries (subject
 *     demographics, dataset description, defacing attestation), or anything
 *     after the metadata step.
 *
 * Storage: sessionStorage (clears when the browser tab closes).
 *   - Survives accidental clicks, refreshes, and crashes within the tab.
 *   - Does NOT survive the tab being closed, so no long-lived storage of
 *     anything sensitive on the user's machine.
 *
 * Restore flow: when the user drops files, we compare their signatures
 *   (name + size + relativePath) against the saved session. If they match,
 *   we re-attach the new File objects to the saved detection results and
 *   skip the detection step. If they don't match, we treat it as a fresh
 *   session and clear the saved one.
 */

import type { DetectionResult, DetectionSummary } from '../../types/detection';
import type { ScannedFile } from '../../types/files';

const STORAGE_KEY = 'neurogate-tool-session-v1';
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours; clear stale sessions

interface FileSignature {
  name: string;
  size: number;
  relativePath: string;
}

type PersistedDetectionResult = Omit<DetectionResult, 'file'>;

export interface PersistedSession {
  version: 1;
  savedAt: number;
  fileSignatures: FileSignature[];
  detectionResults: PersistedDetectionResult[];
  summary: DetectionSummary;
}

/** Persist the current detection state. Safe to call on every change. */
export function saveToolSession(
  detectionResults: DetectionResult[],
  summary: DetectionSummary,
): void {
  if (typeof sessionStorage === 'undefined') return;
  if (detectionResults.length === 0) return;
  try {
    const persisted: PersistedSession = {
      version: 1,
      savedAt: Date.now(),
      fileSignatures: detectionResults.map((r) => ({
        name: r.fileName,
        size: r.fileSize,
        relativePath: r.relativePath,
      })),
      detectionResults: detectionResults.map((r) => {
        // Strip the File object; it cannot be JSON-serialized.
        const { file, ...rest } = r;
        void file;
        return rest;
      }),
      summary,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // sessionStorage full or disabled; silently ignore.
  }
}

/** Read any saved session, or null if none / stale / invalid. */
export function loadToolSession(): PersistedSession | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const data = sessionStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data) as PersistedSession;
    if (parsed.version !== 1) return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Forget the saved session. */
export function clearToolSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Try to restore detection results from a saved session using newly
 * dropped files. Matches on name + size + relativePath.
 *
 * Returns the restored DetectionResult[] (with File objects re-attached)
 * if every saved file is present in the dropped batch and counts match,
 * otherwise returns null.
 */
export function trySessionRestore(
  scanned: ScannedFile[],
  saved: PersistedSession,
): DetectionResult[] | null {
  if (saved.fileSignatures.length !== scanned.length) return null;

  const fileMap = new Map<string, File>();
  for (const sf of scanned) {
    fileMap.set(`${sf.name}|${sf.size}|${sf.relativePath}`, sf.file);
  }

  const restored: DetectionResult[] = [];
  for (const r of saved.detectionResults) {
    const key = `${r.fileName}|${r.fileSize}|${r.relativePath}`;
    const file = fileMap.get(key);
    if (!file) return null;
    restored.push({ ...r, file });
  }
  return restored;
}

/** Format the saved-at timestamp as a relative phrase (e.g., "5 minutes ago"). */
export function formatSavedAt(savedAt: number): string {
  const ageMs = Date.now() - savedAt;
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}
