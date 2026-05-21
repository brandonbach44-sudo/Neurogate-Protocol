import { useState } from 'react';
import { useAudit } from '../lib/audit';
import { downloadAuditJson, downloadAuditCsv } from '../lib/audit';
import type { AuditEntry } from '../types/audit';

const ACTION_LABELS: Record<string, string> = {
  'files-scanned': 'Files Scanned',
  'detection-completed': 'Detection Complete',
  'session-corrected': 'Session Corrected',
  'modality-corrected': 'Modality Corrected',
  'subject-corrected': 'Subject Corrected',
  'bulk-session-applied': 'Bulk Session',
  'bulk-modality-applied': 'Bulk Modality',
  'institution-configured': 'Institution Config',
  'subject-metadata-entered': 'Subject Metadata',
  'dataset-description-entered': 'Dataset Description',
  'defacing-attested': 'Defacing Attested',
  'defacing-revoked': 'Defacing Revoked',
  'validation-run': 'Validation Run',
  'validation-issue-dismissed': 'Issue Dismissed',
  'upload-started': 'Upload Started',
  'upload-completed': 'Upload Complete',
  'upload-failed': 'Upload Failed',
  'audit-log-exported': 'Log Exported',
};

const ACTOR_STYLES: Record<string, string> = {
  user: 'bg-blue-100 text-blue-700',
  system: 'bg-gray-100 text-gray-600',
};

interface AuditLogPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuditLogPanel({ isOpen, onClose }: AuditLogPanelProps) {
  const audit = useAudit();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (!isOpen) return null;

  const entries = audit.getEntries();

  const handleExportJson = () => {
    downloadAuditJson(audit, 'user');
  };

  const handleExportCsv = () => {
    downloadAuditCsv(audit, 'user');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between shrink-0 bg-[#011F5B] text-white">
          <div>
            <h2 className="text-sm font-semibold">ALCOA+ Audit Log</h2>
            <p className="text-blue-200 text-xs mt-0.5">
              {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} recorded
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-blue-200 hover:text-white transition-colors text-lg"
            aria-label="Close audit log panel"
          >
            &times;
          </button>
        </div>

        {/* Export buttons */}
        <div className="px-5 py-3 border-b border-gray-200 flex gap-2 shrink-0">
          <button
            onClick={handleExportJson}
            disabled={entries.length === 0}
            className="px-3 py-1.5 text-xs font-medium bg-[#011F5B] text-white rounded
              hover:bg-[#01326e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Export JSON
          </button>
          <button
            onClick={handleExportCsv}
            disabled={entries.length === 0}
            className="px-3 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded
              hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Export CSV
          </button>
          <div className="flex-1" />
          <span className="text-xs text-gray-500 self-center">
            ALCOA+ Compliant
          </span>
        </div>

        {/* Entries list */}
        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              No audit entries yet. Actions will be logged as you progress through the wizard.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {[...entries].reverse().map(entry => (
                <AuditEntryRow
                  key={entry.id}
                  entry={entry}
                  expanded={expandedId === entry.id}
                  onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Single Entry Row ──────────────────────────────────────────

function AuditEntryRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: AuditEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const time = new Date(entry.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const actorStyle = ACTOR_STYLES[entry.actor] || ACTOR_STYLES.user;

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-5 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start gap-3">
          {/* Timestamp */}
          <span className="text-xs text-gray-500 font-mono shrink-0 mt-0.5 w-16">
            {timeStr}
          </span>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${actorStyle}`}>
                {entry.actor}
              </span>
              <span className="text-xs text-gray-500">
                {ACTION_LABELS[entry.action] || entry.action}
              </span>
            </div>
            <p className="text-sm text-gray-700 truncate">
              {entry.summary}
            </p>
          </div>

          {/* Expand indicator */}
          <span className="text-xs text-gray-300 mt-1">
            {expanded ? '▼' : '▶'}
          </span>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && Object.keys(entry.details).length > 0 && (
        <div className="px-5 pb-3 ml-[76px]">
          <div className="bg-gray-50 rounded p-3 text-xs font-mono text-gray-600 overflow-x-auto">
            {Object.entries(entry.details).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="text-gray-500 shrink-0">{key}:</span>
                <span className="text-gray-700">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
