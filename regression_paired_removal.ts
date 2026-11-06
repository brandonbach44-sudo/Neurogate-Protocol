/**
 * Paired-removal regression: removeResults() correctly resolves primaries
 * and their companions in one pass, never shifting indices mid-removal.
 *
 * Tests:
 *  - Single file with no companions
 *  - Single file whose JSON sidecar is removed with it
 *  - Bulk removal where two files each have their own sidecars (all four dropped)
 *  - Bulk removal where the user selected both a primary AND its sidecar
 *    explicitly — the sidecar must not be double-counted
 *  - Removing a file at index N does not shift the companions of a file at
 *    index > N (the classic off-by-one that the old per-call loop caused)
 *  - Only companion modalities are auto-included; a same-stem file with a
 *    data modality (e.g. a second NIfTI) is NOT removed
 *
 *  - DWI .bval/.bvec removed with their scan; companions never cascade;
 *    dotted names pair by full base name
 *
 * Usage: npx tsx regression_paired_removal.ts   (non-zero exit on failure)
 */
import { removeResults } from './src/lib/mapping/removeResults';
import type { DetectionResult } from './src/types/detection';

let failures = 0;
function check(ok: boolean, detail: string) {
  if (!ok) { failures++; console.log(`  FAIL  ${detail}`); }
}

/** Minimal DetectionResult stub. */
function mk(
  relativePath: string,
  detectedModality: string,
): DetectionResult {
  const fileName = relativePath.split('/').pop()!;
  return {
    relativePath,
    fileName,
    detectedModality,
    confidence: 'high',
    subjectGroup: 'S',
    session: null,
    userSession: null,
    userModality: null,
    userSubjectGroup: null,
    bidsFilename: fileName,
    bidsPath: fileName,
    duplicateOf: null,
    derivedLabel: null,
    runIndex: null,
    sidecarFields: null,
    petDetails: null,
    taskLabel: null,
    userTask: undefined,
  } as unknown as DetectionResult;
}

// ── 1. Single file, no companions ────────────────────────────────────────────
console.log('single file, no companions');
{
  const results = [
    mk('S/anat/T1w.nii.gz', 'T1w'),
    mk('S/anat/T2w.nii.gz', 'T2w'),
  ];
  const { kept, removed } = removeResults(results, [0]);
  check(kept.length === 1, `kept=${kept.length}, want 1`);
  check(kept[0].fileName === 'T2w.nii.gz', `kept[0]=${kept[0].fileName}`);
  check(removed.length === 1, `removed=${removed.length}, want 1`);
  check(removed[0].fileName === 'T1w.nii.gz', `removed[0]=${removed[0].fileName}`);
}

// ── 2. Primary + JSON sidecar removed together ───────────────────────────────
console.log('primary + JSON sidecar');
{
  const results = [
    mk('S/anat/T1w.nii.gz', 'T1w'),
    mk('S/anat/T1w.json', 'sidecar-json'),
    mk('S/anat/T2w.nii.gz', 'T2w'),
  ];
  const { kept, removed } = removeResults(results, [0]);
  check(kept.length === 1, `kept=${kept.length}, want 1`);
  check(kept[0].fileName === 'T2w.nii.gz', 'wrong file kept');
  check(removed.length === 2, `removed=${removed.length}, want 2`);
  check(removed.some(r => r.fileName === 'T1w.json'), 'JSON sidecar not removed with primary');
}

// ── 3. Bulk: two primaries with sidecars, all four removed ───────────────────
console.log('bulk removal — two primaries + their sidecars');
{
  const results = [
    mk('S/func/rest_bold.nii.gz', 'bold'),
    mk('S/func/rest_bold.json', 'sidecar-json'),
    mk('S/func/fingertap_bold.nii.gz', 'bold'),
    mk('S/func/fingertap_bold.json', 'sidecar-json'),
    mk('S/anat/T1w.nii.gz', 'T1w'),
  ];
  // User selects both primaries (indices 0 and 2).
  const { kept, removed } = removeResults(results, [0, 2]);
  check(kept.length === 1, `kept=${kept.length}, want 1`);
  check(kept[0].fileName === 'T1w.nii.gz', 'wrong file kept after bulk remove');
  check(removed.length === 4, `removed=${removed.length}, want 4`);
  check(removed.some(r => r.fileName === 'rest_bold.json'), 'rest sidecar not removed');
  check(removed.some(r => r.fileName === 'fingertap_bold.json'), 'fingertap sidecar not removed');
}

// ── 4. User selected both primary AND its sidecar — no double-count ──────────
console.log('user selected primary + sidecar explicitly');
{
  const results = [
    mk('S/anat/T1w.nii.gz', 'T1w'),
    mk('S/anat/T1w.json', 'sidecar-json'),
    mk('S/anat/T2w.nii.gz', 'T2w'),
  ];
  // Indices 0 (primary) AND 1 (sidecar) both selected.
  const { kept, removed } = removeResults(results, [0, 1]);
  check(kept.length === 1, `kept=${kept.length}, want 1`);
  check(removed.length === 2, `removed=${removed.length}, want 2 (not 3 or more)`);
}

