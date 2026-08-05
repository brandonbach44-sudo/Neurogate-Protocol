/**
 * Node Directory Scanner
 *
 * CLI/local equivalent of the web app's drag-and-drop folder scan:
 * walks a directory on disk and produces the same ScannedFile[] shape
 * the detection engine (lib/detection/engine.ts) already consumes,
 * using NodeFileAdapter for the `file` field instead of a browser File.
 *
 * NODE-ONLY: see the header comment in nodeFileAdapter.ts. Only the
 * future CLI package (packages/cli) should import this.
 */

import { readdir } from 'node:fs/promises';
import { join, relative, sep, basename } from 'node:path';
import { NodeFileAdapter } from './nodeFileAdapter';
import type { ScannedFile } from '../../types/files';

/**
 * Recursively scan `rootPath` and return one ScannedFile per regular
 * file found.
 *
 * relativePath is prefixed with rootPath's OWN folder name (e.g.
 * scanning ".../EpilepsyStudy_Raw" produces paths like
 * "EpilepsyStudy_Raw/Patient_001/Session_implant/anat/T1w.nii.gz", not
 * "Patient_001/...") -- this matches the browser's webkitRelativePath
 * convention exactly (FileDropZone.tsx's readEntry() includes the
 * top-level dropped folder's own name as the first path segment, and
 * regression.ts's toScannedFiles() replicates the same convention via
 * `join(basename(root), relative(root, full))`).
 *
 * This match matters beyond cosmetics: lib/detection/subjectGrouping.ts
 * and the folder/session detectors key off path *depth* and structure
 * relative to a consistent top-level folder. Without this prefix, a CLI
 * user pointing the scanner directly at a single patient folder (e.g.
 * ".../Patient_001") would get relativePaths starting at
 * "Session_implant/...", one level shallower than the web app ever
 * produces -- which silently misgroups each session subfolder as a
 * separate "subject" instead of one patient with multiple sessions.
 * Found via CLI pipeline verification against real demo data
 * (verify_cli_pipeline.ts): scanning Patient_001 directly produced three
 * fake subjects (one per Session_* folder) instead of one.
 */
export async function scanDirectory(rootPath: string): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  const rootName = basename(rootPath);

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const relativeFromRoot = relative(rootPath, fullPath).split(sep).join('/');
        const relativePath = `${rootName}/${relativeFromRoot}`;
        const adapter = await NodeFileAdapter.fromPath(fullPath);
        results.push({
          relativePath,
          name: entry.name,
          size: adapter.size,
          file: adapter,
        });
      }
      // Symlinks are intentionally skipped rather than followed, to
      // avoid infinite loops on a self-referential link and to keep
      // behavior predictable for clinical data directories.
    }
  }

  await walk(rootPath);
  return results;
}
