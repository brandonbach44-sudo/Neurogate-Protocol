/**
 * Flexible session structure: presets and the custom-timepoint generator.
 *
 * Phase 1 addition (July 2026). This module is additive -- nothing here is
 * wired into detection/validation/export/UI yet. See
 * Documents/Phase1_Flexible_Folder_Structure_Spec.md for the full plan and
 * Documents/NeuroGate_Phase_Roadmap.md for how this fits the broader roadmap.
 *
 * A dataset's session structure is one of a small set of presets:
 *
 * - "Implant sessions" is NeuroGate's original built-in preset (pre-implant,
 *   post-implant, post-surgery). It is NOT a universal BIDS standard -- BIDS
 *   itself doesn't prescribe session names, this is just the structure
 *   NeuroGate was first built around.
 * - "Custom timepoints" lets any study define its own timepoints from a
 *   number + unit picker, with no free-text entry anywhere in the flow, so
 *   no site name or PI name can ever end up in a generated session label.
 *
 * The registry (SESSION_PRESETS) is a list, not a hardcoded two-way fork, so
 * a future preset can be added without redesigning the Step 1 picker.
 */

import { SESSIONS, type Session } from './detection';

// ── Preset registry (Step 1) ──────────────────────────────────────

export type PresetId = 'implant' | 'custom-timepoints';

export interface SessionPresetInfo {
  id: PresetId;
  label: string;
  description: string;
}

/**
 * Registry of available presets for the Step 1 picker. Extensible: add an
 * entry here for a future preset (e.g. a different condition-specific
 * structure) without redesigning the picker component.
 */
export const SESSION_PRESETS: SessionPresetInfo[] = [
  {
    id: 'implant',
    label: 'Implant sessions',
    description:
      "pre-implant, post-implant, post-surgery. NeuroGate's built-in preset for implant-based surgical workups.",
  },
  {
    id: 'custom-timepoints',
    label: 'Custom timepoints',
    description:
      'For longitudinal studies without an implant procedure. Build your own timepoints below, no free text.',
  },
];

// ── Custom timepoint generator (Step 2) ───────────────────────────

export type TimepointUnit = 'day' | 'week' | 'month' | 'year';

export const TIMEPOINT_UNITS: { value: TimepointUnit; label: string; abbrev: string; days: number }[] = [
  { value: 'day', label: 'days', abbrev: 'd', days: 1 },
  { value: 'week', label: 'weeks', abbrev: 'wk', days: 7 },
  { value: 'month', label: 'months', abbrev: 'mo', days: 30 },
  { value: 'year', label: 'years', abbrev: 'yr', days: 365 },
];

/**
 * Practical UI cap on the number of custom timepoints in one dataset. This
 * is a UX sanity limit, not a data-model or governance restriction.
 * Confirmed with Brandon 2026-07-31.
 */
export const MAX_CUSTOM_TIMEPOINTS = 24;

export interface CustomTimepoint {
  /** 0-99. By convention, 0 (of any unit) represents baseline, so there is
   * no separate free-text "baseline" label to validate or misuse. */
  number: number;
  unit: TimepointUnit;
}

function unitInfo(unit: TimepointUnit) {
  const info = TIMEPOINT_UNITS.find(u => u.value === unit);
  if (!info) throw new Error(`Unknown timepoint unit: ${unit}`);
  return info;
}

/**
 * Generate the ses- label for a custom timepoint, e.g.
 * { number: 2, unit: 'month' } -> "ses-2mo".
 *
 * There is no free-text entry feeding this function: number comes from a
 * bounded numeric input and unit comes from a fixed dropdown, so a site
 * name or PI name cannot end up here.
 */
/**
 * Defense-in-depth guard for the label generator. The Step 2 UI only ever
 * feeds this a bounded, non-negative integer from a numeric input, so this
 * should never fire in normal use -- but the engine itself had no check of
 * its own, so a caller bypassing the UI (a future API path, a bug
 * upstream) could silently produce an invalid BIDS label: a negative
 * number yields a double-dash ("ses--3mo") and a non-integer yields a
 * disallowed "." character ("ses-2.5mo"), since BIDS entity values must be
 * alphanumeric only. Found via adversarial testing 2026-08-02.
 */
function assertValidTimepointNumber(n: number): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(
      `Invalid custom timepoint number ${n}: must be a non-negative integer.`,
    );
  }
}

