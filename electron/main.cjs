/**
 * NeuroGate Desktop (Electron main process)
 *
 * Wraps the web app in a native installer.
 *
 * Architecture: on launch, requires server/index.js IN-PROCESS with
 * SERVE_STATIC=true, calls its exported start() on 127.0.0.1, then
 * points the BrowserWindow at http://127.0.0.1:<port>. The renderer is
 * the exact same built dist/ the website ships, served locally. The
 * server only serves pages; desktop-only features (folder export, CLI
 * install) go through the preload bridge.
 *
 * Why in-process, not a child process: an earlier design spawned a
 * second copy of the packaged .exe (process.execPath +
 * ELECTRON_RUN_AS_NODE=1). On a real installed Windows build that
 * failed every launch with `spawn ...\NeuroGate.exe ENOENT`, most
 * likely because antivirus blocks an unsigned .exe launching itself and
 * reports it as "file not found". Electron's main process is already a
 * Node.js runtime, so requiring the module directly removes the second
 * process and that failure mode.
 *
 * Deliberately plain CommonJS (.cjs), not TypeScript or ESM: the main
 * process is small enough that a build step (electron-vite, tsc, etc.)
 * would be pure overhead, and .cjs sidesteps ESM/Electron interop
 * gotchas (__dirname, some native module loading edge cases) regardless
 * of this repo's root package.json having "type": "module".
 *
 * CLI install flow: the "Install CLI" button (wired via preload.cjs +
 * the 'install-cli' IPC handler below) copies the bundled
 * dist-cli/neurogate.exe (see scripts/build-cli-sea.mjs and the "build"
 * config in package.json, which packages it as an extraResource) to a
 * stable per-user location and adds that location to the Windows User
 * PATH registry value directly via PowerShell's [Environment]::
 * SetEnvironmentVariable(...,'User') -- deliberately NOT the `setx`
 * command, which has a well-documented bug where it silently truncates
 * PATH at 1024 characters if the existing value (System + User
 * combined, which is what `setx PATH "%PATH%;x"` captures) is already
 * long, corrupting the user's PATH. Reading and writing only the User
 * scope via .NET's Environment API avoids that entirely and is what
 * Windows installers do internally. Editing PATH is done here (not left
 * as a copy-pasteable command like earlier revisions of this file
 * planned) specifically because Brandon confirmed the actual goal is
 * for `neurogate <folder>` to just work in a fresh terminal after one
 * button click -- the "don't silently modify PATH" caution from
 * Documents/NeuroGate_Phase_Roadmap.md was about doing this
 * automatically/invisibly on install; a user-initiated button click is
 * consent, not silence.
 */

const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

// app.getName() (and therefore app.getPath('userData')) defaults to
// package.json's top-level "name" field ("epilepsy-app" -- an old
// internal name, not the product's actual branding), NOT
// electron-builder's "productName" ("NeuroGate") used for the
// installer/shortcuts/window title. Without this, "Install CLI" would
// silently install to %APPDATA%\epilepsy-app\bin instead of
// %APPDATA%\NeuroGate\bin, which is confusing to find and inconsistent
// with everything else the user sees. Must be set before any
// app.getPath('userData') call -- see cliInstallDir() below.
app.setName('NeuroGate');

// Fixed port for now. If this ever collides with something already
// running on the user's machine, a future revision should probe for a
// free port instead -- not needed for v1 (this is a purely local
// loopback server, not intended to be reachable from anywhere else).
const SERVER_PORT = 3001;
const APP_URL = `http://127.0.0.1:${SERVER_PORT}`;

// Fast dev loop (see scripts/dev-electron.mjs / "npm run electron:dev:fast"):
// when set, the window loads the Vite dev server directly instead of a
// built dist/ served by Express, so every save is a Vite HMR update --
// no `npm run build` + relaunch cycle. The page server still runs
// in-process below, just with SERVE_STATIC off, since the Vite dev
// server is what's serving the frontend now. This is what closes the
// "close, reinstall the app" complaint for iterating on small changes --
// full electron-builder installers are still how release testing and
// actual releases work.
const DEV_SERVER_URL = process.env.ELECTRON_START_URL || null;

/** Root of the packaged app -- one level up from electron/, same layout in dev and packaged (electron-builder copies electron/, server/, dist/ as siblings; see the "build" config in package.json). */
const APP_ROOT = path.join(__dirname, '..');

let httpServer = null;
let mainWindow = null;

/**
 * Sets the env vars server/index.js reads at module-load time, then
 * requires it and calls its exported start(). The env vars must be set
 * BEFORE require(), since the module reads them while building the
 * Express app at the top level.
 */
