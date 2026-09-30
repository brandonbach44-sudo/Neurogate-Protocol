/**
 * PET regression: detection, BIDS naming, validation warnings and sidecar
 * de-identification for demo-data/PET_Raw.
 *
 * The fixtures are synthetic: 1-byte NIfTI placeholders with JSON
 * sidecars modeled on what dcm2niix writes for a PET series (Modality
 * "PT", TracerName, InjectedRadioactivity, ... but no timing fields) and
 * on a complete PET2BIDS sidecar. Each case is a situation real PET data
 * produces that the engine got wrong before PET support existed:
 *
 *   PET_Brain/FDG_PET_Brain_AC + _NAC   corrected + uncorrected pair -> rec-acstat / rec-nacstat
 *   PET_Brain/CTAC_3.75_Thick           attenuation CT by name        -> ct-ac, not exported
 *   PET_Brain/CT_Brain_2.0              CT sidecar inside PET folder   -> ct-ac, not exported
 *   Series7/Brain_3D_OSEM_TOF_7         "TOF" name (was MR angio)      -> pet from sidecar
 *   Series5/series5                     meaningless name, full sidecar -> pet, dynamic, no warning
 *   FDG_PET_nosidecar                   no sidecar                     -> pet + warning
 *   PET_MR/PET_MR_T1_mprage             PET-ish name, MR sidecar       -> T1w
 *   Patient_102/AV45_amyloid_PET        tracer ID not a subject        -> trc-florbetapir
 *
 * Assertions are explicit (not a snapshot), so a failure says what broke.
 * Usage: npx tsx regression_pet.ts   (non-zero exit on failure)
 */
import { readdirSync, statSync, readFileSync } from 'fs';
import { join, relative, basename } from 'path';
import { runDetection, readJsonSidecars, readEdfHeaders } from './src/lib/detection';
import { runValidation } from './src/lib/validation';
import { buildFileEntries } from './src/lib/bids/exporter';
import { deidentifyJsonSidecar } from './src/lib/deidentify/jsonSidecarDeidentifier';
import type { ScannedFile } from './src/types/files';
import type { SubjectMetadata } from './src/types/metadata';
import {
  createDefaultDatasetDescription,
  createDefaultAttestation,
  createDefaultInstitutionConfig,
} from './src/types/metadata';

const ROOT = join(process.cwd(), 'demo-data', 'PET_Raw');

