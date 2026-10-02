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
import type { TreeNode, DeidentificationSummary } from '../lib/bids/exporter';
import { generateSubjectDateShifts } from '../lib/deidentify/edfDeidentifier';
import type { DatasetStructure } from '../types/sessionStructure';
import { isFileLike } from '../types/fileLike';
import { isUnreadable } from '../lib/fileCache';
import type { DesktopExportEntry } from '../types/electronBridge';

interface ExportStepProps {
  detectionResults: DetectionResult[];
  subjects: SubjectMetadata[];
  datasetDescription: DatasetDescription;
  institutionConfig: InstitutionConfig;
  onBack: () => void;
  /**
   * Called once the dataset has been written. `destination` is set for a
   * desktop folder export (the audit log is then saved into that folder);
   * it's absent for a browser ZIP download.
   */
  onExportComplete: (
    deidentifySummary: DeidentificationSummary,
    destination?: { outputDir: string },
  ) => void | Promise<void>;
  /** The dataset's chosen session structure, recorded in dataset_description.json's GeneratedBy field. */
  structure?: DatasetStructure;
}

export default function ExportStep({
  detectionResults,
  subjects,
  datasetDescription,
  institutionConfig,
  onBack,
  onExportComplete,
  structure,
}: ExportStepProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>('');
  const [exportError, setExportError] = useState<string>('');
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [zipFilename, setZipFilename] = useState<string>('');

  // Desktop app: export streams straight to a folder on disk through the
  // same writer the CLI uses (see electron/main.cjs "Export to folder"),
  // so there is no file-size limit and no ZIP step. A plain browser has
  // no bridge and keeps the in-memory ZIP path below.
  const desktop = typeof window !== 'undefined' ? window.neurogateDesktop : undefined;
  const isDesktopExport = Boolean(desktop?.exportToFolder);
  const [desktopResult, setDesktopResult] = useState<{ outputDir: string; filesWritten: number } | null>(null);

  const [deidentifySummary, setDeidentifySummary] = useState<DeidentificationSummary | null>(null);

  // Warn up front if any file was unreadable at drop time (e.g. OneDrive cloud-only).
  const unreadableFiles = detectionResults
    .filter(r => isUnreadable(r.file))
    .map(r => r.fileName);

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
    () => buildFileEntries(
      detectionResults, subjects, datasetDescription, dateShifts, structure,
      // Desktop export streams from disk, so nothing is too large; the
      // browser ZIP keeps the default in-memory cap.
      isDesktopExport ? Infinity : undefined,
    ),
    [detectionResults, subjects, datasetDescription, dateShifts, structure, isDesktopExport]
  );

  const tree = useMemo(() => buildTreeFromEntries(fileEntries), [fileEntries]);
  // Subjects and sessions.tsv files as actually written (subjects with no
  // exported data are left out of the export, see buildFileEntries).
  const sessionsTsvPaths = useMemo(
    () => fileEntries.map(e => e.path).filter(p => p.endsWith('_sessions.tsv')),
    [fileEntries],
  );
  const exportedSubjectCount = useMemo(() => {
    const participants = fileEntries.find(e => e.path === 'participants.tsv')?.content;
    return typeof participants === 'string' ? participants.trim().split('\n').length - 1 : subjects.length;
  }, [fileEntries, subjects.length]);
  const stats = useMemo(() => getExportStats(fileEntries), [fileEntries]);

  const exportBaseName = () => {
    const timestamp = new Date().toISOString().slice(0, 10);
    const prefix = institutionConfig.prefix || 'BIDS';
    return `${prefix}_bids_export_${timestamp}`;
  };

  // Desktop: pick a folder, then stream every file into it.
  const handleDesktopExport = async () => {
    if (!desktop) return;
    setExportError('');
    const choice = await desktop.chooseExportFolder(exportBaseName());
    if (!choice) return;

    setIsExporting(true);
    setExportProgress('Preparing files...');
    const unsubscribe = desktop.onExportProgress(p => {
      setExportProgress(`Writing file ${p.current} of ${p.total}...`);
    });
    try {
      const plan: DesktopExportEntry[] = fileEntries.map(entry => {
        const base = {
          path: entry.path,
          needsGzip: entry.needsGzip,
          edfDeidentify: entry.edfDeidentify,
          jsonDeidentify: entry.jsonDeidentify,
          layDeidentify: entry.layDeidentify,
          csvToTsv: entry.csvToTsv,
          subjectGroup: entry.subjectGroup,
        };
        if (!isFileLike(entry.content)) return { ...base, text: entry.content };
        const sourcePath = desktop.getPathForFile(entry.content as File);
        if (!sourcePath) {
          throw new Error(`Cannot find "${entry.content.name}" on disk. Add the folder again and retry.`);
        }
        return { ...base, sourcePath };
      });

      const { summary, filesWritten } = await desktop.exportToFolder(choice.outputDir, plan);
      setDeidentifySummary(summary);
      setExportProgress('Saving audit log...');
      await onExportComplete(summary, { outputDir: choice.outputDir });
      setDesktopResult({ outputDir: choice.outputDir, filesWritten });
      setExportProgress('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Export failed:', err);
      setExportError(`Export failed: ${msg}`);
      setExportProgress('');
    } finally {
      unsubscribe();
      setIsExporting(false);
    }
  };

  // Browser: build the ZIP. Files over 500 MB are left out (see the warning below).
  const handleBuild = async () => {
    setIsExporting(true);
    setZipUrl(null);
    setExportError('');
    setExportProgress('Preparing files...');

    try {
      setExportProgress('Building ZIP...');
      const { blob, summary } = await generateZip(fileEntries, (progress) => {
        if (progress.phase === 'building') {
          setExportProgress(`Adding file ${progress.current} of ${progress.total}...`);
        } else {
          setExportProgress('Compressing...');
        }
      });

      setDeidentifySummary(summary);

      const filename = `${exportBaseName()}.zip`;

      if (zipUrl) URL.revokeObjectURL(zipUrl);
      setZipUrl(URL.createObjectURL(blob));
      setZipFilename(filename);
      setExportProgress('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Export failed:', err);
      setExportError(`Export failed: ${msg}`);
      setExportProgress('');
    } finally {
      setIsExporting(false);
    }
  };

  // Step 2: called when user clicks the real <a> download link.
  const handleDownloadClick = () => {
    onExportComplete(deidentifySummary ?? { edfFiles: [], jsonSidecars: [] });
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-gray-800">Export BIDS Dataset</h2>
        <p className="text-gray-500 mt-2">
          {isDesktopExport
            ? 'Review the output structure below, then export it to a folder on your computer.'
            : 'Review the output structure below, then download it as a ZIP.'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-semibold text-[#011F5B]">{exportedSubjectCount}</p>
          <p className="text-sm text-gray-500 mt-1">
            {exportedSubjectCount === 1 ? 'Subject' : 'Subjects'}
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
          {/* The sessions.tsv files actually written: none for the Single
              session preset, and none for a subject with no exported data. */}
          {sessionsTsvPaths.map(p => (
            <div key={p} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
              <span className="text-sm text-blue-700">{p.split('/').pop()}</span>
            </div>
          ))}
        </div>
      </div>

      {unreadableFiles.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-semibold text-amber-800 mb-1">File not locally available</p>
          <p className="text-sm text-amber-700">
            <strong>{unreadableFiles.join(', ')}</strong> could not be read. It may be a cloud-only OneDrive file.
            In Windows Explorer, right-click the file and choose <strong>"Always keep on this device"</strong>, then add the folder again.
          </p>
        </div>
      )}

      {exportError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium text-red-800">{exportError}</p>
        </div>
      )}

      {stats.largeFiles.length > 0 && (
          // A browser can't package these files in memory. They are NOT exported: copying them in by hand would
          // put raw, un-de-identified headers into the dataset. The
          // desktop app and CLI export them with no size limit.
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <p className="text-sm font-semibold text-amber-800 mb-2">
              Files over 500 MB will not be included
            </p>
            <p className="text-sm text-amber-700 mb-3">
              A browser can't process files this large. Use the NeuroGate desktop app or CLI
              to export them de-identified.
            </p>
            {stats.largeFiles.map(f => (
              <div key={f.bidsPath} className="bg-white border border-amber-200 rounded p-3 mb-2 font-mono text-xs text-gray-700">
                <span className="font-semibold text-gray-900">{f.originalName}</span>
                <span className="text-gray-400 ml-2">({formatSize(f.sizeBytes)})</span>
              </div>
            ))}
          </div>
      )}

      {desktopResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-green-800">
              <span className="text-green-600 text-lg mr-1">&#10003;</span>
              Exported {desktopResult.filesWritten} files, with the audit log, to:
            </p>
            <p className="font-mono text-xs text-green-900 mt-1 break-all">{desktopResult.outputDir}</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => desktop?.revealExportFolder(desktopResult.outputDir).catch(err => setExportError(String(err)))}
            className="shrink-0"
          >
            Show Folder
          </Button>
        </div>
      )}

      {zipUrl && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-green-600 text-lg">&#10003;</span>
            <p className="text-sm font-medium text-green-800">
              ZIP ready. Click <strong>Download</strong> to save it.
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
          {isDesktopExport ? (
            <Button variant="primary" onClick={handleDesktopExport} disabled={isExporting} className="gap-2">
              {isExporting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Exporting...
                </>
              ) : desktopResult ? (
                'Export Again'
              ) : (
                'Export to Folder'
              )}
            </Button>
          ) : zipUrl ? (
            <a
              href={zipUrl}
              download={zipFilename}
              onClick={handleDownloadClick}
              className="btn-cta inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#011F5B] text-white hover:bg-[#022a7a] transition-colors"
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
