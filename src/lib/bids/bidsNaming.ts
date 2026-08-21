/**
 * Canonical BIDS Naming
 *
 * Single source of truth for the BIDS filename and path of every file.
 * The detection engine, the mapping-table preview, the validator, and the
 * exporter all rely on this module, so a file's predicted name and its
 * exported name can never drift apart.
 *
 * It assigns the BIDS entities needed to keep names unique:
 *
 *  - run-<n>     when one subject, session, and modality holds more than
 *                one acquisition (for example two T2w scans, or a TOF
 *                scan plus its MIP reconstructions). Without this, every
 *                repeated scan collapses onto the same filename.
 *  - magnitude1 / magnitude2 / phasediff / phase1 / phase2
 *                for field maps, so magnitude and phase images get valid
 *                BIDS suffixes instead of a single shared "fmap" suffix.
 *
 * JSON and TSV sidecars are paired with their data file by base name and
 * inherit that file's BIDS name with a .json / .tsv extension, so the
 * scanner metadata travels with the data into the export.
 */

import type { DetectionResult, Modality, Session } from '../../types/detection';
import {
  MODALITIES,
  getEffectiveSession,
  getEffectiveModality,
  getEffectiveSubjectGroup,
} from '../../types/detection';
import type { DatasetStructure } from '../../types/sessionStructure';

/** Path marker for localizer / scout scans, which are never exported. */
export const LOCALIZER_EXCLUDED = '(excluded from export: localizer/scout)';

/** Modalities that produce a real data file in the BIDS export. */
const EXPORTABLE_MODALITIES = new Set<Modality>([
  'anat-T1w', 'anat-T2w', 'anat-FLAIR', 'anat-angio',
  'ct', 'dwi', 'perf', 'eeg', 'ieeg', 'func', 'fmap',
  'electrodes', 'channels', 'events',
]);

/** BIDS suffix for each data modality. Field maps are handled separately. */
const SUFFIX: Record<string, string> = {
  'anat-T1w': 'T1w',
  'anat-T2w': 'T2w',
  'anat-FLAIR': 'FLAIR',
  'anat-angio': 'angio',
  'ct': 'ct',
  'dwi': 'dwi',
  'perf': 'asl',
  'eeg': 'eeg',
  'ieeg': 'ieeg',
  'func': 'bold',
  'electrodes': 'electrodes',
  'channels': 'channels',
  'events': 'events',
};

/** The BIDS task entity used by recording and functional modalities. */
function taskEntity(modality: Modality): string | null {
  if (modality === 'func') return 'task-rest';
  if (modality === 'eeg' || modality === 'ieeg') return 'task-monitor';
  if (modality === 'channels' || modality === 'events') return 'task-monitor';
  return null;
}

/**
 * The export extension for a file. Uncompressed NIfTI (.nii) becomes
 * .nii.gz because the exporter gzips it. Everything else keeps its
 * original extension.
 */
function exportExtension(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.nii.gz')) return '.nii.gz';
  if (lower.endsWith('.nii')) return '.nii.gz';
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.substring(dot) : '';
}

/**
 * Base name shared by a scan and its companions. dcm2niix names a scan,
 * its JSON sidecar, and its .bval / .bvec identically apart from the
 * extension, so stripping the extension yields the join key.
 * Mirrors getSidecarBaseName() in lib/detection/sidecarReader.ts.
 */
function baseName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.nii.gz')) return fileName.slice(0, -7);
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.substring(0, dot) : fileName;
}

/** Strip a data-file extension from an already-built BIDS filename. */
function stripExtension(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.nii.gz')) return name.slice(0, -7);
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.substring(0, dot) : name;
}

/** Add the sub- prefix if the id does not already carry it. */
function subjectPrefix(id: string): string {
  return id.startsWith('sub-') ? id : `sub-${id}`;
}

// ── Field-map image classification ────────────────────────────────

interface FmapAcquisition {
  /** The acquisition's base name. */
  base: string;
  /** Echo number if the file name carries one (for example _e2), else null. */
  echo: number | null;
}

