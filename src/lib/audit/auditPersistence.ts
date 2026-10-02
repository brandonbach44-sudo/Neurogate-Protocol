/**
 * Keeps the GUI audit log across a reload.
 *
 * The log is saved to sessionStorage (tab storage) on every change, the
 * same place as the saved Mapping progress (lib/session/toolSession.ts),
 * and read back when the app starts. Tab storage is cleared when the
 * browser tab or the desktop app is closed, so a saved log never
 * outlives the app session it belongs to. The log holds original file
 * names, like the saved Mapping progress, so it stays on this computer.
 *
 * Saving is skipped silently if storage is unavailable or full; the log
 * itself is unaffected and can still be exported.
 */

import type { AuditLog } from '../../types/audit';

const STORAGE_KEY = 'neurogate-audit-log-v1';

export function saveAuditLog(log: AuditLog): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(log));
    return true;
  } catch {
    return false;
  }
}

/** The saved log, or null if there isn't one or it doesn't parse. */
export function loadAuditLog(): AuditLog | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuditLog;
    if (typeof parsed?.sessionStarted !== 'string' || !Array.isArray(parsed.entries)) return null;
    const valid = parsed.entries.every(e =>
      e && typeof e.id === 'number' && typeof e.timestamp === 'string' &&
      typeof e.action === 'string' && typeof e.summary === 'string');
    return valid ? parsed : null;
  } catch {
    return null;
  }
}
