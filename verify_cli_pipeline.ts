/**
 * End-to-end verification of the CLI pipeline (src/cli/pipeline.ts)
 * against real demo data -- exercises the full scan -> detect ->
 * validate -> export sequence exactly as the interactive CLI would,
 * but with literal options instead of terminal prompts (see
 * pipeline.ts's module doc for why it's split out this way).
 *
 * Checks:
 *   1. Export succeeds against Patient_001 (Implant sessions preset)
 *      with a complete dataset description and defacing confirmed.
 *   2. The written BIDS output folder has the expected structure --
 *      dataset_description.json, participants.tsv, sub-<ID> folders.
 *   3. Blocking behavior: omitting defacing confirmation (when
 *      structural MRI is present) produces a validation ERROR and
 *      writes nothing -- proves the CLI actually enforces the same
 *      HIPAA defacing requirement the web app does, not a softer CLI
 *      shortcut.
 *   4. Audit log was written and contains the expected entries.
 *
 * Usage: npx tsx verify_cli_pipeline.ts
 */
import { existsSync, readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runNeuroGatePipeline, type NeuroGateRunOptions } from './src/cli/pipeline';
import { createDefaultDatasetDescription } from './src/types/metadata';

const PATIENT_ROOT = join(process.cwd(), 'demo-data', 'EpilepsyStudy_Raw', 'Patient_001');
const STUDY_ROOT = join(process.cwd(), 'demo-data', 'EpilepsyStudy_Raw');

function baseOptions(outputDir: string): NeuroGateRunOptions {
  const datasetDescription = createDefaultDatasetDescription();
  datasetDescription.name = 'CLI Pipeline Verification';
  datasetDescription.authors = ['Verification Script'];

  return {
    sourceFolder: PATIENT_ROOT,
    structure: { presetId: 'implant' },
    institutionConfig: { prefix: 'VRFY', startingNumber: 1 },
    datasetDescription,
    defacingConfirmed: true,
    outputDir,
    proceedDespiteWarnings: true,
    exportedBy: 'verify-script',
  };
}

