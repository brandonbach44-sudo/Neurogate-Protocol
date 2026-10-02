/**
 * Audit log regression: dismissals, attestation changes, and keeping the
 * log across a reload (save to tab storage, restore, continue numbering).
 *
 * Usage: npx tsx regression_audit.ts   (non-zero exit on failure)
 */
import { createAuditLogger } from './src/lib/audit/auditLogger';
import { saveAuditLog, loadAuditLog } from './src/lib/audit/auditPersistence';
import { redactAuditValue } from './src/lib/audit/auditRedaction';
import type { ValidationIssue } from './src/types/validation';

let failures = 0;
function check(ok: boolean, detail: string) {
  if (!ok) { failures++; console.log(`  FAIL  ${detail}`); }
}

// Minimal sessionStorage for Node.
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

console.log('dismissals');
{
  const audit = createAuditLogger();
  const issue: ValidationIssue = {
    id: 'phi-7', category: 'phi-risk', severity: 'warning',
    title: 'Potential name in sidecar text (unconfirmed)',
    description: 'SeriesDescription contains "John Smith", which may be a name.',
    affectedFiles: ['Smith_John/anat/T1.json'], subjectGroup: 'Smith_John', dismissable: true,
  };
  audit.logIssueDismissed(issue);
  const e = audit.getEntries()[0];
  check(e.action === 'validation-issue-dismissed' && e.actor === 'user', 'dismissal not logged as a user action');
  check(e.summary === 'Dismissed warning "Potential name in sidecar text (unconfirmed)" (1 file)', `summary: ${e.summary}`);
  check(!JSON.stringify(e).includes('John Smith'), 'the issue description (which can quote PHI) was logged');
  const shared = redactAuditValue(e, [['Smith_John/anat/T1.json', 'primary/sub-PENN001/anat/sub-PENN001_T1w.json'], ['Smith_John', 'sub-PENN001']]);
  check(!JSON.stringify(shared).includes('Smith_John'), 'shareable copy still names the original folder');
  audit.logDismissalsCleared(2);
  check(audit.getEntries()[1].summary === 'Checks re-run; 2 dismissed issues shown again', 'dismissals-cleared summary');
}

console.log('attestation');
{
  const audit = createAuditLogger();
  audit.logDefacingAttested(3);
  audit.logDefacingRevoked('unticked');
  audit.logDefacingRevoked('files-changed');
  const [a, b, c] = audit.getEntries();
  check(a.summary === 'Defacing attestation confirmed (covers 3 structural MRI files)', `attested: ${a.summary}`);
  check(b.action === 'defacing-revoked' && b.actor === 'user' && b.details.reason === 'unticked', 'untick not logged');
  check(c.actor === 'system' && c.details.reason === 'files-changed', 'files-changed clearing not logged as system');
  audit.logDefacingAttested();
  check(audit.getEntries()[3].summary === 'Defacing attestation confirmed', 'CLI form (no count) changed');
}

console.log('kept across a reload');
{
  store.clear();
  const before = createAuditLogger();
  let changes = 0;
  before.subscribe(() => changes++);
  before.logStructureSelected('implant', 3, ['preimplant', 'postimplant', 'postsurgery']);
  before.logFilesScanned(10, 2048);
  check(changes === 2, 'subscribe not called on each entry');
  check(saveAuditLog(before.getLog()), 'save failed');

  // "Reload": a new logger restores the saved log.
  const saved = loadAuditLog();
  check(saved?.entries.length === 2, 'saved log not read back');
  const after = createAuditLogger();
  after.restore(saved!);
  after.logAuditLogRestored(saved!.entries.length);
  after.logFilesScanned(1, 1);
  const ids = after.getEntries().map(e => e.id);
  check(ids.join(',') === '1,2,3,4', `ids not continued after restore: ${ids}`);
  check(after.getLog().sessionStarted === before.getLog().sessionStarted, 'session start time not kept');
  check(after.getEntries()[2].summary === 'Page reloaded; audit log restored with 2 earlier entries', 'restored entry summary');

  store.set('neurogate-audit-log-v1', '{"not":"a log"}');
  check(loadAuditLog() === null, 'a malformed saved log was accepted');
  store.set('neurogate-audit-log-v1', '{oops');
  check(loadAuditLog() === null, 'unparseable saved log was accepted');
}

if (failures > 0) {
  console.error(`\n${failures} audit check failure(s).`);
  process.exit(1);
}
console.log('\nAll audit checks passed.');