/**
 * Classify a field-map file from its name. dcm2niix appends _e<n> for the
 * echo and _ph for the phase image, so a Siemens gradient-echo field map
 * arrives as _e1 (magnitude), _e2 (magnitude), _e2_ph (phase).
 */
function classifyFmap(fileName: string): { type: 'magnitude' | 'phase'; echo: number | null } {
  const stem = baseName(fileName).toLowerCase();
  const echoMatch = stem.match(/_e(\d+)/);
  const echo = echoMatch ? parseInt(echoMatch[1], 10) : null;
  const isPhase =
    /_ph(?:[._]|$)/.test(stem) || /phase/.test(stem) || /phasediff/.test(stem);
  return { type: isPhase ? 'phase' : 'magnitude', echo };
}

function byEcho(a: FmapAcquisition, b: FmapAcquisition): number {
  return (a.echo ?? 99) - (b.echo ?? 99) || a.base.localeCompare(b.base);
}

// ── Entity assignment ─────────────────────────────────────────────

/**
 * Assign run / field-map suffix entities to one subject + session +
 * modality group. All files sharing a base name are one acquisition and
 * get the same entity, so a scan's .nii, .bval, and .bvec stay together.
 */
function assignGroupEntities(
  results: DetectionResult[],
  indices: number[],
  runOf: Map<number, number>,
  fmapSuffixOf: Map<number, string>,
): void {
  const modality = getEffectiveModality(results[indices[0]]);

  // distinct acquisitions, keyed by base name, in a stable order
  const baseToIndices = new Map<string, number[]>();
  for (const i of indices) {
    const b = baseName(results[i].fileName);
    const list = baseToIndices.get(b);
    if (list) list.push(i);
    else baseToIndices.set(b, [i]);
  }
  const bases = [...baseToIndices.keys()].sort();

  if (modality === 'fmap') {
    assignFmapEntities(results, baseToIndices, bases, runOf, fmapSuffixOf);
    return;
  }

  // Every other modality: number the acquisitions when there is more
  // than one. A single acquisition needs no run entity.
  if (bases.length > 1) {
    bases.forEach((b, idx) => {
      for (const i of baseToIndices.get(b)!) runOf.set(i, idx + 1);
    });
  }
}

/**
 * Assign BIDS field-map suffixes within one field-map group. Magnitude
 * images become magnitude1 / magnitude2, a single phase image becomes
 * phasediff, and multiple phase images become phase1 / phase2. If two
 * acquisitions still land on the same suffix, a run entity is added.
 */
