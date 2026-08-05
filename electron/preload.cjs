/**
 * Electron preload script.
 *
 * The renderer is the exact same web build the hosted site ships --
 * contextIsolation is on and nodeIntegration is off (see main.cjs), so
 * it has zero Node/Electron access by default, matching the browser
 * deployment exactly. This file is the one deliberate, narrow exception:
 * it exposes a single `window.neurogateDesktop` object with one method,
 * `installCli()`, so the web UI can offer an "Install CLI" button ONLY
 * when actually running inside the desktop app (the web deployment
 * never gets this global at all, since it doesn't load this script).
 *
 * Kept intentionally minimal -- no generic "run any IPC channel" bridge,
 * just the one desktop-specific action that needs main-process access
 * (writing a file to a fixed location and touching the User PATH
 * registry value, neither of which the sandboxed renderer can do
 * itself).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('neurogateDesktop', {
  installCli: () => ipcRenderer.invoke('install-cli'),
});
