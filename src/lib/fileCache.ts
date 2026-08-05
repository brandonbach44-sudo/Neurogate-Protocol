/**
 * Eager file content cache.
 *
 * Files from drag-and-drop (FileSystemFileEntry.file()) can lose read
 * permission after the drop event is long past. This module caches
 * ArrayBuffers at ingest time so they remain available at export time.
 *
 * Uses a WeakMap so cached buffers are GC'd when the File is released.
 *
 * Works with any FileLike (see types/fileLike.ts), not just a browser
 * File -- on CLI/desktop, `file` is a NodeFileAdapter instead, and the
 * two browser-specific fallback paths below (Response/createObjectURL)
 * are simply never reached, since the first arrayBuffer() attempt
 * always succeeds for a NodeFileAdapter.
 */

import type { FileLike } from '../types/fileLike';

const cache = new WeakMap<FileLike, ArrayBuffer>();

/** Store a file's content eagerly. Call this immediately after obtaining a File. */
export function cacheFileBuffer(file: FileLike, buffer: ArrayBuffer): void {
  cache.set(file, buffer);
}

/**
 * Read a file's ArrayBuffer, preferring the cached copy.
 * Falls back through two alternative read paths before giving up,
 * to work around browser permission quirks on drag-and-drop files.
 */
export async function readFileBuffer(file: FileLike): Promise<ArrayBuffer> {
  const cached = cache.get(file);
  if (cached) return cached;

  // Try direct arrayBuffer() first. Always succeeds for NodeFileAdapter,
  // so the two browser-only fallbacks below are web-only code paths.
  try {
    return await file.arrayBuffer();
  } catch { /* fall through */ }

  // Some browsers handle File permissions differently via the Fetch/Response
  // API compared to the direct arrayBuffer() call. Try that next.
  // (Browser-only: `file` must be a real Blob/File for this to work.)
  try {
    return await new Response(file as unknown as Blob).arrayBuffer();
  } catch { /* fall through */ }

  // Last resort: createObjectURL + fetch. (Browser-only, same caveat.)
  const url = URL.createObjectURL(file as unknown as Blob);
  try {
    const res = await fetch(url);
    return await res.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}
