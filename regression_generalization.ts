/**
 * Generalization suite: does the detection engine handle datasets LIKE
 * this one, not just this one?
 *
 * regression.ts and regression_flywheel.ts both pin exact output for
 * specific fixtures. Neither can tell you whether the engine would cope
 * with the same study run at a different site -- a GE or Philips scanner,
 * a different visit-folder convention, a different subject-id scheme.
 * This suite asks that question directly, as assertions over names rather
 * than files, so it stays cheap and readable.
 *
 * Every case here was a real miss when the suite was written (2026-08-17):
 *   - "fMRI_resting" and "pCASL" fell to the blind T1w default because the
 *     camelCase normalizer split lowercase-prefixed acronyms.
 *   - "SWIp" broke on the mirror of that bug at the other end.
 *   - GE (BRAVO/FSPGR/SWAN) and Philips (SWIp/TFE) vocabulary was absent.
 *   - "week2", "W2", "2_weeks", "visit1", "V1", "baseline/followup" had
 *     every visit folder treated as a separate PATIENT.
 *   - "T1"/"T2" briefly read as timepoint labels while fixing that, which
 *     would have mistaken modality folders for visits.
 *
 * Usage: npx tsx regression_generalization.ts   (non-zero exit on failure)
 */
import { detectFromFilename } from './src/lib/detection/filenameDetector';
import { detectCustomSession, looksLikeTimepointFolder } from './src/lib/detection/customSessionDetector';
import { resolveSessionIds } from './src/types/sessionStructure';
import type { DatasetStructure } from './src/types/sessionStructure';
import { groupIntoSubject } from './src/lib/detection/subjectGrouping';
import { isOsJunkFile } from './src/lib/detection/extensionDetector';
import type { ScannedFile } from './src/types/files';
import { DEFACING_MODALITIES } from './src/types/detection';
import { runDetection, readJsonSidecars, readEdfHeaders } from './src/lib/detection';
import { scanSidecarContentForPhi } from './src/lib/validation/phiScanner';
import { buildFileEntries, generateZip } from './src/lib/bids/exporter';
import { createDefaultDatasetDescription } from './src/types/metadata';
import type { SubjectMetadata } from './src/types/metadata';
import type { Modality } from './src/types/detection';

let failures = 0;
function report(section: string, ok: boolean, detail: string) {
  if (!ok) { failures++; console.log(`  FAIL  [${section}] ${detail}`); }
}


