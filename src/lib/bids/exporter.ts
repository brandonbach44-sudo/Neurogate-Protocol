/**
 * BIDS Export Module
 *
 * Assembles a complete BIDS-compliant dataset from detection results
 * and metadata, then packages it as a ZIP for download.
 *
 * Output structure:
 *   dataset_description.json
 *   participants.tsv
 *   primary/
 *     sub-<ID>/
 *       sub-<ID>_sessions.tsv
 *       ses-preimplant/
 *         anat/
 *           sub-<ID>_ses-preimplant_T1w.nii.gz
 *           sub-<ID>_ses-preimplant_T1w.json
 *           ...
 *       ses-postimplant/
 *         ct/
 *         ieeg/
 *       ses-postsurgery/
 *         anat/
 *   derivatives/
 *     scanner/
 *       sub-<ID>/
 *         ses-<label>/
 *           dwi/
 *             sub-<ID>_ses-<label>_desc-ADC_dwi.nii.gz
 *             sub-<ID>_ses-<label>_desc-FA_dwi.nii.gz
 *
 * The derivatives tree holds maps the scanner computed rather than
 * acquired. They mirror the raw layout but stay out of primary/, because
 * they carry no bval/bvec and must never be mistaken for raw diffusion
 * signal by a downstream pipeline.
 *
 * Every file's BIDS path is assigned by computeBidsNames() in
 * lib/bids/bidsNaming.ts, the single source of truth shared with the
 * detection engine and the validator. The exporter places each file at
 * the path that module produced, so the export can never disagree with
 * the in-tool preview.
 */

import JSZip from 'jszip';
import { readFileBuffer } from '../fileCache';
import type { FileLike } from '../../types/fileLike';
import { isFileLike } from '../../types/fileLike';
import type { DetectionResult } from '../../types/detection';
import { getEffectiveSubjectGroup } from '../../types/detection';
import { computeBidsNames, isExportedPath } from './bidsNaming';
import { deidentifyEdf } from '../deidentify/edfDeidentifier';
import { deidentifyJsonSidecar, isJsonSidecarFile } from '../deidentify/jsonSidecarDeidentifier';
import type {
  SubjectMetadata,
  DatasetDescription,
} from '../../types/metadata';
import type { DatasetStructure } from '../../types/sessionStructure';
import { resolveSessionIds } from '../../types/sessionStructure';

// ── Public types ──────────────────────────────────────────────────

/** A node in the BIDS folder tree (for preview display) */
export interface TreeNode {
  name: string;
  type: 'folder' | 'file';
  /** Size in bytes (files only) */
  size?: number;
  children?: TreeNode[];
}

/** Progress callback for ZIP generation */
export type ExportProgressCallback = (progress: {
  phase: 'building' | 'zipping';
  current: number;
  total: number;
}) => void;

// ── Metadata file generators ──────────────────────────────────────

/**
 * Describe the dataset's session-structure preset for the GeneratedBy
 * entry below. GeneratedBy is the BIDS-sanctioned place for a tool to
 * record its own provenance metadata (arbitrary Description text is
 * allowed there), so this doesn't require a nonstandard top-level key
 * that a strict validator might flag. See
 * Documents/Phase1b_Custom_Timepoint_Detection_Spec.md Section 5.2 --
 * this closes the gap where the structure choice only survived in
 * sessionStorage for the current browser tab and was lost once the ZIP
 * was downloaded.
 */
function describeStructure(structure?: DatasetStructure): string | undefined {
  if (!structure) return undefined;
  if (structure.presetId === 'implant') {
    return `Session structure: Implant sessions preset (${resolveSessionIds(structure).join(', ')})`;
  }
  if (structure.presetId === 'single-session') {
    return 'Session structure: Single session preset (no ses- entity, one folder per subject)';
  }
  return `Session structure: Custom timepoints preset (${resolveSessionIds(structure).join(', ')})`;
}

function generateDatasetDescription(desc: DatasetDescription, structure?: DatasetStructure): string {
  const obj: Record<string, unknown> = {
    Name: desc.name,
    BIDSVersion: desc.bidsVersion,
    DatasetType: desc.datasetType,
    Authors: desc.authors.filter(a => a.trim()),
  };

  const structureDescription = describeStructure(structure);
  obj.GeneratedBy = [{
    Name: 'NeuroGate',
    Version: '1.0.0',
    ...(structureDescription ? { Description: structureDescription } : {}),
  }];

  return JSON.stringify(obj, null, 2);
}

