/**
 * NeuroGate Desktop (Electron main process)
 *
 * Wraps the existing web app and the existing Express API server in a
 * native installer. See Documents/NeuroGate_Phase_Roadmap.md, "Phase
 * 4/6 Revision," Step 3.
 *
 * Architecture: on launch, requires server/index.js IN-PROCESS (see
 * "Why in-process, not a child process" below) with SERVE_STATIC=true,
 * calls its exported start(), then points the BrowserWindow at
 * http://127.0.0.1:<port>. Frontend and API share one origin/port --
 * this avoids CORS entirely and means the renderer needs zero
 * Electron-specific code; it's the exact same built dist/ the web
 * deployment ships, just served locally instead of from S3/CloudFront.
 * See server/index.js's SERVE_STATIC block, which this process is the
 * reason that block was actually finished (it existed but was dead code
 * from the earlier, now-superseded Dockerized-desktop plan).
 *
 * Why in-process, not a child process: the original design spawned a
 * second copy of the packaged .exe (via process.execPath +
 * ELECTRON_RUN_AS_NODE=1) as a child process running server/index.js.
 * That worked in `npm run electron:dev` but failed consistently on a
 * real installed build with `spawn ...\NeuroGate.exe ENOENT`, every
 * launch, even though the target file plainly exists (the app IS that
 * file). Root cause, most likely: an unsigned .exe launching a second
 * instance of itself is a classic dropper/self-replication pattern,
 * and AV/EDR behavioral rules commonly block that CreateProcess call
 * and report it back as "file not found" rather than "access denied"
 * specifically so the block doesn't look like a block. Electron's main
 * process is already a full Node.js runtime -- requiring the server
 * module directly and calling its exported start() removes the second
 * process, and that whole failure mode, entirely. See server/index.js
 * for the corresponding `module.exports = { app, start }` and the
 * `require.main === module` guard that keeps standalone usage (local
 * dev, AWS/EC2 deployment) working unchanged.
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
// no `npm run build` + relaunch cycle. The API server still runs
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
 * requires it and calls its exported start(). Env vars are set BEFORE
 * the require() call since the module reads process.env.PORT /
 * process.env.SERVE_STATIC while building the Express app at the top
 * level, not lazily inside start(). Setting them here (rather than
 * relying on dotenv) also means this doesn't depend on a server/.env
 * file existing in the packaged app at all.
 */
async function startServer() {
  process.env.PORT = String(SERVER_PORT);
  // In fast-dev mode the frontend is served by Vite on its own origin
  // (default http://localhost:5173), not by this server, so SERVE_STATIC
  // must stay off and the server's existing CORS_ORIGIN default (also
  // http://localhost:5173 -- see server/index.js) already covers it
  // without any extra config here.
  process.env.SERVE_STATIC = DEV_SERVER_URL ? 'false' : 'true';

  const serverEntry = path.join(APP_ROOT, 'server', 'index.js');
  console.log(`[electron] loading server in-process: ${serverEntry}`);

  const { start } = require(serverEntry);
  httpServer = await start(SERVER_PORT);
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
        ? `CLI binary is missing from this build (expected at ${source}). This build was packaged without it -- rebuild with the CLI step included.`
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
