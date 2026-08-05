/**
 * Node Streaming EDF De-identification
 *
 * De-identifies an EDF/BDF file from a source path to a destination path
 * without ever holding the whole recording in memory: reads only the
 * first 256 bytes to compute the new header (via transformEdfHeader(),
 * the same pure logic edfDeidentifier.ts's whole-buffer path uses),
 * writes those 256 bytes, then streams the remainder (unmodified signal
 * data) straight from source to destination.
 *
 * This is the piece that actually delivers on "too large for the
 * browser" -- deidentifyEdf() in edfDeidentifier.ts reads the entire
 * file into memory, which is fine for the web export path (anything
 * already dropped into a browser tab fits in memory by definition) but
 * defeats the point for a multi-GB local iEEG recording, which is
 * exactly the case the CLI/desktop packaging exists to serve. See
 * Documents/NeuroGate_Phase_Roadmap.md, "Phase 4/6 Revision."
 *
 * NODE-ONLY: see the header comment in nodeFileAdapter.ts.
 */

import { open } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import {
  transformEdfHeader,
  type EdfDeidentifyOptions,
} from '../deidentify/edfDeidentifier';

export interface StreamDeidentifyResult {
  originalPatientId: string;
  originalDate: string;
  shiftedDate: string;
  containedPhi: boolean;
  /** True if the source file was under 256 bytes and copied through unmodified (mirrors deidentifyEdf()'s short-circuit for the same case). */
  tooSmallToDeidentify: boolean;
}

/**
 * De-identify sourcePath's EDF/BDF header, writing the result to
 * destPath. destPath is created (or overwritten) fresh -- this does not
 * modify sourcePath.
 */
export async function deidentifyEdfStream(
  sourcePath: string,
  destPath: string,
  options: EdfDeidentifyOptions,
): Promise<StreamDeidentifyResult> {
  const headerBuffer = Buffer.alloc(256);
  let bytesRead: number;

  const readHandle = await open(sourcePath, 'r');
  try {
    ({ bytesRead } = await readHandle.read(headerBuffer, 0, 256, 0));
  } finally {
    await readHandle.close();
  }

  // Mirrors deidentifyEdf()'s `file.size < 256` short-circuit: too small
  // to be a real EDF file, copy through unchanged rather than attempt a
  // header transform on a truncated/malformed buffer.
  if (bytesRead < 256) {
    await pipeline(createReadStream(sourcePath), createWriteStream(destPath));
    return {
      originalPatientId: '',
      originalDate: '',
      shiftedDate: '',
      containedPhi: false,
      tooSmallToDeidentify: true,
    };
  }

  const headerResult = transformEdfHeader(new Uint8Array(headerBuffer), options);

  // Write the modified header first, then pipe the untouched remainder
  // of the source (byte 256 onward -- the actual signal data, which is
  // never read as a whole into memory, only streamed in the write
  // stream's internal chunk size, 64KB by default) into the same write
  // stream so header and body land in one sequential write pass.
  await new Promise<void>((resolve, reject) => {
    const writeStream = createWriteStream(destPath);
    const readStream = createReadStream(sourcePath, { start: 256 });

    writeStream.on('error', reject);
    readStream.on('error', reject);
    writeStream.on('finish', resolve);

    writeStream.write(Buffer.from(headerResult.headerBytes), (err) => {
      if (err) {
        reject(err);
        return;
      }
      readStream.pipe(writeStream);
    });
  });

  return {
    originalPatientId: headerResult.originalPatientId,
    originalDate: headerResult.originalDate,
    shiftedDate: headerResult.shiftedDate,
    containedPhi: headerResult.containedPhi,
    tooSmallToDeidentify: false,
  };
}
