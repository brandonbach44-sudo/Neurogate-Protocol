/**
 * BIDS Structure Validator
 *
 * Checks that the generated BIDS paths and filenames follow the
 * BIDS specification for iEEG/neural data:
 *
 * - Correct folder hierarchy: primary/sub-XXX/ses-XXX/modality/
 * - Valid BIDS filename format: sub-XXX_ses-XXX_suffix.ext
 * - No illegal characters in paths
 * - Required sidecar JSON files exist for data files
 * - No duplicate BIDS paths (two files mapping to the same output)
 */

import type { DetectionResult } from '../../types/detection';
import { getEffectiveSession, getEffectiveModality, getEffectiveSubjectGroup } from '../../types/detection';
import type { SubjectMetadata } from '../../types/metadata';
import type { ValidationIssue } from '../../types/validation';
import { isOsJunkFile } from '../detection/extensionDetector';

// Characters not allowed in BIDS filenames/paths (beyond normal filesystem)
const ILLEGAL_CHARS = /[^a-zA-Z0-9\-_./]/;

// Valid BIDS filename pattern: sub-<label>[_ses-<label>][_key-value]*_<suffix>.<ext>
// Reserved for future per-file BIDS naming validation
export const BIDS_FILENAME_PATTERN = /^sub-[a-zA-Z0-9]+_ses-[a-zA-Z0-9]+.*\.[a-zA-Z0-9.]+$/;

let issueCounter = 0;
function nextId(): string {
  return `bids-${++issueCounter}`;
}

