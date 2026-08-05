/**
 * FileLike — the minimal subset of the browser File/Blob API that
 * NeuroGate's detection, validation, BIDS naming, and de-identification
 * logic actually uses.
 *
 * The browser's native File already satisfies this interface (File
 * extends Blob, which has arrayBuffer/text/slice), so no change is
 * needed on the web app's side.
 *
 * A second implementation (NodeFileAdapter, see nodeFileAdapter.ts) reads
 * from a filesystem path instead of a browser drag-and-drop File, so the
 * same detection/validation/BIDS/de-identification code can run
 * unmodified from a CLI or a local Electron process.
 *
 * Kept deliberately small: every method here is one actually called
 * somewhere in src/lib/. Do not add methods "for completeness" -- add
 * them only when a real caller needs them, so NodeFileAdapter's contract
 * stays easy to verify against.
 */
/**
 * The subset of Blob used on a sliced chunk of a file (edfHeaderReader.ts
 * reads only the first ~8KB of a recording via .slice().arrayBuffer()).
 * Split out from FileLike because Blob.slice() returns a Blob, not a
 * File -- it has no .name -- so a slice result can't be typed as
 * FileLike without breaking against the browser's real File.slice().
 */
export interface BlobLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  slice(start?: number, end?: number): BlobLike;
}

export interface FileLike extends BlobLike {
  readonly name: string;
  readonly size: number;
}

/**
 * True for anything that looks like a real file (FileLike), false for a
 * plain string. Used in place of `instanceof File` checks, which fail
 * for NodeFileAdapter since it isn't a real browser File/Blob.
 */
export function isFileLike(value: FileLike | string): value is FileLike {
  return typeof value !== 'string';
}
