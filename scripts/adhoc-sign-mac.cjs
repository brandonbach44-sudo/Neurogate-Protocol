/**
 * electron-builder afterPack hook (see "afterPack" in package.json's
 * "build" config): ad-hoc signs the whole macOS .app bundle before the
 * dmg/zip targets are built from it.
 *
 * Why: with "identity": null (no Developer ID certificate yet -- see
 * "Code signing" in neurogate_deployment_workflow.md), electron-builder
 * skips signing entirely, leaving only the linker's signature
 * on the main executable and none over the bundle's resources. Once a
 * browser quarantines that download, Gatekeeper reports the app as
 * "damaged and can't be opened" with no way past it short of running
 * `xattr -cr` in Terminal. A full ad-hoc signature (`codesign --sign -`,
 * free, identifies no developer) turns that into the ordinary
 * "unidentified developer" block, which users can clear once via
 * System Settings -> Privacy & Security -> Open Anyway.
 *
 * Ad-hoc signing does NOT make in-place auto-update work on macOS --
 * Squirrel.Mac requires the new build to match the installed build's
 * Developer ID. That's why initAutoUpdater() in electron/main.cjs sends
 * macOS users to the release page instead of downloading.
 *
 * Plain CommonJS for the same reason as electron/main.cjs: the repo
 * root is "type": "module", and electron-builder require()s this file.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adhocSignMac(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`[adhoc-sign] ad-hoc signing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
};
