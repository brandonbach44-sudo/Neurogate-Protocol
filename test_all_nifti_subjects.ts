import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runNeuroGatePipeline } from './src/cli/pipeline';
import { createDefaultDatasetDescription } from './src/types/metadata';

// ── NIfTI-ready subjects (nii.gz >= 3) ─────────────────────────────────
// Inner path = [base]/[cohort]/[subj]/scitran/phase2_mri/[cohort]/[subj]
// Session strategy:
//   - 2weeks cohorts  → custom-timepoints ses-2wk
//   - date cohorts    → single-session (date folder won't resolve to a label)

const DATA_ROOT = join(process.cwd(), '..', '..', 'ng_test_nifti_only');

function innerPath(cohort: string, subj: string): string {
  // Try Flywheel-wrapped structure first (scitran/phase2_mri/cohort/subj)
  const flywheelPath = join(DATA_ROOT, cohort, subj, 'scitran', 'phase2_mri', cohort, subj);
  if (existsSync(flywheelPath)) return flywheelPath;
  // Fall back: session folders are directly inside the subject folder
  return join(DATA_ROOT, cohort, subj);
}

const STRUCTURE_2WK = {
  presetId: 'custom-timepoints' as const,
  timepoints: [
    { number: 2, unit: 'week' as const },
    { number: 6, unit: 'month' as const },
  ],
};
const STRUCTURE_SINGLE = { presetId: 'single-session' as const };

interface SubjectSpec {
  cohort: string;
  subj: string;
  structure: typeof STRUCTURE_2WK | typeof STRUCTURE_SINGLE;
}

