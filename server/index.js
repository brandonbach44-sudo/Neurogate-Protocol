/**
 * NeuroGate local page server.
 *
 * Serves the built web app (dist/) to the desktop app's own window. The
 * Electron main process requires this module in-process and calls
 * start() on 127.0.0.1 (see electron/main.cjs), so the pages are
 * reachable only from the same computer. There are no upload or
 * processing routes: all processing happens in the app, and exports
 * stream straight to disk.
 *
 * Environment variables, set by electron/main.cjs before require():
 *   PORT          - port to listen on (default: 3001)
 *   SERVE_STATIC  - "true" to serve dist/; off in fast-dev mode, where
 *                   the window loads the Vite dev server instead
 *
 * Routes:
 *   GET /api/health  - liveness check
 *   GET /*           - the built app, with index.html as the SPA fallback
 */

const path = require('path');
const fs = require('fs');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3001;
const SERVE_STATIC = process.env.SERVE_STATIC === 'true';
const STATIC_DIR = path.join(__dirname, '..', 'dist');

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

if (SERVE_STATIC) {
  if (!fs.existsSync(STATIC_DIR)) {
    console.warn(`[server] SERVE_STATIC is set but ${STATIC_DIR} does not exist; run "npm run build" first.`);
  }
  app.use(express.static(STATIC_DIR));

  // SPA fallback: any other GET gets index.html, so a direct load of a
  // client-side route (e.g. /docs) resolves instead of 404ing.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

/**
 * Starts listening and resolves with the http.Server once bound, or
 * rejects if listen() fails (e.g. the port is in use). The desktop app
 * passes host 127.0.0.1.
 *
 * Run in-process by Electron rather than as a child process: spawning a
 * second copy of the unsigned .exe was blocked on some Windows machines
 * (reported as ENOENT), likely by antivirus self-replication rules.
 */
function start(port = PORT, host = undefined) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      console.log(`NeuroGate page server listening on ${host ?? 'all interfaces'}, port ${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = { app, start };

// `node server/index.js` still starts it standalone (for local testing).
if (require.main === module) {
  start();
}
