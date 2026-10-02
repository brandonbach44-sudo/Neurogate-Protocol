/**
 * NIfTI header regression: reading headers (.nii and .nii.gz, NIfTI-1
 * and NIfTI-2, either byte order) and what detection and validation do
 * with them.
 *
 * Usage: npx tsx regression_nifti.ts   (non-zero exit on failure)
 */
import { gzipSync } from 'node:zlib';
import { runDetection, readJsonSidecars, readEdfHeaders, readNiftiHeaders } from './src/lib/detection';
import { parseNiftiHeader } from './src/lib/detection/niftiHeaderReader';
import { scanNiftiHeadersForPhi } from './src/lib/validation/phiScanner';
import type { ScannedFile } from './src/types/files';

let failures = 0;
function check(ok: boolean, detail: string) {
  if (!ok) { failures++; console.log(`  FAIL  ${detail}`); }
}

/** A minimal NIfTI-1 header (+4 extension bytes + a little image data). */
function nifti1(dims: number[], { descrip = '', littleEndian = true } = {}): Uint8Array {
  const buf = new ArrayBuffer(352 + 64);
  const v = new DataView(buf);
  const b = new Uint8Array(buf);
  v.setInt32(0, 348, littleEndian);
  v.setInt16(40, dims.length, littleEndian);
  dims.forEach((d, i) => v.setInt16(42 + i * 2, d, littleEndian));
  v.setInt16(70, 4, littleEndian); // datatype int16
  v.setInt16(72, 16, littleEndian);
  [1, 1, 1].forEach((p, i) => v.setFloat32(80 + i * 4, p, littleEndian));
  for (let i = 0; i < descrip.length; i++) b[148 + i] = descrip.charCodeAt(i);
  'n+1\0'.split('').forEach((c, i) => (b[344 + i] = c.charCodeAt(0)));
  return b;
}

/** A minimal NIfTI-2 header. */
function nifti2(dims: number[]): Uint8Array {
  const buf = new ArrayBuffer(544 + 64);
  const v = new DataView(buf);
  v.setInt32(0, 540, true);
  v.setBigInt64(16, BigInt(dims.length), true);
  dims.forEach((d, i) => v.setBigInt64(24 + i * 8, BigInt(d), true));
  [2, 2, 2].forEach((p, i) => v.setFloat64(112 + i * 8, p, true));
  return new Uint8Array(buf);
}

const mk = (relativePath: string, content: Uint8Array | string): ScannedFile => {
  const name = relativePath.split('/').pop()!;
  const file = new File([content], name);
  return { relativePath, name, size: file.size, file } as ScannedFile;
};

async function main() {
  console.log('parsing');
  check(parseNiftiHeader(nifti1([256, 256, 176]))?.volumes === 1, 'NIfTI-1 3D volume count');
  check(parseNiftiHeader(nifti1([64, 64, 36, 200]))?.volumes === 200, 'NIfTI-1 4D volume count');
  check(parseNiftiHeader(nifti1([64, 64, 36, 30], { littleEndian: false }))?.volumes === 30, 'big-endian NIfTI-1');
  const two = parseNiftiHeader(nifti2([96, 96, 60, 120]));
  check(two?.version === 2 && two.volumes === 120 && two.voxelSize[0] === 2, 'NIfTI-2 dims and voxel size');
  check(parseNiftiHeader(new Uint8Array(400)) === null, 'random bytes parsed as a header');

  console.log('reading .nii and .nii.gz');
  const files = [
    mk('P/series_7.nii.gz', gzipSync(nifti1([64, 64, 36, 200]))),
    mk('P/series_8.nii.gz', gzipSync(nifti1([256, 256, 176]))),
    mk('P/T1_MPRAGE.nii.gz', gzipSync(nifti1([64, 64, 36, 4]))),
    mk('P/rest_bold.nii', nifti1([64, 64, 36])),
    mk('P/FDG_PET.nii.gz', gzipSync(nifti1([128, 128, 90, 6]))),
    mk('P/broken.nii.gz', new Uint8Array([1, 2, 3])),
  ];
  const headers = await readNiftiHeaders(files);
  check(headers.get('P/series_7.nii.gz')?.volumes === 200, 'gzipped 4D header not read');
  check(headers.get('P/rest_bold.nii')?.dims.length === 3, 'uncompressed header not read');
  check(!headers.has('P/broken.nii.gz'), 'a non-NIfTI file produced a header');

  console.log('detection');
  const results = runDetection(files, await readJsonSidecars(files), await readEdfHeaders(files), undefined, headers);
  const get = (p: string) => results.find(r => r.relativePath === p)!;
  check(get('P/series_7.nii.gz').detectedModality === 'other', `unnamed 4D series defaulted to ${get('P/series_7.nii.gz').detectedModality}`);
  check(get('P/series_8.nii.gz').detectedModality === 'anat-T1w' && get('P/series_8.nii.gz').modalityIsGuess === true, 'unnamed 3D image should keep the guessed T1w default');
  check(get('P/T1_MPRAGE.nii.gz').reasons.some(r => /^WARNING: the name says T1w, but the image has 4 volumes/.test(r.message)), '4D "T1w" not warned');
  check(get('P/rest_bold.nii').reasons.some(r => /^WARNING: the name says functional MRI, but the image is a single 3D volume/.test(r.message)), '3D "bold" not warned');
  check(get('P/FDG_PET.nii.gz').pet?.dynamic === true, 'PET with 6 volumes and no sidecar not marked dynamic');
  check(get('P/series_8.nii.gz').niftiHeader?.volumes === 1, 'header not attached to the result');

  console.log('PHI in header text');
  const phiFiles = [
    mk('Q/T1_MPRAGE.nii.gz', gzipSync(nifti1([256, 256, 176], { descrip: 'patient John Smith' }))),
    mk('Q/T2_TSE.nii.gz', gzipSync(nifti1([256, 256, 30], { descrip: 'TE=96;Time=101502.425;phase=1' }))),
  ];
  const phiResults = runDetection(phiFiles, undefined, undefined, undefined, await readNiftiHeaders(phiFiles));
  const issues = scanNiftiHeadersForPhi(phiResults);
  check(issues.some(i => i.affectedFiles[0] === 'Q/T1_MPRAGE.nii.gz' && i.severity === 'error'), 'a name in descrip was not flagged');
  check(!issues.some(i => i.affectedFiles[0] === 'Q/T2_TSE.nii.gz'), 'normal dcm2niix descrip text was flagged');

  if (failures > 0) {
    console.error(`\n${failures} NIfTI check failure(s).`);
    process.exit(1);
  }
  console.log('\nAll NIfTI checks passed.');
}

main().catch(err => { console.error(err); process.exit(1); });