function generateParticipantsTsv(subjects: SubjectMetadata[]): string {
  const header = 'participant_id\n';
  const rows = subjects
    .map(s => s.bidsSubjectId)
    .join('\n');
  return header + rows;
}

function generateSessionsTsv(subject: SubjectMetadata): string {
  const header = 'session_id\tacq_time';
  const rows = subject.sessions
    .map(s => `${s.sessionId}\t${s.acqTime || 'n/a'}`)
    .join('\n');
  return header + '\n' + rows;
}

// ── Build the file map (path -> content) ──────────────────────────

// Files larger than this cannot be loaded into a browser ArrayBuffer.
// They are excluded from the ZIP and listed separately for manual copy.
// This is a web-only limitation -- the Node/CLI export path (see
// lib/adapters/nodeExportWriter.ts) streams every file to disk instead
// of buffering it, so it passes a much higher threshold (effectively
// unlimited) to buildFileEntries() below rather than using this default.
const LARGE_FILE_THRESHOLD_BYTES = 500 * 1024 * 1024; // 500 MB

export interface FileEntry {
  path: string;
  content: FileLike | string;
  needsGzip?: boolean;
  edfDeidentify?: {
    dateShiftDays: number;
    anonymousSubjectId?: string;
  };
  /**
   * When set, this is a scan JSON sidecar and gets known-identifying
   * fields blanked and known date fields shifted before export. See
   * lib/deidentify/jsonSidecarDeidentifier.ts.
   */
  jsonDeidentify?: {
    dateShiftDays: number;
  };
  /** True when the file exceeds LARGE_FILE_THRESHOLD_BYTES and must be copied manually. */
  tooLarge?: boolean;
  /**
   * Subject group this file belongs to, kept only so generateZip() can
   * attribute de-identification summary entries to a subject for the
   * audit log (see DeidentificationSummary below). Not used for naming
   * or export placement -- that's already decided by `path`.
   */
  subjectGroup?: string;
}

// ── De-identification summary (for the audit log) ──────────────────

/**
 * What de-identification actions were taken during one export, collected
 * by generateZip() as it processes each file. Handed back to the caller
 * so it can be logged (see auditLogger.ts's logDeidentificationSummary).
 *
 * Deliberately excludes the actual date-shift day values. This summary
 * is built from the same downloadable audit log that ships bundled with
 * the de-identified dataset -- if the exact shift amount were included,
 * anyone holding both the audit log and the data could trivially reverse
 * the shift and recover the true acquisition date, defeating the entire
 * point of shifting instead of blanking. `dateShifted` records only
 * whether a (non-zero) shift was applied, not its value. Decided with
 * Brandon 2026-08-02.
 */
export interface DeidentificationSummary {
  edfFiles: {
    bidsPath: string;
    subjectGroup: string;
    /**
     * Whether the original (pre-redaction) patient ID field appeared to
     * contain real PHI. Undefined for files de-identified via the
     * server-upload path (large files), which doesn't currently report
     * this back -- rather than guess, it's left unknown.
     */
    containedPhi?: boolean;
    /** Whether a non-zero date shift was applied. Value itself is not recorded here. */
    dateShifted: boolean;
  }[];
  jsonSidecars: {
    bidsPath: string;
    subjectGroup: string;
    strippedFields: string[];
    shiftedFields: string[];
    unparseableDateFields: string[];
  }[];
}

function emptyDeidentificationSummary(): DeidentificationSummary {
  return { edfFiles: [], jsonSidecars: [] };
}

/** Files excluded from the ZIP because they are too large for browser memory. */
export interface LargeFileEntry {
  originalName: string;
  bidsPath: string;
  sizeBytes: number;
}

/** True for an uncompressed NIfTI file (.nii but not .nii.gz). */
function isUncompressedNifti(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.nii') && !lower.endsWith('.nii.gz');
}

/** True for an EDF or BDF file that requires header de-identification. */
function isEdfFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.edf') || lower.endsWith('.bdf');
}

