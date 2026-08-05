/**
 * One-off verification script for the Node filesystem adapter
 * (lib/adapters/nodeFileAdapter.ts + scanDirectory.ts).
 *
 * Mirrors regression.ts exactly, except files are scanned via
 * scanDirectory() (lazy, path-based NodeFileAdapter reads) instead of
 * regression.ts's toScannedFiles() (eager readFileSync()+new File()).
 * Diffs the result against the same committed regression_expected.json
 * golden snapshot regression.ts uses.
 *
 * This is the checkpoint for Phase 4/6 Revision Step 1 (core
 * extraction): if this produces zero diffs, the adapter reads/detects
 * byte-identically to the browser File path, which is the whole point
 * of building FileLike/NodeFileAdapter instead of just wiring the CLI
 * to Node's built-in File/Blob (which would eagerly buffer, defeating
 * the large-EDF-file memory goal this exists for).
 *
 * Usage: npx tsx verify_adapter.ts
 */
import { readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import { scanDirectory } from './src/lib/adapters/scanDirectory';
import { runDetection, generateSummary, readJsonSidecars, readEdfHeaders } from './src/lib/detection';
import { runValidation } from './src/lib/validation';
import type { ScannedFile } from './src/types/files';
import type { SubjectMetadata } from './src/types/metadata';
import {
  createDefaultDatasetDescription,
  createDefaultAttestation,
  createDefaultInstitutionConfig,
} from './src/types/metadata';

const DEMO_ROOT = join(process.cwd(), 'demo-data', 'EpilepsyStudy_Raw');
const EXPECTED_PATH = join(process.cwd(), 'regression_expected.json');

async function runSample(sampleName: string) {
  const root = join(DEMO_ROOT, sampleName);
  // scanDirectory() now prefixes relativePath with the root folder's own
  // name itself (matching regression.ts's toScannedFiles() convention),
  // so no manual prefixing needed here anymore.
  const scanned = await scanDirectory(root);

  const sidecarMap = await readJsonSidecars(scanned);
  const edfHeaderMap = await readEdfHeaders(scanned);

  const detectionResults = runDetection(scanned, sidecarMap, edfHeaderMap);
  const summary = generateSummary(detectionResults);

  const groups = summary.subjectGroups;
  const subjects: SubjectMetadata[] = groups.map((g, i) => ({
    subjectGroup: g,
    bidsSubjectId: `sub-BASE${String(i + 1).padStart(3, '0')}`,
    sessions: ['ses-preimplant', 'ses-postimplant'].map((sessionId) => ({
      sessionId: sessionId as SubjectMetadata['sessions'][number]['sessionId'],
      acqTime: '2026-01-01',
      age: '30',
    })),
  }));

  const datasetDescription = createDefaultDatasetDescription();
  datasetDescription.name = 'Regression Fixture';
  datasetDescription.authors = ['Regression Script'];
  const defacingAttestation = createDefaultAttestation();
  defacingAttestation.confirmed = true;
  defacingAttestation.timestamp = '2026-01-01T00:00:00.000Z';
  const institutionConfig = createDefaultInstitutionConfig();
  institutionConfig.prefix = 'BASE';

  const validationReport = await runValidation({
    detectionResults,
    subjects,
    datasetDescription,
    defacingAttestation,
    institutionConfig,
  } as Parameters<typeof runValidation>[0]);

  return {
    sample: sampleName,
    fileCount: scanned.length,
    detection: detectionResults
      .map((r) => ({
        relativePath: r.relativePath,
        detectedModality: r.detectedModality,
        detectedSession: r.detectedSession,
        confidence: r.confidence,
        subjectGroup: r.subjectGroup,
        bidsFilename: r.bidsFilename,
        bidsPath: r.bidsPath,
      }))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    detectionSummary: summary,
    validationSummary: {
      passed: validationReport.passed,
      issueCount: validationReport.issues.length,
      issues: validationReport.issues,
    },
  };
}

function diff(path: string, expected: unknown, actual: unknown, out: string[]): void {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return;

  const bothObjects =
    expected && actual && typeof expected === 'object' && typeof actual === 'object' && !Array.isArray(expected) && !Array.isArray(actual);

  if (bothObjects) {
    const keys = new Set([...Object.keys(expected as object), ...Object.keys(actual as object)]);
    for (const key of keys) {
      diff(`${path}.${key}`, (expected as any)[key], (actual as any)[key], out);
    }
    return;
  }

  const bothArrays = Array.isArray(expected) && Array.isArray(actual);
  if (bothArrays && expected.length === actual.length) {
    for (let i = 0; i < expected.length; i++) {
      diff(`${path}[${i}]`, expected[i], actual[i], out);
    }
    return;
  }

  out.push(`${path}:\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
}

async function main() {
  const samples = readdirSync(DEMO_ROOT).filter((d) => statSync(join(DEMO_ROOT, d)).isDirectory()).sort();
  const results: unknown[] = [];

  for (const sample of samples) {
    try {
      const r = await runSample(sample);
      results.push(r);
      console.log(`OK   ${sample}: ${r.fileCount} files, ${r.detectionSummary.unclassified} unclassified, ${r.validationSummary.issueCount} validation issues`);
    } catch (err) {
      console.log(`FAIL ${sample}: ${(err as Error).message}`);
      results.push({ sample, error: (err as Error).message });
    }
  }

  const snapshot = { results };

  if (!existsSyncQuiet(EXPECTED_PATH)) {
    console.error(`No regression_expected.json found at ${EXPECTED_PATH} -- run regression.ts first.`);
    process.exit(1);
  }

  const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf-8'));
  const diffs: string[] = [];
  diff('results', expected.results, snapshot.results, diffs);

  if (diffs.length > 0) {
    console.error(`\nADAPTER MISMATCH vs regression_expected.json -- ${diffs.length} field(s) differ between the browser-File path and the NodeFileAdapter path:\n`);
    for (const d of diffs) console.error(`  ${d}\n`);
    process.exit(1);
  }

  console.log('\nNode filesystem adapter verified: output is byte-identical to the browser File path across all demo-data samples.');
}

function existsSyncQuiet(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

main();
