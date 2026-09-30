#!/usr/bin/env node
/**
 * Bundles src/lib/adapters/desktopExport.ts (TypeScript, reaching into
 * src/lib for the Node export writer and de-identifiers) into a single
 * CommonJS file, electron/desktop-export.cjs, that electron/main.cjs can
 * require(). Same approach as build-cli-bundle.mjs, for the same reason:
 * the main process is plain .cjs with no TypeScript build step.
 *
 * Must run before any Electron launch or package (electron:dev,
 * electron:dev:fast, electron:build, and the release workflow).
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

build({
  entryPoints: [join(ROOT, 'src', 'lib', 'adapters', 'desktopExport.ts')],
  outfile: join(ROOT, 'electron', 'desktop-export.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  minify: false,
  sourcemap: false,
  logLevel: 'info',
}).catch((err) => {
  console.error('[desktop:bundle] failed:', err);
  process.exitCode = 1;
});