// ── 1. Vendor scan-name vocabulary ───────────────────────────────
const CASES: [string, string, string][] = [
  // ── Siemens (beyond what this corpus happens to contain) ─────────
  ['t1_mprage_sag_p2_iso',            'anat-T1w',     'Siemens'],
  ['t1_fl2d_tra',                     'anat-T1w',     'Siemens'],
  ['t2_space_sag_p2_iso',             'anat-T2w',     'Siemens'],
  ['t2_tse_tra_512',                  'anat-T2w',     'Siemens'],
  ['t2_flair_sag_p2_iso',             'anat-FLAIR',   'Siemens'],
  ['t2_tirm_tra_dark-fluid',          'anat-FLAIR',   'Siemens'],
  ['ep2d_bold_rest',                  'func',         'Siemens'],
  ['ep2d_pace_moco',                  'func',         'Siemens'],
  ['tof_fl3d_tra_multi-slab',         'anat-angio',   'Siemens'],
  ['pd_tse_cor',                      'anat-PDw',     'Siemens'],
  ['t2_swi_tra_p2',                   'anat-T2starw', 'Siemens'],
  ['asl_3d_tra_iso',                  'perf',         'Siemens'],
  ['gre_field_map',                   'fmap',         'Siemens'],
  ['ep2d_se_pe_polar',                'fmap',         'Siemens (topup pair)'],

  // ── GE ───────────────────────────────────────────────────────────
  ['BRAVO',                           'anat-T1w',     'GE'],
  ['3D_FSPGR_BRAVO',                  'anat-T1w',     'GE'],
  ['Ax_CUBE_T2',                      'anat-T2w',     'GE'],
  ['Sag_CUBE_FLAIR',                  'anat-FLAIR',   'GE'],
  ['Ax_DTI_30dir',                    'dwi',          'GE'],
  ['fMRI_resting',                    'func',         'GE'],
  ['3D_TOF_SPGR',                     'anat-angio',   'GE'],
  ['Ax_SWAN',                         'anat-T2starw', 'GE (SWAN = SWI)'],
  ['ASL_3D_pCASL',                    'perf',         'GE'],

  // ── Philips ──────────────────────────────────────────────────────
  ['T1W_3D_TFE',                      'anat-T1w',     'Philips'],
  ['T2W_TSE',                         'anat-T2w',     'Philips'],
  ['T2W_FLAIR',                       'anat-FLAIR',   'Philips'],
  ['DWI_32dir',                       'dwi',          'Philips'],
  ['fMRI_REST_SENSE',                 'func',         'Philips'],
  ['SWIp',                            'anat-T2starw', 'Philips (SWIp)'],
  ['B0_map',                          'fmap',         'Philips'],
  ['pCASL',                           'perf',         'Philips'],

  // ── Generic / BIDS-ish already ───────────────────────────────────
  ['sub-01_ses-01_T1w',               'anat-T1w',     'BIDS input'],
  ['sub-01_ses-01_acq-highres_T2w',   'anat-T2w',     'BIDS input'],
  ['sub-01_task-rest_bold',           'func',         'BIDS input'],
  ['sub-01_dir-AP_dwi',               'dwi',          'BIDS input'],

  // ── PET (added 2026-09-30). Every name below that contains CT / TOF /
  // CBF / "structural" was claimed by an MRI or CT rule before PET
  // existed. Names modeled on Siemens Biograph, GE Discovery and Philips
  // Vereos series descriptions plus PET2BIDS output.
  ['FDG_PET_Brain',                   'pet',          'generic FDG'],
  ['PET_Brain_FDG_3D_AC',             'pet',          'Siemens-style'],
  ['PET_CT_FDG',                      'pet',          'PET/CT (CT token must not win)'],
  ['PETCT_Brain',                     'pet',          'joined PETCT'],
  ['FDGPET',                          'pet',          'joined FDGPET'],
  ['Brain_PET_TOF_OSEM',              'pet',          'TOF recon (not MR angio)'],
  ['H2O_CBF_PET',                     'pet',          'H2O perfusion PET (not ASL)'],
  ['PET_Structural',                  'pet',          '"structural" must not make it T1w'],
  ['18F-FDG_static',                  'pet',          'isotope-prefixed tracer'],
  ['AV45_amyloid',                    'pet',          'florbetapir'],
  ['PiB_dynamic',                     'pet',          'PiB'],
  ['MK6240_tau',                      'pet',          'tau tracer'],
  ['sub-01_trc-FDG_pet',              'pet',          'BIDS input'],
  ['PET_MR_Brain',                    'pet',          'PET/MR'],
  ['CTAC_3.75_Thick',                 'ct-ac',        'GE attenuation CT'],
  ['AC_CT_Brain',                     'ct-ac',        'Siemens attenuation CT'],
  ['CT_AC',                           'ct-ac',        'bare CT_AC, no PET token'],
  ['PET_CTAC',                        'ct-ac',        'PET study, CTAC token is the CT'],
  ['MuMap_PET',                       'ct-ac',        'PET/MR mu-map'],
];


console.log('vendor scan names');
for (const [name, expected, vendor] of CASES) {
  const got = detectFromFilename(name + '.nii.gz').modality ?? 'NONE(blind T1w)';
  report('vendor', got === expected, `${vendor} "${name}": expected ${expected}, got ${got}`);
}

