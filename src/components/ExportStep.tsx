import { useState, useMemo } from 'react';
import Button from './Button';
import type { DetectionResult } from '../types/detection';
import type { SubjectMetadata, DatasetDescription, InstitutionConfig } from '../types/metadata';
import {
  buildFileEntries,
  buildTreeFromEntries,
  generateZip,
  downloadBlob,
  getExportStats,
} from '../lib/bids/exporter';
import type { TreeNode } from '../lib/bids/exporter';

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

  // Build the file entries and tree on mount
  const fileEntries = useMemo(
    () => buildFileEntries(detectionResults, subjects, datasetDescription),
    [detectionResults, subjects, datasetDescription]
  );

  const tree = useMemo(() => buildTreeFromEntries(fileEntries), [fileEntries]);
  const stats = useMemo(() => getExportStats(fileEntries), [fileEntries]);

  // Handle ZIP download
  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress('Preparing files...');

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
      downloadBlob(blob, `${prefix}_bids_export_${timestamp}.zip`);

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

        <div className="flex items-center gap-3">
          {isExporting && (
            <span className="text-sm text-gray-500">{exportProgress}</span>
          )}
          <Button variant="primary" onClick={handleExport} disabled={isExporting} className="gap-2">
            {isExporting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Exporting...
              </>
            ) : exported ? (
              'Download Again'
            ) : (
              'Download ZIP'
            )}
          </Button>
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
          {expanded ? '&#9660;' : '&#9654;'}
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
