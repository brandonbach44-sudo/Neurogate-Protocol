/**
 * Detection Engine — Main Orchestrator
 *
 * Combines all 5 detection layers into a single pipeline:
 *   1. Extension detector  → file type (highest reliability)
 *   2. Filename keywords   → modality + session
 *   3. Folder path keywords → session + modality
 *   4. Neighbor inference  → context from nearby files
 *   5. Subject grouping    → which patient this file belongs to
 *
 * Each layer produces partial results with confidence weights.
 * The engine merges them, resolves conflicts, and assigns a
 * final confidence level to each file.
 *
 * The output is an array of DetectionResult objects, one per file,
 * ready to be displayed in the mapping table.
 */

import type { ScannedFile } from '../../types/files';
import type {
  DetectionResult,
  DetectionSummary,
  Modality,
  Session,
  Confidence,
  DetectionReason,
} from '../../types/detection';
import { detectFromExtension } from './extensionDetector';
import { detectFromFilename, detectFromSidecarText } from './filenameDetector';
import { detectFromFolderPath } from './folderDetector';
import { inferFromNeighbors, getFolderPath } from './neighborInference';
import { groupIntoSubject } from './subjectGrouping';
import { buildFolderSessionMap, neighborPropagationReason } from './customSessionNeighborPropagation';
import { getSidecarBaseName } from './sidecarReader';
import type { SidecarInfo } from './sidecarReader';
import { computeBidsNames } from '../bids/bidsNaming';
import type { EdfHeaderInfo } from './edfHeaderReader';
import { detectCustomSession } from './customSessionDetector';
import { assignDateClusterSessions } from './dateClusterDetector';
import type { DatedFile, DateClusterAssignment } from './dateClusterDetector';
import { assignFolderClusterSessions } from './folderClusterDetector';
import type { FolderedFile, FolderClusterAssignment } from './folderClusterDetector';
import { resolveSessionIds, createDefaultDatasetStructure } from '../../types/sessionStructure';
import type { DatasetStructure } from '../../types/sessionStructure';

// ── Session-structure awareness (Phase 1, July 2026) ────────────────
// Everything below that guesses a session from fuzzy keywords (filename
// keywords, folder path keywords, neighbor CT+iEEG inference, the
// modality-based fallback) is specific to the Implant sessions preset --
// there's no keyword vocabulary or clinical heuristic that generalizes to
// an arbitrary study's Custom timepoints. When the active structure is
// Custom timepoints, those fuzzy layers are skipped for session purposes
// (they still run for modality, which is orthogonal to session structure)
// and detectCustomSession() does a literal match against the known
// timepoint labels instead. See Documents/Phase1_Flexible_Folder_Structure_Spec.md.

// BIDS filename and path generation lives in lib/bids/bidsNaming.ts, the
// single source of truth shared with the exporter and the validator.
// runDetection() calls computeBidsNames() over the whole result set
// before returning, so repeated modalities get unique run- entities.

// ── Confidence calculation ────────────────────────────────────────

/**
 * Calculate overall confidence from the accumulated detection reasons.
 */
