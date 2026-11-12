/**
 * Back-to-back mapping edits regression (src/lib/mapping/detectionEdits.ts).
 *
 * ToolPage's edit handlers used to read detectionResults from the render
 * closure, so two edits fired before a re-render both started from the same
 * array and the second dropped the first. They now read a ref that every
 * commit updates synchronously. These checks call the real edit functions
 * twice in a row with a commit that never re-renders, and check:
 *  - both edits are kept (single corrections, bulk edits, removal + edit)
 *  - each audit entry is written exactly once, and the summary is set once
 *    per edit
 *  - a control run with the old stale behavior (commit does not update the
 *    ref) does lose the first edit, so these checks can catch the bug
 *  - ToolPage changes detection results only through commitDetectionResults
 *
 * Usage: npx tsx tests/regression_detection_edits.ts   (non-zero exit on failure)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDetection, readJsonSidecars, readEdfHeaders } from '../src/lib/detection';
import { computeBidsNames } from '../src/lib/bids/bidsNaming';
import { createAuditLogger } from '../src/lib/audit/auditLogger';
import { createDefaultDatasetStructure } from '../src/types/sessionStructure';
import {
  updateResult, bulkUpdateTask, bulkUpdateSession, bulkUpdateModality, removeFromMapping,
} from '../src/lib/mapping/detectionEdits';
import type { DetectionEditContext } from '../src/lib/mapping/detectionEdits';
import type { DetectionResult } from '../src/types/detection';
import type { ScannedFile } from '../src/types/files';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

let failures = 0;
function check(ok: boolean, detail: string) {
  if (!ok) { failures++; console.log(`  FAIL  ${detail}`); }
}

const mk = (relativePath: string, content: string | Uint8Array<ArrayBuffer>): ScannedFile => {
  const name = relativePath.split('/').pop()!;
  const file = new File([content], name);
  return { relativePath, name, size: file.size, file } as ScannedFile;
};
const sc = (desc: string) => JSON.stringify({ SeriesDescription: desc, Modality: 'MR' });

const structure = createDefaultDatasetStructure();

async function fixture(): Promise<DetectionResult[]> {
  const files = [
    mk('S/Session_preimplant/anat/t1.nii.gz', new Uint8Array(8)), mk('S/Session_preimplant/anat/t1.json', sc('T1 MPRAGE')),
    mk('S/Session_preimplant/anat/t2.nii.gz', new Uint8Array(8)), mk('S/Session_preimplant/anat/t2.json', sc('T2 SPACE')),
    mk('S/Session_preimplant/func/rest_bold.nii.gz', new Uint8Array(8)), mk('S/Session_preimplant/func/rest_bold.json', sc('ep2d_bold_rest')),
  ];
  const results = runDetection(files, await readJsonSidecars(files), await readEdfHeaders(files), structure);
  return computeBidsNames(results, undefined, structure);
}

/**
 * An edit context whose commit never triggers a re-render: the "rendered"
 * array stays at its initial value, the way React's detectionResults would
 * between two events in the same tick. `updateRef: false` reproduces the old
 * handlers, which always read the rendered array.
 */
function harness(initial: DetectionResult[], updateRef = true) {
  const rendered = initial;
  const results = { current: initial };
  const commits: DetectionResult[][] = [];
  let summaries = 0;
  const audit = createAuditLogger();
  const ctx: DetectionEditContext = {
    results,
    commit: next => { if (updateRef) results.current = next; commits.push(next); },
    setSummary: () => { summaries++; },
    audit,
    structure,
  };
  return {
    ctx,
    rendered,
    last: () => commits[commits.length - 1],
    commits,
    summaries: () => summaries,
    count: (action: string) => audit.getEntries().filter(e => e.action === action).length,
  };
}

const at = (rs: DetectionResult[], fileName: string) => rs.find(r => r.fileName === fileName)!;
const idx = (rs: DetectionResult[], fileName: string) => rs.findIndex(r => r.fileName === fileName);

