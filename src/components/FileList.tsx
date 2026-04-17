import type { ScannedFile } from '../types/files';
import { formatFileSize } from '../types/files';

interface FileListProps {
  files: ScannedFile[];
}

/** Displays scanned files in a table with path, name, and size */
export default function FileList({ files }: FileListProps) {
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="w-full max-w-4xl mx-auto mt-8">
      {/* Summary bar */}
      <div className="flex items-center justify-between mb-4 px-1">
        <h2 className="text-lg font-semibold text-gray-800">
          Scanned Files
        </h2>
        <div className="flex gap-4 text-sm text-gray-500">
          <span>{files.length} files</span>
          <span>{formatFileSize(totalSize)} total</span>
        </div>
      </div>

      {/* File table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-600">
          <span>File Path</span>
          <span className="text-right w-24">Size</span>
        </div>

        {/* Rows */}
        <div className="max-h-[500px] overflow-y-auto">
          {files.map((file, i) => (
            <div
              key={file.relativePath + i}
              className={`
                grid grid-cols-[1fr_auto] gap-4 px-4 py-2.5 text-sm
                ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                hover:bg-blue-50/50 transition-colors
              `}
            >
              <span className="text-gray-700 font-mono text-xs truncate" title={file.relativePath}>
                {file.relativePath}
              </span>
              <span className="text-right text-gray-500 w-24 tabular-nums">
                {formatFileSize(file.size)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
