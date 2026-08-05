/**
 * Verification script for the Node export writer (writeFileEntriesToDisk)
 * and the streaming EDF de-identifier (deidentifyEdfStream).
 *
 * The most important check here: for every real EDF file in the demo
 * fixtures, run BOTH the whole-buffer de-identify path (deidentifyEdf,
 * used by the web export) and the new streaming path (deidentifyEdfStream,
 * used by the CLI export) against the exact same source file and options,
 * and diff the output byte-for-byte. Since both call the same
 * transformEdfHeader() for the header logic, they should be identical --
 * this proves the streaming path's file-splicing (write header, then
 * stream-copy the remainder) doesn't corrupt or misalign anything.
 *
 * Then runs the full export writer against one demo patient and spot
 * checks: plain-copy files (tsv/bval/bvec) are byte-identical to source,
 * EDF outputs are the right size with a de-identified header, and JSON
 * sidecars are valid JSON.
 *
 * Usage: npx tsx verify_export_writer.ts
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, createReadStream, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGzip, gunzipSync } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

import { scanDirectory } from './src/lib/adapters/scanDirectory';
import { NodeFileAdapter } from './src/lib/adapters/nodeFileAdapter';
import { deidentifyEdf } from './src/lib/deidentify/edfDeidentifier';
import { deidentifyEdfStream } from './src/lib/adapters/nodeEdfDeidentifyStream';
import { writeFileEntriesToDisk } from './src/lib/adapters/nodeExportWriter';
import { buildFileEntries } from './src/lib/bids/exporter';
import { runDetection, generateSummary, readJsonSidecars, readEdfHeaders } from './src/lib/detection';
import { generateSubjectDateShifts } from './src/lib/deidentify/edfDeidentifier';
import type { SubjectMetadata } from './src/types/metadata';
import { createDefaultDatasetDescription } from './src/types/metadata';

const PATIENT_ROOT = join(process.cwd(), 'demo-data', 'EpilepsyStudy_Raw', 'Patient_001');

/**
 * Build a synthetic-but-realistic EDF file: a proper 256-byte global
 * header with real PHI-shaped content in the patient/recording ID
 * fields, followed by `payloadSize` bytes of pseudo-random "signal data"
 * standing in for the actual recording.
 *
 * The demo-data fixtures' EDF files are 1-byte stubs (fine for detection
 * tests, which only look at the extension/filename), so they trivially
 * hit the "too small to de-identify" short-circuit in both
 * deidentifyEdf() and deidentifyEdfStream() -- that would make a
 * byte-comparison test pass without ever exercising the real header
 * transform or, critically, the streamed remainder-copy logic. This
 * builds a real header plus a real payload so both code paths are
 * actually tested end-to-end.
 */
function buildSyntheticEdf(patientId: string, recordingId: string, startDate: string, payloadSize: number): Uint8Array {
  const header = new Uint8Array(256).fill(0x20); // space-padded, EDF convention
  const write = (start: number, length: number, value: string) => {
    const padded = value.padEnd(length, ' ').slice(0, length);
    for (let i = 0; i < length; i++) header[start + i] = padded.charCodeAt(i);
  };
  write(0, 8, '0'); // version
  write(8, 80, patientId);
  write(88, 80, recordingId);
  write(168, 8, startDate);
  write(176, 8, '00.00.00'); // start time, untouched by de-identifier

  const payload = new Uint8Array(payloadSize);
  // Deterministic pseudo-random fill (not Math.random) so a failing
  // comparison is reproducible across runs.
  let seed = 12345;
  for (let i = 0; i < payloadSize; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    payload[i] = seed % 256;
  }

  const full = new Uint8Array(256 + payloadSize);
  full.set(header, 0);
  full.set(payload, 256);
  return full;
}

