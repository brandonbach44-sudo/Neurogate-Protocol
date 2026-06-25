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
 * Falls back to file.arrayBuffer() if not cached (e.g. for input-picker files).
 */
export async function readFileBuffer(file: File): Promise<ArrayBuffer> {
  const cached = cache.get(file);
  if (cached) return cached;
  return file.arrayBuffer();
}
