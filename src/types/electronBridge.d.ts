/**
 * Type declaration for the one global electron/preload.cjs exposes via
 * contextBridge -- window.neurogateDesktop. Only actually present when
 * the app is running inside the Electron desktop shell; the hosted web
 * build never loads preload.cjs, so this is always undefined there.
 * Renderer code must feature-detect (`if (window.neurogateDesktop)`)
 * before using it, not assume it exists.
 */
export interface InstallCliResult {
  destPath: string;
  destDir: string;
  platform: string;
  addedToPath: boolean;
  pathError: string | null;
}

export interface NeuroGateDesktopBridge {
  installCli: () => Promise<InstallCliResult>;
}

declare global {
  interface Window {
    neurogateDesktop?: NeuroGateDesktopBridge;
  }
}
