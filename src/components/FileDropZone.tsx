import { useState, useCallback, useRef } from 'react';
import type { ScannedFile } from '../types/files';
import { formatFileSize } from '../types/files';

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
        className={`
          border-2 border-dashed rounded-xl p-16 text-center cursor-pointer
          transition-all duration-200
          ${isDragging
            ? 'border-[#011F5B] bg-blue-50 scale-[1.01]'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }
        `}
      >
        {isScanning ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-[#011F5B] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 text-lg">Scanning files...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {/* Folder icon */}
            <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <div>
              <p className="text-xl font-medium text-gray-700">
                Drop your patient data folder here
              </p>
              <p className="text-gray-500 mt-1">
                or click to browse
              </p>
            </div>
            <p className="text-sm text-gray-400 mt-2">
              Supports folders with multiple patient directories
            </p>
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