export function buildFileEntries(
  results: DetectionResult[],
  subjects: SubjectMetadata[],
  datasetDescription: DatasetDescription,
  /**
   * Per-subject date shift values (subjectGroup -> days to shift).
   * Generated by generateSubjectDateShifts() and recorded in the audit log.
   * When provided, all EDF/BDF files get their headers de-identified on export.
   */
  dateShifts?: Map<string, number>,
  /** The dataset's chosen session structure, recorded in GeneratedBy. Optional so existing callers don't break; omitting it just omits the Description field. */
  structure?: DatasetStructure,
  /**
   * Override for LARGE_FILE_THRESHOLD_BYTES. The web export path omits
   * this (uses the 500MB browser-memory default); the Node/CLI export
   * path (nodeExportWriter.ts) passes Infinity, since it streams every
   * file to disk and never buffers a whole file in memory regardless of
   * size -- the browser-specific reason for excluding large files from
   * the export doesn't apply there.
   */
  largeFileThresholdBytes: number = LARGE_FILE_THRESHOLD_BYTES,
): FileEntry[] {
  const entries: FileEntry[] = [];

  // ── Dataset-level metadata files ────────────────────────────
  entries.push({
    path: 'dataset_description.json',
    content: generateDatasetDescription(datasetDescription, structure),
  });

  entries.push({
    path: 'participants.tsv',
    content: generateParticipantsTsv(subjects),
  });

  // ── Per-subject sessions.tsv ─────────────────────────────────
  // Skipped entirely for the Single session preset: per the BIDS spec,
  // sessions.tsv exists to describe multiple sessions, and every subject
  // has zero here by design (see Section 6 of
  // Documents/Phase2_Additional_Dataset_Presets_Spec.md -- omit the ses-
  // layer, not an implicit single id). Writing a header-only/empty file
  // for something that structurally doesn't exist would be noise, not
  // useful metadata.
  if (structure?.presetId !== 'single-session') {
    for (const subject of subjects) {
      entries.push({
        path: `primary/${subject.bidsSubjectId}/${subject.bidsSubjectId}_sessions.tsv`,
        content: generateSessionsTsv(subject),
      });
    }
  }

  // ── Data files and their sidecars ───────────────────────────
  // computeBidsNames assigns every file its final BIDS path using the
  // metadata subject ids, run / field-map entities, and sidecar pairing.
  // The exporter simply places each file where that path says.
  const subjectIdMap = new Map<string, string>();
  for (const s of subjects) {
    subjectIdMap.set(s.subjectGroup, s.bidsSubjectId);
  }

  const named = computeBidsNames(results, subjectIdMap, structure);
  for (const result of named) {
    // Export only files that belong to a configured subject and that
    // resolved to a real BIDS path -- primary/ for acquisitions, or the
    // derivatives tree for scanner-computed maps. This drops
    // localizer/scout scans, unclassified files, redundant duplicate
    // copies, and anything without a session.
    if (!subjectIdMap.has(getEffectiveSubjectGroup(result))) continue;
    if (!isExportedPath(result.bidsPath)) continue;

    const subjectGroup = getEffectiveSubjectGroup(result);
    const subjectId = subjectIdMap.get(subjectGroup);
    const dateShiftDays = dateShifts?.get(subjectGroup) ?? 0;

    entries.push({
      path: result.bidsPath,
      content: result.file,
      needsGzip: isUncompressedNifti(result.fileName),
      edfDeidentify: isEdfFile(result.fileName)
        ? { dateShiftDays, anonymousSubjectId: subjectId }
        : undefined,
      jsonDeidentify: isJsonSidecarFile(result.fileName)
        ? { dateShiftDays }
        : undefined,
      tooLarge: result.file.size > largeFileThresholdBytes,
      subjectGroup,
    });
  }

  return entries;
}

// ── Build tree structure for preview ──────────────────────────────

export function buildTreeFromEntries(entries: FileEntry[]): TreeNode {
  const root: TreeNode = { name: 'bids_output', type: 'folder', children: [] };

  for (const entry of entries) {
    const parts = entry.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        current.children!.push({
          name: part,
          type: 'file',
          size: isFileLike(entry.content) ? entry.content.size : entry.content.length,
        });
      } else {
        let child = current.children!.find(c => c.name === part && c.type === 'folder');
        if (!child) {
          child = { name: part, type: 'folder', children: [] };
          current.children!.push(child);
        }
        current = child;
      }
    }
  }

  // Sort: folders first, then files, alphabetically
  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    sortTree(child);
  }
}

// ── ZIP generation ────────────────────────────────────────────────

/**
 * Gzip an uncompressed .nii file so the export is BIDS-compliant
 * .nii.gz. Uses the browser's native CompressionStream, so there is no
 * extra dependency. Returns the gzipped bytes.
 */
async function gzipFile(file: File): Promise<ArrayBuffer> {
  const compressed = file.stream().pipeThrough(new CompressionStream('gzip'));
  return await new Response(compressed).arrayBuffer();
}

