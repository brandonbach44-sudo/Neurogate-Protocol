/**
 * Quick detection test against real Phase2_MRI data
 */
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runNeuroGatePipeline } from './src/cli/pipeline';
import { createDefaultDatasetDescription } from './src/types/metadata';

const DATA_ROOT = join(process.cwd(), '..', '..', 'neurogate_test_data');

const COHORTS = [
  join(DATA_ROOT, 'Phase2_MRI'),
  join(DATA_ROOT, 'Phase2_MRI_FriendControls'),
  join(DATA_ROOT, 'Phase2_MRI_OrthoControls'),
];

async function testCohort(cohortPath: string) {
  const name = cohortPath.split('/').pop()!;
  console.log(`\n=== Testing: ${name} ===`);
  const outDir = mkdtempSync(join(tmpdir(), 'neurogate-real-test-'));
  const desc = createDefaultDatasetDescription();
  desc.name = `${name} Test`;
  desc.authors = ['Brandon Bach'];

  const result = await runNeuroGatePipeline(
    {
      sourceFolder: cohortPath,
      structure: { presetId: 'custom-timepoints', timepoints: [{ number: 2, unit: 'week' }] },
      institutionConfig: { prefix: 'PENN', startingNumber: 1 },
      datasetDescription: desc,
      defacingConfirmed: false,
      outputDir: outDir,
      proceedDespiteWarnings: true,
      exportedBy: 'test-script',
    },
    { onLog: (m) => console.log('  LOG:', m) }
  );

  console.log(`  Status: ${result.status}`);
  if ('summary' in result) {
    const s = result.summary;
    console.log(`  High confidence: ${s.highConfidence}`);
    console.log(`  Medium confidence: ${s.mediumConfidence}`);
    console.log(`  Low confidence: ${s.lowConfidence}`);
    console.log(`  Unclassified: ${s.unclassified}`);
    console.log(`  Subjects detected: ${s.subjectGroups.join(', ') || '(none)'}`);
    if (s.warnings.length) console.log(`  Warnings: ${s.warnings.slice(0,5).join('; ')}`);
    if (s.missingRequired.length) console.log(`  Missing required: ${s.missingRequired.slice(0,5).join('; ')}`);
  }
  if ('validationReport' in result) {
    console.log(`  Validation errors: ${result.validationReport.errorCount}`);
    console.log(`  Validation warnings: ${result.validationReport.warningCount}`);
    for (const issue of result.validationReport.issues.slice(0, 8)) {
      console.log(`    [${issue.severity.toUpperCase()}] ${issue.title}: ${issue.description}`);
    }
  }
  if ('subjects' in result && result.subjects.length > 0) {
    console.log(`  Subjects (${result.subjects.length}):`);
    for (const s of result.subjects.slice(0, 5)) {
      console.log(`    ${s.subjectGroup} -> ${s.bidsSubjectId}`);
    }
  }

  rmSync(outDir, { recursive: true, force: true });
}

async function main() {
  for (const c of COHORTS) {
    await testCohort(c);
  }
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
