import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { scanDirectory } from './src/lib/adapters/scanDirectory';
import { runDetection, readJsonSidecars, generateSummary } from './src/lib/detection';
import { computeBidsNames } from './src/lib/bids/bidsNaming';

const DATA_ROOT = join(process.cwd(), '..', '..', 'ng_test_nifti_only');
const STRUCTURE = { presetId: 'custom-timepoints' as const,
  timepoints: [{ number: 2, unit: 'week' as const }, { number: 6, unit: 'month' as const }] };

const COHORT = process.argv[2] ?? 'Phase2_MRI';
const SUBJ   = process.argv[3] ?? '01_1207';

async function run() {
  const fw = join(DATA_ROOT, COHORT, SUBJ, 'scitran', 'phase2_mri', COHORT, SUBJ);
  const path = existsSync(fw) ? fw : join(DATA_ROOT, COHORT, SUBJ);

  console.log('╔' + '═'.repeat(98) + '╗');
  console.log('║ NEUROGATE — SIMULATED RUN' + ' '.repeat(73) + '║');
  console.log('╚' + '═'.repeat(98) + '╝');
  console.log(`Dropped folder : ${COHORT}/${SUBJ}`);
  console.log(`Preset         : Custom timepoints  (2 weeks, 6 months)`);
  console.log(`Structure      : ${existsSync(fw) ? 'Flywheel nested (scitran/...)' : 'Flat'}`);

  const files = await scanDirectory(path);
  const sc = await readJsonSidecars(files);
  let res = runDetection(files, sc, undefined, STRUCTURE);
  res = computeBidsNames(res, undefined, STRUCTURE);
  const summary = generateSummary(res, STRUCTURE);

  console.log(`\nSTEP 1 — Scan          : ${files.length} files found`);
  console.log(`STEP 2 — Detection     : ${summary.highConfidence} high / ${summary.mediumConfidence} medium / ${summary.lowConfidence} low / ${summary.unclassified} unclassified`);
  console.log(`STEP 3 — Subjects      : ${summary.subjectGroups.join(', ')}`);
  const sessions = [...new Set(res.map(r => r.detectedSession).filter(Boolean))].sort();
  console.log(`STEP 4 — Sessions      : ${sessions.join(', ')}`);

  // Mapping table as the UI would render it
  const nii = res.filter(r => r.relativePath.endsWith('.nii.gz'))
                 .sort((a,b) => (a.bidsPath ?? '').localeCompare(b.bidsPath ?? ''));

  console.log('\n' + '='.repeat(140));
  console.log('MAPPING TABLE (what the user reviews before export)');
  console.log('='.repeat(140));
  console.log('SOURCE SCAN'.padEnd(40) + 'SES'.padEnd(9) + 'MODALITY'.padEnd(12) + 'CONF'.padEnd(8) + 'WRITES TO');
  console.log('-'.repeat(140));
  for (const r of nii) {
    const parts = r.relativePath.split('/').filter(Boolean);
    const scan = parts[parts.length - 2] ?? '?';
    const flag = r.reasons.some(x => x.message.includes('Defaulting ambiguous NIfTI')) ? ' ⚠' : '';
    console.log(
      scan.slice(0,38).padEnd(40) +
      String(r.detectedSession ?? '-').padEnd(9) +
      String(r.detectedModality).padEnd(12) +
      (r.confidence + flag).padEnd(8) +
      (r.bidsPath ?? '-')
    );
  }

  const guessed = nii.filter(r => r.reasons.some(x => x.message.includes('Defaulting ambiguous NIfTI')));
  const guessedExported = guessed.filter(r => r.bidsPath?.startsWith('primary/'));
  console.log('-'.repeat(140));
  console.log(`⚠ = modality came from the blind "Defaulting ambiguous NIfTI to T1w — please verify" fallback`);
  console.log(`   ${guessed.length} of ${nii.length} scans;  ${guessedExported.length} of those are exported into primary/ as real T1w anatomicals.`);
}
run().catch(e => { console.error(e); process.exit(1); });
