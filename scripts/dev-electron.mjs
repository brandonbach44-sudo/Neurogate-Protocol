#!/usr/bin/env node
/**
 * Fast Electron dev loop ("npm run electron:dev:fast").
 *
 * The existing `npm run electron:dev` (`npm run build && electron .`)
 * still runs a full `tsc -b && vite build`, then relaunches the app --
 * fine for a final sanity check before packaging, but slow enough that
 * testing a one-line change means closing the app, rebuilding, and
 * reopening it every time.
 *
 * This script instead:
 *   1. Starts the Vite dev server (HMR) on its normal port.
 *   2. Waits for it to actually accept connections.
 *   3. Launches Electron with ELECTRON_START_URL pointed at it -- see
 *      electron/main.cjs, which loads that URL instead of the built
 *      dist/ when the env var is set, and turns SERVE_STATIC off so the
 *      in-process API server doesn't also try to serve the frontend.
 *
 * From here, editing src/ files hot-reloads inside the running Electron
 * window like a normal Vite dev session -- no rebuild, no reinstall, no
 * relaunch. Electron main-process changes (electron/*.cjs) still need a
 * manual restart of this script, since that process itself isn't
 * hot-reloadable.
 *
 * Closing the Electron window (or Ctrl+C in this terminal) tears down
 * the Vite dev server too, so nothing is left running in the background.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';

const VITE_PORT = 5173;
const VITE_HOST = '127.0.0.1';

function waitForPort(host, port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host, port }, () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Vite dev server never came up on ${host}:${port} within ${timeoutMs}ms`));
        } else {
          setTimeout(attempt, 250);
        }
      });
    };
    attempt();
  });
}

function killTree(child) {
  if (!child || child.killed) return;
  // Windows: spawn() doesn't create a process group by default, and
  // plain child.kill() only signals the immediate `npm`/`vite.cmd`
  // wrapper, leaving the real vite.js (and its dev server) orphaned and
  // still holding the port. taskkill /T walks the whole tree.
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  } else {
    child.kill('SIGTERM');
  }
}

const vite = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', '--port', String(VITE_PORT), '--strictPort'],
  { stdio: 'inherit' }
);

vite.on('exit', (code) => {
  // If Vite dies on its own (port in use, config error, etc.) before
  // Electron even launches, don't hang waiting for a port that's never
  // coming up.
  if (electron === null) {
    console.error(`[dev-electron] Vite exited early (code ${code}) -- aborting.`);
    process.exit(code ?? 1);
  }
});

let electron = null;

try {
  await waitForPort(VITE_HOST, VITE_PORT);
} catch (err) {
  console.error(`[dev-electron] ${err.message}`);
  killTree(vite);
  process.exit(1);
}

console.log(`[dev-electron] Vite is up at http://${VITE_HOST}:${VITE_PORT} -- launching Electron...`);

electron = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['electron', '.'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_START_URL: `http://${VITE_HOST}:${VITE_PORT}`,
    },
  }
);

electron.on('exit', (code) => {
  console.log('[dev-electron] Electron closed -- stopping Vite.');
  killTree(vite);
  process.exit(code ?? 0);
});

process.on('SIGINT', () => {
  killTree(electron);
  killTree(vite);
  process.exit(0);
});
