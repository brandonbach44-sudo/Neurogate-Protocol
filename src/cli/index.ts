#!/usr/bin/env node
/**
 * NeuroGate CLI (interactive entry point)
 *
 * Gathers options via terminal prompts, then hands off to
 * runNeuroGatePipeline() in pipeline.ts for the actual
 * scan/detect/validate/export work -- this file's only job is turning
 * human answers into a NeuroGateRunOptions object and printing the
 * result. See pipeline.ts's module doc for why the two are split.
 *
 * Scope for this version: no interactive per-file correction (the web
 * app's mapping table has no CLI equivalent yet). If detection finds
 * unclassified files or validation reports blocking errors, the CLI
 * reports them and stops rather than guessing -- fixing generally means
 * reorganizing the source folder and re-running, or using the website
 * for cases that need per-file overrides. That's a deliberate v1
 * boundary, not an oversight. See
 * Documents/NeuroGate_Phase_Roadmap.md, "Phase 4/6 Revision," Step 2.
 *
 * NODE-ONLY.
 *
 * Usage: npx tsx src/cli/index.ts [source-folder]
 * (once packaged: neurogate [source-folder])
 */

import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { userInfo } from 'node:os';

import { runNeuroGatePipeline } from './pipeline';
import { createDefaultDatasetDescription } from '../types/metadata';
import type { DatasetDescription, InstitutionConfig } from '../types/metadata';
import {
  SESSION_PRESETS,
  buildCustomSessionLabel,
  TIMEPOINT_UNITS,
} from '../types/sessionStructure';
import type { DatasetStructure, CustomTimepoint, TimepointUnit, PresetId } from '../types/sessionStructure';
import { getEffectiveModality } from '../types/detection';
import { askText, askYesNoRequired, askNumber, askChoice, askList, closePrompts } from './prompts';

function log(msg = ''): void {
  console.log(msg);
}

/**
 * Strips a single layer of matching leading/trailing quotes (straight
 * double or single) from user-typed input. Windows Explorer's "Copy as
 * path" wraps the result in double quotes by default -- a very common
 * way users grab a folder path -- and since this is a plain readline
 * text prompt (not a shell command line), those quotes are never
 * stripped automatically the way they would be if pasted as a shell
 * argument. Without this, a pasted "C:\foo\bar" gets treated as a
 * literal string containing quote characters, which resolve() then
 * mangles into a bogus path relative to the current directory.
 */
function stripSurroundingQuotes(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

async function resolveSourceFolder(): Promise<string> {
  const argPath = process.argv[2];
  const raw = argPath ?? (await askText('Path to the folder you want to organize'));
  const abs = resolve(stripSurroundingQuotes(raw));
  const stats = await stat(abs).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new Error(`"${abs}" is not a directory that exists. Check the path and try again.`);
  }
  return abs;
}

async function chooseStructure(): Promise<DatasetStructure> {
  const presetId = await askChoice<PresetId>(
    '\nHow are this dataset\'s sessions structured?',
    SESSION_PRESETS.map(p => ({ value: p.id, label: p.label, description: p.description })),
    0,
  );

  if (presetId === 'implant' || presetId === 'single-session') {
    return { presetId } as DatasetStructure;
  }

  const count = await askNumber('How many timepoints does this study have?', 2);
  const timepoints: CustomTimepoint[] = [];
  const unitChoices = TIMEPOINT_UNITS.map(u => ({ value: u.value, label: u.label }));

  for (let i = 0; i < count; i++) {
    log(`\nTimepoint ${i + 1} of ${count}:`);
    const number = await askNumber('  Number (0 = baseline)', i);
    const unit = await askChoice<TimepointUnit>('  Unit', unitChoices, 2 /* month */);
    timepoints.push({ number, unit });
    log(`  -> ${buildCustomSessionLabel({ number, unit })}`);
  }

  return { presetId: 'custom-timepoints', timepoints };
}

async function configureInstitution(): Promise<InstitutionConfig> {
  while (true) {
    const prefix = (await askText('\nInstitution prefix (2-6 uppercase letters, e.g. PENN, HUP)')).toUpperCase();
    if (/^[A-Z]{2,6}$/.test(prefix)) {
      const startingNumber = await askNumber('Starting subject number', 1);
      return { prefix, startingNumber };
    }
    log('  Prefix must be 2-6 uppercase letters. Try again.');
  }
}

async function configureDatasetDescription(): Promise<DatasetDescription> {
  const desc = createDefaultDatasetDescription();
  desc.name = await askText('\nStudy name');
  // Required, not optional -- blank Enter used to slip through here and
  // only get caught afterward by export-blocking validation. Silently
  // re-asks (no error text) until askList returns at least one name.
  while (desc.authors.length === 0) {
    desc.authors = await askList('Author(s)');
  }
  return desc;
}

