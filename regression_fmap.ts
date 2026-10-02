/**
 * Field map IntendedFor regression: every exported field-map sidecar
 * lists the EPI images (func/, dwi/, perf/) of its own session, as paths
 * relative to the subject folder, and a stale IntendedFor from the source
 * (which names original files) never reaches the export. Checked through
 * both export paths: the browser ZIP and the streaming writer used by the
 * desktop app and CLI.
 *
 * Usage: npx tsx regression_fmap.ts   (non-zero exit on failure)
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import JSZip from 'jszip';
import { runDetection, readJsonSidecars, readEdfHeaders, readNiftiHeaders } from './src/lib/detection';
import { buildFileEntries, generateZip } from './src/lib/bids/exporter';
import { computeIntendedFor } from './src/lib/bids/intendedFor';
import { writeFileEntriesToDisk } from './src/lib/adapters/nodeExportWriter';
import { scanDirectory } from './src/lib/adapters/scanDirectory';
import { createDefaultDatasetDescription } from './src/types/metadata';
import type { SubjectMetadata } from './src/types/metadata';
import type { ScannedFile } from './src/types/files';

let failures = 0;
function check(ok: boolean, detail: string) {
  if (!ok) { failures++; console.log(`  FAIL  ${detail}`); }
}

const mk = (relativePath: string, content: string | Uint8Array): ScannedFile => {
  const name = relativePath.split('/').pop()!;
  const file = new File([content], name);
  return { relativePath, name, size: file.size, file } as ScannedFile;
};
const sidecar = (desc: string, extra: Record<string, unknown> = {}) => JSON.stringify({ SeriesDescription: desc, Modality: 'MR', ...extra });

async function main() {
  console.log('paths');
  {
    const map = computeIntendedFor([
      'primary/sub-A/ses-pre/fmap/sub-A_ses-pre_phasediff.json',
      'primary/sub-A/ses-pre/fmap/sub-A_ses-pre_phasediff.nii.gz',
      'primary/sub-A/ses-pre/func/sub-A_ses-pre_task-rest_bold.nii.gz',
      'primary/sub-A/ses-pre/func/sub-A_ses-pre_task-rest_bold.json',
      'primary/sub-A/ses-pre/func/sub-A_ses-pre_task-rest_sbref.nii.gz',
      'primary/sub-A/ses-pre/perf/sub-A_ses-pre_asl.nii.gz',
      'primary/sub-A/ses-pre/anat/sub-A_ses-pre_T1w.nii.gz',
      'primary/sub-A/ses-post/func/sub-A_ses-post_task-rest_bold.nii.gz',
      'primary/sub-B/ses-pre/func/sub-B_ses-pre_task-rest_bold.nii.gz',
      'derivatives/scanner/sub-A/ses-pre/dwi/sub-A_ses-pre_desc-ADC_dwi.nii.gz',
      'primary/sub-C/fmap/sub-C_epi.json',
      'primary/sub-C/dwi/sub-C_dwi.nii.gz',
    ]);
    check(map.size === 2, `expected 2 field-map sidecars, got ${map.size}`);
    check(JSON.stringify(map.get('primary/sub-A/ses-pre/fmap/sub-A_ses-pre_phasediff.json')) === JSON.stringify([
      'ses-pre/func/sub-A_ses-pre_task-rest_bold.nii.gz',
      'ses-pre/func/sub-A_ses-pre_task-rest_sbref.nii.gz',
      'ses-pre/perf/sub-A_ses-pre_asl.nii.gz',
    ]), `wrong targets: ${JSON.stringify(map.get('primary/sub-A/ses-pre/fmap/sub-A_ses-pre_phasediff.json'))}`);
    check(JSON.stringify(map.get('primary/sub-C/fmap/sub-C_epi.json')) === '["dwi/sub-C_dwi.nii.gz"]', 'Single session (no ses- folder) targets');
  }

  console.log('export');
  const fixture: [string, string | Uint8Array][] = [
    ['Patient_F/Session_preimplant/fieldmap_e1.nii.gz', new Uint8Array(8)],
    ['Patient_F/Session_preimplant/fieldmap_e1.json', sidecar('gre_field_mapping', { IntendedFor: ['ses-01/func/sub-MRN1234567_task-rest_bold.nii.gz'] })],
    ['Patient_F/Session_preimplant/fieldmap_e2.nii.gz', new Uint8Array(8)],
    ['Patient_F/Session_preimplant/fieldmap_e2.json', sidecar('gre_field_mapping')],
    ['Patient_F/Session_preimplant/fieldmap_e2_ph.nii.gz', new Uint8Array(8)],
    ['Patient_F/Session_preimplant/fieldmap_e2_ph.json', sidecar('gre_field_mapping')],
    ['Patient_F/Session_preimplant/rest_bold.nii.gz', new Uint8Array(8)],
    ['Patient_F/Session_preimplant/rest_bold.json', sidecar('ep2d_bold_rest')],
    ['Patient_F/Session_preimplant/dwi_ap.nii.gz', new Uint8Array(8)],
    ['Patient_F/Session_preimplant/dwi_ap.bval', '0 1000'],
    ['Patient_F/Session_preimplant/dwi_ap.bvec', '0 1\n0 0\n0 0'],
    ['Patient_F/Session_preimplant/T1w_MPRAGE.nii.gz', new Uint8Array(8)],
    ['Patient_F/Session_preimplant/T1w_MPRAGE.json', sidecar('t1_mprage', { IntendedFor: 'Patient_F/old/path.nii.gz' })],
    ['Patient_F/Session_postsurgery/rest_bold.nii.gz', new Uint8Array(8)],
  ];
  const entriesFor = async (files: ScannedFile[]) => {
    const results = runDetection(files, await readJsonSidecars(files), await readEdfHeaders(files), undefined, await readNiftiHeaders(files));
    const group = results[0].subjectGroup;
    const subjects = [{ subjectGroup: group, bidsSubjectId: 'sub-T010', sessions: [
      { sessionId: 'ses-preimplant', acqTime: '', age: '' }, { sessionId: 'ses-postsurgery', acqTime: '', age: '' },
    ] }] as SubjectMetadata[];
    return buildFileEntries(results, subjects, createDefaultDatasetDescription(), new Map([[group, 5]]));
  };

  const expected = ['ses-preimplant/dwi/sub-T010_ses-preimplant_dwi.nii.gz', 'ses-preimplant/func/sub-T010_ses-preimplant_task-rest_bold.nii.gz'];
  const fmapJson = ['magnitude1', 'magnitude2', 'phasediff'].map(s => `primary/sub-T010/ses-preimplant/fmap/sub-T010_ses-preimplant_${s}.json`);
  const t1Json = 'primary/sub-T010/ses-preimplant/anat/sub-T010_ses-preimplant_T1w.json';
  const boldJson = 'primary/sub-T010/ses-preimplant/func/sub-T010_ses-preimplant_task-rest_bold.json';

  const checkOutput = (label: string, read: (path: string) => string | undefined) => {
    for (const p of fmapJson) {
      const text = read(p);
      const json = text ? JSON.parse(text) : null;
      check(JSON.stringify(json?.IntendedFor) === JSON.stringify(expected), `${label}: ${p.split('/').pop()} IntendedFor = ${JSON.stringify(json?.IntendedFor)}`);
      check(!text?.includes('MRN1234567'), `${label}: stale IntendedFor with an original ID reached the export`);
    }
    const t1 = read(t1Json);
    check(Boolean(t1) && !('IntendedFor' in JSON.parse(t1!)), `${label}: stale IntendedFor on a non-field-map sidecar was kept`);
    const bold = read(boldJson);
    check(Boolean(bold) && !('IntendedFor' in JSON.parse(bold!)), `${label}: IntendedFor added to a non-field-map sidecar`);
  };

  const { blob } = await generateZip(await entriesFor(fixture.map(([p, c]) => mk(p, c))));
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const zipFiles = new Map<string, string>();
  for (const [name, f] of Object.entries(zip.files)) if (!f.dir && name.endsWith('.json')) zipFiles.set(name.replace(/^bids_output\//, ''), await f.async('string'));
  checkOutput('ZIP', p => zipFiles.get(p));

  const work = mkdtempSync(join(tmpdir(), 'ng-fmap-'));
  const outDir = join(work, 'out');
  try {
    for (const [p, c] of fixture) {
      mkdirSync(dirname(join(work, 'src', p)), { recursive: true });
      writeFileSync(join(work, 'src', p), c);
    }
    await writeFileEntriesToDisk(await entriesFor(await scanDirectory(join(work, 'src', 'Patient_F'))), outDir);
    checkOutput('stream', p => { try { return readFileSync(join(outDir, 'bids_output', p), 'utf8'); } catch { return undefined; } });
  } finally {
    if (process.env.KEEP) console.log(work); else rmSync(work, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} field map check failure(s).`);
    process.exit(1);
  }
  console.log('\nAll field map checks passed.');
}

main().catch(err => { console.error(err); process.exit(1); });
