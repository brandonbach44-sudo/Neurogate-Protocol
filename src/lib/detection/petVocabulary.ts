/**
 * PET vocabulary, shared by every layer that needs to recognize PET.
 *
 * PET arrives as NIfTI converted by dcm2niix (or PET2BIDS's
 * dcm2niix4pet, which wraps it). Two kinds of evidence identify it:
 *
 *   1. The JSON sidecar (strongest). dcm2niix writes "Modality": "PT" for
 *      every PET series, plus PET-only fields such as TracerName,
 *      TracerRadionuclide and InjectedRadioactivity -- see
 *      sidecarReader.ts. That is read structurally in engine.ts, not here.
 *   2. Names (this file). Scan, file and folder names carry "PET", the
 *      tracer ("FDG", "PiB", "AV45"), or a BIDS "_pet" / "trc-" entity.
 *      The patterns run on text already passed through
 *      normalizeForKeywords() (filenameDetector.ts), so separators are
 *      hyphens and \b word boundaries split tokens.
 *
 * FDG is by far the most common tracer in epilepsy work (interictal
 * FDG-PET for presurgical localization), but sites use others, so the
 * common neuro tracers are listed too.
 *
 * Not PET, despite looking like it: Siemens "PETRA" is a zero-TE MRI
 * sequence. \bpet\b does not match inside "PETRA".
 */

/** Tracer names and aliases, as regex alternatives (normalized text). */
const TRACER_ALTERNATIVES = [
  'fdg', 'fluorodeoxyglucose', 'fluoro-?deoxy-?glucose',
  'pib', 'pittsburgh-?compound',
  'av-?45', 'florbetapir', 'amyvid',
  'florbetaben', 'fbb', 'neuraceq',
  'flutemetamol', 'vizamyl',
  'av-?1451', 'flortaucipir', 'tauvid',
  'mk-?6240', 'pi-?2620', 'ro-?948',
  'ucb-?j', 'flumazenil', 'fmz',
  'f-?dopa', 'fdopa', 'raclopride',
  'amyloid', 'tau-?pet',
];

/**
 * PET image. "pet" alone covers "FDG_PET", "PET_CT", "PET-MR", BIDS
 * "_pet"; the joined forms cover all-caps names normalizeForKeywords
 * doesn't split ("PETCT", "FDGPET"); "trc-<label>" is the BIDS tracer
 * entity.
 */
export const PET_PATTERN = new RegExp(
  `\\b(pet|petct|petmr|fdgpet|trc-[a-z0-9]+|${TRACER_ALTERNATIVES.join('|')})\\b`,
  'i',
);

/**
 * Unambiguous names for the CT a PET/CT scanner acquires only to correct
 * the PET image for attenuation (and the MR-derived equivalent on PET/MR,
 * the mu-map). Checked BEFORE PET_PATTERN: "PET_CTAC" is the CT, not a
 * PET image.
 */
export const CTAC_PATTERN =
  /\b(ctac|ac-?ct|ct-?attenuation(-?correction)?|attenuation-?(correction-?)?ct|ct-?for-?ac|mu-?map|umap)\b/i;

/**
 * "CT_AC" / "CT-AC" alone. Checked AFTER PET_PATTERN, because in
 * "PET_CT_AC" the AC most likely describes the attenuation-corrected PET
 * image, while a bare "CT_AC" with no PET token is the correction CT.
 */
export const CTAC_LOOSE_PATTERN = /\bct-?ac\b/i;

/** True when a path's folders suggest a PET study (used to spot a CT that belongs to a PET/CT). */
export function isPetContextPath(relativePath: string): boolean {
  const folders = relativePath.split('/').slice(0, -1);
  return folders.some(seg => PET_PATTERN.test(seg.replace(/[\s_]+/g, '-')));
}

/**
 * Tracer names written like subject IDs ("AV45", "MK6240", "PI2620",
 * "AV1451", "RO948"). subjectGrouping.ts treats letters+digits tokens as
 * candidate subject IDs, so these must be excluded there -- otherwise
 * "AV45_scan.nii.gz" becomes a subject called AV45.
 */
const TRACER_ID_LIKE = /^(av-?45|av-?1451|mk-?6240|pi-?2620|ro-?948|ucb-?j)$/i;

export function isTracerToken(token: string): boolean {
  return TRACER_ID_LIKE.test(token);
}

