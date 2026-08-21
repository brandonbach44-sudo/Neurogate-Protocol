/**
 * Regression check for Flywheel / longitudinal real-world layouts.
 *
 * The original regression.ts fixture (demo-data/EpilepsyStudy_Raw) is an
 * Implant-sessions dataset with tidy modality-named folders. It passed
 * unchanged through every bug found in the 2026-08-17 audit, because it
 * contains no field maps, no Siemens sequence names, no derived diffusion
 * maps and no date-folder sessions. A suite that cannot fail on those is
 * not protecting them, so this second fixture covers the shapes that
 * actually broke:
 *
 *   - Flywheel timepoint folder names ("2weeks", "6months")
 *   - YYYYMMDD session folders, nested Flywheel-style so the session
 *     folder is a file's GRANDparent (the folder-cluster depth bug)
 *   - gre_field_mapping / gre_field_mappingRS with _e1/_e2/_e2_ph, twice
 *     in one session (fmap regex + per-series magnitude/phasediff)
 *   - Siemens ep2d_diff_* raw diffusion (no dwi/dti token in the name)
 *   - a derived ADC map whose filename hides it and whose sidecar
 *     ImageType is the only evidence (DERIVED/ADC)
 *   - a _TW series that looks derived but whose ImageType says ORIGINAL,
 *     pinning the distinction that must NOT be inferred from the name
 *   - pd_tse_tra (PDw), Sag_SWI_3D / Mag_Images / Pha_Images (T2starw),
 *     MoCoSeries (func + rec-moco), MP-RAGE / 3D_TFLR / T2flr aliases
 *
 * The fixture is synthetic: placeholder gzip payloads with real-world
 * names. No patient data is committed.
 *
 * Usage:
 *   npx tsx regression_flywheel.ts            # fail on drift
 *   npx tsx regression_flywheel.ts --update   # rewrite the snapshot
 */
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, relative, basename } from 'path';
import { runDetection, generateSummary, readJsonSidecars } from './src/lib/detection';
import { computeBidsNames } from './src/lib/bids/bidsNaming';
import type { ScannedFile } from './src/types/files';
import type { DatasetStructure } from './src/types/sessionStructure';

const ROOT = join(process.cwd(), 'demo-data', 'FlywheelLongitudinal_Raw');
const EXPECTED_PATH = join(process.cwd(), 'regression_flywheel_expected.json');
const UPDATE_MODE = process.argv.includes('--update');

/** Both fixture subjects are two-timepoint longitudinal studies. */
const STRUCTURE: DatasetStructure = {
  presetId: 'custom-timepoints',
  timepoints: [
    { number: 2, unit: 'week' },
    { number: 6, unit: 'month' },
  ],
} as DatasetStructure;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function toScannedFiles(root: string): ScannedFile[] {
  return walk(root).map((full) => {
    const buf = readFileSync(full);
    const name = basename(full);
    const relativePath = join(basename(root), relative(root, full)).split('\\').join('/');
    return {
      relativePath,
      name,
      size: statSync(full).size,
      file: new File([buf], name),
    } as ScannedFile;
  });
}

async function runSubject(subject: string) {
  const root = join(ROOT, subject);
  const scanned = toScannedFiles(root);
  const sidecarMap = await readJsonSidecars(scanned);

  let results = runDetection(scanned, sidecarMap, undefined, STRUCTURE);
  results = computeBidsNames(results, undefined, STRUCTURE);
  const summary = generateSummary(results, STRUCTURE);

  return {
    subject,
    fileCount: scanned.length,
    detection: results
      .map((r) => ({
        relativePath: r.relativePath,
        detectedModality: r.detectedModality,
        detectedSession: r.detectedSession,
        confidence: r.confidence,
        modalityIsGuess: r.modalityIsGuess ?? false,
        duplicateOf: r.duplicateOf ?? null,
        bidsPath: r.bidsPath,
      }))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    summary: {
      totalFiles: summary.totalFiles,
      highConfidence: summary.highConfidence,
      mediumConfidence: summary.mediumConfidence,
      lowConfidence: summary.lowConfidence,
      unclassified: summary.unclassified,
      subjectGroups: summary.subjectGroups,
    },
  };
}

async function main() {
  if (!existsSync(ROOT)) {
    console.error(`Fixture missing: ${ROOT}`);
    process.exit(1);
  }

  const subjects = readdirSync(ROOT).filter((d) => statSync(join(ROOT, d)).isDirectory()).sort();
  const actual = [];
  for (const s of subjects) actual.push(await runSubject(s));

  for (const r of actual) {
    const exported = r.detection.filter((d) => d.bidsPath.startsWith('primary/')).length;
    const guessed = r.detection.filter((d) => d.modalityIsGuess).length;
    const guessedExported = r.detection.filter(
      (d) => d.modalityIsGuess && d.bidsPath.startsWith('primary/'),
    ).length;
    console.log(
      `     ${r.subject.padEnd(12)} ${String(r.fileCount).padStart(3)} files, ` +
      `${exported} exported, ${guessed} guessed modality, ${guessedExported} guessed-and-exported`,
    );
    // A series present twice must export exactly once, or the dataset
    // double-counts the acquisition.
    const dupExported = r.detection.filter(
      (d) => d.duplicateOf && d.bidsPath.startsWith('primary/'),
    );
    if (dupExported.length > 0) {
      console.error(
        `\nFAIL  ${r.subject}: ${dupExported.length} redundant duplicate cop${dupExported.length === 1 ? 'y was' : 'ies were'} ` +
        `exported into primary/. Each series converted twice must export exactly once:\n` +
        dupExported.map((d) => `        ${d.relativePath}`).join('\n'),
      );
      process.exit(1);
    }

    // A guessed modality must never reach the BIDS tree. This is the
    // invariant the whole 2026-08-17 fix exists to hold.
    if (guessedExported > 0) {
      console.error(
        `\nFAIL  ${r.subject}: ${guessedExported} file(s) with a guessed modality were exported ` +
        `into primary/. A modality that came only from the blind T1w fallback must stay in ` +
        `unclassified/ until a user assigns it.`,
      );
      process.exit(1);
    }
  }

  if (UPDATE_MODE) {
    writeFileSync(EXPECTED_PATH, JSON.stringify(actual, null, 2) + '\n');
    console.log(`\nWrote ${EXPECTED_PATH}`);
    return;
  }

  if (!existsSync(EXPECTED_PATH)) {
    console.error(`\nNo snapshot at ${EXPECTED_PATH}. Run with --update first.`);
    process.exit(1);
  }

  const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'));
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    console.error('\nDRIFT detected against regression_flywheel_expected.json.');
    // Point at the first differing entry so the failure is actionable.
    for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
      const e = JSON.stringify(expected[i]);
      const a = JSON.stringify(actual[i]);
      if (e !== a) {
        const eD = expected[i]?.detection ?? [];
        const aD = actual[i]?.detection ?? [];
        for (let j = 0; j < Math.max(eD.length, aD.length); j++) {
          if (JSON.stringify(eD[j]) !== JSON.stringify(aD[j])) {
            console.error(`\n  first difference — ${actual[i]?.subject ?? expected[i]?.subject}:`);
            console.error(`    expected: ${JSON.stringify(eD[j])}`);
            console.error(`    actual:   ${JSON.stringify(aD[j])}`);
            break;
          }
        }
        break;
      }
    }
    console.error('\nIf the new behavior is correct, re-run with --update.');
    process.exit(1);
  }

  console.log('\nNo drift detected. Flywheel/longitudinal output matches regression_flywheel_expected.json.');
}

main().catch((e) => { console.error(e); process.exit(1); });