function calculateConfidence(
  modality: Modality,
  session: Session | null,
  reasons: DetectionReason[],
  /**
   * True for the Single session preset (Phase 2, August 2026): this
   * dataset has no session concept at all, so a null session here is the
   * expected, correct outcome, not missing evidence. Without this flag
   * every single-session file would fall through to the "only modality
   * detected" branch below and get capped at medium/low confidence
   * purely for lacking something the dataset was never supposed to have,
   * the same reasoning that already exempts sidecars just above.
   */
  sessionless = false,
): Confidence {
  if (modality === 'other') return 'unclassified';

  // Sum up all weights
  const totalWeight = reasons.reduce((sum, r) => sum + r.weight, 0);

  // ── Modality-evidence floor ────────────────────────────────────
  // totalWeight above is deliberately dimension-blind: it mixes evidence
  // about the session, the subject and the modality into one number. That
  // is fine for grading "how much do we know about this file overall", but
  // it must NOT be the only gate, because 'high' is what authorises the
  // exporter to write a file into the BIDS tree under a modality-specific
  // name (see EXPORTABLE_MODALITIES / SUFFIX in lib/bids/bidsNaming.ts).
  //
  // A file can be certain about its session and subject and still have no
  // idea what kind of scan it is. Real case from the Phase2_MRI corpus,
  // gre_field_mapping_e1.nii.gz:
  //
  //   0.30 extension        "NIfTI gzipped file - imaging data"   (ambiguous)
  //   0.45 folder           session = ses-2wk                     (not modality)
  //   0.10 extension        "Defaulting ambiguous NIfTI to T1w - please verify"
  //   0.30 neighbor         session = pre-implant baseline        (not modality)
  //   0.30 subject-grouping subject = 01_1204                     (not modality)
  //   ----
  //   1.45 -> >= 1.2 -> "high" -> exported as sub-XX_ses-2wk_run-N_T1w.nii.gz
  //
  // The only thing that spoke to modality was a 0.10 fallback that says
  // "please verify" in its own message. Auditing 868 real scans on
  // 2026-08-17 found 416 files (48%) whose modality came from that
  // fallback, of which 371 were graded high and exported as fabricated
  // T1w anatomicals -- field maps, proton-density and diffusion scans
  // written into anat/ as structural images.
  //
  // So: cap confidence by how much evidence actually supports the
  // MODALITY. A file whose modality rests only on the blind default can
  // never be graded above 'low', which keeps it in the mapping table for
  // the user to assign and out of the export. Untagged reasons are
  // ignored here (they still count toward totalWeight), so this only ever
  // tightens the grade, never loosens it.
  const modalityEvidence = reasons
    .filter(r => r.supports === 'modality')
    .reduce((sum, r) => sum + r.weight, 0);

  // The blind default contributes exactly 0.1; anything at or below that
  // means nothing better than a guess ever identified this scan.
  const MODALITY_EVIDENCE_FLOOR = 0.15;
  if (modalityEvidence <= MODALITY_EVIDENCE_FLOOR) {
    return 'low';
  }

  // Sidecars are scored on their own. A JSON / TSV sidecar inherits its
  // session from the data file it pairs with (see computeBidsNames in
  // lib/bids/bidsNaming.ts), so the engine should not penalise it for
  // not having found a session on its own. Classify it purely by the
  // strength of the modality evidence. This branch must come before the
  // session-aware branches below, otherwise a sidecar whose engine-time
  // session is still null would fall through to the modality-only path
  // and be capped at medium.
  if (modality === 'sidecar-json' || modality === 'sidecar-tsv' || sessionless) {
    if (totalWeight >= 0.8) return 'high';
    if (totalWeight >= 0.4) return 'medium';
    return 'low';
  }

  // Both modality and session detected with good evidence
  if (session) {
    if (totalWeight >= 1.2) return 'high';
    if (totalWeight >= 0.7) return 'medium';
    return 'low';
  }

  // Only modality detected (no session)
  if (modality) {
    if (totalWeight >= 1.0) return 'medium';
    return 'low';
  }

  return 'unclassified';
}

// ── Main detection pipeline ───────────────────────────────────────

/**
 * Run the full detection pipeline on a list of scanned files.
 * Returns a DetectionResult for every file.
 */
