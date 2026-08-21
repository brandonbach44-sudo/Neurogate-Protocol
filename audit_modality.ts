import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { scanDirectory } from './src/lib/adapters/scanDirectory';
import { runDetection, readJsonSidecars } from './src/lib/detection';
import { computeBidsNames } from './src/lib/bids/bidsNaming';

const DATA_ROOT = join(process.cwd(), '..', '..', 'ng_test_nifti_only');

const STRUCTURE = {
  presetId: 'custom-timepoints' as const,
  timepoints: [
    { number: 2, unit: 'week' as const },
    { number: 6, unit: 'month' as const },
  ],
};

function innerPath(cohort: string, subj: string): string {
  const fw = join(DATA_ROOT, cohort, subj, 'scitran', 'phase2_mri', cohort, subj);
  return existsSync(fw) ? fw : join(DATA_ROOT, cohort, subj);
}

const SUBJECTS: [string, string][] = [
  ['Phase2_MRI', '01_1204'], ['Phase2_MRI', '01_1206'], ['Phase2_MRI', '01_1207'],
  ['Phase2_MRI', '01_1215'], ['Phase2_MRI', '01_1229'], ['Phase2_MRI', '01_1231'],
  ['Phase2_MRI', '01_1232'], ['Phase2_MRI', '01_1237'], ['Phase2_MRI', '01_1239'],
  ['Phase2_MRI', '01_1243'], ['Phase2_MRI', '01_1245'], ['Phase2_MRI', '01_1265'],
  ['Phase2_MRI', '01_1290'], ['Phase2_MRI', '02_1245'], ['Phase2_MRI', '02_1290'],
  ['Phase2_MRI', '03_1265'], ['Phase2_MRI', '07_1245'], ['Phase2_MRI', '07_1265'],
  ['Phase2_MRI', '08_1290'],
  ['Phase2_MRI_FriendControls', '01_1519'], ['Phase2_MRI_FriendControls', '01_1520'],
  ['Phase2_MRI_FriendControls', '01_1539'], ['Phase2_MRI_FriendControls', '02_1274'],
  ['Phase2_MRI_FriendControls', '02_1293'],
  ['Phase2_MRI_OrthoControls', '01_1522'], ['Phase2_MRI_OrthoControls', '01_1523'],
  ['Phase2_MRI_OrthoControls', '08_1229'],
];

const byScan = new Map<string, {
  modalities: Map<string, number>;
  confidences: Map<string, number>;
  sampleBids: string | null;
  sampleFile: string;
}>();

async function run() {
  for (const [cohort, subj] of SUBJECTS) {
    const path = innerPath(cohort, subj);
    if (!existsSync(path)) { console.error(`MISSING ${cohort}/${subj}`); continue; }

    const files = await scanDirectory(path);
    const sidecarMap = await readJsonSidecars(files);
    let results = runDetection(files, sidecarMap, undefined, STRUCTURE);
    results = computeBidsNames(results, undefined, STRUCTURE);

    for (const r of results) {
      const rel = r.relativePath ?? '';
      if (!rel.endsWith('.nii.gz')) continue;
      const parts = rel.split('/').filter(Boolean);
      const scanName = parts.length >= 2 ? parts[parts.length - 2] : '(root)';

      let e = byScan.get(scanName);
      if (!e) {
        e = { modalities: new Map(), confidences: new Map(), sampleBids: null, sampleFile: r.fileName };
        byScan.set(scanName, e);
      }
      const mod = r.userModality ?? r.detectedModality ?? 'null';
      e.modalities.set(mod, (e.modalities.get(mod) ?? 0) + 1);
      e.confidences.set(r.confidence, (e.confidences.get(r.confidence) ?? 0) + 1);
      if (!e.sampleBids && r.bidsPath) e.sampleBids = r.bidsPath;
    }
  }

  const rows = [...byScan.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  console.log('='.repeat(125));
  console.log('MODALITY AUDIT - every unique scan folder in the corpus');
  console.log('='.repeat(125));
  console.log('SCAN NAME'.padEnd(52) + 'MODALITY'.padEnd(16) + 'CONF'.padEnd(9) + 'SAMPLE BIDS PATH');
  console.log('-'.repeat(125));

  for (const [scan, e] of rows) {
    const mods = [...e.modalities.entries()].map(([m, c]) => `${m}(${c})`).join(',');
    const confs = [...e.confidences.keys()].join(',');
    console.log(
      scan.slice(0, 51).padEnd(52) +
      mods.slice(0, 15).padEnd(16) +
      confs.slice(0, 8).padEnd(9) +
      (e.sampleBids ?? '(not exported)')
    );
  }

  console.log('\n' + '='.repeat(125));
  console.log('SUSPICIOUS ASSIGNMENTS');
  console.log('='.repeat(125));
  for (const [scan, e] of rows) {
    const mods = [...e.modalities.keys()];
    const s = scan.toLowerCase();
    const flags: string[] = [];

    const isSwi = /swi|t2star|mip_images|mag_images|pha_images/.test(s);
    const isPd = /^pd[_-]|pd_tse/.test(s);
    const isFmap = /field_?mapping|fieldmap/.test(s);
    const isMoco = /mocoseries/.test(s);
    const isDeriv = /_adc$|_fa$|_tracew$|_tw$/.test(s);
    const isSbref = /sbref$/.test(s);
    const isFlairAbbrev = /tflr|t2flr|tflair/.test(s);
    const isRevPe = /revpe|perev/.test(s);

    if (isSwi && !mods.some(m => /swi|gre/.test(m))) flags.push(`SWI-family -> ${mods.join('/')}`);
    if (isPd) flags.push(`proton-density -> ${mods.join('/')}`);
    if (isFmap && !mods.includes('fmap')) flags.push(`fieldmap -> ${mods.join('/')}`);
    if (isMoco) flags.push(`motion-corrected func -> ${mods.join('/')}`);
    if (isDeriv) flags.push(`DWI DERIVED map -> ${mods.join('/')} (raw dwi/ wrong)`);
    if (isSbref) flags.push(`single-band ref -> ${mods.join('/')} (needs _sbref)`);
    if (isFlairAbbrev && !mods.includes('anat-FLAIR')) flags.push(`FLAIR abbrev -> ${mods.join('/')}`);
    if (isRevPe) flags.push(`reverse-PE -> ${mods.join('/')} (needs dir- entity)`);

    if (flags.length) console.log(`  ${scan.padEnd(50)} ${flags.join(' | ')}`);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
