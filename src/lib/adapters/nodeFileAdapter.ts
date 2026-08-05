/**
 * Node Filesystem Adapter
 *
 * Implements FileLike (see types/fileLike.ts) backed by a path on disk
 * instead of a browser drag-and-drop File. This is the piece that lets
 * every existing detection/validation/BIDS/de-identification module in
 * src/lib/ run unmodified from a CLI or a local Electron process --
 * those modules only ever call .arrayBuffer() / .text() / .slice() on a
 * "file", never a browser-specific API, so swapping the implementation
 * behind FileLike is enough. See Documents/NeuroGate_Phase_Roadmap.md,
 * "Phase 4/6 Revision" for the plan this is step 1 of.
 *
 * NODE-ONLY: this file imports node:fs/promises and must never be
 * imported from anything the web app (src/main.tsx and its import graph)
 * pulls in -- it will not bundle for the browser. Only the future CLI
 * package (packages/cli) should import this.
 *
 * Deliberately does not eagerly read the whole file into memory on
 * construction. edfHeaderReader.ts relies on being able to .slice() a
 * multi-GB EDF recording down to its first ~8KB before calling
 * .arrayBuffer() -- an adapter that read the full file up front would
 * silently reintroduce the exact large-file memory problem this
 * packaging effort exists to avoid.
 */

import { open, stat } from 'node:fs/promises';
import { createReadStream, type ReadStream } from 'node:fs';
import { basename } from 'node:path';
import type { FileLike } from '../../types/fileLike';

export class NodeFileAdapter implements FileLike {
  readonly name: string;
  readonly size: number;
  /**
   * The underlying file path. Public (unlike rangeStart/rangeEnd) because
   * Node-only consumers that need true fs streaming -- nodeExportWriter.ts
   * in particular, for a plain file copy or a gzip pass that would be
   * wasteful to route through arrayBuffer() -- need it directly. Not part
   * of FileLike; only code that already knows it's holding a
   * NodeFileAdapter (via `instanceof`) should touch this.
   */
  readonly path: string;
  /** Byte offset into the underlying file where this slice starts. */
  private readonly rangeStart: number;
  /** Byte offset into the underlying file where this slice ends (exclusive). */
  private readonly rangeEnd: number;

  private constructor(path: string, name: string, rangeStart: number, rangeEnd: number) {
    this.path = path;
    this.name = name;
    this.rangeStart = rangeStart;
    this.rangeEnd = rangeEnd;
    this.size = rangeEnd - rangeStart;
  }

  /** Create an adapter covering the entire file at `path`. */
  static async fromPath(path: string): Promise<NodeFileAdapter> {
    const stats = await stat(path);
    if (!stats.isFile()) {
      throw new Error(`Not a regular file: ${path}`);
    }
    return new NodeFileAdapter(path, basename(path), 0, stats.size);
  }

  /**
   * Mirrors Blob.slice(): returns a new FileLike over a byte range of
   * the same underlying file, read lazily. Negative/omitted args behave
   * like Blob.slice (omitted end = to the end of this slice).
   */
  slice(start = 0, end = this.size): NodeFileAdapter {
    const normalizedStart = start < 0 ? Math.max(this.size + start, 0) : Math.min(start, this.size);
    const normalizedEnd = end < 0 ? Math.max(this.size + end, 0) : Math.min(end, this.size);
    const absStart = this.rangeStart + normalizedStart;
    const absEnd = this.rangeStart + Math.max(normalizedStart, normalizedEnd);
    return new NodeFileAdapter(this.path, this.name, absStart, absEnd);
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const length = this.rangeEnd - this.rangeStart;
    if (length <= 0) return new ArrayBuffer(0);

    const handle = await open(this.path, 'r');
    try {
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, this.rangeStart);
      // Buffer is a view over a possibly-larger underlying ArrayBuffer;
      // slice to the exact byte range so callers get exactly `length` bytes.
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } finally {
      await handle.close();
    }
  }

  async text(): Promise<string> {
    const buffer = await this.arrayBuffer();
    return new TextDecoder('utf-8').decode(buffer);
  }

  /**
   * Node-only: a real fs.ReadStream over exactly this slice's byte range,
   * for callers that want to stream (plain copy, gzip transform) rather
   * than buffer via arrayBuffer(). Not part of FileLike.
   */
  createReadStream(): ReadStream {
    // fs.createReadStream's `end` option is inclusive, unlike this
    // class's exclusive rangeEnd -- subtract 1. Guard the empty-range
    // case (rangeEnd === rangeStart, e.g. a zero-length slice) separately
    // since start > end would otherwise be passed to fs and throw.
    const end = Math.max(this.rangeEnd - 1, this.rangeStart);
    return createReadStream(this.path, { start: this.rangeStart, end });
  }
}
