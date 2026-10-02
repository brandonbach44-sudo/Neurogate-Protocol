/**
 * Desktop Export (Electron main process)
 *
 * Lets the desktop app's Export step write the dataset the same way the
 * CLI does -- streamed to a folder on disk by writeFileEntriesToDisk()
 * (nodeExportWriter.ts) -- instead of building an in-memory ZIP in the
 * renderer, which has to leave out files over 500 MB (see
 * LARGE_FILE_THRESHOLD_BYTES in lib/bids/exporter.ts). That limit made
 * multi-GB EDF recordings impossible to export de-identified from the
 * desktop app; the CLI never had it.
 *
 * The renderer builds the FileEntry[] exactly as it always has
 * (buildFileEntries, with no size cap), then flattens it into a
 * serializable plan: generated metadata files travel as text, and every
 * real data file travels as its path on disk (from Electron's
 * webUtils.getPathForFile -- see electron/preload.cjs). This module turns
 * that plan back into FileEntry[] backed by NodeFileAdapter and hands it
 * to the same writer the CLI uses, so a desktop export and a CLI export
 * produce byte-identical layouts and de-identification.
 *
 * Bundled to electron/desktop-export.cjs by scripts/build-desktop-bundle.mjs
 * (electron/main.cjs is plain CommonJS and can't import TypeScript).
 *
 * NODE-ONLY: see the header comment in nodeFileAdapter.ts.
 */

import { isAbsolute, normalize } from 'node:path';
import type { FileEntry, DeidentificationSummary } from '../bids/exporter';
import { NodeFileAdapter } from './nodeFileAdapter';
import { writeFileEntriesToDisk, type WriteProgressCallback } from './nodeExportWriter';

/** One FileEntry flattened for IPC: exactly one of `text` / `sourcePath` is set. */
export interface DesktopExportEntry {
  path: string;
  text?: string;
  sourcePath?: string;
  needsGzip?: boolean;
  edfDeidentify?: FileEntry['edfDeidentify'];
  jsonDeidentify?: FileEntry['jsonDeidentify'];
  layDeidentify?: FileEntry['layDeidentify'];
  subjectGroup?: string;
}

export interface DesktopExportResult {
  summary: DeidentificationSummary;
  filesWritten: number;
}

/**
 * Rejects any output path that could escape bids_output/. Every path
 * comes from computeBidsNames(), so this should never fire -- but the
 * paths cross a process boundary here, and the writer joins them onto a
 * real directory, so they're checked rather than trusted.
 */
function assertSafeRelativePath(p: string): void {
  const normalized = normalize(p);
  if (!p || isAbsolute(p) || normalized.startsWith('..') || normalized.split(/[\\/]/).includes('..')) {
    throw new Error(`Refusing to write outside the export folder: "${p}"`);
  }
}

export async function runDesktopExport(
  plan: DesktopExportEntry[],
  outputDir: string,
  onProgress?: WriteProgressCallback,
): Promise<DesktopExportResult> {
  const entries: FileEntry[] = [];
  for (const item of plan) {
    assertSafeRelativePath(item.path);
    let content: FileEntry['content'];
    if (item.sourcePath !== undefined) {
      try {
        content = await NodeFileAdapter.fromPath(item.sourcePath);
      } catch (err) {
        throw new Error(`Cannot read "${item.sourcePath}" -- make sure the file is stored locally (not cloud-only) and still exists. (${(err as Error).message})`);
      }
    } else if (item.text !== undefined) {
      content = item.text;
    } else {
      throw new Error(`Export entry "${item.path}" has no content.`);
    }
    entries.push({
      path: item.path,
      content,
      needsGzip: item.needsGzip,
      edfDeidentify: item.edfDeidentify,
      jsonDeidentify: item.jsonDeidentify,
      layDeidentify: item.layDeidentify,
      subjectGroup: item.subjectGroup,
    });
  }
  return writeFileEntriesToDisk(entries, outputDir, onProgress);
}
