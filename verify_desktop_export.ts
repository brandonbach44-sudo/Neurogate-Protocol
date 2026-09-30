/**
 * Verifies the desktop app's folder export (electron/main.cjs "Export to
 * folder" -> electron/desktop-export.cjs) end to end, against the BUNDLED
 * file the packaged app actually loads -- not the TypeScript source.
 *
 * Builds a synthetic EDF with PHI-shaped header fields plus a JSON
 * sidecar in a temp folder, sends them through runDesktopExport() as the
 * renderer would (paths on disk, not file contents), then checks:
 *   - the EDF lands at its BIDS path with the patient field replaced and
 *     the start date shifted,
 *   - every byte after the header is unchanged (streamed, not truncated),
 *   - the sidecar's identifying fields are blanked and dates shifted,
 *   - a path that tries to escape bids_output/ is refused.
 *
 * Usage:
 *   npm run desktop:bundle && npx tsx verify_desktop_export.ts
 *   npx tsx verify_desktop_export.ts --large   # 600 MB EDF (the old 500 MB browser limit)
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, mkdir, writeFile, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const BUNDLE = join(process.cwd(), 'electron', 'desktop-export.cjs');

const PAYLOAD_BYTES = process.argv.includes('--large') ? 600 * 1024 * 1024 : 8 * 1024 * 1024;
const PATIENT_ID = 'HUP900 M 01-JAN-1980 Doe_Jane';
const RECORDING_ID = 'Startdate 03-MAR-2024 X X X';
const START_DATE = '03.03.24';
const SHIFT_DAYS = -40;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -- ${detail}` : ''}`);
  if (!ok) failures++;
}

/** EDF with a real 256-byte header, then PAYLOAD_BYTES of deterministic data, written in chunks. */
async function writeSyntheticEdf(path: string) {
  const header = Buffer.alloc(256, 0x20);
  const put = (start: number, length: number, value: string) =>
    header.write(value.padEnd(length, ' ').slice(0, length), start, 'latin1');
  put(0, 8, '0');
  put(8, 80, PATIENT_ID);
  put(88, 80, RECORDING_ID);
  put(168, 8, START_DATE);
  put(176, 8, '22.15.00');

  const out = createWriteStream(path);
  out.write(header);
  const chunk = Buffer.alloc(4 * 1024 * 1024);
  let seed = 12345;
  for (let written = 0; written < PAYLOAD_BYTES; written += chunk.length) {
    const n = Math.min(chunk.length, PAYLOAD_BYTES - written);
    for (let i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      chunk[i] = seed & 0xff;
    }
    if (!out.write(n === chunk.length ? chunk : chunk.subarray(0, n))) {
      await new Promise(r => out.once('drain', r));
    }
  }
  await new Promise<void>((res, rej) => out.end((err?: Error | null) => (err ? rej(err) : res())));
}

async function sha256From(path: string, start: number) {
  const hash = createHash('sha256');
  for await (const buf of createReadStream(path, { start })) hash.update(buf as Buffer);
  return hash.digest('hex');
}

async function readHeader(path: string) {
  const fh = await open(path, 'r');
  const buf = Buffer.alloc(256);
  await fh.read(buf, 0, 256, 0);
  await fh.close();
  const field = (s: number, l: number) => buf.toString('latin1', s, s + l).trim();
  return { patientId: field(8, 80), recordingId: field(88, 80), startDate: field(168, 8), startTime: field(176, 8) };
}

async function main() {
  if (!existsSync(BUNDLE)) {
    console.error(`Missing ${BUNDLE} -- run "npm run desktop:bundle" first.`);
    process.exit(1);
  }
  const { runDesktopExport } = require(BUNDLE);

  const work = await mkdtemp(join(tmpdir(), 'neurogate-desktop-export-'));
  try {
    const src = join(work, 'source', 'Patient_900');
    await mkdir(src, { recursive: true });
    const edfPath = join(src, 'night1_ieeg.edf');
    const jsonPath = join(src, 'T1_MPRAGE.json');
    console.log(`Writing synthetic EDF (${(PAYLOAD_BYTES / 1024 / 1024).toFixed(0)} MB payload)...`);
    await writeSyntheticEdf(edfPath);
    await writeFile(jsonPath, JSON.stringify({
      Modality: 'MR',
      PatientName: 'Doe^Jane',
      InstitutionName: 'Example Hospital',
      AcquisitionDateTime: '2024-03-03T09:30:00',
      SeriesDescription: 'T1_MPRAGE',
    }));

    const edfBids = 'primary/sub-PENN001/ses-postimplant/ieeg/sub-PENN001_ses-postimplant_task-monitor_ieeg.edf';
    const jsonBids = 'primary/sub-PENN001/ses-preimplant/anat/sub-PENN001_ses-preimplant_T1w.json';
    const outputDir = join(work, 'PENN_bids_export_test');
    const progress: number[] = [];

    const result = await runDesktopExport([
      { path: 'dataset_description.json', text: '{"Name":"test"}' },
      { path: 'participants.tsv', text: 'participant_id\nsub-PENN001' },
      { path: edfBids, sourcePath: edfPath, edfDeidentify: { dateShiftDays: SHIFT_DAYS, anonymousSubjectId: 'sub-PENN001' }, subjectGroup: 'Patient_900' },
      { path: jsonBids, sourcePath: jsonPath, jsonDeidentify: { dateShiftDays: SHIFT_DAYS }, subjectGroup: 'Patient_900' },
    ], outputDir, (p: { current: number }) => progress.push(p.current));

    const root = join(outputDir, 'bids_output');
    const outEdf = join(root, ...edfBids.split('/'));
    check('all 4 files written', result.filesWritten === 4, `filesWritten=${result.filesWritten}`);
    check('progress reported per file', progress.join(',') === '1,2,3,4', progress.join(','));
    check('EDF at its BIDS path', existsSync(outEdf));

    const [inSize, outSize] = [(await stat(edfPath)).size, (await stat(outEdf)).size];
    check('EDF size unchanged', inSize === outSize, `${inSize} -> ${outSize}`);

    const header = await readHeader(outEdf);
    check('patient field replaced', header.patientId.startsWith('sub-PENN001') && !header.patientId.includes('Doe'), header.patientId);
    check('start date shifted', header.startDate !== START_DATE, `${START_DATE} -> ${header.startDate}`);
    check('recording date shifted', !header.recordingId.includes('03-MAR-2024'), header.recordingId);
    check('signal data identical', (await sha256From(edfPath, 256)) === (await sha256From(outEdf, 256)));
    check('EDF recorded in de-identification summary', result.summary.edfFiles.length === 1 && result.summary.edfFiles[0].containedPhi === true);

    const sidecar = JSON.parse(await readFile(join(root, ...jsonBids.split('/')), 'utf-8'));
    check('sidecar name blanked', sidecar.PatientName === 'X', sidecar.PatientName);
    check('sidecar institution blanked', sidecar.InstitutionName === 'X', sidecar.InstitutionName);
    check('sidecar date shifted', sidecar.AcquisitionDateTime !== '2024-03-03T09:30:00', sidecar.AcquisitionDateTime);

    let refused = false;
    try {
      await runDesktopExport([{ path: '../escape.txt', text: 'x' }], join(work, 'escape-test'));
    } catch {
      refused = true;
    }
    check('path escaping bids_output/ refused', refused && !existsSync(join(work, 'escape.txt')));
  } finally {
    await rm(work, { recursive: true, force: true });
  }

  console.log(failures === 0 ? '\nAll desktop export checks passed.' : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
