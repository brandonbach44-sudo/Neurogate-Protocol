/**
 * Consistency checks: files that have to agree with each other.
 *
 *   1. channels.tsv against electrodes.tsv: every electrode channel
 *      (iEEG: SEEG, ECOG, DBS; scalp EEG: EEG) should name a contact in the
 *      electrodes table beside it. Analysis tools match them by exact name,
 *      so "LA01" against "LA1" breaks localization.
 *   2. Persyst pairs: a .dat needs its .lay (and the reverse) to be read.
 *   3. A dropped sessions.tsv against the sessions that have files: rows
 *      that match no session, sessions listed with no files, and sessions
 *      with files that the table doesn't list (their date isn't filled
 *      from it).
 *
 * All are warnings or info, and can be dismissed: each can be deliberate
 * (unused contacts, a session not shared), but each is worth a look.
 */

import type { DetectionResult } from '../../types/detection';
import { getEffectiveModality, getEffectiveSession, getEffectiveSubjectGroup } from '../../types/detection';
import type { ValidationIssue } from '../../types/validation';
import type { DatasetStructure } from '../../types/sessionStructure';
import { createDefaultDatasetStructure, resolveSessionIds } from '../../types/sessionStructure';
import { isExportedPath } from '../bids/bidsNaming';
import { resolveSessionLabel, SESSION_ID_COLUMNS } from '../metadata/tsvReader';
import { readTableRows } from '../bids/delimitedText';

let counter = 0;
const nextId = () => `cons-${++counter}`;

/** Names listed in an issue, before "and N more". */
const LIST_LIMIT = 12;

function listNames(names: string[]): string {
  const shown = names.slice(0, LIST_LIMIT).join(', ');
  return names.length > LIST_LIMIT ? `${shown} and ${names.length - LIST_LIMIT} more` : shown;
}

interface Table { header: string[]; rows: string[][] }

async function readTable(result: DetectionResult): Promise<Table | null> {
  let text: string;
  try {
    text = await result.file.text();
  } catch {
    return null;
  }
  const rows = readTableRows(text, result.fileName);
  if (rows.length === 0) return null;
  return { header: rows[0].map(h => h.toLowerCase()), rows: rows.slice(1) };
}

function column(table: Table, ...names: string[]): number {
  for (const n of names) {
    const i = table.header.indexOf(n);
    if (i !== -1) return i;
  }
  return -1;
}

const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/'));

// ── 1. channels.tsv against electrodes.tsv ───────────────────────────

/** Channel types that are recorded from an electrode contact, by datatype folder. */
const ELECTRODE_TYPES: Record<string, Set<string>> = {
  ieeg: new Set(['SEEG', 'ECOG', 'DBS']),
  eeg: new Set(['EEG']),
};

/** Without a type column: names that are clearly not electrode contacts. */
const NON_ELECTRODE_NAME = /^(ecg|ekg|emg|eog|resp|trig|trigger|event|events|status|annotations?|photic|pulse|spo2|sao2|osat|dc\d*|marker\w*|ref|gnd|ground)\b/i;

