/**
 * Node Export Writer
 *
 * CLI/local equivalent of generateZip() in lib/bids/exporter.ts: takes
 * the same FileEntry[] that function consumes and writes each entry
 * directly to a folder on disk instead of building an in-memory ZIP.
 *
 * Every entry is streamed, never fully buffered:
 *   - Plain file (no gzip/de-identify): NodeFileAdapter.createReadStream()
 *     piped straight to the destination file.
 *   - Uncompressed .nii needing gzip: source stream piped through Node's
 *     zlib gzip transform to the destination .nii.gz.
 *   - EDF/BDF needing de-identification: deidentifyEdfStream() (see
 *     nodeEdfDeidentifyStream.ts) -- reads only the first 256 bytes,
 *     streams the rest.
 *   - JSON sidecar needing de-identification: read as text (sidecars are
 *     small, KB not GB, so this is fine), transform with the existing
 *     pure deidentifyJsonSidecar(), write as text.
 *   - Generated metadata files (dataset_description.json,
 *     participants.tsv, sessions.tsv): entry.content is already a
 *     string, written directly.
 *
 * No LARGE_FILE_THRESHOLD_BYTES cap here (see buildFileEntries()'s
 * largeFileThresholdBytes param) -- streaming to disk has no browser
 * ArrayBuffer ceiling, so callers should build entries with
 * `largeFileThresholdBytes: Infinity` before passing them here.
 *
 * NODE-ONLY: see the header comment in nodeFileAdapter.ts.
 */

import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

import type { FileEntry, DeidentificationSummary } from '../bids/exporter';
import { SidecarNotJsonError } from '../bids/exporter';
import { isFileLike } from '../../types/fileLike';
import { NodeFileAdapter } from './nodeFileAdapter';
import { deidentifyEdfStream } from './nodeEdfDeidentifyStream';
import { deidentifyJsonSidecar } from '../deidentify/jsonSidecarDeidentifier';
import { deidentifyPersystLay } from '../deidentify/persystLayDeidentifier';
import { csvToTsv } from '../bids/delimitedText';

export type WriteProgressCallback = (progress: {
  current: number;
  total: number;
  path: string;
}) => void;

function emptyDeidentificationSummary(): DeidentificationSummary {
  return { edfFiles: [], jsonSidecars: [], layFiles: [] };
}

/**
 * Write every entry to `outputDir/bids_output/<entry.path>`, matching
 * generateZip()'s `bids_output/` prefix so a CLI export and a web ZIP
 * export land in the same folder layout.
 */
export async function writeFileEntriesToDisk(
  entries: FileEntry[],
  outputDir: string,
  onProgress?: WriteProgressCallback,
): Promise<{ summary: DeidentificationSummary; filesWritten: number }> {
  const summary = emptyDeidentificationSummary();
  const root = join(outputDir, 'bids_output');
  let filesWritten = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    onProgress?.({ current: i + 1, total: entries.length, path: entry.path });

    const destPath = join(root, ...entry.path.split('/'));
    await mkdir(dirname(destPath), { recursive: true });

    if (!isFileLike(entry.content)) {
      // Generated metadata file (dataset_description.json,
      // participants.tsv, a sessions.tsv) -- already a string.
      await writeFile(destPath, entry.content, 'utf-8');
      filesWritten++;
      continue;
    }

    if (!(entry.content instanceof NodeFileAdapter)) {
      // Defensive: this writer only makes sense for the CLI/desktop path,
      // where every real file entry is built from a NodeFileAdapter (via
      // scanDirectory()). A browser File reaching here would mean a
      // caller wired the web export path into this function by mistake.
      throw new Error(
        `writeFileEntriesToDisk expected a NodeFileAdapter for "${entry.path}" but got a browser File/other FileLike. This writer is Node/CLI-only. Use generateZip() from lib/bids/exporter.ts for the web export path.`,
      );
    }
    const source = entry.content;

    if (entry.edfDeidentify) {
      const result = await deidentifyEdfStream(source.path, destPath, entry.edfDeidentify);
      if (!result.tooSmallToDeidentify) {
        summary.edfFiles.push({
          bidsPath: entry.path,
          subjectGroup: entry.subjectGroup ?? '',
          containedPhi: result.containedPhi,
          dateShifted: entry.edfDeidentify.dateShiftDays !== 0,
          annotationRedactions: result.annotationRedactions,
        });
      }
    } else if (entry.jsonDeidentify) {
      const text = await source.text();
      const result = deidentifyJsonSidecar(text, entry.jsonDeidentify);
      if (!result.ok) throw new SidecarNotJsonError(source.name);
      await writeFile(destPath, result.text, 'utf-8');
      if (result.strippedFields.length > 0 || result.shiftedFields.length > 0 || result.unparseableDateFields.length > 0) {
        summary.jsonSidecars.push({
          bidsPath: entry.path,
          subjectGroup: entry.subjectGroup ?? '',
          strippedFields: result.strippedFields,
          shiftedFields: result.shiftedFields,
          unparseableDateFields: result.unparseableDateFields,
        });
      }
    } else if (entry.csvToTsv) {
      await writeFile(destPath, csvToTsv(await source.text()), 'utf-8');
    } else if (entry.layDeidentify) {
      // Persyst layout: small text file (see persystLayDeidentifier.ts).
      const result = deidentifyPersystLay(await source.text(), entry.layDeidentify);
      await writeFile(destPath, result.text, 'utf-8');
      summary.layFiles!.push({
        bidsPath: entry.path,
        subjectGroup: entry.subjectGroup ?? '',
        removedFields: result.removedFields,
        shiftedFields: result.shiftedFields,
        commentRedactions: result.commentRedactions,
      });
    } else if (entry.needsGzip) {
      // Uncompressed .nii -> .nii.gz, streamed through Node's zlib
      // (the Node-side equivalent of the web path's browser
      // CompressionStream in exporter.ts's gzipFile()).
      await pipeline(source.createReadStream(), createGzip(), createWriteStream(destPath));
    } else {
      // Plain copy, streamed -- no buffering regardless of file size.
      await pipeline(source.createReadStream(), createWriteStream(destPath));
    }

    filesWritten++;
  }

  return { summary, filesWritten };
}
