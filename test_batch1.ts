import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runNeuroGatePipeline } from './src/cli/pipeline';
import { createDefaultDatasetDescription } from './src/types/metadata';

const DATA_ROOT = join(process.cwd(), '..', '..', 'neurogate_test_data');
const STRUCTURE_2WK = { presetId: 'custom-timepoints' as const, timepoints: [{ number: 2, unit: 'week' as const }] };
const STRUCTURE_SINGLE = { presetId: 'single-session' as const };

const SUBJECTS = [
  { cohort: 'Phase2_MRI', subj: '01_1204', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '01_1206', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '01_1207', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '01_1215', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '01_1229', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '01_1231', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '01_1232', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '01_1237', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '01_1239', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '01_1243', structure: STRUCTURE_2WK },
];

async function run(cohort: string, subj: string, structure: any) {
  const path = join(DATA_ROOT, cohort, subj, 'scitran', 'phase2_mri', cohort, subj);
  const outDir = mkdtempSync(join(tmpdir(), 'ng-'));
  const desc = createDefaultDatasetDescription();
  desc.name = `${subj}`;
  const sessions = new Set<string>();
  const errs: string[] = [];
  try {
    const result = await runNeuroGatePipeline(
      { sourceFolder: path, structure, institutionConfig: { prefix: 'PENN', startingNumber: 1 },
        datasetDescription: desc, defacingConfirmed: false, outputDir: outDir,
        proceedDespiteWarnings: true, exportedBy: 'test' },
      { onLog: (msg: string) => {
          const m = msg.match(/ses-\w+/g); if (m) m.forEach(s => sessions.add(s));
          if (msg.includes('[ERROR]') && !msg.includes('Defacing')) errs.push(msg.replace(/.*\[ERROR\]\s*/,'').slice(0,80));
        }}
    );
    const s = 'summary' in result ? result.summary : null;
    const hi = s?.highConfidence ?? 0, unc = s?.unclassified ?? 0;
    const sesStr = [...sessions].join(',') || '(none)';
    const subs = s?.subjectGroups.join(',') || '?';
    console.log(`${cohort.slice(-12).padEnd(12)} ${subj.padEnd(10)} ${result.status.slice(0,18).padEnd(18)} hi=${String(hi).padStart(2)} unc=${String(unc).padStart(4)}  ses=${sesStr}  subs=[${subs}]${errs.length ? '  ERR:'+errs[0] : ''}`);
  } catch(e) { console.log(`${cohort.slice(-12).padEnd(12)} ${subj.padEnd(10)} EXCEPTION: ${e}`); }
  finally { rmSync(outDir, { recursive: true, force: true }); }
}

async function main() {
  console.log('Cohort        Subject    Status              Hi  Unc   Sessions');
  console.log('-'.repeat(90));
  for (const {cohort, subj, structure} of SUBJECTS) await run(cohort, subj, structure);
}
main().catch(e => { console.error(e); process.exit(1); });