// ── 2. Visit-folder conventions resolve to a defined timepoint ────
const STRUCTURE = {
  presetId: 'custom-timepoints',
  timepoints: [{ number: 2, unit: 'week' }, { number: 6, unit: 'month' }],
} as DatasetStructure;
const ids = resolveSessionIds(STRUCTURE);
console.log('visit-folder conventions');
for (const folder of ['2weeks','2wk','2_weeks','2 weeks','week2','week_02','wk2','W2','ses-2wk','02weeks']) {
  const got = detectCustomSession(`subj/${folder}/scan/f.nii.gz`, ids).session;
  report('session', got === 'ses-2wk', `"${folder}" -> ${got ?? 'none'} (expected ses-2wk)`);
}

// ── 3. Visit folders must not be read as separate patients ───────
function groupsOf(folders: string[]): string[] {
  const files = folders.flatMap(f => ['T1w.nii.gz','BOLD.nii.gz'].map(n => ({
    relativePath: `${f}/scan/${n}`, name: n, size: 1, file: {} as never,
  } as ScannedFile)));
  return [...new Set(files.map(f => groupIntoSubject(f, files).groupName))];
}
console.log('visit folders are not patients');
for (const set of [['2weeks','6months'],['week2','month6'],['W2','M6'],['2_weeks','6_months'],
                   ['visit1','visit2'],['V1','V2'],['baseline','followup'],['20180510','20181116']]) {
  const g = groupsOf(set);
  report('grouping', !set.some(f => g.includes(f)), `${set.join('+')} split into ${g.join(', ')}`);
}

// ── 4. SAFETY: patient folders must stay separate ────────────────
console.log('patients are not merged');
for (const set of [['P01','P02','P03'],['PT01','PT02'],['S01','S02'],['01','02','03'],
                   ['sub-001','sub-002'],['Patient_01','Patient_02'],['12345','12346'],
                   ['01_1204','01_1206'],['CHOP001','CHOP002']]) {
  const g = groupsOf(set);
  report('safety', set.every(f => g.includes(f)), `${set.join(',')} merged into ${g.join(', ')}`);
}

// ── 5. SAFETY: rules added for one corpus must not claim other data ──
// The vocabulary in this engine grew while fixing a specific TBI dataset.
// Each addition is a liability for every OTHER dataset: a token that helps
// one site can misclassify another site's subject identifiers. These cases
// pin the boundary. Two were real over-reach when written:
//   - "b1234_scan" was claimed as diffusion by a bare b + 3-4 digit
//     b-value rule; that form is also an ordinary subject id.
//   - "PD_003_scan" was claimed as proton-density; PD is how essentially
//     every Parkinson's cohort labels its subjects.
// Both rules were narrowed rather than removed, and the corpus that
// motivated them still classifies correctly.
console.log('rules do not over-reach onto other datasets');
const NO_OVERREACH: [string, string | null, string][] = [
  ['sub-b1234_T1w',   'anat-T1w',     'subject id b+digits, modality token present'],
  ['b1234_scan',      null,           'subject id b+digits, no modality token'],
  ['PD_003_T1w',      'anat-T1w',     "Parkinson's subject with modality token"],
  ['PD_003_scan',     null,           "Parkinson's subject, no modality token"],
  ['sub-PD12_bold',   'func',         "Parkinson's subject, functional"],
  ['difference_map',  null,           '"diff" present but not as a token'],
  ['T2_TSE_b1000',    'anat-T2w',     'explicit T2 wins over an incidental b-value'],
  ['t1_mprage_moco',  'anat-T1w',     'motion-corrected STRUCTURAL stays anatomical'],
  ['CMRR_b1k_64',     'dwi',          'the b-value shorthand this rule exists for'],
  ['pd_tse_tra',      'anat-PDw',     'the proton-density name this rule exists for'],
  // PET vocabulary must not claim MRI or clinical CT names.
  ['CT_Head',         'ct',           'clinical CT stays CT'],
  ['CT_electrodes',   'ct',           'post-implant CT stays CT'],
  ['tof_angio_3d',    'anat-angio',   'MR angiography stays angio'],
  ['asl_perfusion',   'perf',         'ASL stays perfusion'],
  ['PETRA_brain',     null,           'Siemens PETRA is an MRI sequence, not PET'],
  ['competitor_scan', null,           '"pet" inside a word is not PET'],
  ['t1_mprage_ac_pc', 'anat-T1w',     'AC-PC alignment is not attenuation correction'],
];
for (const [name, expected, why] of NO_OVERREACH) {
  const got = detectFromFilename(name + '.nii.gz').modality;
  const ok = expected === null ? got === null : got === expected;
  report('over-reach', ok, `"${name}" expected ${expected ?? 'no claim'}, got ${got ?? 'no claim'} — ${why}`);
}

