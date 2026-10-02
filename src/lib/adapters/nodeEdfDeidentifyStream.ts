/**
 * Node Streaming EDF De-identification
 *
 * De-identifies an EDF/BDF file from a source path to a destination path
 * without ever holding the whole recording in memory: reads only the
 * header to compute its de-identified form (via transformEdfHeader() and
 * edfStructure.ts, the same pure logic the whole-buffer path uses),
 * writes it, then streams the data records, redacting annotation text in
 * place when there is any.
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
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  transformEdfHeader,
  type EdfDeidentifyOptions,
} from '../deidentify/edfDeidentifier';
import {
  readSignalCount,
  parseEdfLayout,
  patientTokens,
  recordingTokens,
  makeRedactor,
  redactHeaderFreeText,
  redactRecords,
  type EdfLayout,
} from '../deidentify/edfStructure';

export interface StreamDeidentifyResult {
  originalPatientId: string;
  originalDate: string;
  shiftedDate: string;
  containedPhi: boolean;
  /** True if the source file was under 256 bytes and copied through unmodified (mirrors deidentifyEdf()'s short-circuit for the same case). */
  tooSmallToDeidentify: boolean;
  /** Identifying text replaced inside EDF+/BDF+ annotations (see edfStructure.ts). */
  annotationRedactions: number;
}

/**
 * Passes data records through, redacting annotation text. Buffers to
 * whole records first, so a TAL is never split across two chunks (its
 * timestamp/text boundaries must be read from the TAL's start). Records
 * are small (kilobytes to a few MB), so memory stays bounded.
 */
class AnnotationRedactStream extends Transform {
  private pending: Buffer = Buffer.alloc(0);
  private position = 0; // bytes of record data emitted so far
  private readonly layout: EdfLayout;
  private readonly redact: ReturnType<typeof makeRedactor>;
  count = 0;

  constructor(layout: EdfLayout, redact: ReturnType<typeof makeRedactor>) {
    super();
    this.layout = layout;
    this.redact = redact;
  }

  _transform(chunk: Buffer, _encoding: string, done: (err?: Error | null) => void): void {
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
    const whole = Math.floor(this.pending.length / this.layout.recordBytes) * this.layout.recordBytes;
    if (whole > 0) {
      const out = Buffer.from(this.pending.subarray(0, whole));
      this.count += redactRecords(out, this.position, this.layout, this.redact);
      this.position += whole;
      this.pending = this.pending.subarray(whole);
      this.push(out);
    }
    done();
  }

  _flush(done: (err?: Error | null) => void): void {
    if (this.pending.length > 0) {
      // A truncated final record: redact whatever of it is present.
      const out = Buffer.from(this.pending);
      this.count += redactRecords(out, this.position, this.layout, this.redact);
      this.push(out);
    }
    done();
  }
}

async function readBytes(path: string, length: number): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * De-identify sourcePath's EDF/BDF file, writing the result to destPath.
 * destPath is created (or overwritten) fresh -- this does not modify
 * sourcePath.
 *
 * Main header: transformEdfHeader(). Signal headers: identifying names in
 * the free-text transducer/prefiltering fields. Data records: annotation
 * text redacted in place when the file has an EDF/BDF Annotations signal;
 * otherwise streamed through untouched. Output size always equals input
 * size.
 */
export async function deidentifyEdfStream(
  sourcePath: string,
  destPath: string,
  options: EdfDeidentifyOptions,
): Promise<StreamDeidentifyResult> {
  const mainHeader = await readBytes(sourcePath, 256);

  // Mirrors deidentifyEdf()'s `file.size < 256` short-circuit: too small
  // to be a real EDF file, copy through unchanged rather than attempt a
  // header transform on a truncated/malformed buffer.
  if (mainHeader.length < 256) {
    await pipeline(createReadStream(sourcePath), createWriteStream(destPath));
    return {
      originalPatientId: '',
      originalDate: '',
      shiftedDate: '',
      containedPhi: false,
      tooSmallToDeidentify: true,
      annotationRedactions: 0,
    };
  }

  const headerResult = transformEdfHeader(new Uint8Array(mainHeader), options);

  // Full header (main + signal headers), when it's well formed. If it
  // isn't, only the main header is cleaned, as before annotations were
  // handled.
  const ns = readSignalCount(new Uint8Array(mainHeader));
  const fullHeader = ns ? await readBytes(sourcePath, 256 + ns * 256) : mainHeader;
  const layout = parseEdfLayout(new Uint8Array(fullHeader));
  const outHeader = Buffer.from(layout ? fullHeader : mainHeader);
  outHeader.set(headerResult.headerBytes, 0);

  const tokens = [...patientTokens(headerResult.originalPatientId), ...recordingTokens(headerResult.originalRecordingId)];
  if (layout) redactHeaderFreeText(outHeader, layout, makeRedactor(tokens, { generic: false }));

  const bodyStart = outHeader.length;
  const redactor = layout && layout.annotationSpans.length > 0 && layout.recordBytes > 0
    ? new AnnotationRedactStream(layout, makeRedactor(tokens))
    : null;

  // Header first, then the body streamed in one sequential write pass,
  // never holding the whole recording in memory.
  const writeStream = createWriteStream(destPath);
  await new Promise<void>((resolve, reject) => {
    writeStream.write(outHeader, err => (err ? reject(err) : resolve()));
  });
  const body = createReadStream(sourcePath, { start: bodyStart });
  if (redactor) await pipeline(body, redactor, writeStream);
  else await pipeline(body, writeStream);

  return {
    originalPatientId: headerResult.originalPatientId,
    originalDate: headerResult.originalDate,
    shiftedDate: headerResult.shiftedDate,
    containedPhi: headerResult.containedPhi,
    tooSmallToDeidentify: false,
    annotationRedactions: redactor?.count ?? 0,
  };
}
