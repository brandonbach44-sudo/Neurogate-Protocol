/**
 * EDF+ annotation de-identification regression.
 *
 * Builds a realistic EDF+ file in memory (full signal headers, a signal
 * channel plus an "EDF Annotations" channel, thousands of data records)
 * whose annotations mix ordinary event markers with identifying text,
 * then checks both de-identification paths:
 *
 *   - whole buffer (deidentifyEdf, used by the browser export)
 *   - streaming   (deidentifyEdfStream, used by the CLI and desktop app),
 *     which must produce byte-identical output even though the file is
 *     read in 64 KB chunks that don't line up with data records.
 *
 * Event text ("Seizure onset") must survive; the patient's name, ID,
 * birth date, phone number and a full date must not. Timestamps, signal
 * data and file size must be unchanged.
 *
 * Usage: npx tsx regression_edf_annotations.ts   (non-zero exit on failure)
 */
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deidentifyEdf } from './src/lib/deidentify/edfDeidentifier';
import { deidentifyEdfStream } from './src/lib/adapters/nodeEdfDeidentifyStream';
import { readEdfHeaders } from './src/lib/detection';
import type { ScannedFile } from './src/types/files';

let failures = 0;
function check(ok: boolean, detail: string) {
  if (!ok) { failures++; console.log(`  FAIL  ${detail}`); }
}

const PATIENT = 'MCH-0234567 M 02-MAY-1951 Smith_John';
const RECORDING = 'Startdate 03-MAR-2024 PSG-1234/2024 NN Telemetry03';
const SIGNAL_SAMPLES = 64;     // 128 bytes of signal per record
const ANNOT_SAMPLES = 40;      // 80 bytes of annotations per record
const RECORDS = 3000;          // ~620 KB, many 64 KB stream chunks

/** Notes typed into specific records; every other record has only its time-keeping TAL. */
const NOTES: Record<number, string> = {
  1: 'Seizure onset',
  700: 'Patient Smith moved',
  1500: 'Called 215-555-1234',
  2999: 'DOB 02-MAY-1951 MCH-0234567',
};

function field(bytes: Uint8Array, at: number, len: number, value: string) {
  const v = value.padEnd(len, ' ').slice(0, len);
  for (let i = 0; i < len; i++) bytes[at + i] = v.charCodeAt(i);
}

function buildEdfPlus(): Uint8Array {
  const ns = 2;
  const headerBytes = 256 + ns * 256;
  const recordBytes = (SIGNAL_SAMPLES + ANNOT_SAMPLES) * 2;
  const bytes = new Uint8Array(headerBytes + RECORDS * recordBytes);

  // Main header
  bytes.fill(0x20, 0, headerBytes);
  field(bytes, 0, 8, '0');
  field(bytes, 8, 80, PATIENT);
  field(bytes, 88, 80, RECORDING);
  field(bytes, 168, 8, '03.03.24');
  field(bytes, 176, 8, '22.15.00');
  field(bytes, 184, 8, String(headerBytes));
  field(bytes, 192, 44, 'EDF+C');
  field(bytes, 236, 8, String(RECORDS));
  field(bytes, 244, 8, '1');
  field(bytes, 252, 4, String(ns));

  // Signal headers (each field is an array over the ns signals)
  const at = (before: number, i: number, size: number) => 256 + ns * before + i * size;
  const labels = ['EEG Fp1', 'EDF Annotations'];
  const transducer = ['AgAgCl electrode Smith', ''];
  const prefilter = ['HP:0.1Hz LP:70Hz N:50/60/120', ''];
  const samples = [SIGNAL_SAMPLES, ANNOT_SAMPLES];
  for (let i = 0; i < ns; i++) {
    field(bytes, at(0, i, 16), 16, labels[i]);
    field(bytes, at(16, i, 80), 80, transducer[i]);
    field(bytes, at(96, i, 8), 8, i === 0 ? 'uV' : '');
    field(bytes, at(104, i, 8), 8, '-3200');
    field(bytes, at(112, i, 8), 8, '3200');
    field(bytes, at(120, i, 8), 8, '-32768');
    field(bytes, at(128, i, 8), 8, '32767');
    field(bytes, at(136, i, 80), 80, prefilter[i]);
    field(bytes, at(216, i, 8), 8, String(samples[i]));
  }

  // Data records: deterministic signal bytes, then the annotation block
  let seed = 7;
  for (let r = 0; r < RECORDS; r++) {
    const base = headerBytes + r * recordBytes;
    for (let k = 0; k < SIGNAL_SAMPLES * 2; k++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      bytes[base + k] = seed & 0xff;
    }
    let tal = `+${r}\x14\x14\x00`; // time-keeping TAL, no text
    if (NOTES[r]) tal += `+${r}.5\x150.25\x14${NOTES[r]}\x14\x00`;
    for (let k = 0; k < tal.length; k++) bytes[base + SIGNAL_SAMPLES * 2 + k] = tal.charCodeAt(k);
  }
  return bytes;
}

