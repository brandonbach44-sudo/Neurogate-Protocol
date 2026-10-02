/**
 * Desktop close guard: drives the real Electron app over the DevTools
 * protocol and reads the main process's log.
 *
 *   1. After real work (files added), the renderer reports unsaved audit
 *      entries and closing the window triggers the "not saved" prompt.
 *   2. A fresh launch doesn't bring that log back (tab storage ends with
 *      the app), and closing with nothing to save closes without asking.
 *
 * The native dialog can't be clicked from here, so the app is killed
 * once the prompt is reached.
 *
 * Needs a build: npm run build && npm run desktop:bundle, then
 *   npx tsx verify_desktop_close.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRequire } from 'node:module';
// The Electron binary itself (node_modules/.bin/electron is a wrapper
// script, and killing the wrapper would leave the app running).
const ELECTRON = createRequire(import.meta.url)('electron') as unknown as string;
const PORT = 9335;
let failures = 0;
function check(ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${detail}`);
  if (!ok) failures++;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface App { proc: ChildProcess; log: () => string; ws: WebSocket; eval: <T>(expr: string) => Promise<T>; send: (m: string, p?: object) => Promise<{ result?: Record<string, unknown> }> }

async function launch(userData: string): Promise<App> {
  let out = '';
  const proc = spawn(ELECTRON, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout!.on('data', d => { out += d; });
  proc.stderr!.on('data', d => { out += d; });
  let target: { webSocketDebuggerUrl: string } | undefined;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json() as { type: string; url: string; webSocketDebuggerUrl: string }[];
      target = list.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1'));
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error(`Electron did not start:\n${out}`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 1;
  const pending = new Map<number, (v: unknown) => void>();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)!(msg); pending.delete(msg.id); }
  });
  const send = (method: string, params: object = {}) => new Promise<{ result?: Record<string, unknown> }>(resolve => {
    const n = id++;
    pending.set(n, resolve as (v: unknown) => void);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async <T>(expression: string): Promise<T> => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return (res.result?.result as { value?: T })?.value as T;
  };
  return { proc, log: () => out, ws, eval: evaluate, send };
}

async function waitFor(app: App, expr: string, timeout = 10000): Promise<boolean> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await app.eval<boolean>(`Boolean(${expr})`)) return true; } catch { /* navigating */ }
    await sleep(200);
  }
  return false;
}
async function waitForLog(app: App, text: string, timeout = 5000): Promise<boolean> {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (app.log().includes(text)) return true; await sleep(100); }
  return false;
}
const click = (app: App, text: string) => app.eval<boolean>(`(() => { const el = [...document.querySelectorAll('button, a')].find(e => e.innerText.trim().startsWith(${JSON.stringify(text)})); if (!el) return false; el.click(); return true; })()`);
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) { const p = join(dir, e); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); }
  return out;
}
/** Wait for the app's own first page, then go to the tool. */
async function openTool(app: App) {
  await waitFor(app, `document.readyState === 'complete' && document.body.innerText.includes('NeuroGate')`, 15000);
  await app.send('Page.navigate', { url: 'http://127.0.0.1:3001/tool' });
}

async function stop(app: App) {
  try { app.ws.close(); } catch { /* ignore */ }
  app.proc.kill('SIGKILL');
  await sleep(800);
}

async function main() {
  const userData = mkdtempSync(join(tmpdir(), 'ng-close-'));
  try {
    // ── 1. Unsaved work: closing asks ─────────────────────────────
    let app = await launch(userData);
    await openTool(app);
    const loaded = await waitFor(app, `document.body.innerText.includes('Does each subject have more than one session')`);
    if (!loaded) console.log('  page:', await app.eval<string>(`location.href + ' | ' + document.body.innerText.slice(0, 200)`));
    check(loaded, 'tool page loaded in the desktop app');
    await click(app, 'Yes');
    await sleep(200);
    await click(app, 'Implant sessions');
    await click(app, 'Continue');
    await waitFor(app, `document.querySelector('input[type=file][multiple]')`);
    check(!app.log().includes('[audit] unsaved entries: true'), 'choosing a structure alone does not count as unsaved work');
    const doc = await app.send('DOM.getDocument', { depth: -1 });
    const q = await app.send('DOM.querySelector', { nodeId: (doc.result!.root as { nodeId: number }).nodeId, selector: 'input[type=file][multiple]' });
    await app.send('DOM.setFileInputFiles', { nodeId: q.result!.nodeId, files: walk(join(process.cwd(), 'demo-data', 'EpilepsyStudy_Raw', 'Patient_001')) });
    await waitFor(app, `document.body.innerText.includes('Continue to Metadata')`, 15000);
    check(await waitForLog(app, '[audit] unsaved entries: true'), 'renderer reported unsaved audit entries to the main process');
    app.proc.kill('SIGTERM'); // Electron quits the app normally on SIGTERM, closing its window
    check(await waitForLog(app, '[audit] close requested with an unsaved audit log; asking'), 'quitting brought up the unsaved-log prompt');
    await sleep(500);
    check(app.proc.exitCode === null, 'the app stayed open while the prompt is up');
    await stop(app);

    // ── 2. Fresh launch: nothing restored, closes without asking ──
    app = await launch(userData);
    await openTool(app);
    await waitFor(app, `document.body.innerText.includes('Does each subject have more than one session')`);
    await sleep(500);
    const count = await app.eval<string>(`[...document.querySelectorAll('button')].find(b => b.innerText.includes('Audit Log'))?.innerText ?? ''`);
    check(!/\d/.test(count), `a new app launch starts with an empty audit log (button reads "${count.replace(/\s+/g, ' ').trim()}")`);
    app.proc.kill('SIGTERM');
    const exited = await new Promise<boolean>(resolve => {
      if (app.proc.exitCode !== null) return resolve(true);
      const t = setTimeout(() => resolve(false), 5000);
      app.proc.once('exit', () => { clearTimeout(t); resolve(true); });
    });
    check(exited && !app.log().includes('asking'), 'quitting with nothing to save closed the app without a prompt');
    await stop(app);
  } finally {
    rmSync(userData, { recursive: true, force: true });
  }
  console.log(failures === 0 ? '\nAll desktop close checks passed.' : `\n${failures} desktop close check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(err => { console.error(err); process.exitCode = 1; });