async function checkChannelsAgainstElectrodes(results: DetectionResult[]): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const byFolder = new Map<string, { channels: DetectionResult[]; electrodes: DetectionResult[] }>();
  for (const r of results) {
    const m = getEffectiveModality(r);
    if ((m !== 'channels' && m !== 'electrodes') || !isExportedPath(r.bidsPath)) continue;
    const folder = folderOf(r.bidsPath);
    const entry = byFolder.get(folder) ?? { channels: [], electrodes: [] };
    entry[m].push(r);
    byFolder.set(folder, entry);
  }

  for (const [folder, { channels, electrodes }] of byFolder) {
    if (channels.length === 0 || electrodes.length === 0) continue;
    const datatype = folder.split('/').pop() ?? '';
    const types = ELECTRODE_TYPES[datatype] ?? ELECTRODE_TYPES.ieeg;

    const contacts = new Set<string>();
    for (const e of electrodes) {
      const t = await readTable(e);
      if (!t) continue;
      const nameCol = column(t, 'name');
      if (nameCol === -1) {
        issues.push({
          id: nextId(), category: 'consistency', severity: 'warning',
          title: 'electrodes.tsv has no "name" column',
          description: `${e.relativePath} has no "name" column, so its contacts can't be matched to the channels. BIDS requires the columns name, x, y, z and size.`,
          affectedFiles: [e.relativePath], subjectGroup: getEffectiveSubjectGroup(e),
          dismissable: true,
        });
        continue;
      }
      for (const row of t.rows) if (row[nameCol]) contacts.add(row[nameCol]);
    }
    if (contacts.size === 0) continue;
    const lowerContacts = new Map([...contacts].map(c => [c.toLowerCase(), c]));

    for (const c of channels) {
      const t = await readTable(c);
      if (!t) continue;
      const nameCol = column(t, 'name');
      if (nameCol === -1) continue;
      const typeCol = column(t, 'type');
      const missing: string[] = [];
      const caseOnly: string[] = [];
      for (const row of t.rows) {
        const name = row[nameCol];
        if (!name) continue;
        if (typeCol !== -1 ? !types.has((row[typeCol] ?? '').toUpperCase()) : NON_ELECTRODE_NAME.test(name)) continue;
        if (contacts.has(name)) continue;
        // A bipolar channel ("LA1-LA2") is fine when both contacts are listed.
        const parts = name.split('-').map(p => p.trim()).filter(Boolean);
        if (parts.length === 2 && parts.every(p => contacts.has(p))) continue;
        missing.push(name);
        if (lowerContacts.has(name.toLowerCase())) caseOnly.push(`${name} / ${lowerContacts.get(name.toLowerCase())}`);
      }
      if (missing.length === 0) continue;
      const electrodeFiles = electrodes.map(e => e.relativePath);
      issues.push({
        id: nextId(), category: 'consistency', severity: 'warning',
        title: `${missing.length} channel${missing.length !== 1 ? 's' : ''} with no matching electrode`,
        description:
          `${c.relativePath} lists ${missing.length} electrode channel${missing.length !== 1 ? 's' : ''} that ${missing.length !== 1 ? 'are' : 'is'} not in ${electrodeFiles.join(', ')}: ${listNames(missing)}.` +
          (caseOnly.length ? ` Some differ only in letter case: ${listNames(caseOnly)}.` : '') +
          ' Tools match channels to electrode positions by exact name, so these recordings would have no location. Fix the names in the source tables so they agree' +
          (typeCol === -1 ? ' (this table has no "type" column, so every channel except ECG, EMG, trigger and similar was checked).' : '.'),
        affectedFiles: [c.relativePath, ...electrodeFiles],
        subjectGroup: getEffectiveSubjectGroup(c),
        session: getEffectiveSession(c) ?? undefined,
        dismissable: true,
      });
    }
  }
  return issues;
}

// ── 2. Persyst .dat / .lay pairs ─────────────────────────────────────

