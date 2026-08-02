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

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const deidentifyRouter = require('./routes/deidentify');
const downloadRouter = require('./routes/download');

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// SERVE_STATIC is only set inside the Dockerized desktop build (see
// ../Dockerfile). The hosted deployment keeps the frontend on S3/CloudFront
// and never sets this, so this block is inert there -- same server code,
// two delivery modes.
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

// ── Error handler ─────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`NeuroGate API listening on port ${PORT}`);
  console.log(`  CORS origin: ${CORS_ORIGIN}`);
  console.log(`  Storage mode: ${process.env.S3_BUCKET ? `S3 (${process.env.S3_BUCKET})` : 'local /tmp'}`);
});