export function runDetection(
  files: ScannedFile[],
  /**
   * Optional map of base name -> JSON sidecar scan-name text, produced
   * by readJsonSidecars(). When provided, the engine uses the scanner's
   * own scan label to classify data files whose own filename is generic.
   */
  sidecarMap?: Map<string, SidecarInfo>,
  /**
   * Optional map of filename -> EDF header info, produced by
   * readEdfHeaders(). When provided, the engine uses signal labels from
   * the EDF header to resolve the eeg-vs-ieeg ambiguity for .edf/.bdf
   * files whose filename and folder give no modality clues.
   */
  edfHeaderMap?: Map<string, EdfHeaderInfo>,
  /**
   * The dataset's chosen session structure. Defaults to the Implant
   * sessions preset, so existing callers that don't pass this yet see
   * identical behavior to before Phase 1.
   */
  structure: DatasetStructure = createDefaultDatasetStructure(),
): DetectionResult[] {
  const isCustomStructure = structure.presetId === 'custom-timepoints';
  // Phase 2 addition (August 2026): Single session datasets have no
  // session concept at all -- every file should end up with session =
  // null, the same "nothing to guess" treatment Custom timepoints already
  // gets from the implant-specific fuzzy layers, just with no literal-
  // label/date-cluster/folder-cluster fallback afterward either (there are
  // no known session ids to match against). usesImplantHeuristics gates
  // every implant-only fuzzy-session block below; isCustomStructure alone
  // still correctly gates the custom-timepoint-only blocks, since it's
  // false for Single session already. See
  // Documents/Phase2_Additional_Dataset_Presets_Spec.md.
  const isSingleSession = structure.presetId === 'single-session';
  const usesImplantHeuristics = !isCustomStructure && !isSingleSession;
  const knownSessionIds = isCustomStructure ? resolveSessionIds(structure) : [];

  // ── Pass 0 (Custom timepoints only): date-cluster + folder-cluster ──
  // session assignment. Layer A (date, spec Section 3.1) and Layer B
  // (folder structure, spec Section 3.2). Both need full-subject
  // visibility across all of a subject's files before any single file's
  // session can be decided, so they run once up front, sharing one pass
  // over `files` (and one groupIntoSubject call per file) rather than
  // duplicating that work in two separate loops. Skipped entirely for
  // the Implant sessions preset.
  const dateClusterAssignments = new Map<string, DateClusterAssignment>();
  const dateClusterMismatchByFile = new Map<string, DetectionReason>();
  const folderClusterAssignments = new Map<string, FolderClusterAssignment>();
  const folderClusterMismatchByFile = new Map<string, DetectionReason>();

  if (isCustomStructure && knownSessionIds.length > 0) {
    const subjectDatedFiles = new Map<string, DatedFile[]>();
    const subjectFolderedFiles = new Map<string, FolderedFile[]>();

    for (const file of files) {
      // Subject grouping is a pure function of filename/path patterns, so
      // it's safe to compute here even though Pass 2 below computes it
      // again per file for the final result -- cheap either way.
      const groupResult = groupIntoSubject(file, files, knownSessionIds);

      const lowerName = file.name.toLowerCase();
      const isJsonFile = lowerName.endsWith('.json');
      const isEdfFile = lowerName.endsWith('.edf') || lowerName.endsWith('.bdf');

      let date: Date | null = null;
      if (isEdfFile && edfHeaderMap) {
        date = edfHeaderMap.get(file.name)?.acquisitionDate ?? null;
      } else if (!isJsonFile && sidecarMap) {
        date = sidecarMap.get(getSidecarBaseName(file.name))?.acquisitionDate ?? null;
      }

      if (date) {
        const bucket = subjectDatedFiles.get(groupResult.groupName) ?? [];
        bucket.push({ fileName: file.name, date });
        subjectDatedFiles.set(groupResult.groupName, bucket);
      }

      // Layer B needs every file's immediate folder, regardless of
      // whether it has a date -- the folder count/order is what matters.
      const folderBucket = subjectFolderedFiles.get(groupResult.groupName) ?? [];
      folderBucket.push({ fileName: file.name, folder: getFolderPath(file.relativePath) });
      subjectFolderedFiles.set(groupResult.groupName, folderBucket);
    }

    for (const datedFiles of subjectDatedFiles.values()) {
      const result = assignDateClusterSessions(datedFiles, knownSessionIds);
      for (const [fileName, assignment] of result.assignments) {
        dateClusterAssignments.set(fileName, assignment);
      }
      if (result.mismatchReason) {
        for (const df of datedFiles) {
          dateClusterMismatchByFile.set(df.fileName, result.mismatchReason);
        }
      }
    }

    for (const [groupName, folderedFiles] of subjectFolderedFiles) {
      // Layer B is only meant for subjects with no usable acquisition
      // date on ANY file at all (spec Section 3.2's precondition). If
      // this subject had even one dated file, Layer A already had a
      // real signal to work with -- either it resolved things (in which
      // case there's nothing left for Layer B to do), or it hit a
      // cluster/timepoint mismatch, which means the dates actively
      // disagreed with the defined structure. Either way, a naive
      // folder-identity match (e.g. "everything's in one folder, and
      // there's only one timepoint, so trivially it matches") must not
      // silently override that. Skip Layer B entirely for this subject
      // and let the mismatch stand.
      if (subjectDatedFiles.has(groupName)) continue;

      const result = assignFolderClusterSessions(folderedFiles, knownSessionIds);
      for (const [fileName, assignment] of result.assignments) {
        folderClusterAssignments.set(fileName, assignment);
      }
      if (result.mismatchReason) {
        for (const ff of folderedFiles) {
          folderClusterMismatchByFile.set(ff.fileName, result.mismatchReason);
        }
      }
    }
  }

  // ── Pass 1: Run layers 1-3 on every file individually ───────
  // These layers only need the file itself, not context from others.

  const intermediateResults: {
    file: ScannedFile;
    modality: Modality;
    session: Session | null;
    reasons: DetectionReason[];
    possibleModalities: Modality[];
    /**
     * Set when DICOM ImageType identified this file authoritatively (a
     * scanner-derived ADC/FA/TRACEW map). Downstream layers that only
     * guess -- the blind T1w default at the end of Pass 1, and neighbor
     * inference in Pass 2 -- must not overwrite that decision.
     */
    modalityLocked: boolean;
    /**
     * Set when a folder name matched the ambiguous bare "post-op" pattern
     * (see folderDetector.ts) and nothing else resolved a session for
     * this file yet. Consulted in Pass 2, after Layer 4 neighbor
     * inference has had a chance to resolve the file to post-implant via
     * real CT/iEEG evidence. Implant sessions preset only.
     */
    ambiguousSessionCandidate: Session | null;
  }[] = [];

  for (const file of files) {
    const reasons: DetectionReason[] = [];
    let modality: Modality = 'other';
    let session: Session | null = null;
    let possibleModalities: Modality[] = [];
    let ambiguousSessionCandidate: Session | null = null;
    let modalityLocked = false;

    // Layer 1: Extension
    const extResult = detectFromExtension(file.name, file.relativePath);
    // Only tag this as modality evidence when the extension actually pinned
    // the modality down (bestGuess set, e.g. .bval -> dwi). For an ambiguous
    // .nii.gz the reason only says "this is imaging data", which is not a
    // statement about WHICH kind of scan it is and must not be spent from the
    // modality-evidence budget in calculateConfidence().
    reasons.push(
      extResult.bestGuess
        ? { ...extResult.reason, supports: 'modality' as const }
        : extResult.reason,
    );
    possibleModalities = extResult.possibleModalities;
    if (extResult.bestGuess) {
      modality = extResult.bestGuess;
    }

    // Layer 2: Filename keywords
    const fnResult = detectFromFilename(file.name);
    reasons.push(...fnResult.reasons);
    if (fnResult.modality) {
      // Filename keywords override extension guess if available
      // (more specific than just knowing it's a .nii.gz)
      if (modality === 'other' || possibleModalities.length > 1) {
        modality = fnResult.modality;
      }
      // If extension already gave a specific answer, only override
      // if the filename match is compatible
      else if (possibleModalities.includes(fnResult.modality)) {
        modality = fnResult.modality;
      }
    }
    // Filename session keywords ("preop", "phase1", ...) are specific to
    // the Implant sessions preset's clinical vocabulary; skip for Custom
    // timepoints, where a session can only be one of the exact labels the
    // user defined (matched below via detectCustomSession).
    if (usesImplantHeuristics && fnResult.session) {
      session = fnResult.session;
    }

    // Layer 2b: JSON sidecar content
    // dcm2niix writes a .json sidecar next to every converted scan, and
    // that sidecar's SeriesDescription / ProtocolName carries the
    // scanner's original scan name even when the NIfTI filename itself
    // is generic (e.g. "sub-X_10.nii"). If a matching sidecar was read,
    // use its scan-name text as a high-signal modality/session clue.
    const isJsonFile = file.name.toLowerCase().endsWith('.json');
    if (sidecarMap && !isJsonFile) {
      const sidecar = sidecarMap.get(getSidecarBaseName(file.name));
      if (sidecar) {
        // ── DICOM ImageType: authoritative, checked before keywords ──
        // ImageType is the scanner's structured statement about the image,
        // so it outranks any guess made from a file or folder name. Its
        // job here is to catch scanner-computed diffusion parameter maps
        // (ADC / FA / trace-weighted), which must never be written into a
        // raw BIDS dwi/ folder: they carry no bval/bvec, so a validator
        // rejects the dataset and a tractography pipeline could ingest an
        // ADC map as if it were raw diffusion signal.
        //
        // Name matching cannot cover this. dcm2niix often drops the
        // descriptive suffix and numbers the output instead, so the ADC
        // map of series 18 lands as
        // "_ep2d_diff_SliceAcc_b1k_64_20170130080338_18.nii.gz" -- a name
        // indistinguishable from raw diffusion, whose sidecar reads
        // ['DERIVED','PRIMARY','DIFFUSION','ADC','ND']. Before this check,
        // those files were classified dwi at high confidence and exported
        // into dwi/ alongside the real data (audit 2026-08-17).
        //
        // Left as 'other' (-> unclassified) rather than given a modality:
        // there is no derivative type in the Modality union yet, and BIDS
        // places these under derivatives/, not in the raw tree. The user
        // can still assign them in the mapping table.
        const upperImageType = sidecar.imageType.map(v => v.toUpperCase());
        const isDerived = upperImageType.includes('DERIVED');
        const derivedKind = upperImageType.find(v =>
          v === 'ADC' || v === 'FA' || v === 'TRACEW' || v === 'COLFA' || v === 'EXADC',
        );
        if (isDerived && derivedKind) {
          modality = 'other';
          // Lock it: the filename still reads "ep2d_diff_...", so both the
          // blind T1w default and neighbor inference would otherwise
          // re-classify this map as real scan data. Locking also keeps the
          // now-overruled filename "Diffusion MRI keyword" reason from
          // counting as live modality evidence.
          modalityLocked = true;
          reasons.push({
            layer: 'sidecar',
            message: `DICOM ImageType is [${sidecar.imageType.join(', ')}] — scanner-derived ${derivedKind} map, not raw diffusion data. Needs manual placement (BIDS: derivatives/).`,
            weight: 0,
          });
        }

        // Skip keyword matching for a derived map: the sidecar's
        // SeriesDescription still reads "ep2d_diff_..._ADC", which would
        // re-classify the file as raw diffusion and undo the decision
        // above. Session detection below still runs, so the mapping table
        // shows the file against its real timepoint instead of a blank.
        const scResult = (isDerived && derivedKind)
          ? { modality: null, session: null, reasons: [] }
          : detectFromSidecarText(sidecar.scanText);
        // Compatible when the sidecar's modality guess isn't ruled out by
        // what this file's own extension says is possible (e.g. a .edf
        // file's possibleModalities is [eeg, ieeg] -- a sidecar claiming
        // "ct" can't be describing this file).
        const compatible =
          !scResult.modality ||
          possibleModalities.length === 0 ||
          possibleModalities.includes(scResult.modality);

        if (compatible) {
          if (scResult.modality) {
            // Apply the sidecar's modality when the file's own name and
            // extension left it ambiguous.
            const fileNameAmbiguous = modality === 'other' || possibleModalities.length > 1;
            if (fileNameAmbiguous) {
              modality = scResult.modality;
            }
          }
          if (usesImplantHeuristics && scResult.session && !session) {
            session = scResult.session;
          }
          // Keyword-match reasons from the sidecar text (modality/session).
          reasons.push(...scResult.reasons);
          // Record which sidecar was consulted, for transparency.
          reasons.push({
            layer: 'sidecar',
            message: `Read scan name from sidecar "${sidecar.sidecarName}": "${sidecar.scanText}"`,
            weight: 0,
          });
        } else {
          // The sidecar's content points to a modality this file's own
          // extension rules out entirely -- almost certainly an unrelated
          // file that happens to share a base name (e.g. a lab metadata
          // .json sitting next to an .edf), not a real dcm2niix sidecar
          // for this file. Ignore its content rather than surface a
          // misleading reason. Found via adversarial testing 2026-08-02.
          reasons.push({
            layer: 'sidecar',
            message: `Sidecar "${sidecar.sidecarName}" was found but its content ("${sidecar.scanText}") is incompatible with this file's type -- likely an unrelated file sharing the same base name, ignored.`,
            weight: 0,
          });
        }
      }
    }

    // Layer 2c: EDF header signal labels
    // For .edf/.bdf files, the extension alone can't distinguish scalp EEG
    // from intracranial EEG (iEEG). When an EDF header was read, use the
    // channel labels inside the file to resolve this ambiguity even when
    // the filename and folder contain no keywords (e.g. "HUP282.edf").
    const isEdfFile = file.name.toLowerCase().endsWith('.edf') || file.name.toLowerCase().endsWith('.bdf');
    if (edfHeaderMap && isEdfFile) {
      const edfInfo = edfHeaderMap.get(file.name);
      if (edfInfo) {
        if (edfInfo.modalityHint) {
          // Only override if we're still ambiguous (eeg/ieeg both possible)
          // or if modality is still 'other'.
          const ambiguous = modality === 'other' || (possibleModalities.includes('eeg') && possibleModalities.includes('ieeg'));
          if (ambiguous) {
            modality = edfInfo.modalityHint;
            // Reading actual signal labels from the binary file is stronger
            // evidence than a filename keyword. Weight 0.85 reflects that
            // certainty -- higher than any keyword match (max 0.6-0.75).
            reasons.push({
              layer: 'sidecar',
              message: `EDF signal labels (${edfInfo.signalLabels.slice(0, 5).join(', ')}${edfInfo.signalLabels.length > 5 ? '...' : ''}) confirm ${edfInfo.modalityHint === 'ieeg' ? 'intracranial EEG' : 'scalp EEG'} - ${edfInfo.numSignals} channels read from file header`,
              weight: 0.85,
            });
          }
        }
        // Surface PHI warning if the EDF header contains patient data
        if (edfInfo.phiLikely) {
          reasons.push({
            layer: 'sidecar',
            message: `WARNING: EDF header patient ID field appears to contain non-anonymized data: "${edfInfo.patientId.slice(0, 40)}" -- review before sharing`,
            weight: 0,
          });
        }
        // Add start date/time as an informational reason if present
        if (edfInfo.startDate && edfInfo.startDate !== '        ') {
          reasons.push({
            layer: 'sidecar',
            message: `EDF recording date: ${edfInfo.startDate} ${edfInfo.startTime}`.trim(),
            weight: 0,
          });
        }
      }
    }

    // Layer 3: Folder path
    const folderResult = detectFromFolderPath(file.relativePath);
    reasons.push(...folderResult.reasons);
    // A folder name (e.g. "anat") can only assign a modality when the
    // file's own extension doesn't actively rule it out. Extension
    // possibleModalities is ['other'] for an unrecognized or
    // non-scan-data extension -- e.g. a Thumbs.db thumbnail-cache file,
    // or any other stray non-imaging file, sitting inside an "anat"
    // folder. Without this compatibility check, ANY file in a
    // modality-named folder was silently classified (high confidence)
    // as that modality regardless of what the file actually was, which
    // meant it could be exported as fabricated patient data. The
    // previous code had a second, correctly-gated check right after
    // this one, but it was permanently dead: by the time it ran,
    // `modality` was no longer 'other' because the first (ungated)
    // check above had already blindly overwritten it. Bug found via
    // adversarial junk-file testing 2026-08-02.
    if (folderResult.modality && modality === 'other') {
      const extensionAllowsThisModality =
        possibleModalities.length === 0 || possibleModalities.includes(folderResult.modality);
      if (extensionAllowsThisModality) {
        modality = folderResult.modality;
      }
    }
    if (usesImplantHeuristics && folderResult.session && !session) {
      session = folderResult.session;
    }
    // Ambiguous bare "post-op" folder match: stash the candidate instead
    // of committing to it now, so Layer 4 neighbor inference (below, Pass
    // 2) gets a chance to resolve it via real CT/iEEG evidence first. See
    // folderDetector.ts's FolderResult.ambiguousSessionCandidate.
    if (usesImplantHeuristics && !session && folderResult.ambiguousSessionCandidate) {
      ambiguousSessionCandidate = folderResult.ambiguousSessionCandidate;
    }

    // Custom timepoints: literal match against the exact labels the user
    // defined in structure setup (e.g. "ses-2mo"), not a fuzzy guess.
    if (isCustomStructure && !session) {
      const customResult = detectCustomSession(file.relativePath, knownSessionIds);
      if (customResult.session) {
        session = customResult.session;
        reasons.push(...customResult.reasons);
      }
    }

    // Custom timepoints Layer A fallback: date-cluster chronological
    // ordering (see dateClusterDetector.ts / Pass 0 above). Only consulted
    // when the literal label match just above found nothing. If this
    // subject's date-cluster count didn't match its timepoint count, this
    // surfaces the mismatch reason instead of silently leaving the file
    // unexplained.
    if (isCustomStructure && !session) {
      const dateAssignment = dateClusterAssignments.get(file.name);
      if (dateAssignment) {
        session = dateAssignment.session;
        reasons.push(...dateAssignment.reasons);
      } else {
        const mismatch = dateClusterMismatchByFile.get(file.name);
        if (mismatch) {
          reasons.push(mismatch);
        }
      }
    }

    // Custom timepoints Layer B fallback: folder-cluster structural
    // ordering (see folderClusterDetector.ts / Pass 0 above). Only
    // reached if neither the literal label match nor the date-cluster
    // layer above found anything for this file.
    if (isCustomStructure && !session) {
      const folderAssignment = folderClusterAssignments.get(file.name);
      if (folderAssignment) {
        session = folderAssignment.session;
        reasons.push(...folderAssignment.reasons);
      } else {
        const mismatch = folderClusterMismatchByFile.get(file.name);
        if (mismatch) {
          reasons.push(mismatch);
        }
      }
    }

    // If we still have an ambiguous .nii.gz with no modality clues,
    // default to anat-T1w (most common type)
    if (modality === 'other' && !modalityLocked && possibleModalities.length > 1 &&
        file.name.toLowerCase().endsWith('.nii.gz')) {
      modality = 'anat-T1w';
      reasons.push({
        layer: 'extension',
        message: 'Defaulting ambiguous NIfTI to T1w (most common) - please verify',
        weight: 0.1,
        supports: 'modality',
      });
    }

    intermediateResults.push({ file, modality, session, reasons, possibleModalities, modalityLocked, ambiguousSessionCandidate });
  }

  // ── Build known modalities map for neighbor inference ────────
  const knownModalities = new Map<string, Modality>();
  for (const result of intermediateResults) {
    if (result.modality !== 'other') {
      knownModalities.set(result.file.name, result.modality);
    }
  }

  // ── Custom timepoints Layer C: neighbor propagation (spec Section 3.3) ──
  // Built once from every file already resolved by the literal match or
  // Layer A (date-cluster) above, so an undated file (channels.tsv,
  // electrodes.tsv, a sidecar-less data file) can inherit its folder
  // neighbor's session in Pass 2 below. Folders where resolved files
  // disagree are excluded (see customSessionNeighborPropagation.ts).
  const customFolderSessionMap = isCustomStructure
    ? buildFolderSessionMap(
        intermediateResults
          .filter((r): r is typeof r & { session: string } => r.session !== null)
          .map(r => ({ fileName: r.file.name, relativePath: r.file.relativePath, session: r.session })),
      )
    : new Map<string, string>();

  // ── Pass 2: Run layers 4-5 with context ─────────────────────

  const finalResults: DetectionResult[] = [];

  for (const intermediate of intermediateResults) {
    const { file } = intermediate;
    let { modality, session } = intermediate;
    const reasons = [...intermediate.reasons];

    // Layer 4: Neighbor inference
    const neighborResult = inferFromNeighbors(file, files, knownModalities);
    reasons.push(...neighborResult.reasons);
    if (neighborResult.modality && !intermediate.modalityLocked &&
        (modality === 'other' || modality === 'sidecar-json')) {
      if (modality === 'sidecar-json' && neighborResult.modality) {
        // JSON sidecars: keep sidecar-json as modality but note what it pairs with
        // (we don't change the modality, just add the reason)
      } else {
        modality = neighborResult.modality;
      }
    }
    // Neighbor session inference (e.g. "CT + iEEG in group -> post-implant")
    // encodes implant-specific clinical logic; skip for Custom timepoints.
    if (usesImplantHeuristics && neighborResult.session && !session) {
      // Guard: a file with a pending ambiguous "post-op" candidate (see
      // the ambiguous-postop resolution block below) can never
      // legitimately resolve to pre-implant -- a "post-" folder cannot
      // also be "pre-implant." Without this guard, neighborInference.ts's
      // generic "no CT/iEEG nearby -> preimplant" default (a much weaker,
      // catch-all rule) fires first and silently overrides the pending
      // candidate with a contradictory answer before the dedicated
      // ambiguous-postop fallback below ever gets a turn. The stronger
      // "CT + iEEG -> postimplant" neighbor rule is unaffected by this
      // guard, since it never proposes preimplant. Found via adversarial
      // testing 2026-08-02 while verifying the post-op-ambiguity fix.
      const wouldContradictPendingPostOp =
        intermediate.ambiguousSessionCandidate === 'ses-postsurgery' && neighborResult.session === 'ses-preimplant';
      if (!wouldContradictPendingPostOp) {
        session = neighborResult.session;
      }
    }

    // Layer 5: Subject grouping
    const groupResult = groupIntoSubject(file, files);
    reasons.push(...groupResult.reasons);
    // Subject grouping's embedded session inference uses the same implant
    // keyword vocabulary as the filename/folder detectors; skip for Custom
    // timepoints for the same reason.
    if (usesImplantHeuristics && groupResult.session && !session) {
      session = groupResult.session;
    }

    // Ambiguous "post-op" folder-name resolution (Implant sessions only).
    // A bare "post-op"/"postop" folder name deliberately did NOT set a
    // session in Pass 1 or in Layer 5 above, so that Layer 4's neighbor
    // inference (just above) had a real chance to resolve it correctly
    // via CT/iEEG evidence in the group -- that rule already exists and
    // now actually gets to run for this case. If neighbor inference still
    // didn't find CT+iEEG (e.g. only a lone CT, or imaging-only), fall
    // back to the site's most likely original intent (post-surgery) here,
    // with an explicit lower-confidence corrective reason -- this must
    // run BEFORE the generic default-by-modality fallback below, which
    // would otherwise guess pre-implant baseline for an imaging-only file
    // and be equally likely wrong. Bug found via full-pipeline adversarial
    // testing 2026-08-02 (a "PostOp/CT" folder was silently misclassified
    // as post-surgery every time).
    if (usesImplantHeuristics && !session) {
      const ambiguousSessionCandidate = intermediate.ambiguousSessionCandidate ?? groupResult.ambiguousSessionCandidate;
      if (ambiguousSessionCandidate) {
        session = ambiguousSessionCandidate;
        reasons.push({
          layer: 'folder',
          message: `Ambiguous "post-op" folder name: no CT/iEEG evidence found nearby to indicate post-implant monitoring, so assumed post-surgery follow-up instead. Please verify this session assignment.`,
          weight: 0.2,
        });
      }
    }

    // Layer C: neighbor propagation (Custom timepoints only, spec Section
    // 3.3). Only reached if the literal match and date-cluster layer
    // (both applied earlier, in Pass 1) found nothing for this file.
    if (isCustomStructure && !session) {
      const folder = getFolderPath(file.relativePath);
      const propagated = customFolderSessionMap.get(folder);
      if (propagated) {
        session = propagated;
        reasons.push(neighborPropagationReason(propagated));
      }
    }

    // ── Session fallback: default by modality ──────────────────
    // If no layer found a session, a file would be stranded with a
    // blank dropdown in the mapping table. Most structural and
    // functional imaging is acquired at the pre-implant baseline,
    // while CT and intracranial EEG (and their metadata) belong to
    // the post-implant monitoring session. Localizer scans are
    // excluded from the export but still receive a default session so
    // the mapping table is not cluttered with blank dropdowns; the
    // session value is cosmetic for them. JSON / TSV sidecars are
    // handled separately: they inherit their data file's session
    // during pairing (see computeBidsNames in lib/bids/bidsNaming.ts).
    // This is a deliberately low-confidence guess the user can
    // override in the mapping table.
    // This modality-based guess ("CT/iEEG implies post-implant, everything
    // else implies pre-implant baseline") only makes sense for the Implant
    // sessions preset. For Custom timepoints there's no generalizable
    // heuristic, so an unmatched file is left with session = null and
    // surfaces as unclassified in the mapping table for the user to assign
    // manually -- correct behavior, not a bug, for an arbitrary study.
    if (
      usesImplantHeuristics &&
      !session &&
      modality !== 'other' &&
      modality !== 'sidecar-json' &&
      modality !== 'sidecar-tsv'
    ) {
      const postImplantModalities: Modality[] = ['ct', 'ieeg', 'electrodes', 'channels', 'events'];
      if (postImplantModalities.includes(modality)) {
        session = 'ses-postimplant';
        reasons.push({
          layer: 'default',
          message: 'No session keyword found; defaulted to post-implant based on modality (CT / iEEG). Please verify.',
          weight: 0.1,
        });
      } else {
        session = 'ses-preimplant';
        reasons.push({
          layer: 'default',
          message: 'No session keyword found; defaulted to pre-implant baseline based on modality. Please verify.',
          weight: 0.1,
        });
      }
    }

    // ── Calculate final confidence ─────────────────────────────
    const confidence = calculateConfidence(modality, session, reasons, isSingleSession);

    // ── Generate BIDS filename preview ─────────────────────────
    // The BIDS filename and path are assigned after this loop, in one
    // pass over the whole result set (see computeBidsNames below).

    // ── Add any neighbor warnings as low-weight reasons ────────
    for (const warning of neighborResult.warnings) {
      reasons.push({
        layer: 'neighbor',
        message: `WARNING: ${warning}`,
        weight: 0,
      });
    }

    // A modality resting only on the blind default is a guess, not a
    // detection. Recorded explicitly so the BIDS namer can keep it out of
    // primary/ -- see DetectionResult.modalityIsGuess for why confidence
    // alone was not enough.
    const modalityIsGuess =
      reasons
        .filter(r => r.supports === 'modality')
        .reduce((sum, r) => sum + r.weight, 0) <= 0.15;

    finalResults.push({
      relativePath: file.relativePath,
      fileName: file.name,
      fileSize: file.size,
      file: file.file,
      subjectGroup: groupResult.groupName,
      detectedSession: session,
      detectedModality: modality,
      confidence,
      modalityIsGuess,
      reasons,
      userSession: null,
      userModality: null,
      userSubjectGroup: null,
      bidsFilename: '',
      bidsPath: '',
    });
  }

  // Assign BIDS filenames and paths (run / field-map entities and sidecar
  // pairing) in one pass, so repeated modalities never collide.
  return computeBidsNames(finalResults, undefined, structure);
}