// ── 5. Index stability — removing index 0 must not shift companions of index 2 ─
console.log('index stability across bulk remove');
{
  const results = [
    mk('S/anat/FLAIR.nii.gz', 'FLAIR'),       // index 0 — will be removed
    mk('S/anat/FLAIR.json', 'sidecar-json'),  // index 1 — companion, auto-removed
    mk('S/anat/T1w.nii.gz', 'T1w'),           // index 2 — also selected for removal
    mk('S/anat/T1w.json', 'sidecar-json'),    // index 3 — companion of index 2
    mk('S/anat/T2w.nii.gz', 'T2w'),           // index 4 — must survive
  ];
  const { kept, removed } = removeResults(results, [0, 2]);
  check(kept.length === 1, `kept=${kept.length}, want 1`);
  check(kept[0].fileName === 'T2w.nii.gz', `surviving file=${kept[0]?.fileName}, want T2w.nii.gz`);
  check(removed.length === 4, `removed=${removed.length}, want 4`);
  check(removed.some(r => r.fileName === 'T1w.json'), 'T1w.json (companion of index 2) not removed');
}

// ── 6. Same-stem data file is NOT auto-removed ───────────────────────────────
console.log('same-stem data modality is NOT auto-removed');
{
  // Two NIfTIs with the same base name but different extensions — should not
  // be treated as companions of each other.
  const results = [
    mk('S/anat/T1w.nii.gz', 'T1w'),
    mk('S/anat/T1w.nii', 'T1w'),       // same stem, data modality — must survive
    mk('S/anat/T1w.json', 'sidecar-json'),
  ];
  const { kept, removed } = removeResults(results, [0]);
  check(kept.length === 1, `kept=${kept.length}, want 1 (the .nii survives)`);
  check(kept[0].fileName === 'T1w.nii', `kept[0]=${kept[0]?.fileName}, want T1w.nii`);
  check(removed.length === 2, `removed=${removed.length}, want 2`);
}

// ── 7. Empty indices → no-op ─────────────────────────────────────────────────
console.log('empty indices → no-op');
{
  const results = [mk('S/anat/T1w.nii.gz', 'T1w')];
  const { kept, removed } = removeResults(results, []);
  check(kept === results, 'should return the same array reference');
  check(removed.length === 0, `removed=${removed.length}`);
}

// ── 8. DWI scan: .bval and .bvec (classified as dwi) go with it ─────────────
console.log('dwi scan removes its .json, .bval and .bvec');
{
  const results = [
    mk('S/dwi/DWI_1.nii.gz', 'dwi'),
    mk('S/dwi/DWI_1.bval', 'dwi'),
    mk('S/dwi/DWI_1.bvec', 'dwi'),
    mk('S/dwi/DWI_1.json', 'sidecar-json'),
    mk('S/dwi/DWI_2.bval', 'dwi'),      // other scan's table, must stay
    mk('S/other/DWI_1.bval', 'dwi'),    // same name, different folder, must stay
  ];
  const { kept, removed } = removeResults(results, [0]);
  check(removed.length === 4, `removed=${removed.length}, want 4`);
  check(kept.map(r => r.relativePath).join(',') === 'S/dwi/DWI_2.bval,S/other/DWI_1.bval',
    `kept=${kept.map(r => r.relativePath).join(',')}`);
}

// ── 9. Removing a companion alone never cascades ────────────────────────────
console.log('removing a bare sidecar or gradient table removes only that file');
{
  const results = [
    mk('S/dwi/DWI_1.nii.gz', 'dwi'),
    mk('S/dwi/DWI_1.bval', 'dwi'),
    mk('S/dwi/DWI_1.bvec', 'dwi'),
    mk('S/dwi/DWI_1.json', 'sidecar-json'),
  ];
  const a = removeResults(results, [3]);
  check(a.removed.length === 1 && a.removed[0].fileName === 'DWI_1.json', `json alone: removed=${a.removed.map(r => r.fileName)}`);
  const b = removeResults(results, [1]);
  check(b.removed.length === 1 && b.removed[0].fileName === 'DWI_1.bval', `bval alone: removed=${b.removed.map(r => r.fileName)}`);
}

// ── 10. Dotted names pair by full base name ─────────────────────────────────
console.log('dotted names pair by full base name');
{
  const results = [
    mk('S/anat/T1_1.0mm.nii.gz', 'T1w'),
    mk('S/anat/T1_1.0mm.json', 'sidecar-json'),
    mk('S/anat/T1_1.2mm.json', 'sidecar-json'),   // different scan, must stay
  ];
  const { kept } = removeResults(results, [0]);
  check(kept.length === 1 && kept[0].fileName === 'T1_1.2mm.json', `kept=${kept.map(r => r.fileName)}`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed.');
