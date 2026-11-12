/**
 * State updater side-effect guard.
 *
 * React Strict Mode calls state updater functions twice in development, so
 * any side effect inside `setX(prev => ...)` runs twice. In ToolPage.tsx that
 * duplicated audit log entries and setSummary calls (handleUpdateResult and
 * the bulk task / session / modality handlers).
 *
 * The real fix lives in component wiring, which cannot be exercised here
 * without a React renderer. Instead this scans the source: for every
 * functional updater `setX(prev => ...)` under src/, the updater body must not
 * call audit.* or another state setter.
 *
 * The check runs on comment-stripped source. String contents are kept, so an
 * updater whose string literal mentions "audit." would be a false positive.
 *
 * Usage: npx tsx tests/regression_updater_side_effects.ts   (non-zero exit on failure)
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const ROOT = REPO_ROOT;
const SRC = join(ROOT, 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Replace comments with spaces so offsets and line numbers are preserved. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, pre: string) => pre + ' '.repeat(m.length - pre.length));
}

/**
 * Starting at the index just after an opening paren, return the index of the
 * matching closing paren. Naive about parens inside strings, which is fine for
 * this codebase.
 */
function matchParen(src: string, start: number): number {
  let depth = 1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

const UPDATER = /\b(set[A-Z]\w*)\(\s*\(?\s*[a-zA-Z_]\w*\s*\)?\s*=>/g;
const FORBIDDEN: Array<[RegExp, string]> = [
  [/\baudit\.\w+\(/, 'audit logging'],
  [/\bset[A-Z]\w*\(/, 'another state setter'],
];

let failures = 0;
let scanned = 0;
for (const file of walk(SRC)) {
  const src = stripComments(readFileSync(file, 'utf-8'));
  for (const m of src.matchAll(UPDATER)) {
    scanned++;
    const openIdx = m.index! + m[1].length + 1;
    const close = matchParen(src, openIdx);
    if (close === -1) continue;
    const body = src.slice(openIdx, close);
    for (const [re, label] of FORBIDDEN) {
      if (re.test(body)) {
        failures++;
        const line = src.slice(0, m.index!).split('\n').length;
        console.log(`  FAIL  ${relative(ROOT, file)}:${line}  ${m[1]}(prev => ...) updater calls ${label}`);
      }
    }
  }
}

// Sanity check: the guard must actually catch the old ToolPage pattern.
{
  const bad = stripComments(`
    setDetectionResults(prev => {
      const renamed = computeBidsNames(prev);
      audit.logSessionCorrected('a', 'b', 'c');
      setSummary(generateSummary(renamed));
      return renamed;
    });`);
  let caught = 0;
  for (const m of bad.matchAll(UPDATER)) {
    const openIdx = m.index! + m[1].length + 1;
    const body = bad.slice(openIdx, matchParen(bad, openIdx));
    caught += FORBIDDEN.filter(([re]) => re.test(body)).length;
  }
  if (caught !== 2) {
    failures++;
    console.log(`  FAIL  self-check: expected 2 violations in the known-bad sample, found ${caught}`);
  }
}

console.log(`updater side-effect guard: ${scanned} functional updaters scanned`);
if (failures > 0) {
  console.log(`${failures} failure(s)`);
  process.exit(1);
}
console.log('PASS');
