import type { FileLike } from './fileLike';

/** Represents a single file from the user's dropped folder (web) or a
 * scanned local directory (CLI/desktop) -- see types/fileLike.ts. */
export interface ScannedFile {
  /** Relative path within the dropped folder (e.g., "patient1/ses-preimplant/anat/T1w.nii.gz") */
  relativePath: string;
  /** File name only */
  name: string;
  /** File size in bytes */
  size: number;
  /** The underlying file for later processing -- a browser File on web, a NodeFileAdapter on CLI/desktop. */
  file: FileLike;
}

/** Format file sizes for display */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
