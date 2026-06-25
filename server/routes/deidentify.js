/**
 * POST /api/deidentify
 *
 * Accepts a multipart upload of an EDF/BDF file.
 * De-identifies the header using a streaming Transform (no RAM spike).
 * Writes the result to a temp file (or S3 when S3_BUCKET env var is set).
 * Returns { id, downloadUrl } where downloadUrl is either:
 *   - A local path: /api/download/:id  (development / no S3)
 *   - A presigned S3 URL              (production with S3_BUCKET set)
 *
 * Form fields:
 *   file          - EDF/BDF binary (required)
 *   subjectId     - BIDS subject ID, e.g. "sub-HUP001" (optional)
 *   dateShiftDays - integer days to shift dates (optional, default 0)
 */

const express = require('express');
const busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { createEdfDeidentifyStream } = require('../lib/edfDeidentify');

const router = express.Router();

// ── S3 helpers (optional — only loaded if S3_BUCKET is configured) ──

async function uploadToS3(localPath, s3Key) {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

  const client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  const bucket = process.env.S3_BUCKET;

  const fileStream = fs.createReadStream(localPath);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: fileStream,
    ContentType: 'application/octet-stream',
  }));

  const url = await getSignedUrl(
    client,
    new (require('@aws-sdk/client-s3').GetObjectCommand)({ Bucket: bucket, Key: s3Key }),
    { expiresIn: 3600 }, // 1 hour
  );

  return url;
}

// ── Route ─────────────────────────────────────────────────────────────

router.post('/', (req, res) => {
  let subjectId = 'X';
  let dateShiftDays = 0;
  const id = uuidv4();
  const tmpPath = path.join(os.tmpdir(), `neurogate_${id}.edf`);

  const bb = busboy({ headers: req.headers, limits: { fileSize: 20 * 1024 * 1024 * 1024 } }); // 20 GB max

  bb.on('field', (name, value) => {
    if (name === 'subjectId') subjectId = value;
    if (name === 'dateShiftDays') dateShiftDays = parseInt(value, 10) || 0;
  });

  bb.on('file', (_fieldname, fileStream, info) => {
    console.log(`[deidentify] receiving ${info.filename} (${info.mimeType})`);

    const { stream: deidentStream, getResult } = createEdfDeidentifyStream({
      subjectId,
      dateShiftDays,
    });

    const writeStream = fs.createWriteStream(tmpPath);

    fileStream
      .pipe(deidentStream)
      .pipe(writeStream);

    writeStream.on('finish', async () => {
      const result = getResult();
      console.log(`[deidentify] done — PHI found: ${result?.containedPhi}, shifted: ${result?.originalDate} -> ${result?.shiftedDate}`);

      try {
        let downloadUrl;

        if (process.env.S3_BUCKET) {
          const s3Key = `exports/${id}.edf`;
          downloadUrl = await uploadToS3(tmpPath, s3Key);
          fs.unlink(tmpPath, () => {}); // clean up local file after S3 upload
        } else {
          // Local mode — serve from /tmp via GET /api/download/:id
          downloadUrl = `/api/download/${id}`;
        }

        res.json({
          id,
          downloadUrl,
          shiftKey: {
            subjectId,
            dateShiftDays,
            originalDate: result?.originalDate,
            shiftedDate: result?.shiftedDate,
          },
        });
      } catch (err) {
        console.error('[deidentify] upload error:', err);
        res.status(500).json({ error: 'Failed to store processed file', detail: err.message });
      }
    });

    writeStream.on('error', (err) => {
      console.error('[deidentify] write error:', err);
      res.status(500).json({ error: 'Failed to write processed file', detail: err.message });
    });

    fileStream.on('error', (err) => {
      console.error('[deidentify] stream error:', err);
      res.status(500).json({ error: 'Upload stream error', detail: err.message });
    });
  });

  bb.on('error', (err) => {
    console.error('[deidentify] busboy error:', err);
    res.status(400).json({ error: 'Multipart parse error', detail: err.message });
  });

  req.pipe(bb);
});

module.exports = router;