let failures = 0;
function check(ok: boolean, detail: string) {
  if (!ok) { failures++; console.log(`  FAIL  ${detail}`); }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const scanned: ScannedFile[] = walk(ROOT).map(full => ({
  relativePath: relative(ROOT, full).split('\\').join('/'),
  name: basename(full),
  size: statSync(full).size,
  file: new File([readFileSync(full)], basename(full)),
} as ScannedFile));

const results = runDetection(scanned, await readJsonSidecars(scanned), await readEdfHeaders(scanned));
const byPath = new Map(results.map(r => [r.relativePath, r]));

// ── Detection and naming ────────────────────────────────────────────
console.log('PET detection and naming');
const EXPECTED: [string, string, string][] = [
  // file, modality, BIDS filename ('' = not exported)
  ['Patient_101/PET_Brain/FDG_PET_Brain_AC.nii.gz',  'pet',      'sub-Patient_101_ses-preimplant_trc-FDG_rec-acstat_run-2_pet.nii.gz'],
  ['Patient_101/PET_Brain/FDG_PET_Brain_NAC.nii.gz', 'pet',      'sub-Patient_101_ses-preimplant_trc-FDG_rec-nacstat_pet.nii.gz'],
  ['Patient_101/Series7/Brain_3D_OSEM_TOF_7.nii.gz', 'pet',      'sub-Patient_101_ses-preimplant_trc-FDG_rec-acstat_run-1_pet.nii.gz'],
  ['Patient_101/Series5/series5.nii.gz',             'pet',      'sub-Patient_101_ses-preimplant_trc-FDG_rec-acdyn_pet.nii.gz'],
  ['Patient_101/FDG_PET_nosidecar.nii.gz',           'pet',      'sub-Patient_101_ses-preimplant_trc-FDG_rec-ac_pet.nii.gz'],
  ['Patient_101/PET_Brain/CTAC_3.75_Thick.nii.gz',   'ct-ac',    ''],
  ['Patient_101/PET_Brain/CT_Brain_2.0.nii.gz',      'ct-ac',    ''],
  ['Patient_101/PET_MR/PET_MR_T1_mprage.nii.gz',     'anat-T1w', 'sub-Patient_101_ses-preimplant_run-1_T1w.nii.gz'],
  ['Patient_102/AV45_amyloid_PET.nii.gz',            'pet',      'sub-Patient_102_ses-preimplant_trc-florbetapir_pet.nii.gz'],
  ['Patient_102/FDG_PET.nii.gz',                     'pet',      'sub-Patient_102_ses-preimplant_trc-FDG_pet.nii.gz'],
];
for (const [path, modality, filename] of EXPECTED) {
  const r = byPath.get(path);
  if (!r) { check(false, `${path} missing from results`); continue; }
  check(r.detectedModality === modality, `${path}: modality ${r.detectedModality}, expected ${modality}`);
  if (filename) {
    check(r.bidsPath.startsWith('primary/') && r.bidsPath.endsWith(`/${filename}`), `${path}: exported as ${r.bidsPath}, expected .../${filename}`);
    if (modality === 'pet') check(r.bidsPath.includes('/pet/'), `${path}: not in a pet/ folder (${r.bidsPath})`);
    check(r.confidence === 'high', `${path}: confidence ${r.confidence}, expected high`);
  } else {
    check(!r.bidsPath.startsWith('primary/'), `${path}: should not be exported, got ${r.bidsPath}`);
  }
}
// The sidecar travels with its image under the same name.
const acSidecar = byPath.get('Patient_101/PET_Brain/FDG_PET_Brain_AC.json');
check(Boolean(acSidecar?.bidsPath.endsWith('trc-FDG_rec-acstat_run-2_pet.json')), `AC sidecar named ${acSidecar?.bidsPath}`);
// Tracer IDs never become subjects.
check(new Set(results.map(r => r.subjectGroup)).size === 2, `subjects: ${[...new Set(results.map(r => r.subjectGroup))].join(', ')}`);
// The attenuation CT must not be filed under post-implant as an electrode CT.
for (const p of ['Patient_101/PET_Brain/CTAC_3.75_Thick.nii.gz', 'Patient_101/PET_Brain/CT_Brain_2.0.nii.gz']) {
  check(byPath.get(p)?.detectedSession !== 'ses-postimplant', `${p} filed as post-implant`);
}

// ── Validation warnings ─────────────────────────────────────────────
console.log('PET sidecar warnings');
const subjects: SubjectMetadata[] = ['Patient_101', 'Patient_102'].map(g => ({
  subjectGroup: g,
  bidsSubjectId: `sub-${g}`,
  sessions: [{ sessionId: 'ses-preimplant', acqTime: '', age: '' }],
} as SubjectMetadata));
const description = createDefaultDatasetDescription();
description.name = 'PET regression';
description.authors = ['Regression'];
const attestation = createDefaultAttestation();
attestation.confirmed = true;
attestation.timestamp = '2026-01-01T00:00:00.000Z';
const institution = createDefaultInstitutionConfig();
institution.prefix = 'PET';
const report = await runValidation({
  detectionResults: results, subjects, datasetDescription: description,
  defacingAttestation: attestation, institutionConfig: institution,
});
const petIssues = report.issues.filter(i => i.id.startsWith('pet-'));
check(petIssues.every(i => i.severity === 'warning' && i.dismissable), 'PET issues must be dismissable warnings, never errors');
const noSidecar = petIssues.find(i => i.title.includes('without a JSON sidecar'));
check(Boolean(noSidecar?.affectedFiles.includes('Patient_101/FDG_PET_nosidecar.nii.gz')), 'no-sidecar warning missing for FDG_PET_nosidecar');
const missing = petIssues.filter(i => i.title.includes('missing BIDS-required'));
const flagged = missing.flatMap(i => i.affectedFiles);
check(flagged.includes('Patient_102/FDG_PET.nii.gz'), 'dcm2niix-only sidecar not flagged as incomplete');
check(missing.some(i => i.description.includes('TimeZero')), 'missing-field warning does not list TimeZero (dcm2niix never writes it)');
check(!missing.some(i => /Missing: .*\bTracerName\b/.test(i.description)), 'TracerName reported missing though dcm2niix wrote it');
check(!flagged.includes('Patient_101/Series5/series5.nii.gz'), 'complete PET2BIDS sidecar was flagged');

// ── Sidecar de-identification ───────────────────────────────────────
console.log('PET sidecar de-identification');
const entries = buildFileEntries(results, subjects, description, new Map([['Patient_101', 10], ['Patient_102', 10]]));
const series5Json = entries.find(e => e.path.endsWith('trc-FDG_rec-acdyn_pet.json'));
check(Boolean(series5Json?.jsonDeidentify), 'PET sidecar not marked for de-identification');
const deid = deidentifyJsonSidecar(readFileSync(join(ROOT, 'Patient_101/Series5/series5.json'), 'utf-8'), { dateShiftDays: 10 });
const out = JSON.parse(deid.text);
check(out.ScanDate === '2024-03-13', `ScanDate not shifted: ${out.ScanDate}`);
check(out.TimeZero === '09:30:00', 'TimeZero (time of day) should be left as is');
const named = deidentifyJsonSidecar(readFileSync(join(ROOT, 'Patient_102/FDG_PET.json'), 'utf-8'), { dateShiftDays: 10 });
check(JSON.parse(named.text).PatientName === 'X', 'PatientName in a PET sidecar not blanked');

if (failures > 0) {
  console.error(`\n${failures} PET regression failure(s).`);
  process.exit(1);
}
console.log('\nAll PET checks passed.');
