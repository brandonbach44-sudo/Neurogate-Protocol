/**
 * The NeuroGate version, from package.json -- the one place a release
 * sets it (see .github/workflows/release.yml). Everything that reports a
 * version reads it from here: dataset_description.json's GeneratedBy,
 * the audit log header, and the footer.
 *
 * __APP_VERSION__ is replaced at build time: by Vite for the app
 * (vite.config.ts) and by esbuild for the CLI and desktop export bundles
 * (scripts/build-cli-bundle.mjs, scripts/build-desktop-bundle.mjs). When
 * TypeScript runs directly under tsx (tests, `npm run cli`), npm's own
 * npm_package_version is used instead.
 */
declare const __APP_VERSION__: string | undefined;

const npmVersion = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.npm_package_version;

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : (npmVersion ?? 'dev');
