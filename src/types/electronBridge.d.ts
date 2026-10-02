/**
 * Type declaration for the one global electron/preload.cjs exposes via
 * contextBridge -- window.neurogateDesktop. Only actually present when
 * the app is running inside the Electron desktop shell; a plain browser
 * never loads preload.cjs, so this is always undefined there.
 * Renderer code must feature-detect (`if (window.neurogateDesktop)`)
 * before using it, not assume it exists.
 */
import type { DeidentificationSummary, FileEntry } from '../lib/bids/exporter';

export interface InstallCliResult {
  destPath: string;
  destDir: string;
  platform: string;
  addedToPath: boolean;
  pathError: string | null;
}

/** Mirror of DesktopExportEntry in src/lib/adapters/desktopExport.ts (kept separate so the renderer never imports Node-only code). */
export interface DesktopExportEntry {
  path: string;
  text?: string;
  sourcePath?: string;
  needsGzip?: boolean;
  edfDeidentify?: FileEntry['edfDeidentify'];
  jsonDeidentify?: FileEntry['jsonDeidentify'];
  layDeidentify?: FileEntry['layDeidentify'];
  csvToTsv?: boolean;
  subjectGroup?: string;
}

export interface ExportFolderChoice {
  parentDir: string;
  outputDir: string;
}

export interface ExportProgress {
  current: number;
  total: number;
  path: string;
}

export interface NeuroGateDesktopBridge {
  installCli: () => Promise<InstallCliResult>;
  getPathForFile: (file: File) => string;
  chooseExportFolder: (suggestedName: string) => Promise<ExportFolderChoice | null>;
  exportToFolder: (outputDir: string, plan: DesktopExportEntry[]) => Promise<{ summary: DeidentificationSummary; filesWritten: number }>;
  writeExportFile: (outputDir: string, name: string, text: string) => Promise<string>;
  revealExportFolder: (outputDir: string) => Promise<void>;
  onExportProgress: (callback: (progress: ExportProgress) => void) => () => void;
  /** Tells the main process whether closing the window would lose unsaved audit entries. Optional: older builds lack it. */
  setAuditUnsaved?: (unsaved: boolean) => void;
}

declare global {
  interface Window {
    neurogateDesktop?: NeuroGateDesktopBridge;
  }
}
