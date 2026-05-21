import { useState, useCallback, useRef } from 'react';
import type { ScannedFile } from '../types/files';

interface FileDropZoneProps {
  onFilesScanned: (files: ScannedFile[]) => void;
}

/**
 * Drag-and-drop zone that accepts a folder of patient data.
 * Also provides a "Pick Folder" button fallback.
 *
 * Uses the File System Access API (webkitdirectory) to read
 * entire folder trees from the user's machine.
 */
export default function FileDropZone({ onFilesScanned }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Extract files from a DataTransferItem using webkitGetAsEntry for folder support */
  const scanDataTransferItems = useCallback(async (items: DataTransferItemList): Promise<ScannedFile[]> => {
    const files: ScannedFile[] = [];

    const readEntry = async (entry: FileSystemEntry, path: string): Promise<void> => {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        const file = await new Promise<File>((resolve, reject) => {
          fileEntry.file(resolve, reject);
        });
        files.push({
          relativePath: path + file.name,
          name: file.name,
          size: file.size,
          file,
        });
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry;
        const reader = dirEntry.createReader();
        const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
          const allEntries: FileSystemEntry[] = [];
          const readBatch = () => {
            reader.readEntries((batch) => {
              if (batch.length === 0) {
                resolve(allEntries);
              } else {
                allEntries.push(...batch);
                readBatch(); // readEntries returns batches, keep reading
              }
            }, reject);
          };
          readBatch();
        });
        for (const childEntry of entries) {
          await readEntry(childEntry, path + entry.name + '/');
        }
      }
    };

    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry) {
        await readEntry(entry, '');
      }
    }

    return files;
  }, []);

  /** Handle files from the <input> fallback (webkitdirectory) */
  const scanInputFiles = useCallback((fileList: FileList): ScannedFile[] => {
    const files: ScannedFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      files.push({
        relativePath: (file as any).webkitRelativePath || file.name,
        name: file.name,
        size: file.size,
        file,
      });
    }
    return files;
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setIsScanning(true);

    try {
      const scanned = await scanDataTransferItems(e.dataTransfer.items);
      onFilesScanned(scanned);
    } catch (err) {
      console.error('Error scanning dropped files:', err);
    } finally {
      setIsScanning(false);
    }
  }, [scanDataTransferItems, onFilesScanned]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setIsScanning(true);
    const scanned = scanInputFiles(e.target.files);
    onFilesScanned(scanned);
    setIsScanning(false);
  }, [scanInputFiles, onFilesScanned]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className="relative overflow-hidden border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-300"
        style={{
          backgroundColor: isDragging ? 'rgba(1,31,91,0.03)' : 'rgba(249,250,251,0.8)',
          borderColor: isDragging ? '#011F5B' : '#d1d5db',
          transform: isDragging ? 'scale(1.01)' : 'scale(1)',
        }}
        onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.borderColor = '#011F5B'; }}
        onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.borderColor = '#d1d5db'; }}
      >
        {isScanning ? (
          <div className="relative flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin border-[#011F5B]" style={{ borderTopColor: 'transparent' }} />
            <p className="text-lg text-gray-500">Scanning files...</p>
          </div>
        ) : (
          <div className="relative flex flex-col items-center gap-4">
            {/* Upload icon */}
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center transition-colors duration-300"
              style={{ backgroundColor: isDragging ? 'rgba(1,31,91,0.08)' : 'rgba(1,31,91,0.04)' }}
            >
              <svg className="w-10 h-10 transition-colors duration-300" fill="none" stroke={isDragging ? '#011F5B' : '#9ca3af'} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-medium text-gray-800">
                {isDragging ? 'Release to upload' : 'Drop your patient data folder here'}
              </p>
              <p className="mt-1.5 text-gray-500">
                or <span className="font-medium underline underline-offset-2 text-[#011F5B]">click to browse</span>
              </p>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                Multi-subject folders
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Auto-detection
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                PHI scanning
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input with webkitdirectory for folder selection */}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleInputChange}
        {...({ webkitdirectory: '', directory: '' } as any)}
      />
    </div>
  );
}
