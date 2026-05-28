import { useState, useEffect, useMemo, type ReactNode } from 'react';
import Button from './Button';
import type { DetectionResult } from '../types/detection';
import type { SubjectMetadata, DatasetDescription, DefacingAttestation, InstitutionConfig } from '../types/metadata';
import type { ValidationReport, ValidationIssue, ValidationCategory, ValidationSeverity } from '../types/validation';
import { runValidation } from '../lib/validation';
import { FolderIcon, ShieldIcon, ClipboardIcon, LinkIcon, FileIcon, TagIcon, BrainIcon, CheckCircleIcon, XCircleIcon } from './Icons';

interface ValidationStepProps {
  detectionResults: DetectionResult[];
  subjects: SubjectMetadata[];
  datasetDescription: DatasetDescription;
  defacingAttestation: DefacingAttestation;
  institutionConfig: InstitutionConfig;
  onContinue: () => void;
  onBack: () => void;
}

// ── Category display config ─────────────────────────────────────

const CATEGORY_INFO: Record<ValidationCategory, { label: string; icon: ReactNode }> = {
  'bids-structure': { label: 'BIDS Structure', icon: <FolderIcon size={18} /> },
  'phi-risk': { label: 'PHI / Privacy', icon: <ShieldIcon size={18} /> },
  'required-files': { label: 'Required Files', icon: <ClipboardIcon size={18} /> },
  'cross-session': { label: 'Cross-Session', icon: <LinkIcon size={18} /> },
  'file-format': { label: 'File Format', icon: <FileIcon size={18} /> },
  'metadata': { label: 'Metadata', icon: <TagIcon size={18} /> },
  'defacing': { label: 'Defacing', icon: <BrainIcon size={18} /> },
};