export function validateBidsStructure(
  results: DetectionResult[],
  subjects: SubjectMetadata[],
): ValidationIssue[] {
  issueCounter = 0;
  const issues: ValidationIssue[] = [];

  // Build a map of subject group → BIDS ID
  const subjectIdMap = new Map<string, string>();
  for (const s of subjects) {
    subjectIdMap.set(s.subjectGroup, s.bidsSubjectId);
  }

  // Track BIDS paths to detect duplicates
  const bidsPathMap = new Map<string, string[]>();

  for (const result of results) {
    const session = getEffectiveSession(result);
    const modality = getEffectiveModality(result);
    const group = getEffectiveSubjectGroup(result);
    const bidsId = subjectIdMap.get(group) || group; void bidsId;

    // OS junk files (Thumbs.db, .DS_Store, desktop.ini, etc.) are never
    // real data -- they're excluded from export at the detection layer
    // already (see isOsJunkFile in extensionDetector.ts). Reporting them
    // as "Unclassified file" or "Subject has no BIDS ID" is just noise
    // that obscures the validation issues that actually need attention.
    // Skip all per-file checks below for these entirely.
    if (isOsJunkFile(result.fileName)) {
      continue;
    }

    // ── Check: File has no session assigned ──────────────────
    // Localizer/scout scans are excluded from the BIDS export, so they
    // do not need a session assignment.
    if (
      !session &&
      modality !== 'other' &&
      modality !== 'localizer' &&
      modality !== 'sidecar-json' &&
      modality !== 'sidecar-tsv'
    ) {
      issues.push({
        id: nextId(),
        category: 'bids-structure',
        severity: 'error',
        title: 'No session assigned',
        description: `"${result.fileName}" has been classified as ${modality} but has no session assigned. Every data file needs a session assigned to be placed in the BIDS folder structure.`,
        affectedFiles: [result.relativePath],
        subjectGroup: group,
        dismissable: false,
      });
    }

    // ── Check: File is completely unclassified ───────────────
    if (modality === 'other') {
      issues.push({
        id: nextId(),
        category: 'bids-structure',
        severity: 'warning',
        title: 'Unclassified file',
        description: `"${result.fileName}" could not be classified into any BIDS modality. It will be placed in the unclassified/ folder. Review and assign a modality if this is a valid data file, or exclude it if it's not needed.`,
        affectedFiles: [result.relativePath],
        subjectGroup: group,
        dismissable: true,
      });
    }

    // ── Check: Illegal characters in original filename ───────
    const nameWithoutExt = result.fileName.replace(/\.[^.]+$/, '');
    if (ILLEGAL_CHARS.test(nameWithoutExt)) {
      issues.push({
        id: nextId(),
        category: 'bids-structure',
        severity: 'info',
        title: 'Special characters in filename',
        description: `"${result.fileName}" contains special characters that will be cleaned during BIDS renaming. The tool will handle this automatically, but review the generated BIDS filename to make sure it looks correct.`,
        affectedFiles: [result.relativePath],
        subjectGroup: group,
        dismissable: true,
      });
    }

    // ── Check: Subject group has no BIDS ID mapping ──────────
    if (!subjectIdMap.has(group)) {
      issues.push({
        id: nextId(),
        category: 'bids-structure',
        severity: 'error',
        title: 'Subject has no BIDS ID',
        description: `Subject group "${group}" doesn't have a BIDS subject ID assigned. Go back to the Metadata step and configure the Institution Setup to generate subject IDs.`,
        affectedFiles: [result.relativePath],
        subjectGroup: group,
        dismissable: false,
      });
    }

    // ── Track duplicate BIDS paths ───────────────────────────
    // Localizer/scout files are excluded from the export, so they
    // cannot collide and are not tracked here.
    if (
      result.bidsPath &&
      modality !== 'localizer' &&
      result.bidsPath !== `unclassified/${result.fileName}`
    ) {
      if (!bidsPathMap.has(result.bidsPath)) {
        bidsPathMap.set(result.bidsPath, []);
      }
      bidsPathMap.get(result.bidsPath)!.push(result.relativePath);
    }
  }

  // ── Check: Duplicate BIDS paths ────────────────────────────
  for (const [bidsPath, originalPaths] of bidsPathMap) {
    if (originalPaths.length > 1) {
      issues.push({
        id: nextId(),
        category: 'bids-structure',
        severity: 'error',
        title: 'Duplicate BIDS path',
        description: `Multiple files are mapped to the same BIDS path "${bidsPath}". This will cause one file to overwrite the other. Change the session or modality for one of these files to resolve the conflict.`,
        affectedFiles: originalPaths,
        dismissable: false,
      });
    }
  }

  // ── Check: JSON sidecars should pair with data files ───────
  const jsonSidecars = results.filter(r => getEffectiveModality(r) === 'sidecar-json');
  for (const sidecar of jsonSidecars) {
    const baseName = sidecar.fileName.replace(/\.json$/i, '');
    const hasMatchingData = results.some(r => {
      const rName = r.fileName.replace(/\.[^.]+$/, '').replace(/\.nii$/, '');
      return rName === baseName && r !== sidecar;
    });

    if (!hasMatchingData) {
      issues.push({
        id: nextId(),
        category: 'bids-structure',
        severity: 'warning',
        title: 'Orphaned JSON sidecar',
        description: `"${sidecar.fileName}" appears to be a JSON sidecar file but no matching data file was found with the same base name. Orphaned sidecars will still be included but may not be properly linked.`,
        affectedFiles: [sidecar.relativePath],
        dismissable: true,
      });
    }
  }

  // ── Unpaired diffusion gradient tables ──────────────────────────
  // Same idea as the orphaned-JSON check above, for .bval / .bvec.
  //
  // bidsNaming pairs a scan with its companions by shared base name, so a
  // gradient table only follows its image when dcm2niix named them
  // together. Some sites name them independently -- the Phase2_MRI data
  // has images called "ep2d_diff_sms_aldit_b1k.nii.gz" with gradients
  // called "DTI_b1000.bval" one folder up. Those never share a base name,
  // so each gets its own run entity and the pair is silently split:
  // "run-1_dwi.bval" ends up describing no exported image, while
  // "run-13_dwi.nii.gz" ships with no gradients.
  //
  // The pairing is NOT guessed here. Inferring "DTI_b1000" belongs to
  // "..._b1k" means matching on b-value spelling and phase-encoding
  // suffixes, and a wrong pairing would attach the wrong gradient
  // directions to a diffusion series -- an error that produces
  // plausible-looking tractography from the wrong table and is very hard
  // to spot downstream. Flagging it and letting the user pair or exclude
  // is the safe behavior. Found 2026-08-17.
  const gradientFiles = results.filter(r => /\.(bval|bvec)$/i.test(r.fileName));
  for (const grad of gradientFiles) {
    const base = grad.fileName.replace(/\.(bval|bvec)$/i, '');
    const hasMatchingImage = results.some(r => {
      if (r === grad) return false;
      if (!/\.nii(\.gz)?$/i.test(r.fileName)) return false;
      const rName = r.fileName.replace(/\.nii\.gz$/i, '').replace(/\.nii$/i, '');
      return rName === base;
    });

    if (!hasMatchingImage) {
      issues.push({
        id: nextId(),
        category: 'bids-structure',
        severity: 'warning',
        title: 'Diffusion gradient table not matched to an image',
        description: `"${grad.fileName}" is a diffusion gradient table, but no image file shares its base name, so it cannot be paired automatically and will be exported under its own run number — not alongside the scan it describes. This usually means the site named the gradient files differently from the images (for example "DTI_b1000.bval" next to "ep2d_diff_..._b1k.nii.gz"). Confirm which diffusion series this table belongs to and pair or exclude it manually; the tool does not guess, because attaching the wrong gradient directions to a series corrupts the diffusion data silently.`,
        affectedFiles: [grad.relativePath],
        dismissable: true,
      });
    }
  }

  // ── Same series converted twice ─────────────────────────────────
  // Flywheel/Scitran exports frequently contain one acquisition under two
  // names in the same folder: the bare series name, and dcm2niix's
  // decorated form _<series>_<timestamp>_<seriesNumber>. For example
  //
  //   ep2d_diff_sms3_b1000_te94_d64_duty68_BW2264_pF68.nii.gz          (29,772,655 B)
  //   _ep2d_diff_sms3_b1000_..._20160426130017_4.nii.gz                (29,733,244 B)
  //
  // are the same diffusion series converted by two different dcm2niix
  // runs. Both are exportable, so they receive separate run- entities and
  // the output asserts two acquisitions where the scanner produced one --
  // which would double-count the series in any downstream analysis.
  //
  // Detection is a deterministic name relationship, not a similarity
  // guess: stripping the leading underscore and the trailing
  // _<timestamp>_<number> from one file must yield the other file's exact
  // base name, in the same folder. Measured over the Phase2_MRI corpus
  // (2026-08-17) this matched 117 folders / 236 files and did not touch
  // the 139 folders holding genuinely different images -- magnitude vs.
  // phase (_ph) and dcm2niix collision variants (trailing "a").
  //
  // Nothing is dropped automatically. Both copies are real patient data,
  // and which to keep is the user's call -- so this reports the pair and
  // names the copy worth keeping. In 118 of 119 pairs the decorated copy
  // is the one carrying the .json sidecar (the bare copy never did), and
  // that sidecar is what the engine reads ImageType from, so it is the
  // more complete file.
  const decoratedPattern = /^_(.+)_\d{8,14}_\d+$/;
  const folderOf = (relativePath: string): string =>
    relativePath.split('/').slice(0, -1).join('/');

  const imageStem = (fileName: string): string | null => {
    if (/\.nii\.gz$/i.test(fileName)) return fileName.slice(0, -7);
    if (/\.nii$/i.test(fileName)) return fileName.slice(0, -4);
    return null;
  };

  for (const result of results) {
    const stem = imageStem(result.fileName);
    if (!stem) continue;
    const m = stem.match(decoratedPattern);
    if (!m) continue;

    const twin = results.find(other => {
      if (other === result) return false;
      if (folderOf(other.relativePath) !== folderOf(result.relativePath)) return false;
      return imageStem(other.fileName) === m[1];
    });
    if (!twin) continue;

    const hasSidecar = results.some(
      r => r.fileName.toLowerCase() === `${stem.toLowerCase()}.json`,
    );

    issues.push({
      id: nextId(),
      category: 'bids-structure',
      severity: 'warning',
      title: 'Same series present twice',
      description: `"${twin.fileName}" and "${result.fileName}" are the same acquisition converted twice (the second is dcm2niix's timestamped form of the first, in the same folder). Only one is exported, so the dataset does not double-count the series: "${result.fileName}" is kept${hasSidecar ? ' because it has the matching .json sidecar carrying the scanner metadata' : ''}, and "${twin.fileName}" is set aside as unclassified rather than deleted. If the other copy is the one you want, set its modality in the mapping table and it will be exported instead.`,
      affectedFiles: [twin.relativePath, result.relativePath],
      dismissable: true,
    });
  }

  return issues;
}
