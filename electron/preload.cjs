/**
 * Electron preload script.
 *
 * The renderer is the same web build, with contextIsolation on and
 * nodeIntegration off (see main.cjs), so by default it has no Node or
 * Electron access at all. This file is the one deliberate, narrow
 * exception: it exposes a single `window.neurogateDesktop` object with a
 * fixed set of desktop-only actions, so the UI can offer them ONLY when
 * running inside the desktop app (a plain browser never loads this
 * script, so the global doesn't exist there).
 *
 * Kept intentionally minimal -- no generic "run any IPC channel" bridge:
 *   - installCli(): copy the bundled CLI and update PATH (main.cjs).
 *   - getPathForFile(file): the on-disk path of a dropped/browsed File,
 *     so export can stream it from disk instead of loading it into
 *     memory (see src/lib/adapters/desktopExport.ts).
 *   - chooseExportFolder / exportToFolder / writeExportFile /
 *     revealExportFolder / onExportProgress: the streamed folder export.
 *   - setAuditUnsaved(unsaved): whether the audit log has unsaved
 *     entries, so closing the window can ask first (main.cjs).
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('neurogateDesktop', {
  installCli: () => ipcRenderer.invoke('install-cli'),

  getPathForFile: (file) => webUtils.getPathForFile(file),

  chooseExportFolder: (suggestedName) => ipcRenderer.invoke('choose-export-folder', suggestedName),
  exportToFolder: (outputDir, plan) => ipcRenderer.invoke('export-to-folder', { outputDir, plan }),
  writeExportFile: (outputDir, name, text) => ipcRenderer.invoke('write-export-file', { outputDir, name, text }),
  revealExportFolder: (outputDir) => ipcRenderer.invoke('reveal-export-folder', outputDir),

  setAuditUnsaved: (unsaved) => ipcRenderer.send('audit-unsaved', Boolean(unsaved)),

  /** Subscribe to per-file export progress; returns an unsubscribe function. */
  onExportProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('export-progress', listener);
    return () => ipcRenderer.removeListener('export-progress', listener);
  },
});
