#!/usr/bin/env node
/**
 * Step 2 of producing a standalone `neurogate` binary: takes the
 * flattened CJS bundle from build-cli-bundle.mjs (dist-cli/cli.cjs) and
 * uses Node's built-in Single Executable Application (SEA) feature to
 * inject it into a copy of the currently-running `node` binary,
 * producing dist-cli/neurogate(.exe) -- a real, standalone executable
 * that end users (or the Electron desktop app's future "Install CLI"
 * flow) can run with no separate Node.js install required.
 *
 * Must be run with a real Node.js binary as `process.execPath`, NOT
 * through Electron -- run this via `npm run cli:sea` from a normal
 * terminal, not `npm run electron:*`. It copies whatever binary is
 * currently executing this script, so an Electron-hosted Node would
 * produce a broken (Electron, not Node) SEA base.
 *
 * Steps, per Node's documented SEA process
 * (https://nodejs.org/api/single-executable-applications.html):
 *   1. Write a sea-config.json pointing at dist-cli/cli.cjs.
 *   2. `node --experimental-sea-config` to produce dist-cli/sea-prep.blob.
 *   3. Copy process.execPath to dist-cli/neurogate(.exe).
 *   4. (Windows/macOS only) remove the copy's code signature -- it's
 *      invalid anyway once we inject a blob into it, and since NeuroGate
 *      ships unsigned installers for v1 (see
 *      Documents/NeuroGate_Phase_Roadmap.md, "Phase 4/6 Revision" --
 *      confirmed decision, no code-signing cert budgeted yet), there's
 *      no re-signing step after this.
 *   5. `postject` to inject the blob into the copy, fusing it into a
 *      real SEA binary via the sentinel fuse string Node's SEA loader
 *      looks for at startup.
 *
 * Deliberately NOT using useSnapshot/useCodeCache in sea-config.json --
 * both are real optimizations but add Node-version-specific constraints
 * (V8 snapshots are sensitive to the exact Node/V8 build) that aren't
 * worth the risk for a v1 CLI binary. Straightforward and robust beats
 * marginally faster startup here.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, copyFileSync, writeFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { platform } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST_CLI = join(ROOT, 'dist-cli');

const BUNDLE_PATH = join(DIST_CLI, 'cli.cjs');
const SEA_CONFIG_PATH = join(DIST_CLI, 'sea-config.json');
const BLOB_PATH = join(DIST_CLI, 'sea-prep.blob');
const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const isWindows = platform() === 'win32';
const isMac = platform() === 'darwin';
const outputName = isWindows ? 'neurogate.exe' : 'neurogate';
const OUTPUT_PATH = join(DIST_CLI, outputName);

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function main() {
  if (!existsSync(BUNDLE_PATH)) {
    console.error(`[cli:sea] ${BUNDLE_PATH} not found -- run "npm run cli:bundle" first (npm run cli:sea does this automatically).`);
    process.exitCode = 1;
    return;
  }

  if (process.execPath.toLowerCase().includes('electron')) {
    console.error(
      '[cli:sea] process.execPath looks like an Electron binary, not plain Node.\n' +
      'Run this via `npm run cli:sea` from a normal terminal (not through electron:dev/electron:build).'
    );
    process.exitCode = 1;
    return;
  }

  console.log('[cli:sea] Writing sea-config.json...');
  writeFileSync(
    SEA_CONFIG_PATH,
    JSON.stringify(
      {
        main: 'dist-cli/cli.cjs',
        output: 'dist-cli/sea-prep.blob',
        disableExperimentalSEAWarning: true,
      },
      null,
      2,
    ),
  );

  console.log('[cli:sea] Generating SEA blob...');
  run(process.execPath, ['--experimental-sea-config', 'dist-cli/sea-config.json'], { cwd: ROOT });

  if (!existsSync(BLOB_PATH)) {
    console.error(`[cli:sea] Expected blob at ${BLOB_PATH} but it wasn't created.`);
    process.exitCode = 1;
    return;
  }

  console.log(`[cli:sea] Copying node binary (${process.execPath}) -> ${OUTPUT_PATH}`);
  copyFileSync(process.execPath, OUTPUT_PATH);
  if (!isWindows) chmodSync(OUTPUT_PATH, 0o755);

  if (isWindows) {
    console.log('[cli:sea] Removing code signature from the copy (signtool, best-effort)...');
    try {
      run('signtool', ['remove', '/s', OUTPUT_PATH]);
    } catch {
      console.warn('[cli:sea] signtool not found or failed -- continuing without removing signature. This is expected on machines without the Windows SDK installed, and usually fine for an unsigned v1 build.');
    }
  } else if (isMac) {
    console.log('[cli:sea] Removing code signature from the copy (codesign, best-effort)...');
    try {
      run('codesign', ['--remove-signature', OUTPUT_PATH]);
    } catch {
      console.warn('[cli:sea] codesign not found or failed -- continuing.');
    }
  }

  console.log('[cli:sea] Injecting blob with postject...');
  // Resolve postject's CLI script directly and run it with `node
  // <script>` rather than shelling out to `npx postject ...`. On
  // Windows, npx is npx.cmd (a shell shim, not a .exe), and
  // execFileSync/spawnSync without shell:true can't find it on PATH --
  // fails with ENOENT even though `npx` works fine typed directly into
  // a terminal. Resolving the real script and invoking it via
  // process.execPath sidesteps the whole npx/shell-shim problem and
  // works identically on every platform.
  const postjectCli = require.resolve('postject/dist/cli.js');
  const postjectArgs = [
    postjectCli,
    OUTPUT_PATH,
    'NODE_SEA_BLOB',
    BLOB_PATH,
    '--sentinel-fuse',
    SENTINEL_FUSE,
    '--overwrite',
  ];
  if (isMac) postjectArgs.push('--macho-segment-name', 'NODE_SEA');
  run(process.execPath, postjectArgs, { cwd: ROOT });

  if (isMac) {
    console.log('[cli:sea] Re-signing (ad-hoc) after injection, required on macOS...');
    try {
      run('codesign', ['--sign', '-', OUTPUT_PATH]);
    } catch {
      console.warn('[cli:sea] ad-hoc codesign failed -- the binary may not run on macOS without it. Install Xcode command line tools and re-run.');
    }
  }

  console.log(`\n[cli:sea] Done: ${OUTPUT_PATH}`);
  console.log(`Try it: ${isWindows ? OUTPUT_PATH : `./${outputName}`} <path-to-a-folder>`);
}

main();
