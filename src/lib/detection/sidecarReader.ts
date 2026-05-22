/**
 * JSON Sidecar Content Reader
 *
 * dcm2niix writes a .json sidecar next to every converted .nii / .nii.gz.
 * That sidecar carries the original scanner-assigned scan name in fields
 * like SeriesDescription and ProtocolName. Those names are frequently
 * lost or genericized in the NIfTI filename itself.
 *
 * Example: a file named "sub-X_10.nii" reveals nothing, but its sibling
 * "sub-X_10.json" contains
 *     "SeriesDescription": "SPIRAL_V20_HCP_ASL"
 * which clearly identifies it as a perfusion / ASL scan.
 *
 * This module reads those sidecars up front so the detection engine can
 * use their text as a high-signal keyword source. Reading is async (the
 * File API is async), so it happens before the synchronous detection
 * pipeline runs and the result is passed in as a lookup map.
 */

import type { ScannedFile } from '../../types/files';

/**
 * Fields in a dcm2niix JSON sidecar that describe the scan in
 * human-readable terms. SeriesDescription and ProtocolName are the
 * scanner operator's labels; the sequence fields add fallback signal.
 */
const SCAN_NAME_FIELDS = [
  'SeriesDescription',
  'ProtocolName',
  'SequenceName',
  'ScanningSequence',
  'SequenceVariant',
  'ImageType',
];

/** What a paired sidecar tells us about a data file. */
export interface SidecarInfo {
  /** Combined scan-name text pulled from the sidecar's descriptive fields. */
  scanText: string;
  /** The sidecar file name, used in audit / reason messages. */
  sidecarName: string;
}

/**
 * Strip a data-file extension to get the base name used for sidecar
 * pairing. dcm2niix names a scan and its sidecar identically except for
 * the extension (e.g. "sub-X_T1w.nii" <-> "sub-X_T1w.json"), so the base
 * name is the join key.
 */
export function getSidecarBaseName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.nii.gz')) return fileName.slice(0, -7);
  if (lower.endsWith('.json')) return fileName.slice(0, -5);
  const lastDot = fileName.lastIndexOf('.');
  return lastDot === -1 ? fileName : fileName.substring(0, lastDot);
}

/**
 * Read every JSON sidecar in the dropped file set and return a map keyed
 * by base name (filename minus extension) -> extracted scan-name text.
 *
 * Sidecars are tiny (a few KB), so reading them all in parallel is cheap
 * even for large datasets. Malformed or unreadable JSON is skipped
 * silently, and the data file is still detected from its name and folder
 * like any other file.
 */
export async function readJsonSidecars(
  files: ScannedFile[],
): Promise<Map<string, SidecarInfo>> {
  const map = new Map<string, SidecarInfo>();

  const jsonFiles = files.filter(f => f.name.toLowerCase().endsWith('.json'));

  await Promise.all(
    jsonFiles.map(async (jf) => {
      try {
        const text = await jf.file.text();
        const parsed = JSON.parse(text) as Record<string, unknown>;

        const parts: string[] = [];
        for (const field of SCAN_NAME_FIELDS) {
          const val = parsed[field];
          if (typeof val === 'string') {
            parts.push(val);
          } else if (Array.isArray(val)) {
            parts.push(val.filter((v): v is string => typeof v === 'string').join(' '));
          }
        }

        const scanText = parts.join(' ').trim();
        if (scanText) {
          map.set(getSidecarBaseName(jf.name), {
            scanText,
            sidecarName: jf.name,
          });
        }
      } catch {
        // Malformed JSON or unreadable file; skip, not fatal.
      }
    }),
  );

  return map;
}
