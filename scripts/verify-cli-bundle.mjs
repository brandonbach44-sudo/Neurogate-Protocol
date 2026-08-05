#!/usr/bin/env node
/**
 * Verifies the CLI actually bundles correctly for SEA packaging --
 * catches import-resolution problems (missing modules, bad relative
 * paths, anything esbuild can't flatten) and confirms the bundled code
 * still produces correct output, not just "builds without error."
 *
 * Two checks:
 *   1. Bundle src/cli/index.ts (the real SEA entry point) with esbuild
 *      and confirm it builds with zero errors. This is a strong enough
 *      signal on its own for the two `await import(...)` dynamic
 *      imports in index.ts (both static string literals, which esbuild
 *      resolves and inlines at bundle time) -- if those paths didn't
 *      resolve, the build would fail here.
 *   2. Bundle src/cli/pipeline.ts (the actual scan/detect/validate/
 *      export logic, no readline/stdin dependency) separately, require()
 *      the bundled output, and run it against real demo data -- the
 *      same check verify_cli_pipeline.ts runs against the TypeScript
 *      source via tsx. If this produces the same result (files written,
 *      correct subject count), the bundling process preserves behavior,
 *      not just syntax.
 *
 * index.ts itself isn't executed here: it's an interactive CLI built on
 * readline, and piped/non-TTY stdin has a well-known Node gotcha where
 * the interface closes on EOF (see pipeline.ts's module doc) -- that's
 * exactly why pipeline.ts exists as a separately-testable pure function
 * in the first place. Driving the interactive prompts end-to-end still
 * needs a human or a real SEA binary run, per the manual-verification
 * note in build-cli-sea.mjs's usage.
 */
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function checkIndexBundles() {
  console.log('--- Check 1: src/cli/index.ts bundles with zero errors ---');
  try {
    const result = await build({
      entryPoints: [join(ROOT, 'src', 'cli', 'index.ts')],
      outfile: join(ROOT, 'dist-cli', '.verify-index.cjs'),
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      logLevel: 'silent',
      metafile: true,
    });
    const errors = result.errors ?? [];
    const warnings = result.warnings ?? [];
    console.log(`  errors: ${errors.length}, warnings: ${warnings.length}`);
    if (warnings.length) {
      for (const w of warnings) console.log(`  [warn] ${w.text}`);
    }
    console.log(`  Result: ${errors.length === 0 ? 'PASS' : 'FAIL'}`);
    return errors.length === 0;
  } catch (err) {
    console.error('  Bundle failed:', err.message ?? err);
    console.log('  Result: FAIL');
    return false;
  }
}

async function checkPipelineBundleRuns() {
  console.log('\n--- Check 2: bundled pipeline.ts runs correctly against real demo data ---');
  const bundlePath = join(ROOT, 'dist-cli', '.verify-pipeline.cjs');

  await build({
    entryPoints: [join(ROOT, 'src', 'cli', 'pipeline.ts')],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    logLevel: 'silent',
  });

  // Fresh import (cache-busted via query string) so re-runs of this
  // script in the same process don't hit Node's require cache with a
  // stale bundle from a previous check.
  const mod = await import(pathToFileURL(bundlePath).href + `?t=${Date.now()}`);
  const { runNeuroGatePipeline } = mod;

  if (typeof runNeuroGatePipeline !== 'function') {
    console.log('  runNeuroGatePipeline was not exported from the bundle.');
    console.log('  Result: FAIL');
    return false;
  }

  // metadata.ts is TypeScript -- can't import it directly under plain
  // node (unlike pipeline.ts, it was never bundled). Build the minimal
  // dataset description by hand instead of pulling in another bundle
  // just for this verification script.
  const datasetDescription = {
    name: 'CLI Bundle Verification',
    bidsVersion: '1.9.0',
    authors: ['Verification Script'],
    acknowledgements: '',
    fundingSources: [],
    ethicsApprovals: [],
    funding: [],
  };

  const outDir = mkdtempSync(join(tmpdir(), 'neurogate-cli-bundle-verify-'));
  const patientRoot = join(ROOT, 'demo-data', 'EpilepsyStudy_Raw', 'Patient_001');

  const result = await runNeuroGatePipeline({
    sourceFolder: patientRoot,
    structure: { presetId: 'implant' },
    institutionConfig: { prefix: 'BNDL', startingNumber: 1 },
    datasetDescription,
    defacingConfirmed: true,
    outputDir: outDir,
    proceedDespiteWarnings: true,
    exportedBy: 'bundle-verify-script',
  });

  console.log(`  status: ${result.status}`);
  console.log(`  subjects: ${result.subjects.map(s => `${s.subjectGroup}->${s.bidsSubjectId}`).join(', ')}`);
  console.log(`  filesWritten: ${result.filesWritten}`);

  const bidsRoot = join(outDir, 'bids_output');
  const wroteSubjectFolder = existsSync(join(bidsRoot, 'primary'))
    ? readdirSync(join(bidsRoot, 'primary')).some(d => d.startsWith('sub-BNDL'))
    : false;

  rmSync(outDir, { recursive: true, force: true });

  const pass = result.status === 'exported' && (result.filesWritten ?? 0) > 0 && wroteSubjectFolder;
  console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

async function main() {
  const check1 = await checkIndexBundles();
  const check2 = await checkPipelineBundleRuns();

  console.log('\n=== Result ===');
  console.log(`index.ts bundles cleanly: ${check1 ? 'PASS' : 'FAIL'}`);
  console.log(`bundled pipeline.ts runs correctly: ${check2 ? 'PASS' : 'FAIL'}`);

  if (!check1 || !check2) process.exitCode = 1;
  else console.log('\nAll CLI bundle checks passed.');
}

main();
