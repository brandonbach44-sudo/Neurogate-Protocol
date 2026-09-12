import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runNeuroGatePipeline } from './src/cli/pipeline';
import { createDefaultDatasetDescription } from './src/types/metadata';

// Test against single subject to see how detection handles Scitran/DICOM structure
const SUBJECT_PATH = join(process.cwd(), '..', '..', 'neurogate_test_data',
  'Phase2_MRI', '01_1204', 'scitran', 'phase2_mri', 'Phase2_MRI', '01_1204');

async function main() {
  console.log(`Scanning: ${SUBJECT_PATH}`);
  const outDir = mkdtempSync(join(tmpdir(), 'ng-single-'));
  const desc = createDefaultDatasetDescription();
  desc.name = 'Single Subject Test';
  desc.authors = ['Brandon Bach'];

  const result = await runNeuroGatePipeline(
    {
      sourceFolder: SUBJECT_PATH,
      structure: { presetId: 'custom-timepoints', timepoints: [{ number: 2, unit: 'week' }] },
      institutionConfig: { prefix: 'PENN', startingNumber: 1 },
      datasetDescription: desc,
      defacingConfirmed: false,
      outputDir: outDir,
      proceedDespiteWarnings: true,
      exportedBy: 'test-script',
    },
    { onLog: (m) => console.log(m) }
  );

  console.log('\nStatus:', result.status);
  if ('summary' in result) {
    const s = result.summary;
    console.log(`High: ${s.highConfidence}, Medium: ${s.mediumConfidence}, Low: ${s.lowConfidence}, Unclassified: ${s.unclassified}`);
    console.log('Subjects:', s.subjectGroups.join(', ') || '(none)');
    if (s.warnings.length) console.log('Warnings:', s.warnings.join('\n  '));
    if (s.missingRequired.length) console.log('Missing:', s.missingRequired.join('\n  '));
  }
  if ('validationReport' in result) {
    console.log(`Errors: ${result.validationReport.errorCount}, Warnings: ${result.validationReport.warningCount}`);
    for (const i of result.validationReport.issues) {
      console.log(`  [${i.severity.toUpperCase()}] ${i.title}: ${i.description}`);
    }
  }
  rmSync(outDir, { recursive: true, force: true });
}

main().catch(e => { console.error(e); process.exit(1); });
