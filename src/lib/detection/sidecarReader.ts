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

/**
 * Date fields dcm2niix may write into a sidecar, in preference order.
 * AcquisitionDateTime is most precise (includes time-of-day, usually an
 * ISO-ish string); StudyDate and SeriesDate are DICOM-format plain dates
 * (YYYYMMDD, no separators, no time). Used by the Custom timepoints
 * date-cluster detector (dateClusterDetector.ts) -- not currently used
 * for anything else. See
 * Documents/Phase1b_Custom_Timepoint_Detection_Spec.md Section 4.
 */
const DATE_FIELDS = ['AcquisitionDateTime', 'StudyDate', 'SeriesDate'];

/**
 * Parse a DICOM-derived date value into a real Date, handling both the
 * ISO-ish AcquisitionDateTime strings dcm2niix writes and the plain
 * YYYYMMDD strings used by StudyDate/SeriesDate. Returns null if the
 * value isn't a usable date (missing, malformed, or clearly a
 * de-identified placeholder like "19000101").
 */
function parseSidecarDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();

  // Plain DICOM date: YYYYMMDD (8 digits, no separators, no time).
  if (/^\d{8}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(4, 6));
    const day = Number(trimmed.slice(6, 8));
    if (year < 1990) return null; // de-identified placeholder (e.g. "19000101")
    const date = new Date(year, month - 1, day);
    return isNaN(date.getTime()) ? null : date;
  }

  // ISO-ish AcquisitionDateTime, e.g. "2026-05-27T14:32:00" or with offset.
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) return null;
  if (date.getFullYear() < 1990) return null;
  return date;
}

/** What a paired sidecar tells us about a data file. */
export interface SidecarInfo {
  /** Combined scan-name text pulled from the sidecar's descriptive fields. */
  scanText: string;
  /** The sidecar file name, used in audit / reason messages. */
  sidecarName: string;
  /**
   * Acquisition date parsed from AcquisitionDateTime / StudyDate /
   * SeriesDate (first present, in that order). Null if none of those
   * fields were present or parseable. Used only by the Custom timepoints
   * date-cluster detector -- unrelated to the existing scan-name text
   * matching this reader was originally built for.
   */
  acquisitionDate: Date | null;
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

        let acquisitionDate: Date | null = null;
        for (const field of DATE_FIELDS) {
          acquisitionDate = parseSidecarDate(parsed[field]);
          if (acquisitionDate) break;
        }

        const scanText = parts.join(' ').trim();
        if (scanText || acquisitionDate) {
          map.set(getSidecarBaseName(jf.name), {
            scanText,
            sidecarName: jf.name,
            acquisitionDate,
          });
        }
      } catch {
        // Malformed JSON or unreadable file; skip, not fatal.
      }
    }),
  );

  return map;
}
