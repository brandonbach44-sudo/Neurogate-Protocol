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
 *           ...
 *       ses-postimplant/
 *         ct/
 *         ieeg/
 *       ses-postsurgery/
 *         anat/
 */

import JSZip from 'jszip';
import type { DetectionResult } from '../../types/detection';
import {
  getEffectiveSession,
  getEffectiveModality,
  getEffectiveSubjectGroup,
  MODALITIES,
} from '../../types/detection';
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

  // ── Per-subject metadata + data files ───────────────────────
  for (const subject of subjects) {
    const subId = subject.bidsSubjectId;

    // sessions.tsv
    entries.push({
      path: `primary/${subId}/${subId}_sessions.tsv`,
      content: generateSessionsTsv(subject),
    });

    // Find all detection results for this subject
    const subjectResults = results.filter(
      r => getEffectiveSubjectGroup(r) === subject.subjectGroup
    );

    for (const result of subjectResults) {
      const session = getEffectiveSession(result);
      const modality = getEffectiveModality(result);

      // Skip unclassified/other files and localizer/scout scans
      // (localizers are not part of a BIDS dataset)
      if (!session || modality === 'other' || modality === 'localizer') continue;

      // Get BIDS folder for this modality
      const modalityInfo = MODALITIES.find(m => m.value === modality);
      const bidsFolder = modalityInfo?.bidsFolder || '';

      // Build the BIDS filename
      const bidsFilename = buildBidsFilename(subId, session, modality, result.fileName);

      // Build path
      let filePath: string;
      if (bidsFolder) {
        filePath = `primary/${subId}/${session}/${bidsFolder}/${bidsFilename}`;
      } else {
        filePath = `primary/${subId}/${session}/${bidsFilename}`;
      }

      entries.push({
        path: filePath,
        content: result.file,
        needsGzip: isUncompressedNifti(result.fileName),
      });
    }
  }

  return entries;
}

// ── BIDS filename builder (mirrors detection engine logic) ────────

function buildBidsFilename(
  subjectId: string,
  session: string,
  modality: string,
  originalFileName: string,
): string {
  const sub = subjectId.startsWith('sub-') ? subjectId : `sub-${subjectId}`;
  const ext = getFileExtension(originalFileName);

  switch (modality) {
    case 'anat-T1w':
      return `${sub}_${session}_T1w${ext}`;
    case 'anat-T2w':
      return `${sub}_${session}_T2w${ext}`;
    case 'anat-FLAIR':
      return `${sub}_${session}_FLAIR${ext}`;
    case 'anat-angio':
      return `${sub}_${session}_angio${ext}`;
    case 'ct':
      return `${sub}_${session}_ct${ext}`;
    case 'dwi':
      return `${sub}_${session}_dwi${ext}`;
    case 'perf':
      return `${sub}_${session}_asl${ext}`;
    case 'eeg':
      return `${sub}_${session}_task-monitor_eeg${ext}`;
    case 'ieeg':
      return `${sub}_${session}_task-monitor_ieeg${ext}`;
    case 'func':
      return `${sub}_${session}_task-rest_bold${ext}`;
    case 'fmap':
      return `${sub}_${session}_fmap${ext}`;
    case 'electrodes':
      return `${sub}_${session}_electrodes.tsv`;
    case 'channels':
      return `${sub}_${session}_task-monitor_channels.tsv`;
    case 'events':
      return `${sub}_${session}_task-monitor_events.tsv`;
    case 'sidecar-json':
    case 'sidecar-tsv':
      return originalFileName;
    default:
      return `${sub}_${session}_${originalFileName}`;
  }
}

function getFileExtension(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.nii.gz')) return '.nii.gz';
  // Uncompressed NIfTI is gzipped on export, so the BIDS filename
  // already carries the final .nii.gz extension.
  if (lower.endsWith('.nii')) return '.nii.gz';
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.substring(lastDot) : '';
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
