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
  SESSIONS,
  MODALITIES,
  getEffectiveSession,
  getEffectiveModality,
  getEffectiveSubjectGroup,
} from '../types/detection';
import { formatFileSize } from '../types/files';

interface MappingTableProps {
  results: DetectionResult[];
  summary: DetectionSummary;
  onUpdateResult: (index: number, updates: Partial<DetectionResult>) => void;
  onBulkUpdateSession: (indices: number[], session: Session) => void;
  onBulkUpdateModality: (indices: number[], modality: Modality) => void;
  onContinue: () => void;
  onBack: () => void;
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

type FilterMode = 'all' | 'high' | 'medium' | 'low' | 'unclassified';

export default function MappingTable({
  results,
  summary,
  onUpdateResult,
  onBulkUpdateSession,
  onBulkUpdateModality,
  onContinue,
  onBack,
}: MappingTableProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [bulkSession, setBulkSession] = useState<Session | ''>('');
  const [bulkModality, setBulkModality] = useState<Modality | ''>('');

  // ── Filter results based on confidence filter ─────────────────
  const filteredIndices = useMemo(() => {
    return results
      .map((_, i) => i)
      .filter(i => {
        if (filterMode === 'all') return true;
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
            className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={filterMode === 'all'
              ? { backgroundColor: '#011F5B', color: '#ffffff' }
              : { backgroundColor: '#f1f5f9', color: '#64748b' }
            }
          >
            All ({summary.totalFiles})
          </button>
          <button
            onClick={() => setFilterMode('high')}
            className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={filterMode === 'high'
              ? { backgroundColor: '#22c55e', color: '#ffffff' }
              : { backgroundColor: 'rgba(34,197,94,0.1)', color: '#16a34a' }
            }
          >
            High ({summary.highConfidence})
          </button>
          <button
            onClick={() => setFilterMode('medium')}
            className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={filterMode === 'medium'
              ? { backgroundColor: '#eab308', color: '#ffffff' }
              : { backgroundColor: 'rgba(234,179,8,0.1)', color: '#ca8a04' }
            }
          >
            Medium ({summary.mediumConfidence})
          </button>
          <button
            onClick={() => setFilterMode('low')}
            className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={filterMode === 'low'
              ? { backgroundColor: '#f97316', color: '#ffffff' }
              : { backgroundColor: 'rgba(249,115,22,0.1)', color: '#ea580c' }
            }
          >
            Low ({summary.lowConfidence})
          </button>
          <button
            onClick={() => setFilterMode('unclassified')}
            className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={filterMode === 'unclassified'
              ? { backgroundColor: '#ef4444', color: '#ffffff' }
              : { backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171' }
            }
          >
            Needs Review ({summary.unclassified})
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

          <div className="flex items-center gap-2">
            <select
              value={bulkSession}
              onChange={(e) => setBulkSession(e.target.value as Session | '')}
              className="text-sm border border-blue-300 rounded px-2 py-1.5 bg-white"
              aria-label="Bulk-assign session to selected files"
            >
              <option value="">Set session...</option>
              {SESSIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <button
              onClick={applyBulkSession}
              disabled={!bulkSession}
              className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Apply
            </button>
          </div>

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
              className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Apply
            </button>
          </div>

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
        <div className="grid grid-cols-[40px_1fr_140px_160px_180px_100px] gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
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
          <span>Session</span>
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
                    grid grid-cols-[40px_1fr_140px_160px_180px_100px] gap-2 px-4 py-2.5 text-sm
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

                  {/* Session dropdown */}
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
                      {SESSIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>

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
