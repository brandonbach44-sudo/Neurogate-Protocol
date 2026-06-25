import { useState, useMemo, useEffect, useRef } from 'react';
import Button from './Button';
import type { DetectionResult } from '../types/detection';
import type { SubjectMetadata, DatasetDescription, InstitutionConfig } from '../types/metadata';
import {
  buildFileEntries,
  buildTreeFromEntries,
  generateZip,
  getExportStats,
} from '../lib/bids/exporter';
import type { TreeNode } from '../lib/bids/exporter';
import { generateSubjectDateShifts } from '../lib/deidentify/edfDeidentifier';

interface ExportStepProps {
  detectionResults: DetectionResult[];
  subjects: SubjectMetadata[];
  datasetDescription: DatasetDescription;
  institutionConfig: InstitutionConfig;
  onBack: () => void;
  onExportComplete: () => void;
}

export default function ExportStep({
  detectionResults,
  subjects,
  datasetDescription,
  institutionConfig,
  onBack,
  onExportComplete,
}: ExportStepProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>('');
  const [exported, setExported] = useState(false);
  // Stores the ready-to-download URLs so the user can click a real <a> link,
  // bypassing the browser's user-activation expiry on async downloads.
  const [downloadLinks, setDownloadLinks] = useState<{ url: string; filename: string }[]>([]);
  const prevLinksRef = useRef<{ url: string; filename: string }[]>([]);

  // Revoke object URLs when new ones replace them to avoid memory leaks.
  useEffect(() => {
    return () => {
      prevLinksRef.current.forEach(l => URL.revokeObjectURL(l.url));
    };
  }, []);

  // Generate one random date shift per subject on mount -- these are used
  // to de-identify EDF/BDF header dates at export time. The shifts are
  // stable for the lifetime of this component instance (useMemo with no
  // changing deps) so repeated clicks produce the same shifted output.
  const dateShifts = useMemo(
    () => generateSubjectDateShifts(subjects.map(s => s.subjectGroup)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // intentionally empty -- shifts must not change across renders
  );

  // Build the file entries and tree on mount
  const fileEntries = useMemo(
    () => buildFileEntries(detectionResults, subjects, datasetDescription, dateShifts),
    [detectionResults, subjects, datasetDescription, dateShifts]
  );

  const tree = useMemo(() => buildTreeFromEntries(fileEntries), [fileEntries]);
  const stats = useMemo(() => getExportStats(fileEntries), [fileEntries]);

  // Handle ZIP generation -- builds the ZIP and stores object URLs so the
  // user can trigger the actual download via a real <a> click (avoids the
  // browser blocking programmatic downloads after async user-activation expiry).
  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress('Preparing files...');
    // Revoke any previous links before replacing them.
    prevLinksRef.current.forEach(l => URL.revokeObjectURL(l.url));
    setDownloadLinks([]);

    try {
      const blob = await generateZip(fileEntries, (progress) => {
        if (progress.phase === 'building') {
          setExportProgress(`Adding file ${progress.current} of ${progress.total}...`);
        } else {
          setExportProgress('Compressing ZIP...');
        }
      });

      const timestamp = new Date().toISOString().slice(0, 10);
      const prefix = institutionConfig.prefix || 'BIDS';
      const links: { url: string; filename: string }[] = [];

      links.push({
        url: URL.createObjectURL(blob),
        filename: `${prefix}_bids_export_${timestamp}.zip`,
      });

      // Include the date shift key as a separate restricted download.
      if (dateShifts.size > 0) {
        const shiftKey = subjects.map(s => ({
          subjectGroup: s.subjectGroup,
          bidsSubjectId: s.bidsSubjectId,
          dateShiftDays: dateShifts.get(s.subjectGroup) ?? 0,
        }));
        const keyBlob = new Blob(
          [JSON.stringify({ generated: new Date().toISOString(), dateShiftKey: shiftKey }, null, 2)],
          { type: 'application/json' },
        );
        links.push({
          url: URL.createObjectURL(keyBlob),
          filename: `${prefix}_date_shift_key_RESTRICTED_${timestamp}.json`,
        });
      }

      prevLinksRef.current = links;
      setDownloadLinks(links);
      setExported(true);
      setExportProgress('');
      onExportComplete();
    } catch (err) {
      console.error('Export failed:', err);
      setExportProgress('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-gray-800">Export BIDS Dataset</h2>
        <p className="text-gray-500 mt-2">
          Review the output structure below, then download the ZIP to upload to your data infrastructure.
        </p>
      </div>

      {/* Stats banner */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-semibold text-[#011F5B]">{subjects.length}</p>
          <p className="text-sm text-gray-500 mt-1">
            {subjects.length === 1 ? 'Subject' : 'Subjects'}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-semibold text-[#011F5B]">{stats.totalFiles}</p>
          <p className="text-sm text-gray-500 mt-1">Total Files</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-semibold text-[#011F5B]">{formatSize(stats.totalSize)}</p>
          <p className="text-sm text-gray-500 mt-1">Total Size</p>
        </div>
      </div>

      {/* Folder tree preview */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-6">
        <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">BIDS Output Structure</span>
          <span className="text-xs text-gray-500">{stats.totalFolders} folders, {stats.totalFiles} files</span>
        </div>
        <div className="p-4 max-h-96 overflow-y-auto font-mono text-sm">
          <TreeView node={tree} depth={0} />
        </div>
      </div>

      {/* Generated metadata files info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm font-medium text-blue-800 mb-2">Auto-generated metadata files included:</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
            <span className="text-sm text-blue-700">dataset_description.json</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
            <span className="text-sm text-blue-700">participants.tsv</span>
          </div>
          {subjects.map(s => (
            <div key={s.bidsSubjectId} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
              <span className="text-sm text-blue-700">{s.bidsSubjectId}_sessions.tsv</span>
            </div>
          ))}
        </div>
      </div>

      {/* Export success message */}
      {exported && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-green-600 text-lg">&#10003;</span>
            <div>
              <p className="text-sm font-medium text-green-800">Export complete!</p>
              <p className="text-sm text-green-700 mt-0.5">
                Your BIDS dataset has been downloaded. Unzip the file and upload the contents to your
                site's chosen data infrastructure (SOP-PENNSIEVE-001 covers Pennsieve as an example).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack} disabled={isExporting}>
          Back to Validation
        </Button>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          {isExporting && (
            <span className="text-sm text-gray-500">{exportProgress}</span>
          )}
          {downloadLinks.length > 0 ? (
            <>
              {downloadLinks.map((link) => (
                <a
                  key={link.filename}
                  href={link.url}
                  download={link.filename}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#011F5B] text-white hover:bg-[#022a7a] transition-colors"
                >
                  {link.filename.includes('RESTRICTED') ? 'Save Shift Key' : 'Save ZIP'}
                </a>
              ))}
              <Button variant="secondary" onClick={handleExport} disabled={isExporting}>
                Rebuild ZIP
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={handleExport} disabled={isExporting} className="gap-2">
              {isExporting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Exporting...
                </>
              ) : (
                'Download ZIP'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tree view sub-component ───────────────────────────────────────

function TreeView({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 3);
  const indent = depth * 20;

  if (node.type === 'file') {
    return (
      <div
        className="flex items-center gap-1.5 py-0.5 text-gray-600 hover:bg-gray-50 rounded px-1"
        style={{ paddingLeft: indent }}
      >
        <span className="text-gray-500 text-xs">&#128196;</span>
        <span>{node.name}</span>
        {node.size !== undefined && (
          <span className="text-gray-300 text-xs ml-1">({formatSize(node.size)})</span>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 py-0.5 text-gray-800 font-medium hover:bg-gray-50 rounded px-1 w-full text-left"
        style={{ paddingLeft: indent }}
      >
        <span className="text-xs text-gray-500 w-3">
          {expanded ? '▼' : '▶'}
        </span>
        <span className="text-yellow-600 text-xs">&#128193;</span>
        <span>{node.name}/</span>
        {node.children && (
          <span className="text-gray-300 text-xs ml-1">
            ({node.children.length} {node.children.length === 1 ? 'item' : 'items'})
          </span>
        )}
      </button>
      {expanded && node.children?.map((child, i) => (
        <TreeView key={`${child.name}-${i}`} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

// ── Utility ───────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