async function main(): Promise<void> {
  log('NeuroGate CLI\n');

  const sourceFolder = await resolveSourceFolder();

  log(`Scanning ${sourceFolder} for a quick look before asking questions...`);
  // A first lightweight pass just to decide which prompts to ask
  // (structural MRI -> defacing question). The pipeline itself re-scans
  // and re-detects -- fine, detection is fast, and keeping the pipeline
  // self-contained (it doesn't take pre-computed detection results as
  // input) is worth the small duplicate pass for how much simpler it
  // keeps both this file and pipeline.ts's interface.
  const structure = await chooseStructure();
  const institutionConfig = await configureInstitution();
  const datasetDescription = await configureDatasetDescription();

  // Quick detection pass just to know whether to ask about defacing.
  const { scanDirectory } = await import('../lib/adapters/scanDirectory');
  const { runDetection, readJsonSidecars, readEdfHeaders } = await import('../lib/detection');
  const scanned = await scanDirectory(sourceFolder);
  const sidecarMap = await readJsonSidecars(scanned);
  const edfHeaderMap = await readEdfHeaders(scanned);
  const preDetection = runDetection(scanned, sidecarMap, edfHeaderMap, structure);
  const hasStructuralMri = preDetection.some(r => {
    const mod = getEffectiveModality(r);
    return mod === 'anat-T1w' || mod === 'anat-T2w' || mod === 'anat-FLAIR';
  });

  let defacingConfirmed = false;
  if (hasStructuralMri) {
    // No default here on purpose -- forces an explicit y/n so this can't
    // be blown past with a blank Enter and only caught afterward by
    // export-blocking validation.
    defacingConfirmed = await askYesNoRequired(
      '\nThis dataset includes structural MRI (T1w/T2w/FLAIR). Have these already been defaced per HIPAA requirements?',
    );
  }

  const defaultOutput = resolve(sourceFolder, '..', `${institutionConfig.prefix}_bids_export`);
  const outputDir = resolve(stripSurroundingQuotes(await askText('\nOutput folder', defaultOutput)));
  const exportedBy = userInfo().username || 'cli-user';

  log('\nRunning the full pipeline...');
  const result = await runNeuroGatePipeline(
    {
      sourceFolder,
      structure,
      institutionConfig,
      datasetDescription,
      defacingConfirmed,
      outputDir,
      // Always true here, by design: warnings are non-blocking findings
      // (that's the entire distinction from errors in the validation
      // system), so the CLI prints them clearly and proceeds rather than
      // pausing for a second confirmation -- consistent with how most
      // CLI tools treat warnings vs. errors. Getting a mid-run
      // yes/no here would also require running validation twice (once
      // to learn about warnings, once to actually export), which
      // pipeline.ts's single-pass design deliberately avoids. Errors
      // still hard-block regardless of this value.
      proceedDespiteWarnings: true,
      exportedBy,
    },
    { onLog: log, onWriteProgress: (current, total, path) => {
      if (current === total || current % 10 === 0) {
        // \x1b[K clears from the cursor to the end of the line before
        // writing -- without it, a shorter line (e.g. a later file with
        // a shorter name) leaves trailing characters from the previous,
        // longer line still visible, which looks exactly like a
        // corrupted double-extension filename. Found by inspection of a
        // real run against demo-data (a raw \r without clearing left
        // "...eeg.edf" and "...eeg.nwb" visually concatenated). Confirmed
        // via a direct computeBidsNames() check that no such filename is
        // ever actually produced -- this was a terminal rendering bug,
        // not a naming bug.
        process.stdout.write(`\r\x1b[K  [${current}/${total}] ${path}`);
        if (current === total) process.stdout.write('\n');
      }
    } },
  );

  printSummary(result);

  if (result.status === 'blocked-by-errors') {
    const errors = result.validationReport.issues.filter(i => i.severity === 'error');
    log(`\nValidation found ${errors.length} error(s) that block export:`);
    for (const e of errors) log(`  [ERROR] ${e.title}: ${e.description}`);
    log('\nFix the issues above (reorganize the source folder, or use the website for per-file corrections) and re-run. No files were written.');
    closePrompts();
    process.exitCode = 1;
    return;
  }

  if (result.status === 'exported') {
    const warnings = result.validationReport.issues.filter(i => i.severity === 'warning');
    if (warnings.length > 0) {
      log(`\nExported with ${warnings.length} warning(s):`);
      for (const w of warnings) log(`  [WARN] ${w.title}: ${w.description}`);
    }
    log(`\nWrote ${result.filesWritten} files to ${outputDir}/bids_output`);
    log(`Audit log: ${result.auditPath}`);
    log('\nDone.');
  }

  closePrompts();
}

function printSummary(result: Awaited<ReturnType<typeof runNeuroGatePipeline>>): void {
  if (result.status === 'no-files') {
    log('\nNothing to organize -- the folder is empty.');
    return;
  }
  if (result.status === 'no-subjects') {
    log('\nNo subjects were detected -- nothing to export. Check the folder structure and try again.');
    return;
  }

  const { summary } = result;
  log(`\nDetection summary:`);
  log(`  ${summary.highConfidence} high confidence, ${summary.mediumConfidence} medium, ${summary.lowConfidence} low, ${summary.unclassified} unclassified`);
  log(`  Subjects detected: ${summary.subjectGroups.join(', ') || '(none)'}`);
  if (summary.warnings.length > 0) {
    log(`  Warnings:`);
    for (const w of summary.warnings) log(`    - ${w}`);
  }
  if (summary.missingRequired.length > 0) {
    log(`  Missing required files:`);
    for (const m of summary.missingRequired) log(`    - ${m}`);
  }
  for (const s of result.subjects) {
    log(`  ${s.subjectGroup} -> ${s.bidsSubjectId}`);
  }
}

main().catch((err) => {
  console.error('\nCLI failed:', err instanceof Error ? err.message : err);
  closePrompts();
  process.exitCode = 1;
});