function assignFmapEntities(
  results: DetectionResult[],
  baseToIndices: Map<string, number[]>,
  bases: string[],
  runOf: Map<number, number>,
  fmapSuffixOf: Map<number, string>,
): void {
  const mags: FmapAcquisition[] = [];
  const phases: FmapAcquisition[] = [];
  for (const b of bases) {
    const sample = results[baseToIndices.get(b)![0]];
    const info = classifyFmap(sample.fileName);
    if (info.type === 'phase') phases.push({ base: b, echo: info.echo });
    else mags.push({ base: b, echo: info.echo });
  }
  mags.sort(byEcho);
  phases.sort(byEcho);

  // Suffixes are assigned per ACQUISITION SERIES, not across the whole
  // subject+session field-map group.
  //
  // A Siemens gradient-echo field map is one series emitting three files
  // (_e1, _e2, _e2_ph) that together form a valid BIDS set: magnitude1 +
  // magnitude2 + phasediff. A session routinely holds more than one such
  // series -- "gre_field_mapping" and "gre_field_mappingRS" (a
  // resting-state-specific map) both appear in the Phase2_MRI corpus.
  //
  // Pooling every phase image in the session made phases.length 2, which
  // took the phase1/phase2 branch, and since both phase files carry echo
  // 2 both were named "phase2" and separated only by a run- entity. The
  // result was magnitude1 + magnitude2 + phase2 per series, which is not
  // one of the two combinations BIDS accepts for a field map (either
  // phasediff with magnitude1[+magnitude2], or phase1 + phase2 with both
  // magnitudes). Splitting by series restores phasediff.
  //
  // This path had no coverage before: the field-map regex never matched
  // "gre_field_mapping", so no real field map ever reached this function
  // and the demo dataset contains none. Surfaced 2026-08-17 once the
  // regex was fixed.
  const seriesOf = (base: string): string =>
    base.replace(/_e\d+(_ph)?$/i, '').replace(/_ph$/i, '');

  const seriesNames = [...new Set(bases.map(seriesOf))].sort();

  const suffixForBase = new Map<string, string>();
  for (const series of seriesNames) {
    const seriesMags = mags.filter(m => seriesOf(m.base) === series);
    const seriesPhases = phases.filter(p => seriesOf(p.base) === series);

    seriesMags.forEach((m, idx) => {
      suffixForBase.set(m.base, `magnitude${m.echo ?? idx + 1}`);
    });
    if (seriesPhases.length === 1) {
      suffixForBase.set(seriesPhases[0].base, 'phasediff');
    } else {
      seriesPhases.forEach((p, idx) => {
        suffixForBase.set(p.base, `phase${p.echo ?? idx + 1}`);
      });
    }
  }

  // Two distinct series in one session would otherwise collide on
  // identical suffixes; give each series its own run- so the sets stay
  // separable. The collision pass below handles any residue.
  if (seriesNames.length > 1) {
    seriesNames.forEach((series, idx) => {
      for (const b of bases) {
        if (seriesOf(b) === series) {
          for (const i of baseToIndices.get(b)!) runOf.set(i, idx + 1);
        }
      }
    });
  }

  // If two acquisitions still share a suffix, disambiguate with run-.
  const basesBySuffix = new Map<string, string[]>();
  for (const b of bases) {
    const s = suffixForBase.get(b)!;
    const list = basesBySuffix.get(s);
    if (list) list.push(b);
    else basesBySuffix.set(s, [b]);
  }
  for (const colliding of basesBySuffix.values()) {
    if (colliding.length > 1) {
      colliding.sort();
      colliding.forEach((b, idx) => {
        for (const i of baseToIndices.get(b)!) runOf.set(i, idx + 1);
      });
    }
  }

  for (const b of bases) {
    for (const i of baseToIndices.get(b)!) {
      fmapSuffixOf.set(i, suffixForBase.get(b)!);
    }
  }
}

// ── Filename assembly ─────────────────────────────────────────────

/**
 * Build a BIDS filename from its parts. Entity order follows the BIDS
 * spec: sub, ses, task, run, suffix.
 *
 * session is nullable for the Single session preset (Phase 2, August
 * 2026): per the actual BIDS spec, the session level is optional, and a
 * dataset with only one timepoint per subject conventionally omits ses-
 * entirely rather than inventing a meaningless placeholder session id.
 * When null, the ses- entity is simply left out of both the filename and
 * the folder path below.
 */
function buildFilename(
  sub: string,
  session: Session | null,
  modality: Modality,
  originalFileName: string,
  run: number | undefined,
  fmapSuffix: string | undefined,
): string {
  const parts: string[] = session ? [sub, session] : [sub];
  const task = taskEntity(modality);
  if (task) parts.push(task);
  if (run !== undefined) parts.push(`run-${run}`);

  const suffix = fmapSuffix ?? SUFFIX[modality] ?? modality;

  // electrodes / channels / events are always .tsv tables
  if (modality === 'electrodes' || modality === 'channels' || modality === 'events') {
    return `${parts.join('_')}_${suffix}.tsv`;
  }
  return `${parts.join('_')}_${suffix}${exportExtension(originalFileName)}`;
}

/**
 * Find the data file a sidecar belongs to: same base name, a real data
 * modality, and an actual export path. The primary image (.nii / .nii.gz)
 * is preferred over companion files such as .bval.
 */