const SUBJECTS: SubjectSpec[] = [
  // ── Phase2_MRI (2-week session) ─────────────────────────────────────
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
  { cohort: 'Phase2_MRI', subj: '01_1245', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '01_1265', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '01_1290', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '02_1245', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '02_1290', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '03_1265', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '07_1245', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '07_1265', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI', subj: '08_1290', structure: STRUCTURE_2WK },
  // ── Phase2_MRI_FriendControls (2-week session) ──────────────────────
  { cohort: 'Phase2_MRI_FriendControls', subj: '01_1519', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI_FriendControls', subj: '01_1520', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI_FriendControls', subj: '01_1539', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI_FriendControls', subj: '02_1274', structure: STRUCTURE_2WK },
  { cohort: 'Phase2_MRI_FriendControls', subj: '02_1293', structure: STRUCTURE_2WK },
  // ── Phase2_MRI_OrthoControls (date-based, single session) ───────────
  { cohort: 'Phase2_MRI_OrthoControls', subj: '01_1522', structure: STRUCTURE_SINGLE },
  { cohort: 'Phase2_MRI_OrthoControls', subj: '01_1523', structure: STRUCTURE_SINGLE },
  { cohort: 'Phase2_MRI_OrthoControls', subj: '08_1229', structure: STRUCTURE_SINGLE },
];

// ── Condensed summary per subject ───────────────────────────────────────

interface SubjectResult {
  cohort: string;
  subj: string;
  status: string;
  high: number;
  med: number;
  low: number;
  unclassified: number;
  subjects: string[];
  sessions: string[];
  errors: string[];
  warnings: string[];
}

const results: SubjectResult[] = [];

async function testSubject(spec: SubjectSpec): Promise<SubjectResult> {
  const path = innerPath(spec.cohort, spec.subj);
  const outDir = mkdtempSync(join(tmpdir(), 'ng-'));
  const desc = createDefaultDatasetDescription();
  desc.name = `${spec.cohort}/${spec.subj}`;

  // Suppress per-file logs — only keep errors/warnings/summary
  const errors: string[] = [];
  const warnings: string[] = [];
  const sessions = new Set<string>();

  try {
    const result = await runNeuroGatePipeline(
      {
        sourceFolder: path,
        structure: spec.structure,
        institutionConfig: { prefix: 'PENN', startingNumber: 1 },
        datasetDescription: desc,
        defacingConfirmed: false,
        outputDir: outDir,
        proceedDespiteWarnings: true,
        exportedBy: 'test-script',
      },
      {
        onLog: (msg: string) => {
          // Only capture errors, warnings, and session info
          if (msg.includes('[ERROR]')) errors.push(msg.replace(/^.*\[ERROR\]\s*/, '').trim());
          if (msg.includes('[WARNING]') && !msg.includes('Unclassified file') && !msg.includes('Phone Number') && !msg.includes('DICOM file detected')) {
            warnings.push(msg.replace(/^.*\[WARNING\]\s*/, '').trim());
          }
          // Detect sessions assigned
          const sesMatch = msg.match(/ses-[\w]+/g);
          if (sesMatch) sesMatch.forEach(s => sessions.add(s));
          // Also catch "Matched Flywheel folder" style messages
          const fwMatch = msg.match(/parsed as (ses-[\w]+)/);
          if (fwMatch) sessions.add(fwMatch[1]);
        }
      }
    );

    const base: Partial<SubjectResult> = {
      cohort: spec.cohort,
      subj: spec.subj,
      status: result.status,
      sessions: [...sessions],
      errors,
      warnings,
    };

    if ('summary' in result) {
      const s = result.summary;
      return {
        ...base,
        high: s.highConfidence,
        med: s.mediumConfidence,
        low: s.lowConfidence,
        unclassified: s.unclassified,
        subjects: s.subjectGroups,
      } as SubjectResult;
    }

    if ('validationReport' in result) {
      const vr = result.validationReport;
      for (const issue of vr.issues) {
        if (issue.severity === 'error') errors.push(issue.description);
        else warnings.push(issue.description);
      }
    }

    return {
      ...base,
      high: 0, med: 0, low: 0, unclassified: 0, subjects: [],
    } as SubjectResult;

  } catch (e: unknown) {
    return {
      cohort: spec.cohort,
      subj: spec.subj,
      status: 'exception',
      high: 0, med: 0, low: 0, unclassified: 0,
      subjects: [],
      sessions: [],
      errors: [String(e)],
      warnings: [],
    };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log(`Testing ${SUBJECTS.length} NIfTI-ready subjects...\n`);

  for (const spec of SUBJECTS) {
    process.stdout.write(`  ${spec.cohort}/${spec.subj} ...`);
    const r = await testSubject(spec);
    results.push(r);
    console.log(` done (${r.status}, hi=${r.high} unclassified=${r.unclassified})`);
  }

  // ── Final report ──────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(100));
  console.log('NEUROGATE TEST REPORT — ALL NIfTI SUBJECTS');
  console.log('='.repeat(100));
  console.log(`${'Cohort'.padEnd(35)} ${'Subj'.padEnd(10)} ${'Status'.padEnd(22)} ${'Hi'.padStart(3)} ${'Med'.padStart(3)} ${'Low'.padStart(3)} ${'Unc'.padStart(5)}  Sessions`);
  console.log('-'.repeat(100));

  for (const r of results) {
    const sesStr = r.sessions.length ? r.sessions.join(', ') : '(none)';
    const subjectStr = r.subjects.length ? r.subjects.join(',') : '(none)';
    const tag = r.high + r.med + r.low > 0 ? '' : ' ⚠';
    console.log(`${r.cohort.slice(0,35).padEnd(35)} ${r.subj.padEnd(10)} ${r.status.slice(0,22).padEnd(22)} ${String(r.high).padStart(3)} ${String(r.med).padStart(3)} ${String(r.low).padStart(3)} ${String(r.unclassified).padStart(5)}  ${sesStr}`);
    if (r.subjects.length > 0) console.log(`${''.padStart(47)}  Subjects: ${subjectStr}`);
    if (r.errors.length > 0 && !r.errors.every(e => e.includes('Defacing'))) {
      for (const e of r.errors.filter(e => !e.includes('Defacing'))) {
        console.log(`${''.padStart(47)}  !! ${e.slice(0, 70)}`);
      }
    }
    if (r.warnings.length > 0) {
      for (const w of r.warnings.slice(0, 3)) {
        console.log(`${''.padStart(47)}  >> ${w.slice(0, 70)}`);
      }
    }
  }

  console.log('\n' + '='.repeat(100));
  const passing = results.filter(r => r.high > 0);
  const noSession = results.filter(r => r.sessions.length === 0);
  const noHigh = results.filter(r => r.high === 0);
  console.log(`SUMMARY: ${results.length} subjects tested | ${passing.length} have high-confidence detections | ${noSession.length} with no session detected | ${noHigh.length} with zero high-confidence files`);
}

main().catch(e => { console.error(e); process.exit(1); });
