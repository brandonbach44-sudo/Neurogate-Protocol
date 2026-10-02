/**
 * End-to-end UI check: drives the real tool page in headless Chrome over
 * the DevTools protocol (no extra dependencies) and verifies workflow
 * behavior that unit tests can't see.
 *
 *   1. Metadata entries survive going back (Mapping, and from Validate).
 *   2. Going back and forth doesn't repeat audit entries.
 *   3. "Change structure" returns to the Structure step, keeps the audit
 *      log, and the new structure is used.
 *
 * Needs a dev server and Chrome:
 *   npx vite --port 5199 &   then   npx tsx verify_ui_flow.ts
 * CHROME=/path/to/chrome overrides the browser; UI_URL the page.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome');
const URL_ = process.env.UI_URL ?? 'http://localhost:5199/tool';
const PORT = 9333;

let failures = 0;
function check(ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${detail}`);
  if (!ok) failures++;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Minimal DevTools protocol client ──────────────────────────────
let ws: WebSocket;
let nextId = 1;
const pending = new Map<number, (v: { result?: unknown; error?: unknown }) => void>();
function send(method: string, params: Record<string, unknown> = {}): Promise<{ result?: { result?: { value?: unknown } } & Record<string, unknown>; error?: unknown }> {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise(resolve => pending.set(id, resolve as never));
}
async function evaluate<T>(expression: string): Promise<T> {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return res.result?.result?.value as T;
}
async function waitFor(expression: string, what: string, timeout = 8000): Promise<boolean> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate<boolean>(`Boolean(${expression})`)) return true;
    await sleep(150);
  }
  console.log(`  (timed out waiting for ${what})`);
  return false;
}
const hasText = (t: string) => `document.body.innerText.includes(${JSON.stringify(t)})`;
async function click(text: string): Promise<boolean> {
  return evaluate<boolean>(`(() => {
    const el = [...document.querySelectorAll('button, a')].find(e => e.innerText.trim().startsWith(${JSON.stringify(text)}) && !e.disabled);
    if (!el) return false; el.click(); return true;
  })()`);
}
async function type(selector: string, value: string): Promise<boolean> {
  return evaluate<boolean>(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
}
const valueOf = (selector: string) => evaluate<string | null>(`document.querySelector(${JSON.stringify(selector)})?.value ?? null`);
async function addFiles(paths: string[]): Promise<void> {
  const doc = await send('DOM.getDocument', { depth: -1 });
  const root = (doc.result as { root: { nodeId: number } }).root.nodeId;
  const q = await send('DOM.querySelector', { nodeId: root, selector: 'input[type=file][multiple]' });
  await send('DOM.setFileInputFiles', { nodeId: (q.result as { nodeId: number }).nodeId, files: paths });
}
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

async function openAuditPanel(): Promise<string> {
  await click('Audit Log');
  await sleep(400);
  const text = await evaluate<string>('document.body.innerText');
  await evaluate<void>(`document.querySelector('[aria-label="Close audit log panel"]')?.click()`);
  await sleep(300);
  return text;
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'ng-ui-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });
  try {
    let target: { webSocketDebuggerUrl: string } | undefined;
    for (let i = 0; i < 40 && !target; i++) {
      await sleep(250);
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json() as { type: string; webSocketDebuggerUrl: string }[];
        target = list.find(t => t.type === 'page');
      } catch { /* not up yet */ }
    }
    if (!target) throw new Error('Chrome did not start');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)!(msg); pending.delete(msg.id); }
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: URL_ });
    await waitFor(hasText('Does each subject have more than one session'), 'Structure step');

    // Structure: multi-session, Implant preset
    await click('Yes');
    await waitFor(hasText('Implant sessions'), 'presets');
    await click('Implant sessions');
    await click('Continue');
    await waitFor(`document.querySelector('input[type=file][multiple]')`, 'drop zone');

    // Drop files: one demo patient
    await addFiles(walk(join(process.cwd(), 'demo-data', 'EpilepsyStudy_Raw', 'Patient_001')));
    check(await waitFor(hasText('Continue to Metadata'), 'mapping', 15000), 'files added, mapping shown');

    // ── 1. Metadata survives Back to Mapping ─────────────────────────
    await click('Continue to Metadata');
    await waitFor(`document.querySelector('#ms-institution-prefix')`, 'metadata');
    await type('#ms-institution-prefix', 'PENN');
    await click('Dataset Description');
    await waitFor(`document.querySelector('#dd-study-name')`, 'dataset tab');
    await type('#dd-study-name', 'UI Test Study');
    await type('input[aria-label="Author 1 name"]', 'Test Author');
    await click('Back to Mapping');
    await waitFor(hasText('Continue to Metadata'), 'mapping again');
    await click('Continue to Metadata');
    await waitFor(`document.querySelector('#ms-institution-prefix')`, 'metadata again');
    check((await valueOf('#ms-institution-prefix')) === 'PENN', 'prefix kept after Back to Mapping');
    await click('Dataset Description');
    await waitFor(`document.querySelector('#dd-study-name')`, 'dataset tab again');
    check((await valueOf('#dd-study-name')) === 'UI Test Study', 'study name kept after Back to Mapping');
    check((await valueOf('input[aria-label="Author 1 name"]')) === 'Test Author', 'author kept after Back to Mapping');

    // Attest defacing if asked, then continue to Validate and come back
    await click('Defacing Attestation');
    await evaluate<void>(`(() => { const c = document.querySelector('#defacing-confirm'); if (c && !c.checked) c.click(); })()`);
    await click('Continue to Validation');
    check(await waitFor(hasText('Back to Metadata'), 'validation', 15000), 'reached Validate');
    await click('Back to Metadata');
    await waitFor(`document.querySelector('#ms-institution-prefix')`, 'metadata from validate');
    check((await valueOf('#ms-institution-prefix')) === 'PENN', 'prefix kept after Back from Validate');
    await click('Defacing Attestation');
    check(await evaluate<boolean>(`Boolean(document.querySelector('#defacing-confirm')?.checked)`), 'attestation kept (same files)');

    // ── 2. No duplicate audit entries ────────────────────────────────
    await click('Continue to Validation');
    await waitFor(hasText('Back to Metadata'), 'validation again', 15000);
    const audit = await openAuditPanel();
    const count = (re: RegExp) => (audit.match(re) ?? []).length;
    check(count(/Institution configured: prefix=/g) === 1, `institution logged once (found ${count(/Institution configured: prefix=/g)})`);
    check(count(/Defacing attestation confirmed/g) === 1, `defacing attestation logged once (found ${count(/Defacing attestation confirmed/g)})`);

    // ── 3. Change structure ──────────────────────────────────────────
    await click('Back to Metadata');
    await waitFor(`document.querySelector('#ms-institution-prefix')`, 'metadata');
    await click('Back to Mapping');
    await waitFor(hasText('Change structure'), 'change structure button');
    await click('Change structure');
    check(await waitFor(hasText('Change the structure?'), 'confirmation'), 'asks before clearing files');
    await click('Keep working');
    check(await waitFor(`!${hasText('Change the structure?')} && ${hasText('Continue to Metadata')}`, 'cancel'), 'Keep working leaves the mapping as it was');
    await click('Change structure');
    await click('Change structure and clear files');
    check(await waitFor(hasText('Cancel, keep the current structure'), 'structure step'), 'returned to the Structure step');
    check(await evaluate<boolean>(hasText('Implant sessions')), 'current structure (Implant) preselected');
    // Implant -> Single session: back to the first question, answer No
    await click('Back');
    await waitFor(hasText('Does each subject have more than one session'), 'first question');
    await click('No');
    await click('Continue');
    check(await waitFor(`document.querySelector('input[type=file][multiple]')`, 'drop zone'), 'back at Drop Files');
    check(await evaluate<boolean>(hasText('Structure: Single session')), 'new structure in use');
    const audit2 = await openAuditPanel();
    check(/Structure changed from Implant sessions .* to Single session/.test(audit2), 'audit records the change');
    check(/Institution configured: prefix=/.test(audit2), 'earlier audit entries kept');
  } finally {
    try { ws?.close(); } catch { /* ignore */ }
    chrome.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
  console.log(failures === 0 ? '\nAll UI checks passed.' : `\n${failures} UI check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(err => { console.error(err); process.exitCode = 1; });