export async function generateZip(
  entries: FileEntry[],
  onProgress?: ExportProgressCallback,
): Promise<{ blob: Blob; summary: DeidentificationSummary }> {
  const zip = new JSZip();
  const summary = emptyDeidentificationSummary();

  // Add all entries to the ZIP
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    onProgress?.({ phase: 'building', current: i + 1, total: entries.length });

    if (entry.tooLarge) {
      // Skip — browser cannot load files this large into memory.
      // Listed separately in the UI so the user can copy them manually.
      continue;
    }

    if (isFileLike(entry.content)) {
      if (entry.needsGzip) {
        // Uncompressed .nii -- gzip to .nii.gz for BIDS compliance.
        // gzipFile uses browser-only CompressionStream/.stream(), so this
        // whole generateZip()/downloadBlob() pair stays web-only for now;
        // entry.content is always a real File here since only the web
        // upload path produces uncompressed .nii files today. A CLI
        // export path (not built yet) will need its own gzip via Node's
        // zlib instead of reusing this function.
        const buffer = await gzipFile(entry.content as File);
        zip.file(`bids_output/${entry.path}`, buffer);
      } else if (entry.edfDeidentify) {
        // EDF/BDF -- de-identify the header before packing.
        try {
          const result = await deidentifyEdf(entry.content, entry.edfDeidentify);
          zip.file(`bids_output/${entry.path}`, result.bytes);
          summary.edfFiles.push({
            bidsPath: entry.path,
            subjectGroup: entry.subjectGroup ?? '',
            containedPhi: result.containedPhi,
            dateShifted: entry.edfDeidentify.dateShiftDays !== 0,
          });
        } catch (err) {
          throw new Error(`Cannot read "${entry.content.name}" — make sure the file is stored locally (not cloud-only) and try re-uploading it. (${(err as Error).message})`);
        }
      } else if (entry.jsonDeidentify) {
        // Scan JSON sidecar -- blank identifying fields and shift dates
        // before packing. Falls back to the raw bytes if the file can't
        // be read as text (shouldn't happen for a real sidecar, but
        // export must not fail because of one malformed file).
        try {
          const text = await entry.content.text();
          const result = deidentifyJsonSidecar(text, entry.jsonDeidentify);
          zip.file(`bids_output/${entry.path}`, result.text);
          if (result.strippedFields.length > 0 || result.shiftedFields.length > 0 || result.unparseableDateFields.length > 0) {
            summary.jsonSidecars.push({
              bidsPath: entry.path,
              subjectGroup: entry.subjectGroup ?? '',
              strippedFields: result.strippedFields,
              shiftedFields: result.shiftedFields,
              unparseableDateFields: result.unparseableDateFields,
            });
          }
        } catch (err) {
          throw new Error(`Cannot read "${entry.content.name}" — make sure the file is stored locally (not cloud-only) and try re-uploading it. (${(err as Error).message})`);
        }
      } else {
        // Use cached buffer to avoid NotReadableError on stale File references.
        try {
          const buffer = await readFileBuffer(entry.content);
          zip.file(`bids_output/${entry.path}`, buffer);
        } catch (err) {
          throw new Error(`Cannot read "${entry.content.name}" — make sure the file is stored locally (not cloud-only) and try re-uploading it. (${(err as Error).message})`);
        }
      }
    } else {
      zip.file(`bids_output/${entry.path}`, entry.content);
    }
  }

  // Generate ZIP blob
  onProgress?.({ phase: 'zipping', current: 0, total: 1 });
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  onProgress?.({ phase: 'zipping', current: 1, total: 1 });

  return { blob, summary };
}

// ── Download helper ───────────────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Count stats for display ───────────────────────────────────────

export function getExportStats(entries: FileEntry[]) {
  let totalFiles = 0;
  let totalSize = 0;
  const folders = new Set<string>();
  const largeFiles: LargeFileEntry[] = [];

  for (const entry of entries) {
    if (entry.tooLarge && isFileLike(entry.content)) {
      largeFiles.push({
        originalName: entry.content.name,
        bidsPath: entry.path,
        sizeBytes: entry.content.size,
      });
      continue;
    }

    totalFiles++;
    if (isFileLike(entry.content)) {
      totalSize += entry.content.size;
    } else {
      totalSize += entry.content.length;
    }

    const parts = entry.path.split('/');
    for (let i = 1; i <= parts.length - 1; i++) {
      folders.add(parts.slice(0, i).join('/'));
    }
  }

  return { totalFiles, totalSize, totalFolders: folders.size, largeFiles };
}
