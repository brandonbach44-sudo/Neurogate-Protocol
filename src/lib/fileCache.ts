/**
 * Eager file content cache.
 *
 * Files from drag-and-drop (FileSystemFileEntry.file()) can lose read
 * permission after the drop event is long past. This module caches
 * ArrayBuffers at ingest time so they remain available at export time.
 *
 * Uses a WeakMap so cached buffers are GC'd when the File is released.
 */

const cache = new WeakMap<File, ArrayBuffer>();

/** Store a file's content eagerly. Call this immediately after obtaining a File. */
export function cacheFileBuffer(file: File, buffer: ArrayBuffer): void {
  cache.set(file, buffer);
}

/**
 * Read a file's ArrayBuffer, preferring the cached copy.
 * Falls back through two alternative read paths before giving up,
 * to work around browser permission quirks on drag-and-drop files.
 */
export async function readFileBuffer(file: File): Promise<ArrayBuffer> {
  const cached = cache.get(file);
  if (cached) return cached;

  // Try direct arrayBuffer() first.
  try {
    return await file.arrayBuffer();
  } catch { /* fall through */ }

  // Some browsers handle File permissions differently via the Fetch/Response
  // API compared to the direct arrayBuffer() call. Try that next.
  try {
    return await new Response(file).arrayBuffer();
  } catch { /* fall through */ }

  // Last resort: createObjectURL + fetch.
  const url = URL.createObjectURL(file);
  try {
    const res = await fetch(url);
    return await res.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}