// Folder names that are NOT timepoints, including forms that look close.
for (const f of ['anat','dwi','sub-01','Male','Week','group1','run1','scan1','P1','C1','T3']) {
  report('over-reach', !looksLikeTimepointFolder(f), `folder "${f}" claimed as a timepoint`);
}

// ── 6. SAFETY: OS junk never becomes scan data ───────────────────
// An operating-system artifact whose NAME resembles a scan must stay
// unclassified. This regressed silently once "ep2d_diff" became a
// diffusion token: a macOS AppleDouble sidecar named
// "._ep2d_diff_..._7.nii.gz.drAITD" was exported as real diffusion data.
console.log('OS junk stays unclassified');
for (const junk of [
  '._ep2d_diff_sms_aldit_b3k_20170722092027_7.nii.gz.drAITD',
  '._Sag_MPRAGE.nii.gz',
  '.T1_axial.nii.gz.qkjGHi',
  '.DS_Store',
  'Thumbs.db',
]) {
  report('safety', isOsJunkFile(junk), `"${junk}" not recognised as OS junk`);
}

// ── 7. SAFETY: modality folders are not timepoints ───────────────
console.log('modality folders are not timepoints');
for (const f of ['T1','T2','T1w','T2w','DWI','CT','anat','func','SWI','FLAIR']) {
  report('safety', !looksLikeTimepointFolder(f), `"${f}" read as a timepoint label`);
}

// ── 7b. SAFETY: tracer names are not subject IDs ─────────────────
console.log('tracer names are not subjects');
{
  const flat = ['AV45_scan.nii.gz', 'MK6240_scan.nii.gz', 'HUP015_AV45.nii.gz'].map(n => ({
    relativePath: n, name: n, size: 1, file: {} as never,
  } as ScannedFile));
  for (const f of flat) {
    const g = groupIntoSubject(f, flat).groupName;
    report('safety', !/^(AV45|MK6240)$/i.test(g), `"${f.name}" grouped as subject "${g}"`);
  }
  const hup = groupIntoSubject(flat[2], flat).groupName;
  report('safety', /HUP015/i.test(hup), `"HUP015_AV45" grouped as "${hup}", expected HUP015`);
}