function findSidecarPartner(
  results: DetectionResult[],
  sidecarIndex: number,
): DetectionResult | null {
  const base = baseName(results[sidecarIndex].fileName);
  // We accept partners whose own path is excluded (for example a
  // localizer). The caller checks the partner's path before deciding
  // whether to mirror it; either way the sidecar inherits the
  // partner's session, so the mapping table never shows a blank
  // dropdown for a paired sidecar.
  const candidates = results.filter((d, di) => {
    if (di === sidecarIndex) return false;
    const m = getEffectiveModality(d);
    if (m === 'sidecar-json' || m === 'sidecar-tsv') return false;
    return baseName(d.fileName) === base;
  });
  if (candidates.length === 0) return null;

  const score = (name: string): number => {
    const l = name.toLowerCase();
    if (l.endsWith('.nii.gz') || l.endsWith('.nii')) return 0;
    if (l.endsWith('.edf') || l.endsWith('.bdf') || l.endsWith('.nwb')) return 1;
    return 2;
  };
  candidates.sort((a, b) => score(a.fileName) - score(b.fileName));
  return candidates[0];
}

/**
 * Safety net: never let two files share an export path. Once run and
 * field-map entities are assigned this should not fire, but it guards
 * against silent overwrites for unusual inputs.
 */
function dedupePaths(results: DetectionResult[]): void {
  const counts = new Map<string, number>();
  for (const r of results) {
    if (!r.bidsPath.startsWith('primary/')) continue;
    const n = counts.get(r.bidsPath) ?? 0;
    counts.set(r.bidsPath, n + 1);
    if (n > 0) {
      const slash = r.bidsPath.lastIndexOf('/');
      const dir = r.bidsPath.slice(0, slash + 1);
      const file = r.bidsPath.slice(slash + 1);
      const dot = file.indexOf('.');
      const stem = dot >= 0 ? file.slice(0, dot) : file;
      const ext = dot >= 0 ? file.slice(dot) : '';
      r.bidsFilename = `${stem}_dup-${n + 1}${ext}`;
      r.bidsPath = dir + r.bidsFilename;
    }
  }
}

// ── Public entry point ────────────────────────────────────────────

/**
 * Recompute the BIDS filename and path for every result, using the
 * effective (user-corrected) subject, session, and modality.
 *
 * @param results      detection results to name
 * @param subjectIdMap optional map of detected subject group to the BIDS
 *                     subject id chosen in the metadata step. When omitted
 *                     the raw detected group name is used, which is fine
 *                     for the in-tool preview and for duplicate detection.
 * @returns a new array of results with fresh bidsFilename / bidsPath.
 */
