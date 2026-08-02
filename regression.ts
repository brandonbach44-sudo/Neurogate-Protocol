/**
 * CI-safe regression check.
 *
 * Runs the detection + validation engines against the synthetic,
 * committed-to-git sample data in demo-data/EpilepsyStudy_Raw (Patient_001-005)
 * and diffs the output against a committed golden snapshot
 * (regression_expected.json).
 *
 * Unlike baseline.ts/baseline_run.ts (which point at ../demo_patient_data,
 * a real-ish local-only sample set that must never be committed or run in
 * CI), this script only touches the small synthetic fixtures already in
 * the repo, so it is safe to run on every push.
 *
 * Usage:
 *   npx tsx regression.ts            # compare against regression_expected.json, exit 1 on drift
 *   npx tsx regression.ts --update   # (re)write regression_expected.json from current output
 *
 * Run with: npx tsx regression.ts
 */
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, relative, basename } from 'path';
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
const UPDATE_MODE = process.argv.includes('--update');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function toScannedFiles(root: string): ScannedFile[] {
  const files = walk(root);
  return files.map((full) => {
    const realSize = statSync(full).size;
    const buf = readFileSync(full);
    const name = basename(full);
    const relativePath = join(basename(root), relative(root, full)).split('\\').join('/');
    const file = new File([buf], name);
    return {
      relativePath,
      name,
      size: realSize,
      file,
    } as ScannedFile;
  });
}

async function runSample(sampleName: string) {
  const root = join(DEMO_ROOT, sampleName);
  const scanned = toScannedFiles(root);

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
  });

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

// Minimal recursive diff so failures point at the exact field that moved,
// instead of dumping two multi-KB JSON blobs and making Brandon eyeball them.
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

  if (UPDATE_MODE || !existsSync(EXPECTED_PATH)) {
    writeFileSync(EXPECTED_PATH, JSON.stringify(snapshot, null, 2) + '\n');
    console.log(`\nWrote ${EXPECTED_PATH}`);
    return;
  }

  const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf-8'));
  const diffs: string[] = [];
  diff('results', expected.results, snapshot.results, diffs);

  if (diffs.length > 0) {
    console.error(`\nREGRESSION DETECTED — ${diffs.length} field(s) changed vs regression_expected.json:\n`);
    for (const d of diffs) console.error(`  ${d}\n`);
    console.error('If this change is intentional, run `npx tsx regression.ts --update` and commit the updated regression_expected.json.');
    process.exit(1);
  }

  console.log('\nNo drift detected. Detection and validation output match regression_expected.json.');
}

main();