// ── 7c. SAFETY: same-named files in different subjects stay separate ──
// Sidecars, EDF headers and the neighbor-modality map were keyed by bare
// file name, so Patient_A/scan.json and Patient_B/scan.json overwrote
// each other and one subject's scan was classified from the other's
// sidecar (found 2026-10-02). Each file here must be decided by its own
// sidecar / header.
console.log('same-named files in different subjects');
{
  const edf = (labels: string[]) => {
    const ns = labels.length;
    const bytes = new Uint8Array(256 + ns * 256).fill(0x20);
    const put = (at: number, len: number, v: string) => { for (let i = 0; i < len; i++) bytes[at + i] = (v.padEnd(len, ' ')).charCodeAt(i); };
    put(0, 8, '0'); put(8, 80, 'X X X X'); put(168, 8, '01.01.24'); put(176, 8, '00.00.00');
    put(184, 8, String(256 + ns * 256)); put(236, 8, '1'); put(244, 8, '1'); put(252, 4, String(ns));
    labels.forEach((l, i) => put(256 + i * 16, 16, l));
    return bytes;
  };
  const mk = (relativePath: string, content: string | Uint8Array): ScannedFile => {
    const name = relativePath.split('/').pop()!;
    const file = new File([content], name);
    return { relativePath, name, size: file.size, file } as ScannedFile;
  };
  const files = [
    mk('Patient_A/scan.nii.gz', new Uint8Array([0])),
    mk('Patient_A/scan.json', JSON.stringify({ Modality: 'PT', TracerName: 'FDG' })),
    mk('Patient_A/night.edf', edf(['LA1', 'LA2', 'LA3', 'LB1', 'LB2'])),
    mk('Patient_B/scan.nii.gz', new Uint8Array([0])),
    mk('Patient_B/scan.json', JSON.stringify({ Modality: 'MR', SeriesDescription: 'T1_MPRAGE' })),
    mk('Patient_B/night.edf', edf(['Fp1', 'Fp2', 'C3', 'C4', 'O1'])),
  ];
  const results = runDetection(files, await readJsonSidecars(files), await readEdfHeaders(files));
  const modalityOf = (p: string) => results.find(r => r.relativePath === p)?.detectedModality;
  for (const [path, expected] of [
    ['Patient_A/scan.nii.gz', 'pet'], ['Patient_B/scan.nii.gz', 'anat-T1w'],
    ['Patient_A/night.edf', 'ieeg'], ['Patient_B/night.edf', 'eeg'],
  ] as const) {
    report('safety', modalityOf(path) === expected, `${path}: ${modalityOf(path)}, expected ${expected} (decided by another subject's file?)`);
  }
}

// ── 7d. SAFETY: a sidecar that isn't valid JSON is never exported ──
// It can't be de-identified, so validation blocks it and export refuses
// it (before 2026-10-02 it was copied through with every field intact).
console.log('broken sidecars are blocked');
{
  const mk = (relativePath: string, content: string | Uint8Array): ScannedFile => {
    const name = relativePath.split('/').pop()!;
    const file = new File([content], name);
    return { relativePath, name, size: file.size, file } as ScannedFile;
  };
  const files = [
    mk('Patient_C/T1_MPRAGE.nii.gz', new Uint8Array([0])),
    mk('Patient_C/T1_MPRAGE.json', '{ "PatientName": "Smith^John", '),
  ];
  const results = runDetection(files, await readJsonSidecars(files), await readEdfHeaders(files));
  const issues = await scanSidecarContentForPhi(results);
  const blocking = issues.find(i => i.title.startsWith('Sidecar is not valid JSON'));
  report('safety', Boolean(blocking && blocking.severity === 'error' && !blocking.dismissable), 'broken exported sidecar did not raise a blocking error');
  const subjects = [{ subjectGroup: results[0].subjectGroup, bidsSubjectId: 'sub-T001', sessions: [{ sessionId: 'ses-preimplant', acqTime: '', age: '' }] }] as SubjectMetadata[];
  const entries = buildFileEntries(results, subjects, createDefaultDatasetDescription(), new Map([[results[0].subjectGroup, 5]]));
  let refused = false;
  try { await generateZip(entries); } catch { refused = true; }
  report('safety', refused, 'export copied a sidecar it could not de-identify');
}

// ── 8. SAFETY: every face-bearing structural contrast needs defacing ──
// GOV-001 requires defacing for all five. Before 2026-09-30 the check only
// covered T1w/T2w/FLAIR, so a PDw- or T2*w-only dataset exported with no
// attestation at all.
console.log('defacing covers all structural MRI');
for (const m of ['anat-T1w', 'anat-T2w', 'anat-FLAIR', 'anat-PDw', 'anat-T2starw'] as Modality[]) {
  report('safety', DEFACING_MODALITIES.includes(m), `${m} does not require the defacing attestation`);
}

if (failures > 0) {
  console.error(`\n${failures} generalization failure(s).`);
  process.exit(1);
}
console.log('\nAll generalization checks passed.');