export function buildCustomSessionLabel(tp: CustomTimepoint): string {
  assertValidTimepointNumber(tp.number);
  return `ses-${tp.number}${unitInfo(tp.unit).abbrev}`;
}

/** Elapsed time in days, used only for chronological sorting -- never stored or displayed. */
function elapsedDays(tp: CustomTimepoint): number {
  return tp.number * unitInfo(tp.unit).days;
}

/** Sort timepoints chronologically, regardless of the order they were entered in. */
export function sortTimepoints(timepoints: CustomTimepoint[]): CustomTimepoint[] {
  return [...timepoints].sort((a, b) => elapsedDays(a) - elapsedDays(b));
}

/**
 * Find timepoints whose generated label collides with an earlier entry in
 * the list (e.g. "4 weeks" and "1 months" might both be intended as the
 * same point, or a user duplicates a row by mistake). Returns the indices
 * (into the input array, in input order) of the later, colliding entries,
 * so the UI can block them and point at the specific offending row.
 */
export function findDuplicateTimepoints(timepoints: CustomTimepoint[]): number[] {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  timepoints.forEach((tp, i) => {
    const label = buildCustomSessionLabel(tp);
    if (seen.has(label)) {
      duplicates.push(i);
    } else {
      seen.add(label);
    }
  });
  return duplicates;
}

// ── Dataset structure (what gets stored per-dataset) ──────────────

/**
 * The structure choice for one dataset. Stored as dataset metadata (see
 * spec Section 4) so it's remembered on re-entry, not just applied once at
 * first upload.
 */
export type DatasetStructure =
  | { presetId: 'implant' }
  | { presetId: 'custom-timepoints'; timepoints: CustomTimepoint[] };

export function createDefaultDatasetStructure(): DatasetStructure {
  return { presetId: 'implant' };
}

/**
 * The implant preset's fixed session list, re-exported from the existing
 * SESSIONS constant in types/detection.ts so there is exactly one source
 * of truth for it, not a second copy that could drift.
 */
export const IMPLANT_SESSIONS = SESSIONS;

/**
 * Resolve a DatasetStructure to its concrete, ordered list of session ids.
 * For the implant preset this is the fixed three-session list; for custom
 * timepoints it's generated (and chronologically sorted) from the stored
 * timepoints.
 */
export function resolveSessionIds(structure: DatasetStructure): string[] {
  if (structure.presetId === 'implant') {
    return IMPLANT_SESSIONS.map(s => s.value);
  }
  return sortTimepoints(structure.timepoints).map(buildCustomSessionLabel);
}

export interface SessionOption {
  value: string;
  label: string;
}

/**
 * Resolve a DatasetStructure to the {value, label} pairs a session <select>
 * should render. For the implant preset this reuses the existing
 * human-readable labels ("Pre-implant", etc.); for custom timepoints the
 * generated label (e.g. "ses-2mo") doubles as its own display text since
 * there's no separate free-text name to show.
 */
export function getSessionOptions(structure: DatasetStructure): SessionOption[] {
  if (structure.presetId === 'implant') {
    return IMPLANT_SESSIONS.map(s => ({ value: s.value, label: s.label }));
  }
  return sortTimepoints(structure.timepoints).map(tp => {
    const label = buildCustomSessionLabel(tp);
    return { value: label, label: tp.number === 0 ? `${label} (baseline)` : label };
  });
}

/**
 * Validate a full set of custom timepoints before letting the user
 * continue past Step 2: at least one timepoint, no duplicates, no more
 * than MAX_CUSTOM_TIMEPOINTS.
 */
export interface TimepointsValidation {
  valid: boolean;
  errors: string[];
  duplicateIndices: number[];
}

export function validateCustomTimepoints(timepoints: CustomTimepoint[]): TimepointsValidation {
  const errors: string[] = [];
  if (timepoints.length === 0) {
    errors.push('Add at least one timepoint.');
  }
  if (timepoints.length > MAX_CUSTOM_TIMEPOINTS) {
    errors.push(`No more than ${MAX_CUSTOM_TIMEPOINTS} timepoints per dataset.`);
  }
  const duplicateIndices = findDuplicateTimepoints(timepoints);
  if (duplicateIndices.length > 0) {
    errors.push('Two or more timepoints resolve to the same session label. Remove or change the duplicates.');
  }
  return { valid: errors.length === 0, errors, duplicateIndices };
}

// Re-exported for convenience so consumers of this module don't also need
// to import Session from types/detection directly for simple typing.
export type { Session };