async function startServer() {
  process.env.PORT = String(SERVER_PORT);
  // In fast-dev mode the window loads the Vite dev server directly, so
  // this server has no pages to serve.
  process.env.SERVE_STATIC = DEV_SERVER_URL ? 'false' : 'true';

  const serverEntry = path.join(APP_ROOT, 'server', 'index.js');
  console.log(`[electron] loading server in-process: ${serverEntry}`);

  const { start } = require(serverEntry);
  // Loopback only: the server exists to serve this app's own pages to its
  // own window, never to anything else on the network.
  httpServer = await start(SERVER_PORT, '127.0.0.1');
}

function stopServer() {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'NeuroGate',
    // Window/taskbar icon on Linux (Windows and macOS take it from the
    // packaged app instead -- see "icon" in package.json's "build").
    icon: path.join(__dirname, 'icons', 'icon.png'),
    webPreferences: {
      // preload.cjs exposes exactly one thing to the renderer --
      // window.neurogateDesktop.installCli() -- via contextBridge.
      // Everything else about the renderer is identical to the hosted
      // web build: plain fetch() to the local API, no other Node/
      // Electron surface exposed. contextIsolation/sandbox stay on.
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open external links (e.g. docs links pointing at the hosted site)
  // in the user's real browser instead of inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(DEV_SERVER_URL || APP_URL);

  if (DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Auto-update ─────────────────────────────────────────────────────

/**
 * Checks GitHub Releases (the "publish" config in package.json's
 * "build" section, which electron-builder bakes into the packaged app
 * as app-update.yml) for a newer version on every launch, and asks the
 * user before downloading or restarting -- autoDownload is off so a
 * ~100MB download never starts behind someone's back mid-export.
 *
 * Skipped entirely in dev (`npm run electron:dev` / `electron:dev:fast`):
 * there's no app-update.yml outside a packaged build, and an unpackaged
 * app has no installed version to replace anyway.
 *
 * macOS only checks, never downloads: Squirrel.Mac refuses to install
 * an update unless it's signed with the same Developer ID as the
 * installed app, and NeuroGate's macOS builds are only ad-hoc signed
 * (see scripts/adhoc-sign-mac.cjs). So on macOS the prompt opens the
 * release page instead, and the user drags the new version into
 * Applications. Once there's a Developer ID certificate, drop the
 * MANUAL_MAC_UPDATES branch and macOS gets the same flow as Windows/
 * Linux.
 *
 * Every failure (offline, GitHub rate limit, no releases published yet)
 * is logged and otherwise ignored -- the updater must never stop the
 * app launching or interrupt the user with an error for something they
 * didn't ask for.
 */
const MANUAL_MAC_UPDATES = process.platform === 'darwin';
const RELEASES_URL = 'https://github.com/brandonbach44-sudo/Neurogate-Protocol/releases';

function initAutoUpdater() {
  if (!app.isPackaged) {
    console.log('[updater] skipped (not a packaged build)');
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = !MANUAL_MAC_UPDATES;
  autoUpdater.logger = console;

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] no update available');
  });

  autoUpdater.on('update-available', async (info) => {
    console.log(`[updater] update available: ${info.version}`);

    if (MANUAL_MAC_UPDATES) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update available',
        message: `NeuroGate ${info.version} is available.`,
        detail: `You're running ${app.getVersion()}. Open the download page? Download the .dmg, then drag NeuroGate into Applications to replace this version.`,
        buttons: ['Open download page', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) shell.openExternal(`${RELEASES_URL}/tag/v${info.version}`);
      return;
    }

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update available',
      message: `NeuroGate ${info.version} is available.`,
      detail: `You're running ${app.getVersion()}. Download the update now? You can keep working while it downloads.`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      autoUpdater.downloadUpdate().catch((err) => {
        console.error('[updater] download failed:', err);
        if (mainWindow) mainWindow.setProgressBar(-1);
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) mainWindow.setProgressBar(progress.percent / 100);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    console.log(`[updater] update downloaded: ${info.version}`);
    if (mainWindow) mainWindow.setProgressBar(-1);
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update ready',
      message: `NeuroGate ${info.version} is ready to install.`,
      detail: 'Restart now to finish updating? If you choose Later, the update installs the next time you quit NeuroGate.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      // before-quit/will-quit still fire on quitAndInstall, so the
      // in-process server is closed the same way as a normal quit.
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err);
    if (mainWindow) mainWindow.setProgressBar(-1);
  });

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[updater] check failed:', err);
  });
}

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (err) {
    console.error('[electron] server failed to start:', err);
    dialog.showErrorBox(
      'NeuroGate failed to start',
      `The local server could not be started.\n\n${err.message}\n\nTry launching NeuroGate again. If this keeps happening, check that port ${SERVER_PORT} isn't already in use by another program.`
    );
    app.quit();
    return;
  }

  createWindow();
  initAutoUpdater();

  app.on('activate', () => {
    // macOS convention: clicking the dock icon with no windows open
    // should reopen one, rather than the app doing nothing.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Windows/Linux convention: closing the last window quits the app.
  // macOS keeps the app running (per the platform convention) until
  // Cmd+Q, matching how most desktop apps behave there.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopServer();
});

