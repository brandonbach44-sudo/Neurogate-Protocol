/**
 * Task labels regression: functional MRI and EEG / iEEG recordings take
 * the task the user sets (default rest / monitor), channels and events
 * tables follow their recording, runs are numbered per task, and labels
 * are letters and digits only.
 *
 * Usage: npx tsx regression_tasks.ts   (non-zero exit on failure)
 */
import { runDetection, readJsonSidecars, readEdfHeaders } from './src/lib/detection';
import { computeBidsNames } from './src/lib/bids/bidsNaming';
import { sanitizeTaskLabel, taskInBidsName } from './src/types/detection';
import type { DetectionResult } from './src/types/detection';
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
const ieeg = edf(['LA1', 'LA2', 'LA3', 'LB1', 'LB2']);
const sc = (desc: string) => JSON.stringify({ SeriesDescription: desc, Modality: 'MR' });

async function detect(files: ScannedFile[]): Promise<DetectionResult[]> {
  return runDetection(files, await readJsonSidecars(files), await readEdfHeaders(files));
}
function name(results: DetectionResult[], set: Record<string, string> = {}): Map<string, string> {
  const edited = results.map(r => (set[r.relativePath] !== undefined ? { ...r, userTask: set[r.relativePath] } : r));
  const named = computeBidsNames(edited, new Map([[results[0].subjectGroup, 'sub-T001']]));
  return new Map(named.map(r => [r.relativePath, r.bidsFilename]));
}

async function main() {
  console.log('labels');
  check(sanitizeTaskLabel('motor-left_v2!') === 'motorleftv2', `sanitize: ${sanitizeTaskLabel('motor-left_v2!')}`);
  check(taskInBidsName('sub-1_ses-a_task-rest_run-2_bold.nii.gz') === 'rest', 'task read back from a name');
  check(taskInBidsName('sub-1_ses-a_T1w.nii.gz') === null, 'a name with no task');

  console.log('functional MRI');
  {
    const r = await detect([
      mk('S/Session_preimplant/func/rest_bold.nii.gz', new Uint8Array(8)), mk('S/Session_preimplant/func/rest_bold.json', sc('ep2d_bold_rest')),
      mk('S/Session_preimplant/func/fingertap_bold.nii.gz', new Uint8Array(8)), mk('S/Session_preimplant/func/fingertap_bold.json', sc('ep2d_bold_task')),
    ]);
    const before = name(r);
    check(before.get('S/Session_preimplant/func/rest_bold.nii.gz') === 'sub-T001_ses-preimplant_task-rest_run-2_bold.nii.gz', `default (both task-rest, so numbered): ${before.get('S/Session_preimplant/func/rest_bold.nii.gz')}`);
    const after = name(r, { 'S/Session_preimplant/func/fingertap_bold.nii.gz': 'motor' });
    check(after.get('S/Session_preimplant/func/fingertap_bold.nii.gz') === 'sub-T001_ses-preimplant_task-motor_bold.nii.gz', `task set: ${after.get('S/Session_preimplant/func/fingertap_bold.nii.gz')}`);
    check(after.get('S/Session_preimplant/func/fingertap_bold.json') === 'sub-T001_ses-preimplant_task-motor_bold.json', 'sidecar did not follow the task');
    check(after.get('S/Session_preimplant/func/rest_bold.nii.gz') === 'sub-T001_ses-preimplant_task-rest_bold.nii.gz', `runs not numbered per task: ${after.get('S/Session_preimplant/func/rest_bold.nii.gz')}`);
    const junk = name(r, { 'S/Session_preimplant/func/fingertap_bold.nii.gz': '***' });
    check(/task-rest/.test(junk.get('S/Session_preimplant/func/fingertap_bold.nii.gz')!), 'a label with no letters or digits did not fall back to the default');
  }

  console.log('iEEG and its tables');
  {
    const r = await detect([
      mk('S/Session_implant/ieeg/night_ieeg.edf', ieeg),
      mk('S/Session_implant/ieeg/night_channels.tsv', 'name\ttype\nLA1\tSEEG\n'),
      mk('S/Session_implant/ieeg/night_events.tsv', 'onset\tduration\n1\t0\n'),
      mk('S/Session_implant/ieeg/night_electrodes.tsv', 'name\tx\ty\tz\nLA1\t0\t0\t0\n'),
    ]);
    const n = name(r, { 'S/Session_implant/ieeg/night_ieeg.edf': 'sleep' });
    check(n.get('S/Session_implant/ieeg/night_ieeg.edf') === 'sub-T001_ses-postimplant_task-sleep_ieeg.edf', `recording: ${n.get('S/Session_implant/ieeg/night_ieeg.edf')}`);
    check(n.get('S/Session_implant/ieeg/night_channels.tsv') === 'sub-T001_ses-postimplant_task-sleep_channels.tsv', `channels did not follow: ${n.get('S/Session_implant/ieeg/night_channels.tsv')}`);
    check(n.get('S/Session_implant/ieeg/night_events.tsv') === 'sub-T001_ses-postimplant_task-sleep_events.tsv', 'events did not follow');
    check(n.get('S/Session_implant/ieeg/night_electrodes.tsv') === 'sub-T001_ses-postimplant_electrodes.tsv', 'electrodes got a task');
    const own = name(r, { 'S/Session_implant/ieeg/night_ieeg.edf': 'sleep', 'S/Session_implant/ieeg/night_events.tsv': 'stim' });
    check(own.get('S/Session_implant/ieeg/night_events.tsv') === 'sub-T001_ses-postimplant_task-stim_events.tsv', 'a table\'s own task was overridden');
  }
  {
    const r = await detect([
      mk('S/Session_implant/ieeg/a_ieeg.edf', ieeg),
      mk('S/Session_implant/ieeg/b_ieeg.edf', ieeg),
      mk('S/Session_implant/ieeg/shared_channels.tsv', 'name\ttype\nLA1\tSEEG\n'),
    ]);
    const n = name(r, { 'S/Session_implant/ieeg/a_ieeg.edf': 'sleep', 'S/Session_implant/ieeg/b_ieeg.edf': 'stim' });
    check(/_task-monitor_channels\.tsv$/.test(n.get('S/Session_implant/ieeg/shared_channels.tsv')!), `ambiguous table should keep the default: ${n.get('S/Session_implant/ieeg/shared_channels.tsv')}`);
    check(/task-sleep_ieeg/.test(n.get('S/Session_implant/ieeg/a_ieeg.edf')!) && /task-stim_ieeg/.test(n.get('S/Session_implant/ieeg/b_ieeg.edf')!) && !/run-/.test(n.get('S/Session_implant/ieeg/a_ieeg.edf')!), 'two tasks in one session should each be unnumbered');
  }

  if (failures > 0) {
    console.error(`\n${failures} task check failure(s).`);
    process.exit(1);
  }
  console.log('\nAll task checks passed.');
}

main().catch(err => { console.error(err); process.exit(1); });