const latin1 = (b: Uint8Array) => Buffer.from(b).toString('latin1');

async function main() {
  const original = buildEdfPlus();
  const options = { dateShiftDays: -40, anonymousSubjectId: 'sub-T001' };

  // ── Whole-buffer path ─────────────────────────────────────────────
  console.log('whole-buffer de-identification');
  const file = new File([original], 'night.edf');
  const whole = await deidentifyEdf(file, options);
  const out = new Uint8Array(whole.bytes);
  const text = latin1(out);

  check(out.length === original.length, `size changed: ${original.length} -> ${out.length}`);
  check(text.includes('Seizure onset'), 'event marker "Seizure onset" was removed');
  for (const leak of ['Smith', 'John', '0234567', '02-MAY-1951', '215-555-1234', 'PSG-1234']) {
    check(!text.includes(leak), `"${leak}" is still in the file`);
  }
  check(text.includes('+700.5\x150.25\x14'), 'an annotation timestamp was altered');
  check(text.includes('+0\x14\x14\x00') && text.includes('+2999\x14\x14\x00'), 'a time-keeping TAL was altered');
  check(text.includes('N:50/60/120'), 'prefiltering text was over-redacted');
  check(text.includes('AgAgCl electrode'), 'transducer text was over-redacted');
  check((whole.annotationRedactions ?? 0) >= 4, `annotationRedactions = ${whole.annotationRedactions}`);

  // Signal samples untouched
  const headerBytes = 256 + 2 * 256;
  const recordBytes = (SIGNAL_SAMPLES + ANNOT_SAMPLES) * 2;
  let signalIntact = true;
  for (let r = 0; r < RECORDS && signalIntact; r++) {
    const base = headerBytes + r * recordBytes;
    for (let k = 0; k < SIGNAL_SAMPLES * 2; k++) {
      if (out[base + k] !== original[base + k]) { signalIntact = false; break; }
    }
  }
  check(signalIntact, 'signal sample bytes changed');

  // ── Streaming path matches byte for byte ──────────────────────────
  console.log('streaming de-identification');
  const dir = await mkdtemp(join(tmpdir(), 'neurogate-edfplus-'));
  try {
    const src = join(dir, 'night.edf');
    const dest = join(dir, 'out.edf');
    await writeFile(src, original);
    const streamed = await deidentifyEdfStream(src, dest, options);
    const streamedBytes = new Uint8Array(await readFile(dest));
    check(streamedBytes.length === out.length, 'streamed size differs from whole-buffer size');
    check(Buffer.compare(Buffer.from(streamedBytes), Buffer.from(out)) === 0, 'streamed output differs from whole-buffer output');
    check(streamed.annotationRedactions === whole.annotationRedactions, `redaction counts differ: ${streamed.annotationRedactions} vs ${whole.annotationRedactions}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  // ── Plain EDF (no annotation signal) is unchanged after the header ──
  console.log('plain EDF untouched after the header');
  {
    const plain = buildEdfPlus();
    field(plain, 256 + 2 * 16 - 16, 16, 'EEG Fp2'); // relabel the annotation channel
    const res = new Uint8Array((await deidentifyEdf(new File([plain], 'p.edf'), options)).bytes);
    check(latin1(res.subarray(headerBytes)) === latin1(plain.subarray(headerBytes)), 'data of a file without annotations was changed');
  }

  // ── Header reader reads labels for large montages ─────────────────
  console.log('labels read for more than 512 channels');
  {
    const ns = 600;
    const big = new Uint8Array(256 + ns * 256).fill(0x20);
    field(big, 0, 8, '0');
    field(big, 252, 4, String(ns));
    for (let i = 0; i < ns; i++) field(big, 256 + i * 16, 16, `LA${(i % 99) + 1}`);
    const scanned = { relativePath: 'S/big.edf', name: 'big.edf', size: big.length, file: new File([big], 'big.edf') } as ScannedFile;
    const info = (await readEdfHeaders([scanned])).get('S/big.edf');
    check(info?.signalLabels.length === ns, `read ${info?.signalLabels.length ?? 0} of ${ns} labels`);
    check(info?.modalityHint === 'ieeg', `modality hint ${info?.modalityHint} for a 600-contact depth montage`);
  }

  if (failures > 0) {
    console.error(`\n${failures} EDF annotation check failure(s).`);
    process.exit(1);
  }
  console.log('\nAll EDF annotation checks passed.');
}

main().catch(err => { console.error(err); process.exit(1); });
