/**
 * CSV tables regression: electrodes / channels / events tables saved as
 * CSV are recognized, exported under a .tsv name, and actually converted
 * to tab-separated text (through both the browser ZIP and the streaming
 * writer), and Validate reads them correctly.
 *
 * Usage: npx tsx regression_csv.ts   (non-zero exit on failure)
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import JSZip from 'jszip';
import { runDetection, readJsonSidecars, readEdfHeaders } from './src/lib/detection';
import { computeBidsNames } from './src/lib/bids/bidsNaming';
import { buildFileEntries, generateZip } from './src/lib/bids/exporter';
import { csvToTsv, parseDelimited, detectCsvDelimiter } from './src/lib/bids/delimitedText';
import { writeFileEntriesToDisk } from './src/lib/adapters/nodeExportWriter';
import { scanDirectory } from './src/lib/adapters/scanDirectory';
import { checkConsistency } from './src/lib/validation/consistencyChecker';
import { scanTsvContentForPhi } from './src/lib/validation/phiScanner';
import { createDefaultDatasetDescription } from './src/types/metadata';
import type { SubjectMetadata } from './src/types/metadata';
import type { ScannedFile } from './src/types/files';

let failures = 0;
function check(ok: boolean, detail: string) {
  if (!ok) { failures++; console.log(`  FAIL  ${detail}`); }
}
const mk = (relativePath: string, content: string | Uint8Array): ScannedFile => {
  const name = relativePath.split('/').pop()!;
  const file = new File([content], name);
  return { relativePath, name, size: file.size, file } as ScannedFile;
};
function edf(labels: string[]): Uint8Array {
  const ns = labels.length;
  const bytes = new Uint8Array(256 + ns * 256).fill(0x20);
  const put = (at: number, len: number, v: string) => { for (let i = 0; i < len; i++) bytes[at + i] = v.padEnd(len, ' ').charCodeAt(i); };
  put(0, 8, '0'); put(8, 80, 'X X X X'); put(168, 8, '01.01.24'); put(176, 8, '00.00.00');
  put(184, 8, String(256 + ns * 256)); put(236, 8, '1'); put(244, 8, '1'); put(252, 4, String(ns));
  labels.forEach((l, i) => put(256 + i * 16, 16, l));
  return bytes;
}

async function main() {
  console.log('parsing');
  check(JSON.stringify(parseDelimited('a,"b,c","say ""hi"""\r\n1,2,3\r\n', ',')) === JSON.stringify([['a', 'b,c', 'say "hi"'], ['1', '2', '3']]), 'quotes, embedded commas and "" escapes');
  check(JSON.stringify(parseDelimited('name,note\nLA1,"two\nlines"\n', ',')) === JSON.stringify([['name', 'note'], ['LA1', 'two\nlines']]), 'line break inside a quoted cell');
  check(detectCsvDelimiter('﻿name;x;y;z\nLA1;1,5;2;3\n') === ';', 'semicolon CSV (comma decimal marks) not detected');
  check(csvToTsv('﻿name;x;y;z\r\nLA1;-1,5;2;3\r\n\r\nLA2;4;5\r\n') === 'name\tx\ty\tz\nLA1\t-1,5\t2\t3\nLA2\t4\t5\t\n', `semicolon CSV to TSV: ${JSON.stringify(csvToTsv('name;x;y;z\r\nLA1;-1,5;2;3\r\n\r\nLA2;4;5\r\n'))}`);
  check(csvToTsv('onset,trial_type,note\n1.5,seizure,"a\tb\nc"\n') === 'onset\ttrial_type\tnote\n1.5\tseizure\ta b c\n', 'tabs and line breaks inside a cell become spaces');

  const fixture: [string, string | Uint8Array][] = [
    ['P/Session_implant/ieeg/night_ieeg.edf', edf(['LA1', 'LA2', 'LA3'])],
    ['P/Session_implant/ieeg/night_electrodes.csv', 'name,x,y,z,size\r\nLA1,"-30,5",1,2,2\r\nLA2,1,2,3,2\r\n'],
    ['P/Session_implant/ieeg/night_channels.csv', 'name;type;units\nLA1;SEEG;uV\nLA2;SEEG;uV\nLA3;SEEG;uV\n'],
    ['P/Session_implant/ieeg/night_events.csv', 'onset,duration,trial_type,value\n12,0,note,patient_John_Smith MRN 1234567\n'],
  ];
  const files = fixture.map(([p, c]) => mk(p, c));
  const results = runDetection(files, await readJsonSidecars(files), await readEdfHeaders(files));
  const group = results[0].subjectGroup;
  const named = computeBidsNames(results, new Map([[group, 'sub-V001']]));

  console.log('detection and naming');
  for (const [file, modality, path] of [
    ['night_electrodes.csv', 'electrodes', 'primary/sub-V001/ses-postimplant/ieeg/sub-V001_ses-postimplant_electrodes.tsv'],
    ['night_channels.csv', 'channels', 'primary/sub-V001/ses-postimplant/ieeg/sub-V001_ses-postimplant_task-monitor_channels.tsv'],
    ['night_events.csv', 'events', 'primary/sub-V001/ses-postimplant/ieeg/sub-V001_ses-postimplant_task-monitor_events.tsv'],
  ] as const) {
    const r = named.find(x => x.fileName === file)!;
    check(r.detectedModality === modality, `${file}: detected as ${r.detectedModality}`);
    check(r.bidsPath === path, `${file}: exported as ${r.bidsPath}`);
  }

  console.log('validation reads CSV tables');
  const cons = await checkConsistency(named);
  const hit = cons.find(i => /with no matching electrode/.test(i.title));
  check(hit?.title === '1 channel with no matching electrode' && /: LA3\./.test(hit.description), `semicolon channels.csv vs electrodes.csv: ${hit?.description}`);
  const phi = await scanTsvContentForPhi(named);
  check(phi.some(i => i.affectedFiles[0].endsWith('night_events.csv') && i.severity === 'error'), 'PHI typed into an events CSV not flagged');

  console.log('export converts');
  const subjects = [{ subjectGroup: group, bidsSubjectId: 'sub-V001', sessions: [{ sessionId: 'ses-postimplant', acqTime: '', age: '' }] }] as SubjectMetadata[];
  const electrodesPath = 'primary/sub-V001/ses-postimplant/ieeg/sub-V001_ses-postimplant_electrodes.tsv';
  const channelsPath = 'primary/sub-V001/ses-postimplant/ieeg/sub-V001_ses-postimplant_task-monitor_channels.tsv';
  const expectElectrodes = 'name\tx\ty\tz\tsize\nLA1\t-30,5\t1\t2\t2\nLA2\t1\t2\t3\t2\n';
  const expectChannels = 'name\ttype\tunits\nLA1\tSEEG\tuV\nLA2\tSEEG\tuV\nLA3\tSEEG\tuV\n';

  const zipEntries = buildFileEntries(results, subjects, createDefaultDatasetDescription(), new Map([[group, 0]]));
  const zip = await JSZip.loadAsync(await (await generateZip(zipEntries)).blob.arrayBuffer());
  check(await zip.file(`bids_output/${electrodesPath}`)?.async('string') === expectElectrodes, 'ZIP: electrodes CSV not converted');
  check(await zip.file(`bids_output/${channelsPath}`)?.async('string') === expectChannels, 'ZIP: semicolon channels CSV not converted');

  const work = mkdtempSync(join(tmpdir(), 'ng-csv-'));
  try {
    for (const [p, c] of fixture) { mkdirSync(dirname(join(work, 'src', p)), { recursive: true }); writeFileSync(join(work, 'src', p), c); }
    const scanned = await scanDirectory(join(work, 'src', 'P'));
    const r2 = runDetection(scanned, await readJsonSidecars(scanned), await readEdfHeaders(scanned));
    const g2 = r2[0].subjectGroup;
    const entries = buildFileEntries(r2, [{ ...subjects[0], subjectGroup: g2 }], createDefaultDatasetDescription(), new Map([[g2, 0]]));
    await writeFileEntriesToDisk(entries, join(work, 'out'));
    const read = (p: string) => { try { return readFileSync(join(work, 'out', 'bids_output', p), 'utf8'); } catch { return undefined; } };
    check(read(electrodesPath) === expectElectrodes, `stream: electrodes CSV not converted: ${JSON.stringify(read(electrodesPath))}`);
    check(read(channelsPath) === expectChannels, 'stream: semicolon channels CSV not converted');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} CSV check failure(s).`);
    process.exit(1);
  }
  console.log('\nAll CSV checks passed.');
}

main().catch(err => { console.error(err); process.exit(1); });
