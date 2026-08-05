/**
 * NeuroGate API Server
 *
 * Handles large EDF/BDF file de-identification via server-side streaming.
 * The browser never needs to load the full file into memory.
 *
 * Environment variables (see .env.example):
 *   PORT         - server port (default: 3001)
 *   CORS_ORIGIN  - allowed frontend origin (default: http://localhost:5173)
 *   S3_BUCKET    - S3 bucket name for file storage (optional; uses /tmp if not set)
 *   AWS_REGION   - AWS region for S3 (default: us-east-1)
 *
 * Routes:
 *   GET  /api/health          - liveness check
 *   POST /api/deidentify      - stream EDF, patch header, return download URL
 *   GET  /api/download/:id    - serve de-identified file (local mode only)
 */

const path = require('path');
const fs = require('fs');

// Explicit path, not the default cwd-relative lookup -- this module is
// now require()'d in-process by the Electron main process (see
// start() below and electron/main.cjs), where process.cwd() is
// whatever directory the OS launched the app from, not necessarily
// this file's own directory. Resolving relative to __dirname makes
// env loading identical whether this runs standalone (node
// server/index.js / AWS deployment), via the CLI, or embedded in
// Electron.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');

const deidentifyRouter = require('./routes/deidentify');
const downloadRouter = require('./routes/download');

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// SERVE_STATIC is set by the Electron desktop app (see electron/main.ts)
// and, originally, the now-superseded Dockerized desktop build (see
// ../Dockerfile -- kept only as reference at time of writing; the desktop
// delivery mode moved from Docker to Electron, see
// Documents/NeuroGate_Phase_Roadmap.md, "Phase 4/6 Revision"). The hosted
// deployment keeps the frontend on S3/CloudFront and never sets this, so
// this block is inert there -- same server code, multiple delivery modes.
//
// Declared but never actually wired to express.static() until now -- the
// Dockerfile assumed this worked; it didn't (found while building the
// Electron main process, which reuses this exact mechanism so the
// desktop app's frontend and API share one origin/port, avoiding CORS
// entirely).
const SERVE_STATIC = process.env.SERVE_STATIC === 'true';
const STATIC_DIR = path.join(__dirname, '..', 'dist');

// ── Middleware ────────────────────────────────────────────────────────

app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Do NOT use express.json() globally — the deidentify route uses
// raw multipart streaming via busboy and must not be pre-parsed.
app.use('/api/deidentify', deidentifyRouter);
app.use('/api/download', downloadRouter);

// ── Health check ──────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    mode: process.env.S3_BUCKET ? 's3' : 'local',
    version: '1.0.0',
  });
});

// ── Static frontend (desktop mode only) ─────────────────────────────
// Must come after the /api routes above -- Express matches routes in
// registration order, and the SPA fallback below would otherwise catch
// every /api request before it reaches deidentifyRouter/downloadRouter.
if (SERVE_STATIC) {
  if (!fs.existsSync(STATIC_DIR)) {
    console.warn(`[server] SERVE_STATIC is set but ${STATIC_DIR} does not exist -- run "npm run build" first.`);
  }
  app.use(express.static(STATIC_DIR));

  // SPA fallback: any non-API, non-file GET request gets index.html so
  // React Router's client-side routes (e.g. a direct load of /docs)
  // resolve correctly instead of 404ing. Mirrors the CloudFront 403/404
  // -> index.html behavior the hosted deployment needs for the same
  // reason (see the AWS migration notes).
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
}

// ── Error handler ─────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────

/**
 * Starts listening and resolves with the underlying http.Server once
 * bound, or rejects if listen() fails (e.g. port already in use).
 *
 * Exported (alongside `app`) so the Electron main process can run this
 * exact server in-process instead of spawning a second copy of the
 * packaged .exe as a child process. The original design spawned
 * `process.execPath` with ELECTRON_RUN_AS_NODE=1 -- that worked in dev
 * but failed consistently on a real Windows install with
 * `spawn ... ENOENT`, even though the target file plainly exists (the
 * app is that file). The likely cause: an unsigned .exe launching a
 * second instance of itself is a classic dropper/self-replication
 * pattern, and some AV/EDR behavioral rules silently block the
 * CreateProcess call and report it back as "not found" rather than
 * "access denied" specifically so the block looks unremarkable. Since
 * Electron's main process is already a full Node.js runtime, requiring
 * this module directly and calling start() removes the second process
 * (and that whole failure mode) entirely -- see electron/main.cjs.
 */
function start(port = PORT) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`NeuroGate API listening on port ${port}`);
      console.log(`  CORS origin: ${CORS_ORIGIN}`);
      console.log(`  Storage mode: ${process.env.S3_BUCKET ? `S3 (${process.env.S3_BUCKET})` : 'local /tmp'}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = { app, start };

// Preserve standalone behavior: `node server/index.js` (local dev, the
// AWS/EC2 deployment target, Docker reference image) still auto-starts
// exactly as before. Only skipped when this module is require()'d from
// elsewhere (the Electron main process, or in principle a future test
// harness).
if (require.main === module) {
  start();
}
