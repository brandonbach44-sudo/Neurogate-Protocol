/**
 * NeuroGate Run Pipeline
 *
 * Pure, non-interactive core of the CLI: given a fully-resolved set of
 * options (source folder, structure, institution config, dataset
 * description, defacing confirmation, output folder), runs the exact
 * scan -> detect -> validate -> export sequence and returns a result.
 * No prompts, no stdin/stdout I/O beyond an optional onLog callback.
 *
 * Split out from index.ts (the interactive prompt flow) for two
 * reasons:
 *   1. Testability -- Node's readline/promises has a well-known gotcha
 *      where a piped/non-TTY stdin closes the interface as soon as the
 *      input stream ends, which breaks scripted end-to-end tests that
 *      try to drive the interactive prompts directly. This function has
 *      no stdin dependency at all, so it can be called directly from a
 *      verification script with literal option values.
 *   2. Reuse -- the future Electron desktop app (Phase 4/6 Revision,
 *      Step 3) will gather the same options through GUI forms instead of
 *      terminal prompts, then can call this exact same function rather
 *      than re-implementing the scan/detect/validate/export sequence a
 *      third time.
 *
 * NODE-ONLY.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { scanDirectory } from '../lib/adapters/scanDirectory';
import { writeFileEntriesToDisk } from '../lib/adapters/nodeExportWriter';
import { buildFileEntries, type DeidentificationSummary } from '../lib/bids/exporter';
import { runDetection, generateSummary, readJsonSidecars, readEdfHeaders } from '../lib/detection';
import { runValidation } from '../lib/validation';
import { createEmptyReport, type ValidationReport } from '../types/validation';
import { generateSubjectDateShifts } from '../lib/deidentify/edfDeidentifier';
import { autoFillFromDroppedFiles } from '../lib/metadata';
import { createAuditLogger } from '../lib/audit/auditLogger';
import { exportAsJson } from '../lib/audit/auditExporter';
import { createDefaultAttestation } from '../types/metadata';
import type { SubjectMetadata, DatasetDescription, InstitutionConfig } from '../types/metadata';
import { resolveSessionIds } from '../types/sessionStructure';
import type { DatasetStructure } from '../types/sessionStructure';
import type { DetectionSummary } from '../types/detection';
import type { ScannedFile } from '../types/files';

export interface NeuroGateRunOptions {
  sourceFolder: string;
  structure: DatasetStructure;
  institutionConfig: InstitutionConfig;
  datasetDescription: DatasetDescription;
  /** Whether the user attested that structural MRIs are already defaced. Ignored if the dataset has no structural MRI. */
  defacingConfirmed: boolean;
  outputDir: string;
  /**
   * If validation passes with warnings but no errors, this decides
   * whether to proceed. Errors always block regardless of this value.
   * The interactive CLI resolves this by asking the user; a scripted
   * caller (verification, future automation) passes it directly.
   */
  proceedDespiteWarnings: boolean;
  exportedBy: string;
}

export type NeuroGateRunStatus =
  | 'no-files'
  | 'no-subjects'
  | 'blocked-by-errors'
  | 'cancelled-warnings'
  | 'exported';

export interface NeuroGateRunResult {
  status: NeuroGateRunStatus;
  scanned: ScannedFile[];
  summary: DetectionSummary;
  subjects: SubjectMetadata[];
  validationReport: ValidationReport;
  filesWritten?: number;
  /**
   * Subjects held back from this export because they had blocking errors of
   * their own. Everything else was written. Empty on a fully clean run.
   * See the per-subject resilience note in runNeuroGatePipeline.
   */
  heldBackSubjects?: string[];
  deidentificationSummary?: DeidentificationSummary;
  auditPath?: string;
}

export interface PipelineHooks {
  onLog?: (message: string) => void;
  onWriteProgress?: (current: number, total: number, path: string) => void;
}

