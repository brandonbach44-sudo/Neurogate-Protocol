import { useState, useMemo, useEffect } from 'react';
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
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [zipFilename, setZipFilename] = useState<string>('');

  // Revoke the object URL when the component unmounts to free memory.
  useEffect(() => {
    return () => { if (zipUrl) URL.revokeObjectURL(zipUrl); };
  }, [zipUrl]);

  const dateShifts = useMemo(
    () => generateSubjectDateShifts(subjects.map(s => s.subjectGroup)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const fileEntries = useMemo(
    () => buildFileEntries(detectionResults, subjects, datasetDescription, dateShifts),
    [detectionResults, subjects, datasetDescription, dateShifts]
  );

  const tree = useMemo(() => buildTreeFromEntries(fileEntries), [fileEntries]);
  const stats = useMemo(() => getExportStats(fileEntries), [fileEntries]);

  // Step 1: build the ZIP and store a blob URL — no download yet.
  const handleBuild = async () => {
    setIsExporting(true);
    setZipUrl(null);
    setExportProgress('Preparing files...');

    try {
      const blob = await generateZip(fileEntries, (progress) => {
        if (progress.phase === 'building') {
          setExportProgress(`Adding file ${progress.current} of ${progress.total}...`);
        } else {
          setExportProgress('Compressing...');
        }
      });

      const timestamp = new Date().toISOString().slice(0, 10);
      const prefix = institutionConfig.prefix || 'BIDS';
      const filename = `${prefix}_bids_export_${timestamp}.zip`;

      if (zipUrl) URL.revokeObjectURL(zipUrl);
      setZipUrl(URL.createObjectURL(blob));
      setZipFilename(filename);
      setExportProgress('');
    } catch (err) {
      console.error('Export failed:', err);
      setExportProgress('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Step 2: called when user clicks the real <a> download link.
  const handleDownloadClick = () => {
    onExportComplete();
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-gray-800">Export BIDS Dataset</h2>
        <p className="text-gray-500 mt-2">
          Review the output structure below, then download the ZIP to upload to your data infrastructure.
        </p>
      </div>

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

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-6">
        <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">BIDS Output Structure</span>
          <span className="text-xs text-gray-500">{stats.totalFolders} folders, {stats.totalFiles} files</span>
        </div>
        <div className="p-4 max-h-96 overflow-y-auto font-mono text-sm">
          <TreeView node={tree} depth={0} />
        </div>
      </div>

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

      {zipUrl && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-green-600 text-lg">&#10003;</span>
            <p className="text-sm font-medium text-green-800">
              ZIP ready — click <strong>Download</strong> to save it.
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack} disabled={isExporting}>
          Back to Validation
        </Button>

        <div className="flex items-center gap-3">
          {isExporting && (
            <span className="text-sm text-gray-500">{exportProgress}</span>
          )}
          {zipUrl ? (
            <a
              href={zipUrl}
              download={zipFilename}
              onClick={handleDownloadClick}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#011F5B] text-white hover:bg-[#022a7a] transition-colors"
            >
              Download
            </a>
          ) : (
            <Button variant="primary" onClick={handleBuild} disabled={isExporting} className="gap-2">
              {isExporting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Building...
                </>
              ) : (
                'Download'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
