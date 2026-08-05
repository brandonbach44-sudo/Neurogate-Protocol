#!/usr/bin/env node
/**
 * Bundles the NeuroGate CLI (src/cli/index.ts, TypeScript + ESM + a
 * multi-file internal import graph reaching into src/lib and src/types)
 * into a single dependency-free CommonJS file, dist-cli/cli.cjs.
 *
 * This is step 1 of 2 for producing a standalone `neurogate` binary
 * (see build-cli-sea.mjs for step 2, the actual Node "single executable
 * application" packaging). Node's SEA feature requires ONE JS file with
 * no external module resolution at runtime -- it can't `require()` or
 * dynamically `import()` project files off disk once injected into a
 * binary, so everything has to be flattened first. That's exactly what
 * esbuild's bundler does here.
 *
 * Node built-ins (fs, path, node:child_process, etc.) are left as
 * `require()` calls rather than bundled -- esbuild does this
 * automatically for platform: 'node', and it's correct: those modules
 * are provided by the Node runtime the SEA blob gets injected into, not
 * something we need to (or safely could) bundle ourselves.
 *
 * The CLI has two `await import(...)` calls in index.ts (a quick
 * pre-scan pass before the main pipeline run) -- both are static string
 * literals, so esbuild resolves and inlines them into this same single
 * output file rather than treating them as real runtime code-splitting
 * (which only applies to multi-entry ESM builds, not this single-file
 * CJS bundle).
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function main() {
  const result = await build({
    entryPoints: [join(ROOT, 'src', 'cli', 'index.ts')],
    outfile: join(ROOT, 'dist-cli', 'cli.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    // SEA blobs are more predictable (and errors easier to read) from
    // readable output -- this isn't a size-sensitive artifact like a
    // web bundle, it never leaves the user's disk as a download of its
    // own (it's embedded in a Node binary), so there's no reason to
    // minify.
    minify: false,
    sourcemap: false,
    logLevel: 'info',
    metafile: true,
  });

  const outputs = Object.keys(result.metafile.outputs);
  console.log(`\nBundled CLI -> ${outputs.join(', ')}`);
}

main().catch((err) => {
  console.error('[cli:bundle] failed:', err);
  process.exitCode = 1;
});
