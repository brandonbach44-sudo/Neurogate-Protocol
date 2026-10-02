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
import { computeIntendedFor } from './intendedFor';
import { deidentifyEdf } from '../deidentify/edfDeidentifier';
import { deidentifyJsonSidecar, isJsonSidecarFile, shiftDateString } from '../deidentify/jsonSidecarDeidentifier';
import { deidentifyPersystLay, type LayDeidentifyOptions } from '../deidentify/persystLayDeidentifier';
import type {
  SubjectMetadata,
  DatasetDescription,
} from '../../types/metadata';
import type { DatasetStructure } from '../../types/sessionStructure';
import { resolveSessionIds } from '../../types/sessionStructure';
import { APP_VERSION } from '../../version';

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
    Version: APP_VERSION,
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

/**
 * acq_time is filled from the source data (a dropped sessions.tsv, or a
 * sidecar's AcquisitionDateTime -- see lib/metadata/tsvReader.ts), so it
 * holds real acquisition dates. It gets the subject's same date shift as
 * that subject's EDF headers and JSON sidecars, keeping intervals between
 * sessions intact. A value in a format that can't be shifted is written
 * as n/a rather than exported as-is (fail closed, same rule as
 * deidentifyJsonSidecar's unparseable dates).
 */
function generateSessionsTsv(subject: SubjectMetadata, dateShiftDays: number): string {
  const header = 'session_id\tacq_time';
  const rows = subject.sessions
    .map(s => {
      const raw = s.acqTime?.trim();
      let shifted = raw ? shiftDateString(raw, dateShiftDays) : null;
      // BIDS acq_time is ISO 8601; a DICOM-style YYYYMMDD source date is
      // written as YYYY-MM-DD.
      if (shifted && /^\d{8}$/.test(shifted)) {
        shifted = `${shifted.slice(0, 4)}-${shifted.slice(4, 6)}-${shifted.slice(6)}`;
      }
      return `${s.sessionId}\t${shifted ?? 'n/a'}`;
    })
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
    /** Field maps: what IntendedFor is set to (lib/bids/intendedFor.ts). Other sidecars: [] removes a stale one. */
    intendedFor?: string[];
  };
  /**
   * When set, this is a Persyst .lay layout: File= is pointed at the
   * paired .dat's exported name, [Patient] is cleaned and [Comments] text
   * redacted. See lib/deidentify/persystLayDeidentifier.ts.
   */
  layDeidentify?: LayDeidentifyOptions;
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
    /** Identifying text replaced with X inside EDF+/BDF+ annotations. The text itself is never recorded. */
    annotationRedactions?: number;
  }[];
  jsonSidecars: {
    bidsPath: string;
    subjectGroup: string;
    strippedFields: string[];
    shiftedFields: string[];
    unparseableDateFields: string[];
  }[];
  /** Persyst .lay layouts rewritten on export. Field names and counts only, never values. */
  layFiles?: {
    bidsPath: string;
    subjectGroup: string;
    removedFields: string[];
    shiftedFields: string[];
    commentRedactions: number;
  }[];
}

