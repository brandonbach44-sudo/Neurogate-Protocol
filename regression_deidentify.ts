/**
 * CI-safe regression check for the de-identification layer.
 *
 * regression.ts covers the detection/validation engines. This script
 * covers the two export-time de-identification modules (src/lib/deidentify)
 * separately, since neither is exercised by the demo-data fixtures used
 * there (those fixtures have empty/stub file bodies with no real header
 * content to de-identify).
 *
 * Every fixture here is synthetic, constructed in-memory -- no real or
 * real-ish patient data, and no dependency on files outside this repo.
 *
 * Usage:
 *   npx tsx regression_deidentify.ts            # compare, exit 1 on drift
 *   npx tsx regression_deidentify.ts --update    # (re)write golden snapshot
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { deidentifyJsonSidecar } from './src/lib/deidentify/jsonSidecarDeidentifier';
import { deidentifyEdf, generateSubjectDateShifts } from './src/lib/deidentify/edfDeidentifier';

const EXPECTED_PATH = join(process.cwd(), 'regression_deidentify_expected.json');
const UPDATE_MODE = process.argv.includes('--update');

// ── JSON sidecar fixtures ──────────────────────────────────────────
// Each covers one edge case the module's docstring calls out.

const jsonCases: Record<string, string> = {
  fullyIdentifying: JSON.stringify({
    PatientName: 'Smith^John',
    PatientID: 'MRN00123',
    PatientBirthDate: '1980-02-14',
    InstitutionName: 'Test Hospital',
    ReferringPhysicianName: 'Dr. Jones',
    OperatorsName: 'Tech A',
    StationName: 'MRI-3',
    DeviceSerialNumber: 'SN12345',
    AcquisitionDate: '2024-04-22',
    AcquisitionDateTime: '2024-04-22T10:30:00',
    StudyDate: '2024-04-22',
    Manufacturer: 'Siemens',
    MagneticFieldStrength: 3,
  }),
  noIdentifyingFields: JSON.stringify({
    Manufacturer: 'Siemens',
    MagneticFieldStrength: 3,
    RepetitionTime: 2.3,
    SeriesDescription: 'T1_MPRAGE',
  }),
  emptyStringFields: JSON.stringify({
    PatientName: '',
    PatientID: null,
    Manufacturer: 'GE',
  }),
  malformedJson: '{ this is not valid json ',
  dateOnly: JSON.stringify({
    ContentDate: '2024-01-01',
    InstanceCreationDate: '2024-01-01T00:00:00.500',
  }),
};

function runJsonCases() {
  const results: Record<string, unknown> = {};
  for (const [name, text] of Object.entries(jsonCases)) {
    const result = deidentifyJsonSidecar(text, { dateShiftDays: 10 });
    results[name] = {
      strippedFields: result.strippedFields.sort(),
      shiftedFields: result.shiftedFields.sort(),
      // Parse back so key order in the diff doesn't matter and malformed
      // input (returned as raw text) is still comparable.
      output: (() => {
        try {
          return JSON.parse(result.text);
        } catch {
          return { __raw: result.text };
        }
      })(),
    };
  }
  return results;
}

// ── EDF header fixtures ─────────────────────────────────────────────
// Builds a minimal synthetic EDF header (256-byte header block is the
// real EDF minimum; only the fields the de-identifier reads/writes need
// realistic content, the rest can be padding).

function buildEdfHeader(patientId: string, recordingId: string, startDate: string): Uint8Array {
  const bytes = new Uint8Array(256).fill(0x20); // space-padded, EDF convention
  const write = (start: number, length: number, value: string) => {
    const padded = value.padEnd(length, ' ').slice(0, length);
    for (let i = 0; i < length; i++) bytes[start + i] = padded.charCodeAt(i);
  };
  write(0, 8, '0'); // version
  write(8, 80, patientId);
  write(88, 80, recordingId);
  write(168, 8, startDate);
  write(176, 8, '00.00.00'); // start time, untouched by de-identifier
  return bytes;
}

async function runEdfCases() {
  const cases: Record<string, { patientId: string; recordingId: string; startDate: string }> = {
    edfPlusWithPhi: {
      patientId: 'HUP282 M 22-APR-1990 Smith_John',
      recordingId: 'Startdate 22-APR-2024 X X Exported_with_Persyst_EEGSuite',
      startDate: '22.04.24',
    },
    alreadyAnonymized: {
      patientId: 'X X X X',
      recordingId: 'Startdate 01-JAN-2020 X X SomeSoftware',
      startDate: '01.01.20',
    },
    nonEdfPlusFreeText: {
      patientId: 'Smith_John',
      recordingId: 'recorded 22-APR-2024 by tech',
      startDate: '22.04.24',
    },
  };

  const results: Record<string, unknown> = {};
  const shift = 10; // fixed, not generateDateShift(), so the snapshot is deterministic

  for (const [name, c] of Object.entries(cases)) {
    const headerBytes = buildEdfHeader(c.patientId, c.recordingId, c.startDate);
    // Pad to >= 256 bytes total file size so deidentifyEdf doesn't take
    // its "too small to be a real EDF" short-circuit path.
    const file = new File([headerBytes], 'test.edf');
    const result = await deidentifyEdf(file, {
      dateShiftDays: shift,
      anonymousSubjectId: 'sub-TEST001',
    });

    const outBuf = new Uint8Array(result.bytes);
    const decoder = new TextDecoder('ascii');
    const readField = (start: number, length: number) =>
      decoder.decode(outBuf.slice(start, start + length)).trim();

    results[name] = {
      containedPhi: result.containedPhi,
      originalPatientId: result.originalPatientId,
      shiftedDate: result.shiftedDate,
      outputPatientIdField: readField(8, 80),
      outputRecordingIdField: readField(88, 80),
      outputStartDateField: readField(168, 8),
      outputStartTimeField: readField(176, 8), // must be unchanged
    };
  }

  return results;
}

// ── Subject shift map sanity check ──────────────────────────────────
// Not a value-comparison (the shifts are random by design) -- just
// structural: right number of subjects, each with a distinct key, each
// value in range. Catches a signature/behavior change, not a specific value.

function checkSubjectShiftShape() {
  const groups = ['sub-A', 'sub-B', 'sub-C'];
  const shifts = generateSubjectDateShifts(groups);
  const inRange = [...shifts.values()].every((v) => v >= -365 && v <= 365);
  return {
    subjectCount: shifts.size,
    hasAllGroups: groups.every((g) => shifts.has(g)),
    allInRange: inRange,
  };
}

function diff(path: string, expected: unknown, actual: unknown, out: string[]): void {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return;

  const bothObjects =
    expected && actual && typeof expected === 'object' && typeof actual === 'object' && !Array.isArray(expected) && !Array.isArray(actual);

  if (bothObjects) {
    const keys = new Set([...Object.keys(expected as object), ...Object.keys(actual as object)]);
    for (const key of keys) diff(`${path}.${key}`, (expected as any)[key], (actual as any)[key], out);
    return;
  }

  out.push(`${path}:\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
}

async function main() {
  const snapshot = {
    jsonSidecar: runJsonCases(),
    edf: await runEdfCases(),
    subjectShiftShape: checkSubjectShiftShape(),
  };

  if (UPDATE_MODE || !existsSync(EXPECTED_PATH)) {
    writeFileSync(EXPECTED_PATH, JSON.stringify(snapshot, null, 2) + '\n');
    console.log(`Wrote ${EXPECTED_PATH}`);
    return;
  }

  const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf-8'));
  const diffs: string[] = [];
  diff('snapshot', expected, snapshot, diffs);

  if (diffs.length > 0) {
    console.error(`\nDE-IDENTIFICATION REGRESSION DETECTED -- ${diffs.length} field(s) changed vs regression_deidentify_expected.json:\n`);
    for (const d of diffs) console.error(`  ${d}\n`);
    console.error('If this change is intentional, run `npx tsx regression_deidentify.ts --update` and commit the updated snapshot.');
    process.exit(1);
  }

  console.log('No drift detected. De-identification output matches regression_deidentify_expected.json.');
}

main();
