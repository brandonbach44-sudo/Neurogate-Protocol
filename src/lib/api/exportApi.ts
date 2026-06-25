/**
 * NeuroGate Export API Client
 *
 * When VITE_API_URL is set, large EDF/BDF files are uploaded to the
 * NeuroGate API server for streaming de-identification instead of
 * being loaded into browser memory (which fails for files > ~500 MB).
 *
 * When VITE_API_URL is not set, everything stays client-side (current
 * Vercel behavior — no change to small-file users).
 *
 * Usage:
 *   import { hasServerApi, serverDeidentifyEdf } from '../api/exportApi';
 *
 *   if (hasServerApi) {
 *     const { downloadUrl, shiftKey } = await serverDeidentifyEdf(file, opts);
 *   }
 */

// ── Config ────────────────────────────────────────────────────────────

/** True when the NeuroGate API server is configured. */
export const hasServerApi = Boolean(import.meta.env.VITE_API_URL);

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

// ── Types ─────────────────────────────────────────────────────────────

export interface ServerDeidentifyOptions {
  /** BIDS subject ID written into the EDF patient field (e.g. "sub-HUP001"). */
  subjectId: string;
  /** Days to shift all dates in the EDF header. */
  dateShiftDays: number;
}

export interface ServerDeidentifyResult {
  /** Unique ID assigned by the server — use for local /api/download/:id or S3 tracking. */
  id: string;
  /**
   * URL to download the de-identified EDF.
   * - Local mode: relative path `/api/download/:id` (prepend VITE_API_URL)
   * - S3 mode: presigned S3 URL (absolute, 1-hour expiry)
   */
  downloadUrl: string;
  /** Shift key for the audit log — never stored server-side, keep it safe. */
  shiftKey: {
    subjectId: string;
    dateShiftDays: number;
    originalDate: string;
    shiftedDate: string;
  };
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

// ── API calls ─────────────────────────────────────────────────────────

/**
 * Upload an EDF/BDF file to the server for streaming de-identification.
 *
 * The server reads only the first 256 bytes into memory, patches PHI,
 * and streams the rest through — no RAM spike regardless of file size.
 *
 * @param file           - The raw File object from the drag-drop or picker
 * @param opts           - Subject ID and date shift for de-identification
 * @param onProgress     - Optional upload progress callback
 */
export async function serverDeidentifyEdf(
  file: File,
  opts: ServerDeidentifyOptions,
  onProgress?: (p: UploadProgress) => void,
): Promise<ServerDeidentifyResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('subjectId', opts.subjectId);
  form.append('dateShiftDays', String(opts.dateShiftDays));

  // Use XMLHttpRequest so we can report upload progress.
  // fetch() does not expose upload progress natively.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/deidentify`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percent: Math.round((e.loaded / e.total) * 100),
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as ServerDeidentifyResult;
          // If the server returned a relative /api/download/:id path,
          // make it absolute so the browser can fetch it.
          if (data.downloadUrl.startsWith('/')) {
            data.downloadUrl = `${API_BASE}${data.downloadUrl}`;
          }
          resolve(data);
        } catch {
          reject(new Error('Server returned invalid JSON'));
        }
      } else {
        let detail = xhr.responseText;
        try { detail = JSON.parse(xhr.responseText).error ?? detail; } catch { /* ignore */ }
        reject(new Error(`Server error ${xhr.status}: ${detail}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error — could not reach the NeuroGate API server'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));

    xhr.send(form);
  });
}

/**
 * Ping the server health endpoint.
 * Returns true if the server is reachable and healthy.
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json() as { status: string };
    return data.status === 'ok';
  } catch {
    return false;
  }
}
