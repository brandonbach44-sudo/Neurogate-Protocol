/**
 * Consistency checks regression: channels.tsv against electrodes.tsv,
 * Persyst .dat/.lay pairs, and a dropped sessions.tsv against the
 * sessions that have files. Also the session-label matching used by
 * auto-fill, which must follow the chosen structure.
 *
 * Usage: npx tsx regression_consistency.ts   (non-zero exit on failure)
 */
import { runDetection, readJsonSidecars, readEdfHeaders } from './src/lib/detection';
import { computeBidsNames } from './src/lib/bids/bidsNaming';
import { checkConsistency } from './src/lib/validation/consistencyChecker';
import { extractSessionMetadata, resolveSessionLabel } from './src/lib/metadata';
import type { ScannedFile } from './src/types/files';
import type { DatasetStructure } from './src/types/sessionStructure';
import { createDefaultDatasetStructure } from './src/types/sessionStructure';
import type { ValidationIssue } from './src/types/validation';

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

async function issuesFor(files: ScannedFile[], structure: DatasetStructure = createDefaultDatasetStructure()): Promise<ValidationIssue[]> {
  const results = runDetection(files, await readJsonSidecars(files), await readEdfHeaders(files), structure);
  const groups = [...new Set(results.map(r => r.subjectGroup))].sort();
  const named = computeBidsNames(results, new Map(groups.map((g, i) => [g, `sub-C00${i + 1}`])), structure);
  return checkConsistency(named, structure);
}

const contacts = ['LA1', 'LA2', 'LA3', 'LB1', 'LB2'];
const ieeg = edf(contacts);

