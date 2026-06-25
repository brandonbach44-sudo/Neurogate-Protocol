/**
 * Server-side EDF / BDF de-identification
 *
 * Exports a Node.js Transform stream that patches the 256-byte EDF
 * global header in place. The rest of the file (signal headers + data
 * records) streams through unchanged without ever being held in RAM.
 *
 * This means a 5 GB EDF file can be de-identified on a t3.small
 * instance with 2 GB RAM — only the first 256 bytes are buffered.
 *
 * EDF header layout (all ASCII):
 *   bytes   0–7    version
 *   bytes   8–87   local patient identification  (80 chars)
 *   bytes  88–167  local recording identification (80 chars)
 *   bytes 168–175  startdate  dd.mm.yy            (8 chars)
 *   bytes 176–183  starttime  hh.mm.ss            (8 chars)  <- UNCHANGED
 *   bytes 184–191  bytes in header record          (8 chars)
 *   bytes 192–235  reserved                       (44 chars)
 *   bytes 236–243  number of data records          (8 chars)
 *   bytes 244–251  duration of data record         (8 chars)
 *   bytes 252–255  number of signals              (4 chars)
 *
 * EDF spec: https://www.edfplus.info/specs/edf.html
 */

const { Transform } = require('stream');

// ── Month tables ─────────────────────────────────────────────────────

const MONTH_ABBR = [
  'JAN','FEB','MAR','APR','MAY','JUN',
  'JUL','AUG','SEP','OCT','NOV','DEC',
];

// ── Date helpers ─────────────────────────────────────────────────────

/** Parse EDF global header date "dd.mm.yy" -> Date.
 *  EDF convention: yy 85-99 = 1985-1999, yy 00-84 = 2000-2084. */
function parseHeaderDate(s) {
  const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const dd = parseInt(m[1]), mm = parseInt(m[2]) - 1, yy = parseInt(m[3]);
  const yyyy = yy >= 85 ? 1900 + yy : 2000 + yy;
  const d = new Date(yyyy, mm, dd);
  return isNaN(d.getTime()) ? null : d;
}

/** Format Date -> EDF global header date "dd.mm.yy". */
function formatHeaderDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

/** Parse recording ID date "dd-MMM-yyyy" -> Date. */
function parseRecordingDate(s) {
  const m = s.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const dd = parseInt(m[1]);
  const mm = MONTH_ABBR.findIndex(mo => mo === m[2].toUpperCase());
  if (mm === -1) return null;
  const d = new Date(parseInt(m[3]), mm, dd);
  return isNaN(d.getTime()) ? null : d;
}

