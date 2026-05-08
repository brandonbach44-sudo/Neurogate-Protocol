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
   └─ Upload ──► [TBD: direct to Pennsieve OR via thin backend proxy]
```

## Upload Architecture — Open Question

**Status as of 2026-04-14:** Pending guidance from the Pennsieve team (meeting scheduled for week of 2026-04-14).

Pennsieve's documented upload path uses their desktop **Pennsieve Agent**. There is no officially documented browser-based upload API, and CORS support for direct browser calls is not documented. See `Pennsieve_Upload_Architecture_Options.md` in the main project folder for full discussion.

### Three options, ordered by preference

**Option A — Thin Backend Proxy (current plan)**

A minimal serverless function (Cloudflare Workers or Vercel Functions) sits between the browser and Pennsieve. The frontend is still a static web app. The backend handles the Pennsieve API calls using the official Python SDK or REST API.

- Pros: Works regardless of CORS. Uses Pennsieve's supported path. Reliable for large files.
- Cons: Adds a server component. API keys pass through the backend (requires secure handling).

**Option A-prime — Pure Client-Side (ideal if Pennsieve supports it)**

If Pennsieve confirms CORS + documented presigned-URL uploads for browsers, we skip the backend entirely.

**Option B — Desktop App (Electron / Tauri)**

Falls back on Pennsieve Agent. Breaks the "just a web URL" UX. Last resort.

**Option C — Hybrid**

Browser does prep; user runs Agent separately for upload. Splits the workflow across two tools. Also a last resort.

### Design principle

**All upload logic lives behind an abstract interface:**

```typescript
// src/lib/pennsieve/upload.ts
export interface UploadDestination {
  authenticate(apiKey: string, apiSecret: string): Promise<Session>;
  listDatasets(session: Session): Promise<Dataset[]>;
  listSubjects(session: Session, datasetId: string): Promise<string[]>;
  uploadBidsTree(session: Session, datasetId: string, tree: BidsTree, onProgress: ProgressFn): Promise<UploadResult>;
}
```

The rest of the app talks to this interface. We can ship a `MockUploadDestination` (writes JSON manifest to a download link) for development and demos, then plug in the real implementation once the Pennsieve path is settled.

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
  user: string;          // Pennsieve username
  action: AuditAction;   // typed enum of tracked actions
  payload: unknown;      // action-specific details
  sessionId: string;     // groups entries from one upload session
}
```

Exported as JSON + CSV at end of session for the site to retain per their records-management policy.

---

## Deployment

- **Frontend:** Static build → GitHub Pages or Cloudflare Pages. Auto-deploy from `main` branch.
- **Backend (if Option A):** Cloudflare Workers. Single function, <200 lines.
- **CI:** GitHub Actions for lint + test on every PR.

---

## Open Questions

1. Will Pennsieve support browser-direct uploads? (Friday meeting)
2. What's the right institution prefix source — config file committed to repo, admin UI, or derived from Pennsieve workspace name?
3. How do sites handle the mapping file (their BIDS subject ID ↔ internal MRN)? The tool doesn't see it, but we should document the recommended workflow.
4. iEEG validation — is `ieeg-BIDS` extension stable enough to rely on?
5. Versioning: when the governance framework updates (e.g., new required metadata field), how does the deployed tool get updated without breaking in-progress uploads at sites?