async function main() {
  console.log('channels against electrodes');
  {
    const electrodes = 'name\tx\ty\tz\tsize\n' + contacts.map((c, i) => `${c}\t${i}\t0\t0\t2`).join('\n') + '\n';
    const channels = 'name\ttype\tunits\n' +
      'LA1\tSEEG\tuV\nla2\tSEEG\tuV\nLA03\tSEEG\tuV\nLB1-LB2\tSEEG\tuV\nEKG1\tECG\tuV\nDC01\tTRIG\tV\n';
    const issues = await issuesFor([
      mk('P1/Session_implant/ieeg/night_ieeg.edf', ieeg),
      mk('P1/Session_implant/ieeg/night_channels.tsv', channels),
      mk('P1/Session_implant/ieeg/night_electrodes.tsv', electrodes),
    ]);
    const hit = issues.find(i => /with no matching electrode/.test(i.title));
    check(Boolean(hit), 'mismatched channel names not reported');
    check(hit?.title === '2 channels with no matching electrode', `title: ${hit?.title}`);
    check(/: la2, LA03\./.test(hit?.description ?? ''), `missing names: ${hit?.description}`);
    check(/differ only in letter case: la2 \/ LA2/.test(hit?.description ?? ''), 'case-only difference not pointed out');
    check(!/EKG1|DC01|LB1-LB2/.test(hit?.description ?? ''), 'ECG, trigger or a valid bipolar channel was reported');
    check(hit?.severity === 'warning' && hit.dismissable, 'should be a dismissable warning');

    const clean = await issuesFor([
      mk('P1/Session_implant/ieeg/night_ieeg.edf', ieeg),
      mk('P1/Session_implant/ieeg/night_channels.tsv', 'name\ttype\tunits\n' + contacts.map(c => `${c}\tECOG\tuV`).join('\n') + '\nECG\tECG\tuV\n'),
      mk('P1/Session_implant/ieeg/night_electrodes.tsv', electrodes),
    ]);
    check(!clean.some(i => /with no matching electrode/.test(i.title)), 'matching tables were reported');

    const untyped = await issuesFor([
      mk('P1/Session_implant/ieeg/night_ieeg.edf', ieeg),
      mk('P1/Session_implant/ieeg/night_channels.tsv', 'name\tunits\nLA1\tuV\nLA9\tuV\nECG\tuV\nTrigger\tV\n'),
      mk('P1/Session_implant/ieeg/night_electrodes.tsv', electrodes),
    ]);
    const u = untyped.find(i => /with no matching electrode/.test(i.title));
    check(u?.title === '1 channel with no matching electrode' && /LA9/.test(u.description) && /no "type" column/.test(u.description), `untyped table: ${u?.description}`);

    const noName = await issuesFor([
      mk('P1/Session_implant/ieeg/night_ieeg.edf', ieeg),
      mk('P1/Session_implant/ieeg/night_channels.tsv', 'name\ttype\nLA1\tSEEG\n'),
      mk('P1/Session_implant/ieeg/night_electrodes.tsv', 'contact\tx\ty\tz\nLA1\t0\t0\t0\n'),
    ]);
    check(noName.some(i => i.title === 'electrodes.tsv has no "name" column'), 'electrodes table without a name column not reported');

    const otherSession = await issuesFor([
      mk('P1/Session_implant/ieeg/night_ieeg.edf', ieeg),
      mk('P1/Session_implant/ieeg/night_channels.tsv', channels),
      mk('P1/Session_preimplant/ieeg/old_electrodes.tsv', electrodes),
    ]);
    check(!otherSession.some(i => /with no matching electrode/.test(i.title)), 'channels were compared with another session\'s electrodes');
  }

  console.log('Persyst pairs');
  {
    const lay = '[FileInfo]\nFile=rec1.dat\n';
    const issues = await issuesFor([
      mk('P2/Session_implant/ieeg/rec1.dat', new Uint8Array(16)),
      mk('P2/Session_implant/ieeg/rec1.lay', lay),
      mk('P2/Session_implant/ieeg/rec2.dat', new Uint8Array(16)),
      mk('P2/Session_implant/ieeg/rec3.lay', '[FileInfo]\nFile=rec3.dat\n'),
    ]);
    const datOnly = issues.filter(i => i.title === 'Persyst .dat has no .lay file');
    const layOnly = issues.filter(i => i.title === 'Persyst .lay has no .dat file');
    check(datOnly.length === 1 && datOnly[0].affectedFiles[0].endsWith('rec2.dat'), `lone .dat: ${datOnly.map(i => i.affectedFiles[0])}`);
    check(layOnly.length === 1 && layOnly[0].affectedFiles[0].endsWith('rec3.lay'), `lone .lay: ${layOnly.map(i => i.affectedFiles[0])}`);
    const other = await issuesFor([mk('P2/Session_implant/ieeg/rec1.dat', new Uint8Array(16)), mk('P2/Session_preimplant/ieeg/rec1.lay', lay)]);
    check(other.filter(i => /^Persyst/.test(i.title)).length === 2, 'a .dat and .lay in different folders were treated as a pair');
  }

  console.log('sessions.tsv against the sessions with files');
  {
    const t1 = new Uint8Array([0]);
    const issues = await issuesFor([
      mk('P3/Session_preimplant/anat/T1w_MPRAGE.nii.gz', t1),
      mk('P3/Session_postsurgery/anat/T1w_MPRAGE.nii.gz', t1),
      mk('P3/P3_sessions.tsv', 'session_id\tacq_time\npreop\t2024-01-02T10:00:00\nses-postimplant\t2024-02-01T10:00:00\nses-04\t2024-03-01T10:00:00\n'),
    ]);
    const unmatched = issues.find(i => i.title === "sessions.tsv rows don't match any session");
    const empty = issues.find(i => i.title === 'sessions.tsv lists sessions with no files');
    const notListed = issues.find(i => i.title === "Sessions with files aren't in sessions.tsv");
    check(Boolean(unmatched) && /row 4: "ses-04"/.test(unmatched!.description) && !/preop/.test(unmatched!.description), `unmatched rows: ${unmatched?.description}`);
    check(Boolean(empty) && /ses-postimplant/.test(empty!.description) && empty!.severity === 'info', `listed without files: ${empty?.description}`);
    check(Boolean(notListed) && /ses-postsurgery/.test(notListed!.description) && !/ses-preimplant/.test(notListed!.description), `not listed: ${notListed?.description}`);

    const noColumn = await issuesFor([
      mk('P3/Session_preimplant/anat/T1w_MPRAGE.nii.gz', t1),
      mk('P3/P3_sessions.tsv', 'visit\tdate\n1\t2024-01-02\n'),
    ]);
    check(noColumn.some(i => i.title === 'sessions.tsv has no session column'), 'sessions.tsv without a session column not reported');

    const single: DatasetStructure = { presetId: 'single-session' };
    const singleIssues = await issuesFor([mk('P3/anat/T1w_MPRAGE.nii.gz', t1), mk('P3/P3_sessions.tsv', 'session_id\nses-04\n')], single);
    check(!singleIssues.some(i => /sessions\.tsv/.test(i.title)), 'Single session was checked against sessions.tsv');
  }

  console.log('session labels follow the structure');
  {
    const custom = ['ses-1', 'ses-2'];
    check(resolveSessionLabel('ses-1', custom) === 'ses-1', `"ses-1" with Custom sessions -> ${resolveSessionLabel('ses-1', custom)}`);
    check(resolveSessionLabel('2', custom) === 'ses-2', 'bare "2" with Custom sessions');
    check(resolveSessionLabel('baseline', custom) === null, '"baseline" matched a Custom session it isn\'t');
    const implant = ['ses-preimplant', 'ses-postimplant', 'ses-postsurgery'];
    check(resolveSessionLabel('Pre-op', implant) === 'ses-preimplant', 'Implant keyword matching lost');
    check(resolveSessionLabel('ses-2wk', implant) === null, 'a Custom label matched the Implant structure');
    const rows = await extractSessionMetadata(new File(['session_id\tacq_time\nses-1\t2024-01-01\nses-2\t2024-02-01\n'], 's.tsv'), custom);
    check(rows?.map(r => r.sessionId).join(',') === 'ses-1,ses-2', `auto-fill rows: ${rows?.map(r => r.sessionId)}`);
  }

  if (failures > 0) {
    console.error(`\n${failures} consistency check failure(s).`);
    process.exit(1);
  }
  console.log('\nAll consistency checks passed.');
}

main().catch(err => { console.error(err); process.exit(1); });