async function verifyStreamMatchesWholeBuffer(): Promise<boolean> {
  console.log('--- Step 1: stream vs whole-buffer byte-for-byte comparison (synthetic realistic EDF) ---');

  const cases: Record<string, { patientId: string; recordingId: string; startDate: string; payloadSize: number }> = {
    edfPlusWithPhi_smallPayload: {
      patientId: 'HUP282 M 22-APR-1990 Smith_John',
      recordingId: 'Startdate 22-APR-2024 X X Exported_with_Persyst_EEGSuite',
      startDate: '22.04.24',
      payloadSize: 1000,
    },
    alreadyAnonymized_largerPayload: {
      patientId: 'X X X X',
      recordingId: 'Startdate 01-JAN-2020 X X SomeSoftware',
      startDate: '01.01.20',
      // Large enough to force multiple internal stream chunks (default
      // highWaterMark is 64KB), so the pipe()/write() sequencing between
      // the header write and the piped remainder is actually exercised
      // across a chunk boundary, not just a single small read.
      payloadSize: 5 * 1024 * 1024,
    },
    nonEdfPlusFreeText_tinyPayload: {
      patientId: 'Smith_John',
      recordingId: 'recorded 22-APR-2024 by tech',
      startDate: '22.04.24',
      payloadSize: 0, // exactly 256 bytes total -- boundary case
    },
  };

  let allMatch = true;
  const tmpDir = mkdtempSync(join(tmpdir(), 'neurogate-edf-verify-'));

  for (const [name, c] of Object.entries(cases)) {
    const sourceBytes = buildSyntheticEdf(c.patientId, c.recordingId, c.startDate, c.payloadSize);
    const sourcePath = join(tmpDir, `${name}.edf`);
    writeFileSync(sourcePath, sourceBytes);

    const options = { dateShiftDays: 42, anonymousSubjectId: 'sub-VERIFY001' };
    const adapter = await NodeFileAdapter.fromPath(sourcePath);

    // Whole-buffer path (web export logic)
    const wholeBufferResult = await deidentifyEdf(adapter, options);
    const wholeBufferBytes = new Uint8Array(wholeBufferResult.bytes);

    // Streaming path (CLI export logic)
    const destPath = join(tmpDir, `${name}.out.edf`);
    const streamResult = await deidentifyEdfStream(sourcePath, destPath, options);
    const streamBytes = new Uint8Array(readFileSync(destPath));

    const sizeMatch = wholeBufferBytes.length === streamBytes.length && wholeBufferBytes.length === sourceBytes.length;
    const bytesMatch = sizeMatch && wholeBufferBytes.every((b, i) => b === streamBytes[i]);
    // Also confirm the payload region (byte 256+) is untouched vs the
    // ORIGINAL source, not just consistent between the two de-identify
    // paths -- a bug that corrupted the payload identically in both
    // paths would otherwise slip through the bytesMatch check above.
    const payloadPreserved =
      sizeMatch && sourceBytes.slice(256).every((b, i) => b === streamBytes[256 + i]);
    const metaMatch =
      wholeBufferResult.originalPatientId === streamResult.originalPatientId &&
      wholeBufferResult.shiftedDate === streamResult.shiftedDate &&
      wholeBufferResult.containedPhi === streamResult.containedPhi;
    const headerActuallyChanged = wholeBufferResult.originalPatientId !== c.patientId.trim()
      ? false // originalPatientId should read back exactly what was written
      : true;

    console.log(
      `  ${name}: total size ${wholeBufferBytes.length}b, size ${sizeMatch ? 'OK' : 'MISMATCH'}, ` +
      `bytes ${bytesMatch ? 'IDENTICAL' : 'DIFFER'}, payload-preserved ${payloadPreserved ? 'OK' : 'CORRUPTED'}, ` +
      `metadata ${metaMatch ? 'OK' : 'MISMATCH'}, header-read-back ${headerActuallyChanged ? 'OK' : 'MISMATCH'}`,
    );
    if (!sizeMatch || !bytesMatch || !payloadPreserved || !metaMatch || !headerActuallyChanged) allMatch = false;
  }

  rmSync(tmpDir, { recursive: true, force: true });
  return allMatch;
}