// ── Summary generation ────────────────────────────────────────────

/**
 * Generate a summary of detection results for display in the UI.
 */
export function generateSummary(
  results: DetectionResult[],
  /**
   * The dataset's chosen session structure. Defaults to Implant sessions
   * so existing callers see identical behavior to before Phase 1. The
   * missing-required-file check below (T1w at pre-implant, CT+iEEG at
   * post-implant) is specific to that preset's known clinical protocol --
   * Custom timepoints datasets can represent any study protocol, so no
   * per-timepoint modality requirement is enforced for them (confirmed
   * with Brandon 2026-07-31; see the spec doc).
   */
  structure: DatasetStructure = createDefaultDatasetStructure(),
): DetectionSummary {
  const summary: DetectionSummary = {
    totalFiles: results.length,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    unclassified: 0,
    subjectGroups: [],
    missingRequired: [],
    warnings: [],
  };

  const groupSet = new Set<string>();

  for (const result of results) {
    switch (result.confidence) {
      case 'high': summary.highConfidence++; break;
      case 'medium': summary.mediumConfidence++; break;
      case 'low': summary.lowConfidence++; break;
      case 'unclassified': summary.unclassified++; break;
    }
    groupSet.add(result.subjectGroup);

    // Collect warnings from reasons
    for (const reason of result.reasons) {
      if (reason.message.startsWith('WARNING:')) {
        summary.warnings.push(reason.message);
      }
    }
  }

  summary.subjectGroups = Array.from(groupSet).sort();

  // ── Check for missing required files per subject/session ────
  // Implant-specific: skip entirely for Custom timepoints and Single
  // session (see param doc above; the latter never assigns ses-preimplant/
  // ses-postimplant labels in the first place, so this loop was already a
  // no-op for it, but the condition is spelled out explicitly rather than
  // relying on that incidentally).
  for (const group of structure.presetId === 'implant' ? summary.subjectGroups : []) {
    const groupFiles = results.filter(r => r.subjectGroup === group);

    // Check ses-preimplant: T1w required
    const preimplantFiles = groupFiles.filter(r =>
      (r.detectedSession === 'ses-preimplant' || r.userSession === 'ses-preimplant')
    );
    if (preimplantFiles.length > 0) {
      const hasT1w = preimplantFiles.some(r =>
        (r.userModality ?? r.detectedModality) === 'anat-T1w'
      );
      if (!hasT1w) {
        summary.missingRequired.push(`${group} / ses-preimplant: No T1w MRI detected (required)`);
      }
    }

    // Check ses-postimplant: CT and iEEG required
    const postimplantFiles = groupFiles.filter(r =>
      (r.detectedSession === 'ses-postimplant' || r.userSession === 'ses-postimplant')
    );
    if (postimplantFiles.length > 0) {
      const hasCT = postimplantFiles.some(r =>
        (r.userModality ?? r.detectedModality) === 'ct'
      );
      const hasIEEG = postimplantFiles.some(r =>
        (r.userModality ?? r.detectedModality) === 'ieeg'
      );
      if (!hasCT) {
        summary.missingRequired.push(`${group} / ses-postimplant: No CT scan detected (required)`);
      }
      if (!hasIEEG) {
        summary.missingRequired.push(`${group} / ses-postimplant: No iEEG recording detected (required)`);
      }
    }
  }

  // Deduplicate warnings
  summary.warnings = [...new Set(summary.warnings)];

  return summary;
}
