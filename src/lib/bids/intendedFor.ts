/**
 * IntendedFor for field maps.
 *
 * BIDS asks each field map's sidecar to list the images it corrects
 * (IntendedFor), as paths relative to the subject folder. NeuroGate fills
 * it with every EPI image exported in the same session: the images in
 * func/, dwi/ and perf/ (single-band references included). Tools such as
 * fMRIPrep use it to decide which field map applies to which scan.
 *
 * Worked out from the export paths alone, so the browser, desktop and
 * CLI exports agree. Scanner-derived maps (derivatives/) are never
 * targets.
 *
 * Any IntendedFor already in a source sidecar is replaced (or removed
 * when there's nothing to point at): it names the original files, which
 * no longer exist after renaming and can carry original subject IDs.
 */

const EPI_FOLDERS = new Set(['func', 'dwi', 'perf']);

/** "primary/sub-X[/ses-Y]/<datatype>/<file>" split into its parts, or null. */
function splitPrimaryPath(path: string): { subjectDir: string; sessionDir: string; datatype: string; file: string } | null {
  const parts = path.split('/');
  if (parts[0] !== 'primary' || !parts[1]?.startsWith('sub-')) return null;
  const hasSession = parts[2]?.startsWith('ses-');
  const dtIndex = hasSession ? 3 : 2;
  if (parts.length !== dtIndex + 2) return null;
  return {
    subjectDir: parts.slice(0, 2).join('/'),
    sessionDir: parts.slice(0, dtIndex).join('/'),
    datatype: parts[dtIndex],
    file: parts[dtIndex + 1],
  };
}

/**
 * For every exported field-map sidecar, the IntendedFor list (possibly
 * empty), keyed by its export path. `exportedPaths` is every path the
 * export will write.
 */
export function computeIntendedFor(exportedPaths: string[]): Map<string, string[]> {
  const targetsBySession = new Map<string, string[]>();
  for (const p of exportedPaths) {
    const s = splitPrimaryPath(p);
    if (!s || !EPI_FOLDERS.has(s.datatype) || !s.file.endsWith('.nii.gz')) continue;
    const list = targetsBySession.get(s.sessionDir) ?? [];
    list.push(p.slice(s.subjectDir.length + 1));
    targetsBySession.set(s.sessionDir, list);
  }
  const out = new Map<string, string[]>();
  for (const p of exportedPaths) {
    const s = splitPrimaryPath(p);
    if (!s || s.datatype !== 'fmap' || !s.file.endsWith('.json')) continue;
    out.set(p, [...(targetsBySession.get(s.sessionDir) ?? [])].sort());
  }
  return out;
}
