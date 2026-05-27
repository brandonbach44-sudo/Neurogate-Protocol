/**
 * Types for metadata forms.
 *
 * Covers three categories:
 * 1. Per-subject session metadata (dates, ages) → sessions.tsv
 * 2. Dataset-level metadata → dataset_description.json
 * 3. Defacing attestation → audit log entry
 */

import type { Session } from './detection';

// ── Per-Subject Session Metadata ──────────────────────────────────
// Each subject has up to 3 sessions, each with a date and optional age.
// This data goes into sub-<ID>_sessions.tsv

export interface SessionMetadata {
  /** Session ID (e.g., "ses-preimplant") */
  sessionId: Session;
  /** Acquisition date in ISO 8601 format (YYYY-MM-DD) */
  acqTime: string;
  /** Age in years at the time of this session (optional) */
  age: string;
}

export interface SubjectMetadata {
  /** Subject group name from detection (e.g., "Patient_01") */
  subjectGroup: string;
  /** BIDS subject ID that will be assigned (e.g., "sub-CHOP001") */
  bidsSubjectId: string;
  /** Session metadata for each detected session */
  sessions: SessionMetadata[];
}

// ── Dataset Description ───────────────────────────────────────────
// Generated as dataset_description.json on first upload.
// Per BIDS spec and governance framework.

export interface DatasetDescription {
  /** Study name (required) */
  name: string;
  /** BIDS version — currently 1.8.0 (required) */
  bidsVersion: string;
  /** Dataset type — always "raw" for source data (required) */
  datasetType: 'raw';
  /** List of contributing authors (required) */
  authors: string[];
  /** Acknowledgements (optional) */
  acknowledgements: string;
  /** Funding sources (optional) */
  funding: string[];
}

export function createDefaultDatasetDescription(): DatasetDescription {
  return {
    name: '',
    bidsVersion: '1.8.0',
    datasetType: 'raw',
    authors: [''],
    acknowledgements: '',
    funding: [''],
  };
}

// ── Defacing Attestation ──────────────────────────────────────────
// User attests that structural MRIs have been defaced/de-identified.
// Logged per ALCOA+ audit requirements.

export interface DefacingAttestation {
  /** User confirms defacing was performed on the structural MRIs in the upload. */
  confirmed: boolean;
  /** Timestamp when the attestation checkbox was ticked (auto-generated). */
  timestamp: string | null;
}

export function createDefaultAttestation(): DefacingAttestation {
  return {
    confirmed: false,
    timestamp: null,
  };
}

// ── Institution / Upload Config ───────────────────────────────────
// Needed for generating subject IDs

export interface InstitutionConfig {
  /** Institution prefix for subject IDs (2-6 uppercase letters, e.g., "CHOP", "PENN") */
  prefix: string;
  /** Starting counter for subject numbering (e.g., 1 → sub-CHOP001) */
  startingNumber: number;
}

export function createDefaultInstitutionConfig(): InstitutionConfig {
  return {
    prefix: '',
    startingNumber: 1,
  };
}