function checkPersystPairs(results: DetectionResult[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const key = (r: DetectionResult) => r.relativePath.replace(/\.(dat|lay)$/i, '').toLowerCase();
  const dats = results.filter(r => /\.dat$/i.test(r.fileName));
  const lays = results.filter(r => /\.lay$/i.test(r.fileName));
  const datKeys = new Set(dats.map(key));
  const layKeys = new Set(lays.map(key));

  for (const d of dats) {
    if (!isExportedPath(d.bidsPath) || layKeys.has(key(d))) continue;
    issues.push({
      id: nextId(), category: 'consistency', severity: 'warning',
      title: 'Persyst .dat has no .lay file',
      description: `${d.relativePath} has no .lay file with the same name in the same folder. A Persyst recording needs both: the .lay holds the channel layout and sampling rate, so the .dat can't be read without it. Add the .lay to the source folder and start again.`,
      affectedFiles: [d.relativePath], subjectGroup: getEffectiveSubjectGroup(d),
      session: getEffectiveSession(d) ?? undefined,
      dismissable: true,
    });
  }
  for (const l of lays) {
    if (!isExportedPath(l.bidsPath) || datKeys.has(key(l))) continue;
    issues.push({
      id: nextId(), category: 'consistency', severity: 'warning',
      title: 'Persyst .lay has no .dat file',
      description: `${l.relativePath} has no .dat file with the same name in the same folder, so it describes a recording that isn't in the dataset. Add the .dat to the source folder, or remove the .lay.`,
      affectedFiles: [l.relativePath], subjectGroup: getEffectiveSubjectGroup(l),
      session: getEffectiveSession(l) ?? undefined,
      dismissable: true,
    });
  }
  return issues;
}

// ── 3. A dropped sessions.tsv against the session folders ─────────────

async function checkSessionsTables(results: DetectionResult[], structure: DatasetStructure): Promise<ValidationIssue[]> {
  if (structure.presetId === 'single-session') return [];
  const issues: ValidationIssue[] = [];
  const sessionIds = resolveSessionIds(structure);

  for (const table of results) {
    const lower = table.fileName.toLowerCase();
    if (!(lower.includes('session') && lower.endsWith('.tsv'))) continue;
    const t = await readTable(table);
    if (!t || t.rows.length === 0) continue;
    const group = getEffectiveSubjectGroup(table);
    const sesCol = column(t, ...SESSION_ID_COLUMNS);
    if (sesCol === -1) {
      issues.push({
        id: nextId(), category: 'consistency', severity: 'warning',
        title: 'sessions.tsv has no session column',
        description: `${table.relativePath} has no session_id column (or session, ses, ses_id, session_name), so none of its rows can be used. Its dates are not auto-filled.`,
        affectedFiles: [table.relativePath], subjectGroup: group, dismissable: true,
      });
      continue;
    }

    const withFiles = new Set<string>();
    for (const r of results) {
      if (getEffectiveSubjectGroup(r) !== group || !isExportedPath(r.bidsPath)) continue;
      const s = getEffectiveSession(r);
      if (s) withFiles.add(s);
    }

    const unmatched: string[] = [];
    const listed = new Set<string>();
    const listedEmpty: string[] = [];
    t.rows.forEach((row, i) => {
      const raw = row[sesCol];
      if (!raw) return;
      const id = resolveSessionLabel(raw, sessionIds);
      if (!id) { unmatched.push(`row ${i + 2}: "${raw}"`); return; }
      listed.add(id);
      if (!withFiles.has(id)) listedEmpty.push(id);
    });
    const notListed = [...withFiles].filter(s => !listed.has(s)).sort();

    if (unmatched.length) {
      issues.push({
        id: nextId(), category: 'consistency', severity: 'warning',
        title: "sessions.tsv rows don't match any session",
        description: `${table.relativePath} has ${unmatched.length} row${unmatched.length !== 1 ? 's' : ''} whose session matches none of this structure's sessions (${sessionIds.join(', ')}): ${listNames(unmatched)}. Their dates are not used. Rename the sessions in the table, or check that the right structure was chosen.`,
        affectedFiles: [table.relativePath], subjectGroup: group, dismissable: true,
      });
    }
    if (listedEmpty.length) {
      issues.push({
        id: nextId(), category: 'consistency', severity: 'info',
        title: 'sessions.tsv lists sessions with no files',
        description: `${table.relativePath} lists ${listNames(listedEmpty)}, but this subject has no exported files in ${listedEmpty.length !== 1 ? 'those sessions' : 'that session'}. If the files exist, check their session in Mapping. Sessions with no files are left out of the exported sessions.tsv.`,
        affectedFiles: [table.relativePath], subjectGroup: group, dismissable: true,
      });
    }
    if (notListed.length) {
      issues.push({
        id: nextId(), category: 'consistency', severity: 'info',
        title: "Sessions with files aren't in sessions.tsv",
        description: `This subject has files in ${listNames(notListed)}, which ${table.relativePath} doesn't list, so no date for ${notListed.length !== 1 ? 'them' : 'it'} comes from this table (a scan sidecar's AcquisitionDateTime may still fill it).`,
        affectedFiles: [table.relativePath], subjectGroup: group, dismissable: true,
      });
    }
  }
  return issues;
}

export async function checkConsistency(
  results: DetectionResult[],
  structure: DatasetStructure = createDefaultDatasetStructure(),
): Promise<ValidationIssue[]> {
  counter = 0;
  return [
    ...await checkChannelsAgainstElectrodes(results),
    ...checkPersystPairs(results),
    ...await checkSessionsTables(results, structure),
  ];
}
