import type { SubjectMetadata } from '../types/metadata';
import { SESSIONS } from '../types/detection';

interface SubjectMetadataFormProps {
  subject: SubjectMetadata;
  onUpdate: (updated: SubjectMetadata) => void;
  /** Whether this subject's data was auto-filled from a TSV */
  autoFilled: boolean;
}

/**
 * Per-subject metadata card.
 *
 * Shows the subject's BIDS ID and which sessions were detected.
 * Metadata like age and acquisition dates are expected to come
 * from participants.tsv / sessions.tsv files included in the upload.
 */
export default function SubjectMetadataForm({
  subject,
  onUpdate: _onUpdate,
  autoFilled,
}: SubjectMetadataFormProps) {
  void _onUpdate; // reserved for future per-field editing

  const getSessionLabel = (sessionId: string): string => {
    return SESSIONS.find(s => s.value === sessionId)?.label || sessionId;
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Subject header */}
      <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-800">
            {subject.bidsSubjectId}
          </span>
          <span className="text-xs text-gray-500">
            (from: {subject.subjectGroup})
          </span>
        </div>
        {autoFilled && (
          <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full">
            Auto-filled from TSV
          </span>
        )}
      </div>

      {/* Session list */}
      <div className="divide-y divide-gray-100">
        {subject.sessions.map((session) => (
          <div key={session.sessionId} className="px-5 py-3 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
            <span className="text-sm font-medium text-gray-700">
              {getSessionLabel(session.sessionId)}
            </span>
            <span className="text-xs text-gray-500">
              {session.sessionId}
            </span>
          </div>
        ))}

        {subject.sessions.length === 0 && (
          <div className="px-5 py-4 text-sm text-gray-500 italic">
            No sessions detected for this subject. Sessions will be added based on the mapping table.
          </div>
        )}
      </div>
    </div>
  );
}
