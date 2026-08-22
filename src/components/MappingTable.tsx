import { useState, useMemo } from 'react';
import Button from './Button';
import type {
  DetectionResult,
  DetectionSummary,
  Session,
  Modality,
  Confidence,
} from '../types/detection';
import {
  MODALITIES,
  getEffectiveSession,
  getEffectiveModality,
  getEffectiveSubjectGroup,
} from '../types/detection';
import { formatFileSize } from '../types/files';
import { getSessionOptions, createDefaultDatasetStructure, type DatasetStructure } from '../types/sessionStructure';

interface MappingTableProps {
  results: DetectionResult[];
  summary: DetectionSummary;
  onUpdateResult: (index: number, updates: Partial<DetectionResult>) => void;
  onBulkUpdateSession: (indices: number[], session: Session) => void;
  onBulkUpdateModality: (indices: number[], modality: Modality) => void;
  onContinue: () => void;
  onBack: () => void;
  /** Active session structure; defaults to Implant sessions if not passed. */
  structure?: DatasetStructure;
}

// ── Confidence badge colors ───────────────────────────────────────
const CONFIDENCE_STYLES: Record<Confidence, { bg: string; text: string; label: string }> = {
  high: { bg: '', text: '', label: 'High' },
  medium: { bg: '', text: '', label: 'Medium' },
  low: { bg: '', text: '', label: 'Low' },
  unclassified: { bg: '', text: '', label: 'Needs Review' },
};

const CONFIDENCE_COLORS: Record<Confidence, { bg: string; color: string }> = {
  high: { bg: 'rgba(34,197,94,0.12)', color: '#16a34a' },
  medium: { bg: 'rgba(234,179,8,0.12)', color: '#a16207' },
  low: { bg: 'rgba(249,115,22,0.12)', color: '#c2410c' },
  unclassified: { bg: 'rgba(239,68,68,0.2)', color: '#f87171' },
};

type FilterMode = 'all' | 'needs-decision' | 'high' | 'medium' | 'low' | 'unclassified';

/**
 * True when this file will not be exported until the reviewer supplies
 * something the tool could not work out for itself.
 *
 * This is a different question from confidence, and the more useful one to
 * filter on. Confidence tiers answer "how sure is the tool"; this answers
 * "what is waiting on me". They diverge sharply: a scanner-derived ADC map
 * can sit in the derivatives tree perfectly correctly while being graded
 * low, and a redundant duplicate copy is deliberately excluded rather than
 * uncertain. Filtering by confidence buried the handful of genuine
 * decisions among hundreds of files that were already handled properly.
 */
export function needsUserDecision(r: DetectionResult): boolean {
  // A modality that came only from the blind fallback: never exported
  // until a real modality is chosen.
  if (r.modalityIsGuess && !r.userModality) return true;
  // No session and none can be inferred -- the file has nowhere to go.
  // Derived maps and excluded duplicates are not counted: they are
  // resolved, just not in primary/.
  if (!getEffectiveSession(r) && !r.derivedLabel && !r.duplicateOf) {
    const m = getEffectiveModality(r);
    if (m !== 'other' && m !== 'localizer' && m !== 'sidecar-json' && m !== 'sidecar-tsv') return true;
  }
  return false;
}

