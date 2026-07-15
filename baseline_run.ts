import { readdirSync, statSync, readFileSync, writeFileSync, openSync, readSync, closeSync } from 'fs';
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

const READ_CAP = 25 * 1024 * 1024; // 25 MB

function readCapped(path: string, size: number): Buffer {
  if (size <= READ_CAP) return readFileSync(path);
  const buf = Buffer.alloc(READ_CAP);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buf, 0, READ_CAP, 0);
  } finally {
    closeSync(fd);
  }
  return buf;
}

const DEMO_ROOT = process.argv[2] || '../demo_patient_data';

const SAMPLES = [
  'HUP282.edf',
  'Patient_002',
  'Patient_003',
  'Patient_004',
  'Smith_John',
  'sub-SINHA',
];

function walk(dir: string, base: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, base, out);
    else out.push(full);
  }
  return out;
}

function toScannedFiles(root: string): ScannedFile[] {
  const st = statSync(root);
  const files = st.isDirectory() ? walk(root, root) : [root];

  return files.map((full) => {
    const realSize = statSync(full).size;
    const buf = readCapped(full, realSize);
    const name = basename(full);
    const relativePath = st.isDirectory()
      ? join(basename(root), relative(root, full))
      : name;
    const file = new File([buf], name);
    return {
      relativePath: relativePath.split('\\').join('/'),
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
  datasetDescription.name = 'Phase 0 Baseline';
  datasetDescription.authors = ['Baseline Script'];
  const defacingAttestation = createDefaultAttestation();
  defacingAttestation.confirmed = true;
  defacingAttestation.timestamp = new Date().toISOString();
  const institutionConfig = createDefaultInstitutionConfig();
  institutionConfig.prefix = 'BASE';

  const validationReport = runValidation({
    detectionResults,
    subjects,
    datasetDescription,
    defacingAttestation,
    institutionConfig,
  });

  return {
    sample: sampleName,
    fileCount: scanned.length,
    detection: detectionResults.map((r) => ({
      relativePath: r.relativePath,
      detectedModality: r.detectedModality,
      detectedSession: r.detectedSession,
      confidence: r.confidence,
      subjectGroup: r.subjectGroup,
      bidsFilename: r.bidsFilename,
      bidsPath: r.bidsPath,
    })),
    detectionSummary: summary,
    validationSummary: {
      passed: validationReport.passed,
      issueCount: validationReport.issues.length,
      issues: validationReport.issues,
    },
  };
}

async function main() {
  const results: unknown[] = [];
  for (const sample of SAMPLES) {
    try {
      const r: any = await runSample(sample);
      results.push(r);
      console.log(`OK   ${sample}: ${r.fileCount} files, ${r.detectionSummary.unclassified} unclassified, ${r.validationSummary.issueCount} validation issues`);
    } catch (err) {
      console.log(`FAIL ${sample}: ${(err as Error).message}`);
      results.push({ sample, error: (err as Error).message });
    }
  }

  writeFileSync(
    'baseline_results.json',
    JSON.stringify({ capturedAt: new Date().toISOString(), results }, null, 2),
  );
  console.log('\nWrote baseline_results.json');
}

main();
