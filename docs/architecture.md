# Architecture

## High-Level Flow

```
User browser
   │
   ├─ File drop & scan (all client-side)
   ├─ Modality detection (all client-side)
   ├─ Mapping table (all client-side)
   ├─ Metadata forms (all client-side)
   ├─ Validation (all client-side, using bids-validator npm)
   ├─ Audit log generation (all client-side)
   │
   └─ Export ──► BIDS ZIP download (site uploads manually via Pennsieve web or Agent)
```

## Upload Architecture — Decision Finalized

**Decision:** Browser-to-Pennsieve direct upload is not feasible. Pennsieve does not support the CORS headers required for browser-initiated REST API calls, and adding a backend proxy would conflict with the tool's static, client-side-only design.

**Final approach:** The tool exports a validated BIDS ZIP file to the user's local machine. The user then uploads that ZIP to their chosen data infrastructure (Pennsieve web interface, Pennsieve Agent CLI, institutional cloud, etc.) per SOP-PENNSIEVE-001 or their site-specific equivalent. This keeps the tool fully static and deployable as a plain web URL with no backend.

The audit log (JSON + CSV) auto-downloads alongside the BIDS ZIP so sites have an ALCOA+-compliant record regardless of which upload method they use.

---

## File Handling

### Reading files from the user's computer

Use the **File System Access API** (Chrome/Edge) for directory picking with write support, with a fallback to `<input type="file" webkitdirectory>` for Firefox/Safari.

### Streaming large files

**Never** load a whole imaging file into memory:

```typescript
// ❌ WRONG — will crash the tab on multi-GB files
const bytes = await file.arrayBuffer();

// ✅ CORRECT — read in chunks
const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
  const chunk = file.slice(offset, offset + CHUNK_SIZE);
  const bytes = await chunk.arrayBuffer();
  // upload this chunk, then release
}
```

### Header-only reads

For modality detection and validation, we only need the file header (first few KB). Use `file.slice(0, 4096)` or similar — never read the whole file for detection.

---

## State Management

Start simple. React Context + reducers for the wizard state (current step, parsed files, user corrections, validation results).

Reach for Zustand only if context performance becomes an issue (which is unlikely for this app's scale).

No Redux. No MobX. Not needed.

---

## Validation Architecture

Validation runs in stages, each producing errors and warnings:

1. **Structural** — BIDS compliance (via `bids-validator`)
2. **Metadata** — required fields per governance framework
3. **Content sanity** — NIfTI headers parse, dimensions reasonable
4. **PHI scan** — filename patterns
5. **Cross-batch** — session consistency, subject ID uniqueness

Each stage returns a typed result:

```typescript
interface ValidationResult {
  stage: 'structural' | 'metadata' | 'content' | 'phi' | 'cross-batch';
  severity: 'error' | 'warning';
  message: string;
  affectedFile?: string;
  affectedField?: string;
  fixAction?: FixActionRef; // link to the UI control that fixes this
}
```

The UI groups results by severity and provides jump-to-fix links for errors.

---

## Audit Log

Implemented as an append-only array in session state. Each entry:

```typescript
interface AuditEntry {
  id: string;            // UUID v4
  timestamp: string;     // ISO 8601 with ms
  user: string;          // 'user' | 'system' -- the tool has no login/user-management system
  action: AuditAction;   // typed enum of tracked actions
  payload: unknown;      // action-specific details
  sessionId: string;     // groups entries from one upload session
}
```

Exported as JSON + CSV at end of session for the site to retain per their records-management policy.

---

## Deployment

- **Frontend:** Static build, auto-deployed from `main` branch (currently Vercel; AWS relaunch planned -- see the phase roadmap notes for status).
- **CI:** GitHub Actions for lint + test on every PR.

---

## Open Questions

1. What's the right institution prefix source: config file committed to repo, admin UI, or derived from workspace name?
2. How do sites handle the mapping file (their BIDS subject ID vs. internal MRN)? The tool doesn't see it, but we should document the recommended workflow.
3. iEEG validation: is the `ieeg-BIDS` extension stable enough to rely on?
4. Versioning: when the governance framework updates (e.g., new required metadata field), how does the deployed tool get updated without breaking in-progress uploads at sites?