function emptyDeidentificationSummary(): DeidentificationSummary {
  return { edfFiles: [], jsonSidecars: [], layFiles: [] };
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

/** True for a Persyst .lay layout file. */
function isPersystLayFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.lay');
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

  // computeBidsNames assigns every file its final BIDS path using the
  // metadata subject ids, run / field-map entities, and sidecar pairing.
  // The exporter simply places each file where that path says.
  const subjectIdMap = new Map<string, string>();
  for (const s of subjects) {
    subjectIdMap.set(s.subjectGroup, s.bidsSubjectId);
  }
  const named = computeBidsNames(results, subjectIdMap, structure);

  // Which subjects and sessions actually have exported data. A subject
  // whose files were all left out (guessed, unclassified, localizers) must
  // not appear in participants.tsv, and a session with nothing exported
  // must not appear in sessions.tsv.
  const exportedSessions = new Map<string, Set<string>>();
  for (const r of named) {
    const group = getEffectiveSubjectGroup(r);
    if (!subjectIdMap.has(group) || !isExportedPath(r.bidsPath)) continue;
    const set = exportedSessions.get(group) ?? new Set<string>();
    const session = r.userSession ?? r.detectedSession;
    if (session) set.add(session);
    exportedSessions.set(group, set);
  }
  const listedSubjects = subjects.filter(s => exportedSessions.has(s.subjectGroup));

  // ── Dataset-level metadata files ────────────────────────────
  entries.push({
    path: 'dataset_description.json',
    content: generateDatasetDescription(datasetDescription, structure),
  });

  entries.push({
    path: 'participants.tsv',
    content: generateParticipantsTsv(listedSubjects),
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
    for (const subject of listedSubjects) {
      const present = exportedSessions.get(subject.subjectGroup)!;
      const withData = { ...subject, sessions: subject.sessions.filter(ses => present.has(ses.sessionId)) };
      entries.push({
        path: `primary/${subject.bidsSubjectId}/${subject.bidsSubjectId}_sessions.tsv`,
        content: generateSessionsTsv(withData, dateShifts?.get(subject.subjectGroup) ?? 0),
      });
    }
  }

  // ── Data files and their sidecars ───────────────────────────

  // Each exported Persyst .dat's new file name, by its original folder +
  // base name, so the matching .lay's File= can be pointed at it.
  const persystPairKey = (relativePath: string) => relativePath.replace(/\.(dat|lay)$/i, '').toLowerCase();
  const exportedDatName = new Map<string, string>();
  for (const r of named) {
    if (/\.dat$/i.test(r.fileName) && isExportedPath(r.bidsPath)) {
      exportedDatName.set(persystPairKey(r.relativePath), r.bidsFilename);
    }
  }

  // IntendedFor for each field-map sidecar, from the paths being exported.
  const exportedPaths = named
    .filter(r => subjectIdMap.has(getEffectiveSubjectGroup(r)) && isExportedPath(r.bidsPath))
    .map(r => r.bidsPath);
  const intendedFor = computeIntendedFor(exportedPaths);

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
        ? { dateShiftDays, intendedFor: intendedFor.get(result.bidsPath) ?? [] }
        : undefined,
      layDeidentify: isPersystLayFile(result.fileName)
        ? { dateShiftDays, datFileName: exportedDatName.get(persystPairKey(result.relativePath)) }
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

/** A sidecar that isn't a JSON object can't be de-identified, so export stops rather than copy it. */
export class SidecarNotJsonError extends Error {
  constructor(fileName: string) {
    super(`"${fileName}" is not a valid JSON object, so it can't be de-identified. Fix or remove it, then add the folder again.`);
    this.name = 'SidecarNotJsonError';
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
            annotationRedactions: result.annotationRedactions ?? 0,
          });
        } catch (err) {
          throw new Error(`Cannot read "${entry.content.name}". Make sure the file is stored locally (not cloud-only) and add the folder again. (${(err as Error).message})`);
        }
      } else if (entry.jsonDeidentify) {
        // Scan JSON sidecar -- blank identifying fields and shift dates
        // before packing. Falls back to the raw bytes if the file can't
        // be read as text (shouldn't happen for a real sidecar, but
        // export must not fail because of one malformed file).
        try {
          const text = await entry.content.text();
          const result = deidentifyJsonSidecar(text, entry.jsonDeidentify);
          if (!result.ok) throw new SidecarNotJsonError(entry.content.name);
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
          if (err instanceof SidecarNotJsonError) throw err;
          throw new Error(`Cannot read "${entry.content.name}". Make sure the file is stored locally (not cloud-only) and add the folder again. (${(err as Error).message})`);
        }
      } else if (entry.layDeidentify) {
        // Persyst layout -- small text file: point File= at the renamed
        // .dat, clean [Patient], redact [Comments].
        let text: string;
        try {
          text = await entry.content.text();
        } catch (err) {
          throw new Error(`Cannot read "${entry.content.name}". Make sure the file is stored locally (not cloud-only) and add the folder again. (${(err as Error).message})`);
        }
        const result = deidentifyPersystLay(text, entry.layDeidentify);
        zip.file(`bids_output/${entry.path}`, result.text);
        summary.layFiles!.push({
          bidsPath: entry.path,
          subjectGroup: entry.subjectGroup ?? '',
          removedFields: result.removedFields,
          shiftedFields: result.shiftedFields,
          commentRedactions: result.commentRedactions,
        });
      } else {
        // Use cached buffer to avoid NotReadableError on stale File references.
        try {
          const buffer = await readFileBuffer(entry.content);
          zip.file(`bids_output/${entry.path}`, buffer);
        } catch (err) {
          throw new Error(`Cannot read "${entry.content.name}". Make sure the file is stored locally (not cloud-only) and add the folder again. (${(err as Error).message})`);
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