export async function runNeuroGatePipeline(
  options: NeuroGateRunOptions,
  hooks: PipelineHooks = {},
): Promise<NeuroGateRunResult> {
  const log = hooks.onLog ?? (() => {});
  const audit = createAuditLogger();

  log(`Scanning ${options.sourceFolder} ...`);
  const scanned = await scanDirectory(options.sourceFolder);
  const totalSize = scanned.reduce((sum, f) => sum + f.size, 0);
  audit.logFilesScanned(scanned.length, totalSize);

  if (scanned.length === 0) {
    return {
      status: 'no-files',
      scanned,
      summary: emptySummary(),
      subjects: [],
      validationReport: createEmptyReport(),
    };
  }

  audit.logStructureSelected(
    options.structure.presetId,
    resolveSessionIds(options.structure).length,
    resolveSessionIds(options.structure),
  );

  log('Running detection...');
  const sidecarMap = await readJsonSidecars(scanned);
  const edfHeaderMap = await readEdfHeaders(scanned);
  const detectionResults = runDetection(scanned, sidecarMap, edfHeaderMap, options.structure);
  const summary = generateSummary(detectionResults, options.structure);

  audit.logDetectionCompleted(
    summary.totalFiles,
    summary.highConfidence,
    summary.mediumConfidence,
    summary.lowConfidence,
    summary.unclassified,
    summary.subjectGroups,
  );

  if (summary.subjectGroups.length === 0) {
    return {
      status: 'no-subjects',
      scanned,
      summary,
      subjects: [],
      validationReport: createEmptyReport(),
    };
  }

  // ── Subjects (auto-generated BIDS IDs + auto-filled session metadata) ──
  const subjectFilesByGroup = new Map<string, ScannedFile[]>();
  for (const r of detectionResults) {
    const list = subjectFilesByGroup.get(r.subjectGroup) ?? [];
    const sf = scanned.find(s => s.relativePath === r.relativePath);
    if (sf) list.push(sf);
    subjectFilesByGroup.set(r.subjectGroup, list);
  }
  const sessionOrder = resolveSessionIds(options.structure);
  const autoFilled = await autoFillFromDroppedFiles(scanned, subjectFilesByGroup);

  const subjects: SubjectMetadata[] = summary.subjectGroups.map((group, i) => {
    const paddedNum = String(options.institutionConfig.startingNumber + i).padStart(3, '0');
    const bidsSubjectId = `sub-${options.institutionConfig.prefix}${paddedNum}`;
    const autoSessions = autoFilled.sessionsBySubject.get(group);
    const sessions = sessionOrder.map(sessionId => {
      const auto = autoSessions?.find(s => s.sessionId === sessionId);
      return {
        sessionId: sessionId as SubjectMetadata['sessions'][number]['sessionId'],
        acqTime: auto?.acqTime || '',
        age: auto?.age || '',
      };
    });
    return { subjectGroup: group, bidsSubjectId, sessions };
  });

  audit.logInstitutionConfigured(options.institutionConfig.prefix, options.institutionConfig.startingNumber);
  for (const s of subjects) audit.logSubjectMetadataEntered(s.bidsSubjectId, s.sessions.length);
  audit.logDatasetDescriptionEntered(
    options.datasetDescription.name,
    options.datasetDescription.authors.filter(a => a.trim()).length,
  );

  const defacingAttestation = createDefaultAttestation();
  defacingAttestation.confirmed = options.defacingConfirmed;
  defacingAttestation.timestamp = options.defacingConfirmed ? new Date().toISOString() : null;
  if (options.defacingConfirmed) audit.logDefacingAttested();

  log('Running validation...');
  const validationReport = await runValidation({
    detectionResults,
    subjects,
    datasetDescription: options.datasetDescription,
    defacingAttestation,
    institutionConfig: options.institutionConfig,
    structure: options.structure,
  });
  audit.logValidationRun(
    validationReport.issues.filter(i => i.severity === 'error').length,
    validationReport.issues.filter(i => i.severity === 'warning').length,
    validationReport.issues.filter(i => i.severity === 'info').length,
    validationReport.passed,
  );

  // ── Per-subject resilience ──────────────────────────────────────
  // A cohort rarely fails as a whole. One subject with a problem used to
  // block the entire run: pointing this at Phase2_MRI_OrthoControls
  // discarded 01_1522's 61 correctly-organized files because two OTHER
  // subjects in the folder had a single visit against two declared
  // timepoints. Nothing was wrong with 01_1522.
  //
  // So errors are attributed to the subject they belong to, that subject is
  // held back, and the rest export. Only a run where NO subject is clean
  // is blocked outright. Held-back subjects are reported by name with
  // their reasons, so the operator sees exactly what needs attention
  // instead of a whole cohort failing anonymously.
  //
  // An error carrying no subjectGroup is dataset-wide (bad metadata, a
  // missing attestation) and cannot be isolated, so it still blocks
  // everything -- attributing it to nobody and exporting anyway would ship
  // a dataset with a known global defect.
  const errorIssues = validationReport.issues.filter(i => i.severity === 'error');
  const datasetWideErrors = errorIssues.filter(i => !i.subjectGroup);
  if (datasetWideErrors.length > 0) {
    return { status: 'blocked-by-errors', scanned, summary, subjects, validationReport };
  }

  const blockedGroups = new Set(
    errorIssues.map(i => i.subjectGroup).filter((g): g is string => Boolean(g)),
  );
  const exportableSubjects = subjects.filter(s => !blockedGroups.has(s.subjectGroup));

  if (blockedGroups.size > 0 && exportableSubjects.length === 0) {
    return { status: 'blocked-by-errors', scanned, summary, subjects, validationReport };
  }

  const hasWarnings = validationReport.issues.some(i => i.severity === 'warning');
  if (hasWarnings && !options.proceedDespiteWarnings) {
    return { status: 'cancelled-warnings', scanned, summary, subjects, validationReport };
  }

  // ── Export ──────────────────────────────────────────────────────
  await mkdir(options.outputDir, { recursive: true });

  if (blockedGroups.size > 0) {
    log(`Holding back ${blockedGroups.size} subject(s) with blocking errors: ${[...blockedGroups].join(', ')}`);
    log(`Exporting the remaining ${exportableSubjects.length}.`);
  }

  const dateShifts = generateSubjectDateShifts(summary.subjectGroups);
  // Infinity: no browser-memory cap on the CLI export path -- see
  // buildFileEntries()'s largeFileThresholdBytes param.
  const entries = buildFileEntries(
    detectionResults,
    exportableSubjects,
    options.datasetDescription,
    dateShifts,
    options.structure,
    Infinity,
  );

  log(`Writing ${entries.length} files to ${options.outputDir}/bids_output ...`);
  const { summary: deidSummary, filesWritten } = await writeFileEntriesToDisk(
    entries,
    options.outputDir,
    hooks.onWriteProgress ? (p) => hooks.onWriteProgress!(p.current, p.total, p.path) : undefined,
  );
  audit.logDeidentificationSummary(deidSummary);

  const auditPath = resolve(options.outputDir, 'audit_log.json');
  await writeFile(auditPath, exportAsJson(audit, options.exportedBy), 'utf-8');
  audit.logAuditExported('JSON');

  return {
    status: 'exported',
    scanned,
    summary,
    subjects,
    heldBackSubjects: [...blockedGroups],
    validationReport,
    filesWritten,
    deidentificationSummary: deidSummary,
    auditPath,
  };
}

function emptySummary(): DetectionSummary {
  return {
    totalFiles: 0,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    unclassified: 0,
    subjectGroups: [],
    missingRequired: [],
    warnings: [],
  };
}