export default function MappingTable({
  results,
  summary,
  onUpdateResult,
  onBulkUpdateSession,
  onBulkUpdateModality,
  onContinue,
  onBack,
  structure = createDefaultDatasetStructure(),
}: MappingTableProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [bulkSession, setBulkSession] = useState<Session | ''>('');
  const [bulkModality, setBulkModality] = useState<Modality | ''>('');
  const sessionOptions = useMemo(() => getSessionOptions(structure), [structure]);

  const decisionCount = useMemo(
    () => results.filter(needsUserDecision).length,
    [results],
  );

  // ── Filter results based on confidence filter ─────────────────
  const filteredIndices = useMemo(() => {
    return results
      .map((_, i) => i)
      .filter(i => {
        if (filterMode === 'all') return true;
        if (filterMode === 'needs-decision') return needsUserDecision(results[i]);
        return results[i].confidence === filterMode;
      });
  }, [results, filterMode]);

  // ── Select all / deselect all ─────────────────────────────────
  const toggleSelectAll = () => {
    if (selectedIndices.size === filteredIndices.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(filteredIndices));
    }
  };

  const toggleSelect = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedIndices(next);
  };

  // ── Bulk operations ───────────────────────────────────────────
  const applyBulkSession = () => {
    if (bulkSession && selectedIndices.size > 0) {
      onBulkUpdateSession(Array.from(selectedIndices), bulkSession as Session);
      setBulkSession('');
    }
  };

  const applyBulkModality = () => {
    if (bulkModality && selectedIndices.size > 0) {
      onBulkUpdateModality(Array.from(selectedIndices), bulkModality as Modality);
      setBulkModality('');
    }
  };

  // ── Ordered assign (Custom timepoints only) ─────────────────────
  // Unlike applyBulkSession (one session applied to every selected file),
  // this pairs each selected file with a different timepoint in order:
  // the 1st selected file gets sessionOptions[0], the 2nd gets
  // sessionOptions[1], etc. Selection order follows the order files were
  // checked (Set insertion order), not table row order, so the user can
  // click files in the sequence they belong to. Extra files beyond the
  // number of defined timepoints are left unassigned.
  const isCustomTimepoints = structure.presetId === 'custom-timepoints';
  // Single session preset (Phase 2, August 2026): this dataset has no
  // session concept at all, so the Session column/dropdown/bulk-assign
  // control are hidden rather than shown empty and flagged red for a
  // "missing" value that isn't actually missing anything.
  const isSingleSession = structure.presetId === 'single-session';
  const gridCols = isSingleSession
    ? 'grid-cols-[40px_1fr_140px_180px_100px]'
    : 'grid-cols-[40px_1fr_140px_160px_180px_100px]';
  const orderedAssignCount = Math.min(selectedIndices.size, sessionOptions.length);
  const applyOrderedAssign = () => {
    const orderedIndices = Array.from(selectedIndices).slice(0, orderedAssignCount);
    orderedIndices.forEach((index, i) => {
      onUpdateResult(index, { userSession: sessionOptions[i].value });
    });
    setSelectedIndices(new Set());
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* ── Summary Bar ──────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Detection Results</h2>
          <span className="text-sm text-gray-500">
            {summary.totalFiles} files across {summary.subjectGroups.length} subject{summary.subjectGroups.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Confidence breakdown */}
        <div className="flex gap-3 mb-3">
          <button
            onClick={() => setFilterMode('all')}
            className="btn-cta px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={filterMode === 'all'
              ? { backgroundColor: '#011F5B', color: '#ffffff' }
              : { backgroundColor: '#f1f5f9', color: '#64748b' }
            }
          >
            All ({summary.totalFiles})
          </button>
          <button
            onClick={() => setFilterMode('high')}
            className="btn-cta px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={filterMode === 'high'
              ? { backgroundColor: '#22c55e', color: '#ffffff' }
              : { backgroundColor: 'rgba(34,197,94,0.1)', color: '#16a34a' }
            }
          >
            High ({summary.highConfidence})
          </button>
          <button
            onClick={() => setFilterMode('medium')}
            className="btn-cta px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={filterMode === 'medium'
              ? { backgroundColor: '#eab308', color: '#ffffff' }
              : { backgroundColor: 'rgba(234,179,8,0.1)', color: '#ca8a04' }
            }
          >
            Medium ({summary.mediumConfidence})
          </button>
          <button
            onClick={() => setFilterMode('low')}
            className="btn-cta px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={filterMode === 'low'
              ? { backgroundColor: '#f97316', color: '#ffffff' }
              : { backgroundColor: 'rgba(249,115,22,0.1)', color: '#ea580c' }
            }
          >
            Low ({summary.lowConfidence})
          </button>
          <button
            onClick={() => setFilterMode('unclassified')}
            className="btn-cta px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={filterMode === 'unclassified'
              ? { backgroundColor: '#ef4444', color: '#ffffff' }
              : { backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171' }
            }
          >
            Needs Review ({summary.unclassified})
          </button>
          {/*
            Listed last but it is the one to click first: the short list of
            files actually waiting on a human, as opposed to the confidence
            tiers, which mix "unsure" together with "resolved, just not in
            primary/". See needsUserDecision above.
          */}
          <button
            onClick={() => setFilterMode('needs-decision')}
            className="btn-cta px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={filterMode === 'needs-decision'
              ? { backgroundColor: '#7c3aed', color: '#ffffff' }
              : { backgroundColor: 'rgba(124,58,237,0.12)', color: '#6d28d9' }
            }
            title="Files that will not be exported until you supply a modality or session the tool could not determine."
          >
            Needs your decision ({decisionCount})
          </button>
        </div>

        {/* Warnings and missing required files */}
        {(summary.missingRequired.length > 0 || summary.warnings.length > 0) && (
          <div className="mt-3 space-y-1">
            {summary.missingRequired.map((msg, i) => (
              <div key={`missing-${i}`} className="text-sm text-red-600 flex items-start gap-1.5">
                <span className="mt-0.5">&#9888;</span>
                <span>{msg}</span>
              </div>
            ))}
            {summary.warnings.map((msg, i) => (
              <div key={`warn-${i}`} className="text-sm text-orange-600 flex items-start gap-1.5">
                <span className="mt-0.5">&#9888;</span>
                <span>{msg.replace('WARNING: ', '')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Bulk Operations Bar ──────────────────────────────── */}
      {selectedIndices.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium text-blue-800">
            {selectedIndices.size} file{selectedIndices.size !== 1 ? 's' : ''} selected
          </span>

          {!isSingleSession && (
            <div className="flex items-center gap-2">
              <select
                value={bulkSession}
                onChange={(e) => setBulkSession(e.target.value as Session | '')}
                className="text-sm border border-blue-300 rounded px-2 py-1.5 bg-white"
                aria-label="Bulk-assign session to selected files"
              >
                <option value="">Set session...</option>
                {sessionOptions.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <button
                onClick={applyBulkSession}
                disabled={!bulkSession}
                className="btn-cta text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Apply
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <select
              value={bulkModality}
              onChange={(e) => setBulkModality(e.target.value as Modality | '')}
              className="text-sm border border-blue-300 rounded px-2 py-1.5 bg-white"
              aria-label="Bulk-assign modality to selected files"
            >
              <option value="">Set modality...</option>
              {MODALITIES.filter(m => m.value !== 'sidecar-json' && m.value !== 'sidecar-tsv').map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <button
              onClick={applyBulkModality}
              disabled={!bulkModality}
              className="btn-cta text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Apply
            </button>
          </div>

          {isCustomTimepoints && selectedIndices.size > 1 && (
            <div className="flex items-center gap-2 border-l border-blue-200 pl-4">
              <button
                onClick={applyOrderedAssign}
                disabled={orderedAssignCount === 0}
                className="btn-cta text-sm px-3 py-1.5 bg-[#011F5B] text-white rounded hover:bg-[#01326e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Assigns the 1st selected file to the earliest timepoint, the 2nd to the next, and so on."
              >
                Assign in order to timepoints
              </button>
              <span className="text-xs text-blue-700">
                ({orderedAssignCount} of {selectedIndices.size} will be assigned
                {selectedIndices.size > orderedAssignCount ? ` — only ${sessionOptions.length} timepoints defined` : ''})
              </span>
            </div>
          )}

          <button
            onClick={() => setSelectedIndices(new Set())}
            className="text-sm text-blue-600 hover:text-blue-800 ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* ── File Table ───────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
        {/* Header */}
        <div className={`grid ${gridCols} gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider`}>
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={selectedIndices.size === filteredIndices.length && filteredIndices.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300"
              aria-label="Select all files"
            />
          </div>
          <span>Original File</span>
          <span>Subject</span>
          {!isSingleSession && <span>Session</span>}
          <span>Modality</span>
          <span className="text-center">Confidence</span>
        </div>

        {/* Rows */}
        <div className="max-h-[600px] overflow-y-auto">
          {filteredIndices.map((resultIndex) => {
            const result = results[resultIndex];
            const effectiveSession = getEffectiveSession(result);
            const effectiveModality = getEffectiveModality(result);
            const effectiveGroup = getEffectiveSubjectGroup(result);
            const confStyle = CONFIDENCE_STYLES[result.confidence];
            const isExpanded = expandedRow === resultIndex;
            const isSelected = selectedIndices.has(resultIndex);

            return (
              <div key={resultIndex}>
                {/* Main row */}
                <div
                  className={`
                    grid ${gridCols} gap-2 px-4 py-2.5 text-sm
                    border-b border-gray-100
                    ${isSelected ? 'bg-blue-50/50' : resultIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}
                    hover:bg-blue-50/30 transition-colors cursor-pointer
                  `}
                  onClick={() => setExpandedRow(isExpanded ? null : resultIndex)}
                >
                  {/* Checkbox */}
                  <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(resultIndex)}
                      className="w-4 h-4 rounded border-gray-300"
                      aria-label={`Select ${result.fileName}`}
                    />
                  </div>

                  {/* File path */}
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-gray-700 truncate" title={result.relativePath}>
                      {result.relativePath}
                    </div>
                    <div className="font-mono text-xs text-gray-500 mt-0.5 truncate" title={result.bidsPath}>
                      &rarr; {result.bidsPath}
                    </div>

                    {/*
                      Why this file is not where a reviewer might expect.

                      The detection engine records three states that change
                      a file's destination, and none of them were visible
                      here: the row showed only a confidence badge and a
                      path. A reviewer saw files sitting in unclassified/
                      with no way to tell whether the tool was unsure, had
                      deliberately excluded a redundant copy, or had routed
                      a scanner-computed map to derivatives on purpose.
                      Without that, "needs review" and "already handled
                      correctly" look identical.
                    */}
                    {(result.modalityIsGuess || result.duplicateOf || result.derivedLabel) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {result.modalityIsGuess && !result.userModality && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: 'rgba(249,115,22,0.12)', color: '#c2410c' }}
                            title="No detection layer identified this scan; the modality shown is a fallback guess. It will not be exported until you choose a modality."
                          >
                            Guessed &mdash; pick a modality to export
                          </span>
                        )}
                        {result.duplicateOf && !result.userModality && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: 'rgba(234,179,8,0.12)', color: '#a16207' }}
                            title={`The same series was converted twice. "${result.duplicateOf}" is being exported instead of this copy, because it carries the scanner metadata sidecar. Set a modality here to export this copy as well.`}
                          >
                            Duplicate of {result.duplicateOf}
                          </span>
                        )}
                        {result.derivedLabel && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#1d4ed8' }}
                            title={`Computed by the scanner rather than acquired, so it is exported under derivatives/ as desc-${result.derivedLabel} instead of alongside the raw acquisitions.`}
                          >
                            Derived: {result.derivedLabel}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Subject group */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={effectiveGroup}
                      onChange={(e) => onUpdateResult(resultIndex, { userSubjectGroup: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      aria-label={`Subject group for ${result.fileName}`}
                    />
                  </div>

                  {/* Session dropdown -- hidden entirely for Single session
                      datasets, which have no session concept at all, rather
                      than shown empty and flagged red for a "missing" value
                      that was never expected in the first place. */}
                  {!isSingleSession && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <select
                        value={effectiveSession || ''}
                        aria-label={`Session for ${result.fileName}`}
                        onChange={(e) => onUpdateResult(resultIndex, {
                          userSession: (e.target.value as Session) || null
                        })}
                        className={`w-full text-xs border rounded px-2 py-1.5 outline-none
                          ${!effectiveSession ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-400'}
                          focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                        `}
                      >
                        <option value="">-- Select --</option>
                        {sessionOptions.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Modality dropdown */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <select
                      value={effectiveModality}
                      aria-label={`Modality for ${result.fileName}`}
                      onChange={(e) => onUpdateResult(resultIndex, {
                        userModality: e.target.value as Modality
                      })}
                      className={`w-full text-xs border rounded px-2 py-1.5 outline-none
                        ${effectiveModality === 'other' ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-400'}
                        focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                      `}
                    >
                      {MODALITIES.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Confidence badge */}
                  <div className="flex items-center justify-center">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: CONFIDENCE_COLORS[result.confidence].bg,
                        color: CONFIDENCE_COLORS[result.confidence].color,
                      }}
                    >
                      {confStyle.label}
                    </span>
                  </div>
                </div>

                {/* Expanded detail row */}
                {isExpanded && (
                  <div className="px-12 py-3 bg-gray-50 border-b border-gray-200 text-xs">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="font-semibold text-gray-600">Detection Reasons:</span>
                        <ul className="mt-1 space-y-0.5">
                          {result.reasons.map((reason, ri) => (
                            <li key={ri} className={`flex items-start gap-1.5 ${
                              reason.message.startsWith('WARNING') ? 'text-orange-600' : 'text-gray-600'
                            }`}>
                              <span className="mt-0.5 text-gray-500">&bull;</span>
                              <span>
                                <span className="text-gray-500">[{reason.layer}]</span>{' '}
                                {reason.message}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="font-semibold text-gray-600">File Info:</span>
                        <div className="mt-1 space-y-0.5 text-gray-600">
                          <div>Size: {formatFileSize(result.fileSize)}</div>
                          <div>BIDS name: <span className="font-mono">{result.bidsFilename}</span></div>
                          <div>BIDS path: <span className="font-mono">{result.bidsPath}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Action Buttons ───────────────────────────────────── */}
      <div className="flex justify-between mt-6">
        <Button variant="secondary" onClick={onBack}>Back to Drop Zone</Button>
        <Button variant="primary" onClick={onContinue}>Continue to Metadata</Button>
      </div>
    </div>
  );
}