export function computeBidsNames(
  results: DetectionResult[],
  subjectIdMap?: Map<string, string>,
  structure?: DatasetStructure,
): DetectionResult[] {
  const out = results.map(r => ({ ...r }));
  const sessionless = structure?.presetId === 'single-session';

  // ── Group exportable data files by subject + session + modality ──
  // For a sessionless (Single session preset) dataset there's no session
  // component to the key -- acquisitions are still grouped and numbered
  // (run-1, run-2, ...) by subject + modality alone, same as any other
  // preset, just without a session dimension.
  const groups = new Map<string, number[]>();
  out.forEach((r, i) => {
    const modality = getEffectiveModality(r);
    const session = getEffectiveSession(r);
    if (!session && !sessionless) return;
    if (!EXPORTABLE_MODALITIES.has(modality)) return;
    const key = sessionless
      ? `${getEffectiveSubjectGroup(r)} ${modality}`
      : `${getEffectiveSubjectGroup(r)} ${session} ${modality}`;
    const list = groups.get(key);
    if (list) list.push(i);
    else groups.set(key, [i]);
  });

  const runOf = new Map<number, number>();
  const fmapSuffixOf = new Map<number, string>();
  for (const indices of groups.values()) {
    assignGroupEntities(out, indices, runOf, fmapSuffixOf);
  }

  // ── Name the data files ──────────────────────────────────────────
  out.forEach((r, i) => {
    const modality = getEffectiveModality(r);
    const session = getEffectiveSession(r);
    const group = getEffectiveSubjectGroup(r);

    if (modality === 'localizer') {
      r.bidsFilename = r.fileName;
      r.bidsPath = LOCALIZER_EXCLUDED;
      return;
    }
    if (modality === 'sidecar-json' || modality === 'sidecar-tsv') {
      return; // paired in the next pass
    }
    // A modality that came only from the blind "Defaulting ambiguous NIfTI
    // to T1w -- please verify" fallback must not be written under a
    // modality-specific BIDS name. Until this check existed, such a file
    // passed both real export gates (it has a session, and anat-T1w is
    // exportable) and was written as sub-XX_ses-YY_run-N_T1w.nii.gz --
    // 371 field-map, proton-density and diffusion scans in the Phase2_MRI
    // corpus were exported as fabricated anatomicals (audit 2026-08-17).
    // Confidence could not be used for this: nothing in the export path
    // reads it.
    //
    // r.userModality is checked directly rather than via
    // getEffectiveModality so that a user who picks a modality in the
    // mapping table clears the guess and exports normally. The goal is to
    // require a human decision, not to drop the file.
    if (r.modalityIsGuess && !r.userModality) {
      r.bidsFilename = r.fileName;
      r.bidsPath = `unclassified/${r.fileName}`;
      return;
    }
    // A null session is only a legitimate, exportable state when this
    // dataset's active preset is Single session (sessionless). For every
    // other preset it means detection genuinely failed to assign one, so
    // the file falls to unclassified/ same as before Phase 2.
    if ((!session && !sessionless) || !EXPORTABLE_MODALITIES.has(modality)) {
      r.bidsFilename = r.fileName;
      r.bidsPath = `unclassified/${r.fileName}`;
      return;
    }

    const sub = subjectPrefix(subjectIdMap?.get(group) ?? group);
    const filename = buildFilename(
      sub, session, modality, r.fileName,
      runOf.get(i), fmapSuffixOf.get(i),
    );
    const folder = MODALITIES.find(m => m.value === modality)?.bidsFolder ?? '';
    // session is null here exactly when sessionless is true (guarded
    // above), so the ses- path segment is simply omitted rather than
    // ever being an empty/undefined string.
    const sessionSegment = session ? `${session}/` : '';
    r.bidsFilename = filename;
    r.bidsPath = folder
      ? `primary/${sub}/${sessionSegment}${folder}/${filename}`
      : `primary/${sub}/${sessionSegment}${filename}`;
  });

  // ── Pair sidecars with their data file ───────────────────────────
  out.forEach((r, i) => {
    const modality = getEffectiveModality(r);
    if (modality !== 'sidecar-json' && modality !== 'sidecar-tsv') return;

    const partner = findSidecarPartner(out, i);
    if (partner) {
      const sidecarExt = modality === 'sidecar-json' ? '.json' : '.tsv';
      if (partner.bidsPath.startsWith('primary/')) {
        // Partner has a real export path; mirror it for the sidecar.
        r.bidsFilename = stripExtension(partner.bidsFilename) + sidecarExt;
        r.bidsPath = partner.bidsPath.replace(/[^/]+$/, r.bidsFilename);
      } else {
        // Partner is excluded from the export (for example a localizer
        // scan). The sidecar follows: also excluded. The session is
        // still inherited below so the mapping table has no blank
        // dropdown.
        r.bidsFilename = r.fileName;
        r.bidsPath = `unclassified/${r.fileName}`;
      }
      // Inherit the partner's effective session so the mapping table
      // shows a session for the sidecar instead of a blank dropdown.
      const partnerSession = getEffectiveSession(partner);
      if (partnerSession && !r.userSession) r.detectedSession = partnerSession;
    } else {
      r.bidsFilename = r.fileName;
      r.bidsPath = `unclassified/${r.fileName}`;
    }
  });

  dedupePaths(out);
  return out;
}
