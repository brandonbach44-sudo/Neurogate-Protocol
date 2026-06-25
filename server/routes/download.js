/**
 * GET /api/download/:id
 *
 * Serves a de-identified EDF file from the OS temp directory.
 * Used in local / development mode when S3_BUCKET is not configured.
 *
 * Files are automatically cleaned up after download (single-use).
 * In production, set S3_BUCKET and this route is not needed.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();

router.get('/:id', (req, res) => {
  const { id } = req.params;

  // Validate id format to prevent path traversal
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid file ID' });
  }

  const filePath = path.join(os.tmpdir(), `neurogate_${id}.edf`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found or already downloaded' });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="deidentified_${id}.edf"`);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);

  // Delete after sending so temp files don't accumulate
  res.on('finish', () => {
    fs.unlink(filePath, (err) => {
      if (err) console.warn('[download] could not delete temp file:', filePath);
    });
  });

  stream.on('error', (err) => {
    console.error('[download] stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream file' });
    }
  });
});

module.exports = router;
