import type { SubjectMetadata, SessionMetadata } from '../types/metadata';
import { SESSIONS } from '../types/detection';

interface SubjectMetadataFormProps {
  subject: SubjectMetadata;
  onUpdate: (updated: SubjectMetadata) => void;
  /** Whether this subject's data was auto-filled from a TSV */
  autoFilled: boolean;
}

/**
 * Per-subject metadata form.
 *
 * Shows the subject's BIDS ID and a row for each detected session
 * with fields for acquisition date and age. If a sessions.tsv was
 * found in the dropped data, fields are pre-filled.
 */
export default function SubjectMetadataForm({
  subject,
  onUpdate,
  autoFilled,
}: SubjectMetadataFormProps) {

  const updateSession = (index: number, field: keyof SessionMetadata, value: string) => {
    const newSessions = [...subject.sessions];
    newSessions[index] = { ...newSessions[index], [field]: value };
    onUpdate({ ...subject, sessions: newSessions });
  };

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
          <span className="text-xs text-gray-400">
            (from: {subject.subjectGroup})
          </span>
        </div>
        {autoFilled && (
          <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full">
            Auto-filled from TSV
          </span>
        )}
      </div>

      {/* Session rows */}
      <div className="divide-y divide-gray-100">
        {subject.sessions.map((session, i) => (
          <div key={session.sessionId} className="px-5 py-3 flex items-center gap-6">
            {/* Session label */}
            <div className="w-36 shrink-0">
              <span className="text-sm font-medium text-gray-700">
                {getSessionLabel(session.sessionId)}
              </span>
              <div className="text-xs text-gray-400 mt-0.5">
                {session.sessionId}
              </div>
            </div>

            {/* Acquisition date */}
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Acquisition Date
              </label>
              <input
                type="date"
                value={session.acqTime}
                onChange={(e) => updateSession(i, 'acqTime', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded px-3 py-1.5
                  hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Age at visit */}
            <div className="w-32 shrink-0">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Age (years)
              </label>
              <input
                type="number"
                min="0"
                max="120"
                step="0.1"
                placeholder="e.g., 34"
                value={session.age}
                onChange={(e) => updateSession(i, 'age', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded px-3 py-1.5
                  hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        ))}

        {subject.sessions.length === 0 && (
          <div className="px-5 py-4 text-sm text-gray-400 italic">
            No sessions detected for this subject. Sessions will be added based on the mapping table.
          </div>
        )}
      </div>
    </div>
  );
}
