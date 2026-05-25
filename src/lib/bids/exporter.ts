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
 *
 * Every file's BIDS path is assigned by computeBidsNames() in
 * lib/bids/bidsNaming.ts, the single source of truth shared with the
 * detection engine and the validator. The exporter places each file at
 * the path that module produced, so the export can never disagree with
 * the in-tool preview.
 */

import JSZip from 'jszip';
import type { DetectionResult } from '../../types/detection';
import { getEffectiveSubjectGroup } from '../../types/detection';
import { computeBidsNames } from './bidsNaming';
import type {
  SubjectMetadata,
  DatasetDescription,
} from '../../types/metadata';

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

function generateDatasetDescription(desc: DatasetDescription): string {
  const obj: Record<string, unknown> = {
    Name: desc.name,
    BIDSVersion: desc.bidsVersion,
    DatasetType: desc.datasetType,
    Authors: desc.authors.filter(a => a.trim()),
  };

  if (desc.acknowledgements.trim()) {
    obj.Acknowledgements = desc.acknowledgements;
  }

  const funding = desc.funding.filter(f => f.trim());
  if (funding.length > 0) {
    obj.Funding = funding;
  }

  obj.GeneratedBy = [{
    Name: 'NeuroGate',
    Version: '1.0.0',
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

interface FileEntry {
  path: string;
  content: File | string;
  /**
   * True when content is an uncompressed .nii file that must be gzipped
   * to .nii.gz during ZIP generation to be BIDS-compliant.
   */
  needsGzip?: boolean;
}

/** True for an uncompressed NIfTI file (.nii but not .nii.gz). */
function isUncompressedNifti(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.nii') && !lower.endsWith('.nii.gz');
}

export function buildFileEntries(
  results: DetectionResult[],
  subjects: SubjectMetadata[],
  datasetDescription: DatasetDescription,
): FileEntry[] {
  const entries: FileEntry[] = [];

  // ── Dataset-level metadata files ────────────────────────────
  entries.push({
    path: 'dataset_description.json',
    content: generateDatasetDescription(datasetDescription),
  });

  entries.push({
    path: 'participants.tsv',
    content: generateParticipantsTsv(subjects),
  });

  // ── Per-subject sessions.tsv ─────────────────────────────────
  for (const subject of subjects) {
    entries.push({
      path: `primary/${subject.bidsSubjectId}/${subject.bidsSubjectId}_sessions.tsv`,
      content: generateSessionsTsv(subject),
    });
  }

  // ── Data files and their sidecars ───────────────────────────
  // computeBidsNames assigns every file its final BIDS path using the
  // metadata subject ids, run / field-map entities, and sidecar pairing.
  // The exporter simply places each file where that path says.
  const subjectIdMap = new Map<string, string>();
  for (const s of subjects) {
    subjectIdMap.set(s.subjectGroup, s.bidsSubjectId);
  }

  const named = computeBidsNames(results, subjectIdMap);
  for (const result of named) {
    // Export only files that belong to a configured subject and that
    // resolved to a real BIDS path. This drops localizer/scout scans,
    // unclassified files, and anything without a session.
    if (!subjectIdMap.has(getEffectiveSubjectGroup(result))) continue;
    if (!result.bidsPath.startsWith('primary/')) continue;

    entries.push({
      path: result.bidsPath,
      content: result.file,
      needsGzip: isUncompressedNifti(result.fileName),
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
          size: entry.content instanceof File ? entry.content.size : entry.content.length,
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
): Promise<Blob> {
  const zip = new JSZip();

  // Add all entries to the ZIP
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    onProgress?.({ phase: 'building', current: i + 1, total: entries.length });

    if (entry.content instanceof File) {
      if (entry.needsGzip) {
        // Uncompressed .nii; gzip it so the output file is .nii.gz.
        // The entry path was already built with the .nii.gz extension.
        const buffer = await gzipFile(entry.content);
        zip.file(`bids_output/${entry.path}`, buffer);
      } else {
        const buffer = await entry.content.arrayBuffer();
        zip.file(`bids_output/${entry.path}`, buffer);
      }
    } else {
      zip.file(`bids_output/${entry.path}`, entry.content);
    }
  }

  // Generate ZIP blob
  onProgress?.({ phase: 'zipping', current: 0, total: 1 });
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  onProgress?.({ phase: 'zipping', current: 1, total: 1 });

  return blob;
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

  for (const entry of entries) {
    totalFiles++;
    if (entry.content instanceof File) {
      totalSize += entry.content.size;
    } else {
      totalSize += entry.content.length;
    }

    // Track unique folders
    const parts = entry.path.split('/');
    for (let i = 1; i <= parts.length - 1; i++) {
      folders.add(parts.slice(0, i).join('/'));
    }
  }

  return { totalFiles, totalSize, totalFolders: folders.size };
}