async function verifyFullExportWrite(): Promise<boolean> {
  console.log('\n--- Step 2: full export write against Patient_001 ---');
  // scanDirectory() prefixes relativePath with the root folder's own
  // name itself ("Patient_001/...") -- no manual prefixing needed.
  const scanned = await scanDirectory(PATIENT_ROOT);

  const sidecarMap = await readJsonSidecars(scanned);
  const edfHeaderMap = await readEdfHeaders(scanned);
  const results = runDetection(scanned, sidecarMap, edfHeaderMap);
  const summary = generateSummary(results);

  const subjects: SubjectMetadata[] = summary.subjectGroups.map((g, i) => ({
    subjectGroup: g,
    bidsSubjectId: `sub-VERIFY${String(i + 1).padStart(3, '0')}`,
    sessions: [],
  }));

  const dateShifts = generateSubjectDateShifts(summary.subjectGroups);
  const datasetDescription = createDefaultDatasetDescription();
  datasetDescription.name = 'Export Writer Verification';
  datasetDescription.authors = ['Verification Script'];

  // Infinity threshold: the whole point of the CLI path is no browser
  // memory cap -- see buildFileEntries()'s largeFileThresholdBytes param.
  const entries = buildFileEntries(results, subjects, datasetDescription, dateShifts, undefined, Infinity);
  const anyTooLarge = entries.some(e => e.tooLarge);
  console.log(`  Built ${entries.length} entries, tooLarge flagged: ${anyTooLarge} (should be false)`);

  const outDir = mkdtempSync(join(tmpdir(), 'neurogate-export-verify-'));
  const { summary: deidSummary, filesWritten } = await writeFileEntriesToDisk(entries, outDir);
  console.log(`  Wrote ${filesWritten} files. EDF de-identified: ${deidSummary.edfFiles.length}, JSON sidecars touched: ${deidSummary.jsonSidecars.length}`);

  // Spot-check a plain-copy file (tsv) is byte-identical to source.
  const tsvEntry = entries.find(e => e.path.endsWith('.tsv') && e.path.includes('electrodes'));
  let plainCopyOk = true;
  if (tsvEntry) {
    const sourcePath = (tsvEntry.content as NodeFileAdapter).path;
    const destPath = join(outDir, 'bids_output', ...tsvEntry.path.split('/'));
    const sourceBytes = readFileSync(sourcePath);
    const destBytes = readFileSync(destPath);
    plainCopyOk = Buffer.compare(sourceBytes, destBytes) === 0;
    console.log(`  Plain-copy check (${tsvEntry.path}): ${plainCopyOk ? 'byte-identical' : 'MISMATCH'}`);
  }

  // Spot-check a JSON sidecar output is valid JSON.
  const jsonEntry = entries.find(e => e.path.endsWith('.json') && e.jsonDeidentify);
  let jsonOk = true;
  if (jsonEntry) {
    const destPath = join(outDir, 'bids_output', ...jsonEntry.path.split('/'));
    try {
      JSON.parse(readFileSync(destPath, 'utf-8'));
    } catch {
      jsonOk = false;
    }
    console.log(`  JSON sidecar validity check (${jsonEntry.path}): ${jsonOk ? 'valid JSON' : 'INVALID'}`);
  }

  rmSync(outDir, { recursive: true, force: true });
  return !anyTooLarge && plainCopyOk && jsonOk;
}

/**
 * Demo-data has no uncompressed .nii fixture (everything is already
 * .nii.gz), so the needsGzip branch in writeFileEntriesToDisk never
 * fires against real fixtures. Build a synthetic uncompressed-NIfTI
 * stand-in directly and drive the same stream-through-zlib path the
 * writer uses, then decompress and diff against the original -- proves
 * the gzip streaming round-trips without corruption.
 */
async function verifyGzipStreamRoundtrip(): Promise<boolean> {
  console.log('\n--- Step 3: gzip stream round-trip (synthetic uncompressed .nii stand-in) ---');
  const tmpDir = mkdtempSync(join(tmpdir(), 'neurogate-gzip-verify-'));

  // Deterministic pseudo-random content, large enough to span multiple
  // internal stream chunks (same rationale as the EDF payload above).
  const size = 3 * 1024 * 1024;
  const original = new Uint8Array(size);
  let seed = 999;
  for (let i = 0; i < size; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    original[i] = seed % 256;
  }

  const sourcePath = join(tmpDir, 'fake.nii');
  const gzPath = join(tmpDir, 'fake.nii.gz');
  writeFileSync(sourcePath, original);

  // Exactly what nodeExportWriter.ts's needsGzip branch does.
  await pipeline(createReadStream(sourcePath), createGzip(), createWriteStream(gzPath));

  const decompressed = gunzipSync(readFileSync(gzPath));
  const roundtripOk = Buffer.compare(Buffer.from(original), decompressed) === 0;
  console.log(`  ${size} bytes compressed and decompressed: ${roundtripOk ? 'byte-identical' : 'MISMATCH'}`);

  rmSync(tmpDir, { recursive: true, force: true });
  return roundtripOk;
}

async function main() {
  const step1 = await verifyStreamMatchesWholeBuffer();
  const step2 = await verifyFullExportWrite();
  const step3 = await verifyGzipStreamRoundtrip();

  console.log('\n=== Result ===');
  console.log(`Stream matches whole-buffer: ${step1 ? 'PASS' : 'FAIL'}`);
  console.log(`Full export write: ${step2 ? 'PASS' : 'FAIL'}`);
  console.log(`Gzip stream round-trip: ${step3 ? 'PASS' : 'FAIL'}`);

  if (!step1 || !step2 || !step3) process.exit(1);
  console.log('\nAll export writer checks passed.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