app.on('will-quit', () => {
  stopServer();
});

// ── Install CLI ─────────────────────────────────────────────────────

/**
 * Where the CLI binary lives inside the running app, packaged or not:
 *   - Packaged: electron-builder copies dist-cli/neurogate.exe to
 *     resources/cli/neurogate.exe via the "win.extraResources" entry in
 *     package.json's "build" config; process.resourcesPath points at
 *     that resources/ folder in a packaged build.
 *   - Dev (`npm run electron:dev`): extraResources isn't applied at
 *     all, so this reads straight from dist-cli/ in the project --
 *     requires having run `npm run cli:sea` at least once first.
 */
function bundledCliPath() {
  const exeName = process.platform === 'win32' ? 'neurogate.exe' : 'neurogate';
  return app.isPackaged
    ? path.join(process.resourcesPath, 'cli', exeName)
    : path.join(APP_ROOT, 'dist-cli', exeName);
}

/** Stable per-user install location -- app.getPath('userData') resolves to e.g. %APPDATA%\NeuroGate on Windows, keyed off productName, so it survives app updates/reinstalls without needing admin rights. */
function cliInstallDir() {
  return path.join(app.getPath('userData'), 'bin');
}

/**
 * Adds `dir` to the current user's PATH (Windows only) if it isn't
 * already there, via PowerShell calling .NET's Environment API directly
 * -- see the module doc above for why this, not `setx`. Idempotent:
 * running this repeatedly (e.g. re-clicking "Install CLI") doesn't
 * duplicate the entry. Returns true if PATH was actually changed.
 */