/** Format Date -> recording ID date "dd-MMM-yyyy". */
function formatRecordingDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd}-${MONTH_ABBR[d.getMonth()]}-${d.getFullYear()}`;
}

/** Shift a Date by n days. */
function shiftDate(d, days) {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + days);
  return out;
}

// ── Field write helper ────────────────────────────────────────────────

/** Write a string into a fixed-width ASCII field in a Buffer. */
function writeField(buf, start, length, value) {
  const padded = value.padEnd(length, ' ').slice(0, length);
  buf.write(padded, start, length, 'ascii');
}

// ── PHI field builders ────────────────────────────────────────────────

function buildAnonPatientId(original, subjectId) {
  const code = subjectId || 'X';
  const tokens = original.trim().split(/\s+/);
  return tokens.length >= 4 ? `${code} X X X` : 'X X X X';
}

function buildAnonRecordingId(original, dateShiftDays) {
  const edfPlusMatch = original.trim().match(
    /^(Startdate)\s+(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(\S+)\s+(\S+)\s*(.*)/i,
  );
  if (edfPlusMatch) {
    const [, prefix, dateStr, , , equipCode] = edfPlusMatch;
    const parsed = parseRecordingDate(dateStr);
    const shifted = parsed
      ? formatRecordingDate(shiftDate(parsed, dateShiftDays))
      : dateStr;
    return `${prefix} ${shifted} X X ${equipCode || ''}`.trim().slice(0, 80);
  }
  // Non-EDF+ format: shift any embedded dates in-place
  return original.replace(/(\d{1,2}-[A-Za-z]{3}-\d{4})/g, (match) => {
    const d = parseRecordingDate(match);
    return d ? formatRecordingDate(shiftDate(d, dateShiftDays)) : match;
  }).slice(0, 80);
}

// ── Header patch ──────────────────────────────────────────────────────

/**
 * Patch the 256-byte EDF global header buffer in place.
 * @param {Buffer} header  - Must be exactly 256 bytes.
 * @param {object} opts
 * @param {string} opts.subjectId      - BIDS subject ID (e.g. "sub-HUP001")
 * @param {number} opts.dateShiftDays  - Days to shift all dates
 * @returns {{ originalPatientId, originalDate, shiftedDate, containedPhi }}
 */
function patchEdfHeader(header, { subjectId, dateShiftDays }) {
  const originalPatientId = header.toString('ascii', 8, 88).trim();
  const originalRecordingId = header.toString('ascii', 88, 168).trim();
  const originalDate = header.toString('ascii', 168, 176).trim();

  const containedPhi = !/^(x\s*)+$/i.test(originalPatientId) &&
    /[a-wyz]/i.test(originalPatientId);

  const anonPatient = buildAnonPatientId(originalPatientId, subjectId);
  const anonRecording = buildAnonRecordingId(originalRecordingId, dateShiftDays);

  const parsedDate = parseHeaderDate(originalDate);
  const shiftedDate = parsedDate
    ? formatHeaderDate(shiftDate(parsedDate, dateShiftDays))
    : originalDate;

  writeField(header, 8,   80, anonPatient);
  writeField(header, 88,  80, anonRecording);
  writeField(header, 168, 8,  shiftedDate);
  // bytes 176-183 (starttime) are intentionally left unchanged

  return { originalPatientId, originalDate, shiftedDate, containedPhi };
}

// ── Transform stream ──────────────────────────────────────────────────

/**
 * Create a Transform stream that de-identifies an EDF file in streaming fashion.
 *
 * Only the first 256 bytes are ever buffered. Everything else passes through
 * immediately, so memory usage stays flat regardless of file size.
 *
 * @param {object} opts
 * @param {string} [opts.subjectId]    - BIDS subject ID to embed
 * @param {number} [opts.dateShiftDays=0] - Days to shift dates
 * @returns {{ stream: Transform, getResult: () => object }}
 */
function createEdfDeidentifyStream(opts = {}) {
  const { subjectId = 'X', dateShiftDays = 0 } = opts;
  let headerBuf = Buffer.alloc(0);
  let headerDone = false;
  let patchResult = null;

  const transform = new Transform({
    transform(chunk, _encoding, callback) {
      if (headerDone) {
        this.push(chunk);
        return callback();
      }

      headerBuf = Buffer.concat([headerBuf, chunk]);

      if (headerBuf.length >= 256) {
        // We have at least a full header — patch and flush
        const header = Buffer.from(headerBuf.slice(0, 256)); // copy for mutation
        patchResult = patchEdfHeader(header, { subjectId, dateShiftDays });

        this.push(header);
        if (headerBuf.length > 256) {
          this.push(headerBuf.slice(256));
        }
        headerBuf = null;
        headerDone = true;
      }
      // else: keep accumulating

      callback();
    },

    flush(callback) {
      // File shorter than 256 bytes (shouldn't happen with real EDF, but handle gracefully)
      if (!headerDone && headerBuf && headerBuf.length > 0) {
        if (headerBuf.length >= 256) {
          const header = Buffer.from(headerBuf.slice(0, 256));
          patchResult = patchEdfHeader(header, { subjectId, dateShiftDays });
          this.push(header);
          if (headerBuf.length > 256) this.push(headerBuf.slice(256));
        } else {
          this.push(headerBuf); // too short to have a valid header
        }
      }
      callback();
    },
  });

  return {
    stream: transform,
    getResult: () => patchResult,
  };
}

module.exports = { createEdfDeidentifyStream, patchEdfHeader };
