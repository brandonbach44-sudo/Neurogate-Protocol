/**
 * NIfTI header reader.
 *
 * Reads only the fixed-size header at the start of each .nii / .nii.gz
 * (348 bytes for NIfTI-1, 540 for NIfTI-2), never the image data. For a
 * .nii.gz only a small compressed prefix is read and decompressed.
 *
 * What detection uses it for (engine.ts):
 *   - dimensions: a 4D image (more than one volume) is a series (fMRI,
 *     diffusion, dynamic PET), so the blind "default to T1w" fallback
 *     must never label it an anatomical scan; a name that contradicts the
 *     dimensions (a 4D "T1w", a 3D "BOLD") gets a warning in Mapping.
 *   - PET framing when there's no sidecar: more than one volume = dynamic.
 *   - the free-text descrip and aux_file fields, which validation scans
 *     for PHI (phiScanner.ts).
 *
 * Works with any FileLike (browser File or NodeFileAdapter): slice() +
 * arrayBuffer(), and DecompressionStream, available in browsers and in
 * Node 20.
 */

import type { ScannedFile } from '../../types/files';
import type { NiftiHeaderInfo } from '../../types/detection';

const NIFTI1_SIZE = 348;
const NIFTI2_SIZE = 540;
/**
 * Compressed bytes read from a .nii.gz. A header compresses to a few
 * hundred bytes; the rest covers the gzip header's optional stored file
 * name and comment.
 */
const GZ_PREFIX_BYTES = 16 * 1024;
/** Files read at a time, so a folder of thousands of scans doesn't open them all at once. */
const BATCH_SIZE = 32;

/** Decompress the start of a gzip stream until `need` bytes are out. Null if it isn't gzip. */
async function gunzipPrefix(compressed: ArrayBuffer, need: number): Promise<Uint8Array | null> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  // The prefix is cut mid-stream, so closing reports an error once the
  // decompressor runs out of input. That's expected; the header is long
  // decoded by then.
  writer.write(new Uint8Array(compressed)).catch(() => {});
  writer.close().catch(() => {});
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < need) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
  } catch {
    // truncated input or not gzip
  } finally {
    reader.cancel().catch(() => {});
  }
  if (total === 0) return null;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

function cString(bytes: Uint8Array, start: number, length: number): string {
  let s = '';
  for (let i = start; i < start + length && i < bytes.length; i++) {
    if (bytes[i] === 0) break;
    s += String.fromCharCode(bytes[i]);
  }
  return s.trim();
}

/** Parse a NIfTI-1 or NIfTI-2 header (either byte order). Null if it isn't one. */
export function parseNiftiHeader(bytes: Uint8Array): NiftiHeaderInfo | null {
  if (bytes.length < NIFTI1_SIZE) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const le = view.getInt32(0, true);
  const be = view.getInt32(0, false);
  const version = le === NIFTI1_SIZE || be === NIFTI1_SIZE ? 1 : le === NIFTI2_SIZE || be === NIFTI2_SIZE ? 2 : 0;
  if (!version) return null;
  const little = version === 1 ? le === NIFTI1_SIZE : le === NIFTI2_SIZE;

  if (version === 1) {
    const ndim = view.getInt16(40, little);
    if (ndim < 1 || ndim > 7) return null;
    const dims: number[] = [];
    const voxelSize: number[] = [];
    for (let i = 1; i <= ndim; i++) {
      dims.push(view.getInt16(40 + i * 2, little));
      voxelSize.push(view.getFloat32(76 + i * 4, little));
    }
    return {
      version: 1,
      dims,
      volumes: ndim >= 4 ? Math.max(1, dims.slice(3).reduce((a, b) => a * Math.max(1, b), 1)) : 1,
      voxelSize: voxelSize.slice(0, 3),
      descrip: cString(bytes, 148, 80),
      auxFile: cString(bytes, 228, 24),
    };
  }

  if (bytes.length < NIFTI2_SIZE) return null;
  const ndim = Number(view.getBigInt64(16, little));
  if (ndim < 1 || ndim > 7) return null;
  const dims: number[] = [];
  const voxelSize: number[] = [];
  for (let i = 1; i <= ndim; i++) {
    dims.push(Number(view.getBigInt64(16 + i * 8, little)));
    voxelSize.push(view.getFloat64(104 + i * 8, little));
  }
  return {
    version: 2,
    dims,
    volumes: ndim >= 4 ? Math.max(1, dims.slice(3).reduce((a, b) => a * Math.max(1, b), 1)) : 1,
    voxelSize: voxelSize.slice(0, 3),
    descrip: cString(bytes, 240, 80),
    auxFile: cString(bytes, 320, 24),
  };
}

/** Read every NIfTI header in the dropped files, keyed by relative path. Unreadable files are skipped. */
export async function readNiftiHeaders(files: ScannedFile[]): Promise<Map<string, NiftiHeaderInfo>> {
  const map = new Map<string, NiftiHeaderInfo>();
  const niftis = files.filter(f => /\.nii(\.gz)?$/i.test(f.name));
  for (let i = 0; i < niftis.length; i += BATCH_SIZE) await Promise.all(
    niftis.slice(i, i + BATCH_SIZE).map(async (f) => {
      try {
        let bytes: Uint8Array | null;
        if (/\.gz$/i.test(f.name)) {
          bytes = await gunzipPrefix(await f.file.slice(0, GZ_PREFIX_BYTES).arrayBuffer(), NIFTI2_SIZE);
        } else {
          bytes = new Uint8Array(await f.file.slice(0, NIFTI2_SIZE).arrayBuffer());
        }
        const info = bytes ? parseNiftiHeader(bytes) : null;
        if (info) map.set(f.relativePath, info);
      } catch {
        // Unreadable: detection falls back to names and sidecars.
      }
    }),
  );
  return map;
}