async function addToUserPathWindows(dir) {
  // Single PowerShell invocation does the read-check-write atomically
  // from PowerShell's side, and reports back whether it changed
  // anything (stdout is 'true'/'false') so the caller can tell the user
  // accurately. -EncodedCommand isn't used here since the script has no
  // untrusted input beyond `dir`, which is quoted as a single-quoted
  // PowerShell string with embedded single quotes escaped -- the only
  // characters that could break out of that.
  // Newline-separated, NOT semicolon-joined -- a previous version joined
  // these fragments with '; ', which put a semicolon directly between
  // the `if` block's closing `}` and `else`. PowerShell treats that
  // semicolon as terminating the if-statement right there, so `else`
  // showed up as an orphaned, unrecognized command ("The term 'else' is
  // not recognized..."). Real newlines between `}` and `else` are valid
  // PowerShell multi-line syntax and don't have this problem. Found via
  // an actual failed install on Brandon's machine, not caught in the
  // sandbox since there's no Windows PowerShell there to run this
  // against directly -- worth remembering for any future inline
  // PowerShell script built this way.
  const escapedDir = dir.replace(/'/g, "''");
  const script = [
    `$dir = '${escapedDir}'`,
    `$current = [Environment]::GetEnvironmentVariable('Path','User')`,
    `if ($null -eq $current) { $current = "" }`,
    `$parts = $current.Split(';') | Where-Object { $_.Trim() -ne '' }`,
    `if ($parts -contains $dir) {`,
    `  Write-Output "false"`,
    `}`,
    `else {`,
    `  $new = if ($current.Trim() -eq "") { $dir } else { $current.TrimEnd(";") + ";" + $dir }`,
    `  [Environment]::SetEnvironmentVariable('Path', $new, 'User')`,
    `  Write-Output "true"`,
    `}`,
  ].join('\n');

  // Full path, not the bare "powershell.exe" name -- a GUI-launched
  // Electron process doesn't always inherit the same PATH resolution
  // behavior a terminal shell has, and a failed lookup here was
  // silently swallowed by the try/catch below (a real bug: it always
  // fell back to the misleading "already installed" message instead of
  // surfacing the actual failure -- fixed below by returning pathError
  // to the renderer and having it actually display it).
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const powershellPath = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

  let stdout;
  try {
    ({ stdout } = await execFileAsync(powershellPath, ['-NoProfile', '-NonInteractive', '-Command', script]));
  } catch (err) {
    // execFileAsync (promisified execFile) attaches stdout/stderr to
    // the rejected error -- surface stderr too, it's the actual
    // PowerShell error text, not just a generic exit-code message.
    const detail = err.stderr ? `\n${err.stderr}` : '';
    throw new Error(`PowerShell PATH update failed: ${err.message}${detail}`);
  }

  const result = stdout.trim();
  if (result !== 'true' && result !== 'false') {
    throw new Error(`Unexpected output from PATH update script: "${stdout}"`);
  }
  return result === 'true';
}

ipcMain.handle('install-cli', async () => {
  const source = bundledCliPath();
  if (!fs.existsSync(source)) {
    throw new Error(
      app.isPackaged
        ? `CLI binary is missing from this build (expected at ${source}). This build was packaged without it; rebuild with the CLI step included.`
        : `CLI binary not found at ${source}. Run "npm run cli:sea" first, then try again.`
    );
  }

  const destDir = cliInstallDir();
  const destExeName = process.platform === 'win32' ? 'neurogate.exe' : 'neurogate';
  const destPath = path.join(destDir, destExeName);

  await fs.promises.mkdir(destDir, { recursive: true });
  await fs.promises.copyFile(source, destPath);
  if (process.platform !== 'win32') {
    await fs.promises.chmod(destPath, 0o755);
  }

  let addedToPath = false;
  let pathError = null;
  if (process.platform === 'win32') {
    try {
      addedToPath = await addToUserPathWindows(destDir);
    } catch (err) {
      console.error('[electron] failed to update PATH:', err);
      pathError = err.message;
    }
  }

  return {
    destPath,
    destDir,
    platform: process.platform,
    addedToPath,
    pathError,
  };
});

// ── Export to folder ────────────────────────────────────────────────

/**
 * The desktop Export step writes the dataset to a folder on disk,
 * streamed by the same writer the CLI uses (src/lib/adapters/
 * desktopExport.ts, bundled to electron/desktop-export.cjs by
 * scripts/build-desktop-bundle.mjs). This replaced the in-renderer ZIP,
 * which had to leave out files over 500 MB -- so multi-GB EDF recordings
 * couldn't be exported de-identified from the desktop app at all.
 *
 * Flow: 'choose-export-folder' shows a native folder picker and reserves
 * a fresh, uniquely named output folder inside the chosen location;
 * 'export-to-folder' streams every file into it; 'write-export-file'
 * saves the audit log next to bids_output/; 'reveal-export-folder' opens
 * it in Finder/Explorer. The last three only accept an output folder
 * that 'choose-export-folder' handed out this session, so the renderer
 * can't direct writes anywhere the user didn't pick.
 */
const allowedExportDirs = new Set();

function assertAllowedExportDir(outputDir) {
  if (!allowedExportDirs.has(outputDir)) {
    throw new Error('Export folder was not chosen through the folder picker.');
  }
}

/** First of `<parent>/<name>`, `<name>-2`, `<name>-3`, ... that doesn't exist yet. */
function uniqueChildDir(parent, name) {
  let candidate = path.join(parent, name);
  for (let n = 2; fs.existsSync(candidate); n++) {
    candidate = path.join(parent, `${name}-${n}`);
  }
  return candidate;
}

ipcMain.handle('choose-export-folder', async (_event, suggestedName) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose where to save the BIDS export',
    buttonLabel: 'Export Here',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || filePaths.length === 0) return null;

  const safeName = String(suggestedName || 'bids_export').replace(/[^A-Za-z0-9._-]/g, '_');
  const outputDir = uniqueChildDir(filePaths[0], safeName);
  allowedExportDirs.add(outputDir);
  return { parentDir: filePaths[0], outputDir };
});

ipcMain.handle('export-to-folder', async (event, { outputDir, plan }) => {
  assertAllowedExportDir(outputDir);
  await fs.promises.mkdir(outputDir, { recursive: true });

  const { runDesktopExport } = require('./desktop-export.cjs');
  return runDesktopExport(plan, outputDir, (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send('export-progress', progress);
  });
});

ipcMain.handle('write-export-file', async (_event, { outputDir, name, text }) => {
  assertAllowedExportDir(outputDir);
  // Only the audit log is written this way -- nothing else needs to be.
  if (!/^audit_log_[A-Za-z0-9-]+(_shareable)?\.json$/.test(name)) {
    throw new Error(`Refusing to write unexpected file "${name}".`);
  }
  const dest = path.join(outputDir, name);
  await fs.promises.writeFile(dest, text, 'utf-8');
  return dest;
});

ipcMain.handle('reveal-export-folder', async (_event, outputDir) => {
  assertAllowedExportDir(outputDir);
  const error = await shell.openPath(outputDir);
  if (error) throw new Error(error);
});