/**
 * Tracer name -> BIDS trc- label (alphanumeric only, per the BIDS
 * label rules). First match wins. Sidecar TracerName values like
 * "Fluorodeoxyglucose" or "18F-FDG" and filename tokens like "fdg" all
 * resolve to one label, so every subject in a dataset gets the same one.
 */
const TRACER_LABELS: [RegExp, string][] = [
  [/fdg|fluoro-?deoxy-?glucose|fluorodeoxyglucose/i, 'FDG'],
  [/pib|pittsburgh/i, 'PiB'],
  [/av-?45\b|florbetapir|amyvid/i, 'florbetapir'],
  [/florbetaben|\bfbb\b|neuraceq/i, 'florbetaben'],
  [/flutemetamol|vizamyl/i, 'flutemetamol'],
  [/av-?1451|flortaucipir|tauvid/i, 'flortaucipir'],
  [/mk-?6240/i, 'MK6240'],
  [/pi-?2620/i, 'PI2620'],
  [/ro-?948/i, 'RO948'],
  [/ucb-?j/i, 'UCBJ'],
  [/flumazenil|\bfmz\b/i, 'flumazenil'],
  [/f-?dopa|fluorodopa/i, 'FDOPA'],
  [/raclopride/i, 'raclopride'],
];

/**
 * BIDS trc- label for a tracer name from a sidecar or a filename, or null
 * when nothing recognizable is present. An unrecognized sidecar TracerName
 * is kept (stripped to alphanumerics) rather than dropped, since the
 * sidecar is the scanner's own statement of what was injected.
 */
export function tracerLabel(text: string | null | undefined, fromSidecar: boolean): string | null {
  if (!text || !text.trim()) return null;
  for (const [pattern, label] of TRACER_LABELS) {
    if (pattern.test(text)) return label;
  }
  if (!fromSidecar) return null;
  const cleaned = text.replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
  return cleaned || null;
}

/**
 * Attenuation correction and frame count as a name states them, for the
 * BIDS rec- entity. "NAC" / "noAC" / "non-AC" mean not attenuation
 * corrected; "AC" means corrected. "dynamic"/"dyn" and "static"/"stat"
 * state the framing. Anything unstated is null.
 */
export function reconstructionFromName(normalized: string): { attenuationCorrected: boolean | null; dynamic: boolean | null } {
  let attenuationCorrected: boolean | null = null;
  if (/\b(nac|no-?ac|non-?ac|uncorrected)\b/i.test(normalized)) attenuationCorrected = false;
  else if (/\b(ac|attenuation-?corrected)\b/i.test(normalized)) attenuationCorrected = true;

  let dynamic: boolean | null = null;
  if (/\b(dynamic|dyn)\b/i.test(normalized)) dynamic = true;
  else if (/\b(static|stat)\b/i.test(normalized)) dynamic = false;

  return { attenuationCorrected, dynamic };
}

/**
 * Sidecar fields BIDS marks REQUIRED for PET (BIDS specification,
 * "Positron Emission Tomography"). InjectedMass / SpecificRadioactivity
 * and their units may be "n/a" (e.g. for FDG) but must be present.
 * Conditionally required fields (bolus-infusion, recon parameter
 * units/values, filter size) are not listed: they depend on other values.
 */
export const PET_REQUIRED_SIDECAR_FIELDS = [
  'Manufacturer', 'ManufacturersModelName', 'Units',
  'TracerName', 'TracerRadionuclide',
  'InjectedRadioactivity', 'InjectedRadioactivityUnits',
  'InjectedMass', 'InjectedMassUnits',
  'SpecificRadioactivity', 'SpecificRadioactivityUnits',
  'ModeOfAdministration',
  'TimeZero', 'ScanStart', 'InjectionStart', 'FrameTimesStart', 'FrameDuration',
  'AcquisitionMode', 'ImageDecayCorrected', 'ImageDecayCorrectionTime',
  'ReconMethodName', 'ReconMethodParameterLabels', 'ReconFilterType',
  'AttenuationCorrection',
] as const;

/**
 * Sidecar fields that only PET images carry. Any one of them identifies
 * a PET sidecar even without "Modality": "PT" (e.g. a sidecar written by
 * PET2BIDS from a spreadsheet, or hand-assembled).
 */
export const PET_ONLY_SIDECAR_FIELDS = [
  'TracerName', 'TracerRadionuclide', 'InjectedRadioactivity',
  'RadionuclideHalfLife', 'RadionuclideTotalDose', 'Radiopharmaceutical',
  'RadiopharmaceuticalStartTime', 'RadionuclidePositronFraction',
] as const;