async function main() {
  const base = await fixture();
  check(base.length === 6, `fixture has 6 results, got ${base.length}`);
  const t1 = idx(base, 't1.nii.gz');
  const t2 = idx(base, 't2.nii.gz');
  const bold = idx(base, 'rest_bold.nii.gz');
  check(t1 >= 0 && t2 >= 0 && bold >= 0, 'fixture files detected');

  console.log('two single corrections before a re-render');
  {
    const h = harness(base);
    updateResult(h.ctx, t1, { userSession: 'ses-postimplant' });
    updateResult(h.ctx, t2, { userModality: 'anat-FLAIR' });
    const out = h.last();
    check(at(out, 't1.nii.gz').userSession === 'ses-postimplant', 'first edit (session) kept');
    check(at(out, 't2.nii.gz').userModality === 'anat-FLAIR', 'second edit (modality) kept');
    check(h.count('session-corrected') === 1, `session-corrected logged ${h.count('session-corrected')}x, want 1`);
    check(h.count('modality-corrected') === 1, `modality-corrected logged ${h.count('modality-corrected')}x, want 1`);
    check(h.commits.length === 2 && h.summaries() === 2, `commits ${h.commits.length}, summaries ${h.summaries()}, want 2 and 2`);
    check(h.rendered === base && at(base, 't1.nii.gz').userSession == null, 'input array not mutated');
  }

  console.log('two bulk edits before a re-render');
  {
    const h = harness(base);
    bulkUpdateTask(h.ctx, [bold], 'motor');
    bulkUpdateSession(h.ctx, [t1, bold], 'ses-postimplant');
    bulkUpdateModality(h.ctx, [t2], 'anat-PDw');
    const out = h.last();
    check(at(out, 'rest_bold.nii.gz').userTask === 'motor', 'bulk task kept after later bulk edits');
    check(at(out, 'rest_bold.nii.gz').userSession === 'ses-postimplant', 'bulk session kept');
    check(at(out, 't1.nii.gz').userSession === 'ses-postimplant', 'bulk session on second file kept');
    check(at(out, 't2.nii.gz').userModality === 'anat-PDw', 'bulk modality kept');
    for (const a of ['bulk-task-applied', 'bulk-session-applied', 'bulk-modality-applied']) {
      check(h.count(a) === 1, `${a} logged ${h.count(a)}x, want 1`);
    }
    check(h.summaries() === 3, `summaries ${h.summaries()}, want 3`);
  }

  console.log('remove then edit before a re-render');
  {
    const h = harness(base);
    const removedLog: DetectionResult[] = [];
    removeFromMapping(h.ctx, [t1], removedLog);
    // Index of t2 in the array the first edit produced, as the table would
    // see it. With the stale array this index would point at another file.
    const t2After = idx(h.ctx.results.current, 't2.nii.gz');
    updateResult(h.ctx, t2After, { userModality: 'anat-FLAIR' });
    const out = h.last();
    check(!out.some(r => r.fileName === 't1.nii.gz' || r.fileName === 't1.json'), 'removed file and its sidecar stay removed');
    check(at(out, 't2.nii.gz').userModality === 'anat-FLAIR', 'edit after removal applied to the right file');
    check(out.length === 4, `4 results remain, got ${out.length}`);
    check(removedLog.length === 2, `removed log has 2 entries, got ${removedLog.length}`);
    check(h.count('file-removed') === 2, `file-removed logged ${h.count('file-removed')}x, want 2`);
    check(h.count('modality-corrected') === 1, `modality-corrected logged ${h.count('modality-corrected')}x, want 1`);
  }

  console.log('control: the old stale read loses the first edit');
  {
    const h = harness(base, false);
    updateResult(h.ctx, t1, { userSession: 'ses-postimplant' });
    updateResult(h.ctx, t2, { userModality: 'anat-FLAIR' });
    check(at(h.last(), 't1.nii.gz').userSession == null,
      'stale control should drop the first edit; if it does not, this test no longer models the bug');
  }

  console.log('ToolPage changes detection results only through commitDetectionResults');
  {
    const src = readFileSync(join(REPO_ROOT, 'src', 'pages', 'ToolPage.tsx'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const direct = src.match(/\bsetDetectionResults\(/g)?.length ?? 0;
    check(direct === 1, `setDetectionResults( called ${direct}x; only commitDetectionResults may call it`);
    check(/detectionResultsRef\.current = next;\s*setDetectionResults\(next\)/.test(src),
      'commitDetectionResults must set the ref before setDetectionResults');
  }

  if (failures > 0) {
    console.log(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log('\nAll detection edit checks passed.');
}

main();