const SEVERITY_STYLES: Record<ValidationSeverity, { bg: string; text: string; label: string; border: string }> = {
  error: { bg: 'bg-red-50', text: 'text-red-700', label: 'Error', border: 'border-red-200' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Warning', border: 'border-amber-200' },
  info: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Info', border: 'border-blue-200' },
};

export default function ValidationStep({
  detectionResults,
  subjects,
  datasetDescription,
  defacingAttestation,
  institutionConfig,
  onContinue,
  onBack,
}: ValidationStepProps) {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [isRunning, setIsRunning] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filterSeverity, setFilterSeverity] = useState<ValidationSeverity | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<ValidationCategory | 'all'>('all');

  // ── Run validation on mount ───────────────────────────────
  useEffect(() => {
    // Small delay so the UI shows the running state
    const timer = setTimeout(() => {
      const result = runValidation({
        detectionResults,
        subjects,
        datasetDescription,
        defacingAttestation,
        institutionConfig,
      });
      setReport(result);
      setIsRunning(false);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  // ── Rerun validation ──────────────────────────────────────
  const handleRerun = () => {
    setIsRunning(true);
    setDismissedIds(new Set());
    setTimeout(() => {
      const result = runValidation({
        detectionResults,
        subjects,
        datasetDescription,
        defacingAttestation,
        institutionConfig,
      });
      setReport(result);
      setIsRunning(false);
    }, 500);
  };

  // ── Filter and sort issues ────────────────────────────────
  const filteredIssues = useMemo(() => {
    if (!report) return [];

    return report.issues
      .filter(issue => !dismissedIds.has(issue.id))
      .filter(issue => filterSeverity === 'all' || issue.severity === filterSeverity)
      .filter(issue => filterCategory === 'all' || issue.category === filterCategory)
      .sort((a, b) => {
        // Errors first, then warnings, then info
        const severityOrder = { error: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
  }, [report, dismissedIds, filterSeverity, filterCategory]);

  // ── Active error count (undismissed errors) ───────────────
  const activeErrors = useMemo(() => {
    if (!report) return 0;
    return report.issues.filter(i => i.severity === 'error' && !dismissedIds.has(i.id)).length;
  }, [report, dismissedIds]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const dismissIssue = (id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
  };

  // ── Loading state ─────────────────────────────────────────
  if (isRunning) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-12 h-12 border-4 border-[#011F5B] border-t-transparent rounded-full animate-spin mb-6" />
        <h2 className="text-xl font-semibold text-gray-800">Running validation checks...</h2>
        <p className="text-gray-500 mt-2">
          Checking BIDS structure, PHI risks, required files, and cross-session consistency
        </p>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Summary banner */}
      <div className={`rounded-lg p-5 mb-6 ${report.passed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>{report.passed ? <CheckCircleIcon size={32} color="#16a34a" /> : <XCircleIcon size={32} color="#dc2626" />}</span>
            <div>
              <h2 className={`text-lg font-semibold ${report.passed ? 'text-green-800' : 'text-red-800'}`}>
                {report.passed ? 'Validation Passed' : 'Validation Failed'}
              </h2>
              <p className={`text-sm ${report.passed ? 'text-green-600' : 'text-red-600'}`}>
                {report.errorCount} error{report.errorCount !== 1 ? 's' : ''}, {report.warningCount} warning{report.warningCount !== 1 ? 's' : ''}, {report.infoCount} info
                {dismissedIds.size > 0 && ` (${dismissedIds.size} dismissed)`}
              </p>
            </div>
          </div>
          <button
            onClick={handleRerun}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Re-run Checks
          </button>
        </div>
      </div>

      {/* Category summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {(Object.keys(CATEGORY_INFO) as ValidationCategory[])
          .filter(cat => report.categoryCounts[cat] > 0)
          .map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(filterCategory === cat ? 'all' : cat)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                filterCategory === cat
                  ? 'border-[#011F5B] bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="text-lg mb-1">{CATEGORY_INFO[cat].icon}</div>
              <div className="text-xs font-medium text-gray-500">{CATEGORY_INFO[cat].label}</div>
              <div className="text-lg font-semibold text-gray-800">{report.categoryCounts[cat]}</div>
            </button>
          ))}
      </div>

      {/* Severity filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-gray-500">Filter:</span>
        {(['all', 'error', 'warning', 'info'] as const).map(sev => {
          const count = sev === 'all'
            ? report.issues.filter(i => !dismissedIds.has(i.id)).length
            : report.issues.filter(i => i.severity === sev && !dismissedIds.has(i.id)).length;

          return (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filterSeverity === sev
                  ? 'bg-[#011F5B] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {sev === 'all' ? 'All' : SEVERITY_STYLES[sev].label} ({count})
            </button>
          );
        })}
        {filterCategory !== 'all' && (
          <button
            onClick={() => setFilterCategory('all')}
            className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Clear category filter
          </button>
        )}
      </div>

      {/* Issues list */}
      <div className="space-y-2">
        {filteredIssues.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {report.issues.length === 0
              ? 'No issues found — your data looks great!'
              : 'No issues match the current filter.'}
          </div>
        ) : (
          filteredIssues.map(issue => (
            <IssueCard
              key={issue.id}
              issue={issue}
              expanded={expandedIds.has(issue.id)}
              onToggleExpand={() => toggleExpand(issue.id)}
              onDismiss={issue.dismissable ? () => dismissIssue(issue.id) : undefined}
            />
          ))
        )}
      </div>

      {/* Action buttons */}
      <div className="flex justify-between mt-8">
        <Button variant="secondary" onClick={onBack}>Back to Metadata</Button>
        <Button variant="primary" onClick={onContinue} disabled={activeErrors > 0}>
          {activeErrors > 0
            ? `Fix ${activeErrors} Error${activeErrors !== 1 ? 's' : ''} to Continue`
            : 'Continue to Export'}
        </Button>
      </div>
    </div>
  );
}

// ── Issue Card Component ──────────────────────────────────────

function IssueCard({
  issue,
  expanded,
  onToggleExpand,
  onDismiss,
}: {
  issue: ValidationIssue;
  expanded: boolean;
  onToggleExpand: () => void;
  onDismiss?: () => void;
}) {
  const style = SEVERITY_STYLES[issue.severity];
  const catInfo = CATEGORY_INFO[issue.category];

  return (
    <div className={`border ${style.border} rounded-lg overflow-hidden`}>
      {/* Header row */}
      <button
        onClick={onToggleExpand}
        className={`w-full ${style.bg} px-4 py-3 flex items-center gap-3 text-left hover:opacity-90 transition-opacity`}
      >
        {/* Severity badge */}
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${style.text} ${style.bg} border ${style.border}`}>
          {style.label.toUpperCase()}
        </span>

        {/* Category */}
        <span className="text-xs text-gray-500">
          {catInfo.icon} {catInfo.label}
        </span>

        {/* Title */}
        <span className={`flex-1 text-sm font-medium ${style.text}`}>
          {issue.title}
        </span>

        {/* File count */}
        {issue.affectedFiles.length > 0 && (
          <span className="text-xs text-gray-500">
            {issue.affectedFiles.length} file{issue.affectedFiles.length !== 1 ? 's' : ''}
          </span>
        )}

        {/* Expand indicator */}
        <span className="text-gray-500 text-xs">
          {expanded ? '▼' : '▶'}
        </span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 py-3 bg-white border-t border-gray-100 space-y-3">
          <p className="text-sm text-gray-600 whitespace-pre-line">{issue.description}</p>

          {/* Affected files */}
          {issue.affectedFiles.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Affected files:</p>
              <div className="max-h-32 overflow-y-auto">
                {issue.affectedFiles.map((file, i) => (
                  <div key={i} className="text-xs text-gray-500 font-mono py-0.5">
                    {file}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subject/session info */}
          {(issue.subjectGroup || issue.session) && (
            <div className="flex gap-4 text-xs text-gray-500">
              {issue.subjectGroup && <span>Subject: {issue.subjectGroup}</span>}
              {issue.session && <span>Session: {issue.session}</span>}
            </div>
          )}

          {/* Dismiss button */}
          {onDismiss && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="text-xs text-gray-500 hover:text-gray-600 transition-colors"
            >
              Dismiss this issue
            </button>
          )}
        </div>
      )}
    </div>
  );
}