async function verifySuccessfulExport(): Promise<boolean> {
  console.log('--- Check 1: successful export against Patient_001 ---');
  const outDir = mkdtempSync(join(tmpdir(), 'neurogate-cli-verify-'));
  const logs: string[] = [];

  const result = await runNeuroGatePipeline(baseOptions(outDir), { onLog: (m) => logs.push(m) });

  console.log(`  status: ${result.status}`);
  console.log(`  subjects: ${result.subjects.map(s => `${s.subjectGroup}->${s.bidsSubjectId}`).join(', ')}`);
  console.log(`  filesWritten: ${result.filesWritten}`);
  console.log(`  validation: ${result.validationReport.errorCount} errors, ${result.validationReport.warningCount} warnings`);

  const bidsRoot = join(outDir, 'bids_output');
  const hasDatasetDesc = existsSync(join(bidsRoot, 'dataset_description.json'));
  const hasParticipants = existsSync(join(bidsRoot, 'participants.tsv'));
  const subjectDirs = existsSync(join(bidsRoot, 'primary'))
    ? readdirSync(join(bidsRoot, 'primary'))
    : [];
  const hasSubjectFolder = subjectDirs.some(d => d.startsWith('sub-VRFY'));

  console.log(`  dataset_description.json present: ${hasDatasetDesc}`);
  console.log(`  participants.tsv present: ${hasParticipants}`);
  console.log(`  sub-VRFY* folder present: ${hasSubjectFolder} (found: ${subjectDirs.join(', ')})`);

  const auditOk = !!result.auditPath && existsSync(result.auditPath);
  let auditHasEntries = false;
  if (auditOk) {
    const auditJson = JSON.parse(readFileSync(result.auditPath!, 'utf-8'));
    auditHasEntries = Array.isArray(auditJson.entries) && auditJson.entries.length > 5;
    console.log(`  audit_log.json entries: ${auditJson.entries?.length ?? 0}`);
  }

  rmSync(outDir, { recursive: true, force: true });

  const pass =
    result.status === 'exported' &&
    (result.filesWritten ?? 0) > 0 &&
    hasDatasetDesc &&
    hasParticipants &&
    hasSubjectFolder &&
    auditOk &&
    auditHasEntries;

  console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

async function verifyDefacingBlocksExport(): Promise<boolean> {
  console.log('\n--- Check 2: missing defacing attestation blocks export (enforces HIPAA requirement) ---');
  const outDir = mkdtempSync(join(tmpdir(), 'neurogate-cli-verify-block-'));

  const options = baseOptions(outDir);
  options.defacingConfirmed = false; // withhold attestation -- Patient_001 has T1w/T2w/FLAIR

  const result = await runNeuroGatePipeline(options);

  console.log(`  status: ${result.status}`);
  console.log(`  validation errors: ${result.validationReport.errorCount}`);
  const defacingError = result.validationReport.issues.find(i => i.category === 'defacing' && i.severity === 'error');
  console.log(`  defacing error present: ${!!defacingError}`);

  const nothingWritten = !existsSync(join(outDir, 'bids_output'));
  console.log(`  nothing written to disk: ${nothingWritten}`);

  rmSync(outDir, { recursive: true, force: true });

  const pass = result.status === 'blocked-by-errors' && !!defacingError && nothingWritten;
  console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

/** Every real filename this pipeline writes has exactly one extension, except .nii.gz (two dots, by BIDS convention). Anything else with two extension-shaped suffixes (e.g. ".edf.nwb") would mean two files collided and got concatenated instead of properly disambiguated. */
function hasSuspiciousDoubleExtension(filename: string): boolean {
  if (filename.toLowerCase().endsWith('.nii.gz')) return false;
  return /\.[a-z0-9]+\.[a-z0-9]+$/i.test(filename);
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

async function verifyMultiPatientStudy(): Promise<boolean> {
  console.log('\n--- Check 3: multi-patient study folder (realistic CLI usage) ---');
  const outDir = mkdtempSync(join(tmpdir(), 'neurogate-cli-verify-multi-'));

  const options = baseOptions(outDir);
  options.sourceFolder = STUDY_ROOT;
  const result = await runNeuroGatePipeline(options);

  console.log(`  status: ${result.status}`);
  console.log(`  subjects (should be 5, one per patient): ${result.subjects.length} -- ${result.subjects.map(s => `${s.subjectGroup}->${s.bidsSubjectId}`).join(', ')}`);
  console.log(`  filesWritten: ${result.filesWritten}`);

  const writtenFiles = existsSync(join(outDir, 'bids_output')) ? walkFiles(join(outDir, 'bids_output')) : [];
  const suspicious = writtenFiles.filter(f => hasSuspiciousDoubleExtension(f));
  console.log(`  Files with a suspicious double extension: ${suspicious.length}${suspicious.length ? ` -- ${suspicious.join(', ')}` : ''}`);

  rmSync(outDir, { recursive: true, force: true });

  // The whole point of this check: scanning the parent study folder
  // must group by patient (5 subjects), not by session-folder-name (15
  // fake subjects) -- this is exactly the bug scanDirectory()'s
  // relativePath prefix fix addressed.
  const pass = result.status === 'exported' && result.subjects.length === 5 && suspicious.length === 0;
  console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

async function main() {
  const check1 = await verifySuccessfulExport();
  const check2 = await verifyDefacingBlocksExport();
  const check3 = await verifyMultiPatientStudy();

  console.log('\n=== Result ===');
  console.log(`Successful export: ${check1 ? 'PASS' : 'FAIL'}`);
  console.log(`Defacing enforcement: ${check2 ? 'PASS' : 'FAIL'}`);
  console.log(`Multi-patient study grouping: ${check3 ? 'PASS' : 'FAIL'}`);

  if (!check1 || !check2 || !check3) process.exit(1);
  console.log('\nAll CLI pipeline checks passed.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
