import { useState } from 'react';
import Button from './Button';
import {
  SESSION_PRESETS,
  TIMEPOINT_UNITS,
  MAX_CUSTOM_TIMEPOINTS,
  buildCustomSessionLabel,
  sortTimepoints,
  findDuplicateTimepoints,
  validateCustomTimepoints,
  type PresetId,
  type CustomTimepoint,
  type TimepointUnit,
  type DatasetStructure,
} from '../types/sessionStructure';

/**
 * Phase 1 addition (July 2026): the structure-setup screen shown before
 * file organization begins. Wired in as Step 1 of 6 in ToolPage.tsx's
 * /tool flow. See Documents/Phase1_Flexible_Folder_Structure_Spec.md.
 *
 * Step 1: pick a session-structure preset from an extensible list.
 * Step 2 (Custom timepoints only): build timepoints from a number + unit
 * picker. There is no free-text entry anywhere in Step 2, so a site name
 * or PI name cannot end up in a generated session label.
 */

interface StructureSetupStepProps {
  onContinue: (structure: DatasetStructure) => void;
  onBack?: () => void;
  /** Pre-fill the picker from a previously chosen structure (e.g. on re-entry). */
  initialStructure?: DatasetStructure;
}

function emptyTimepoint(): CustomTimepoint {
  return { number: 0, unit: 'month' };
}

export default function StructureSetupStep({ onContinue, onBack, initialStructure }: StructureSetupStepProps) {
  const [selectedPreset, setSelectedPreset] = useState<PresetId | null>(
    initialStructure?.presetId ?? null,
  );
  const [timepoints, setTimepoints] = useState<CustomTimepoint[]>(
    initialStructure?.presetId === 'custom-timepoints' && initialStructure.timepoints.length > 0
      ? initialStructure.timepoints
      : [emptyTimepoint()],
  );
  const [showErrors, setShowErrors] = useState(false);

  const validation = validateCustomTimepoints(timepoints);
  const duplicateIndices = new Set(findDuplicateTimepoints(timepoints));
  const sortedPreview = sortTimepoints(timepoints);

  function updateTimepoint(index: number, patch: Partial<CustomTimepoint>) {
    setTimepoints(prev => prev.map((tp, i) => (i === index ? { ...tp, ...patch } : tp)));
  }

  function addTimepoint() {
    if (timepoints.length >= MAX_CUSTOM_TIMEPOINTS) return;
    setTimepoints(prev => [...prev, emptyTimepoint()]);
  }

  function removeTimepoint(index: number) {
    setTimepoints(prev => prev.filter((_, i) => i !== index));
  }

  function handleContinue() {
    if (selectedPreset === 'implant') {
      onContinue({ presetId: 'implant' });
      return;
    }
    if (selectedPreset === 'custom-timepoints') {
      if (!validation.valid) {
        setShowErrors(true);
        return;
      }
      onContinue({ presetId: 'custom-timepoints', timepoints });
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Study structure</h2>
      <p className="text-sm text-gray-500 mb-6">
        Choose how this dataset's sessions are organized. You can change this later, but it's easiest to set it correctly now.
      </p>

      {/* ── Step 1: preset picker ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {SESSION_PRESETS.map(preset => {
          const isSelected = selectedPreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => setSelectedPreset(preset.id)}
              className={`text-left rounded-xl border p-4 transition-colors ${
                isSelected
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="text-sm font-semibold text-gray-900 mb-1">{preset.label}</div>
              <div className="text-xs text-gray-500 leading-relaxed">{preset.description}</div>
            </button>
          );
        })}
      </div>

      {/* ── Step 2: custom timepoints builder ─────────────────── */}
      {selectedPreset === 'custom-timepoints' && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
          <div className="text-sm font-semibold text-gray-900 mb-3">Define timepoints</div>

          <div className="flex flex-col gap-2 mb-3">
            {timepoints.map((tp, i) => {
              const isDuplicate = duplicateIndices.has(i);
              return (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={tp.number}
                    onChange={e => updateTimepoint(i, { number: Math.max(0, Math.min(99, Number(e.target.value) || 0)) })}
                    className="w-16 text-sm border border-gray-300 rounded px-2 py-1.5"
                    aria-label={`Timepoint ${i + 1} number`}
                  />
                  <select
                    value={tp.unit}
                    onChange={e => updateTimepoint(i, { unit: e.target.value as TimepointUnit })}
                    className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
                    aria-label={`Timepoint ${i + 1} unit`}
                  >
                    {TIMEPOINT_UNITS.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                  <span className="text-sm text-gray-400">&rarr;</span>
                  <code
                    className={`text-sm px-2 py-1 rounded ${
                      isDuplicate ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {buildCustomSessionLabel(tp)}
                  </code>
                  {tp.number === 0 && (
                    <span className="text-xs text-gray-400">baseline</span>
                  )}
                  {isDuplicate && (
                    <span className="text-xs text-red-600">duplicate label</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeTimepoint(i)}
                    disabled={timepoints.length <= 1}
                    className="ml-auto text-xs text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`Remove timepoint ${i + 1}`}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addTimepoint}
            disabled={timepoints.length >= MAX_CUSTOM_TIMEPOINTS}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add timepoint
          </button>

          <p className="text-xs text-gray-400 mt-2">
            Duplicate labels are blocked. Sessions are ordered by elapsed time, not entry order, regardless of the order you add them in.
          </p>

          {/* Chronological preview */}
          {sortedPreview.length > 1 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-400 mb-1">Session order:</div>
              <div className="flex flex-wrap gap-1.5">
                {sortedPreview.map((tp, i) => (
                  <code key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {buildCustomSessionLabel(tp)}
                  </code>
                ))}
              </div>
            </div>
          )}

          {showErrors && !validation.valid && (
            <div className="mt-3 text-xs text-red-600">
              {validation.errors.map((err, i) => (
                <div key={i}>{err}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between">
        {onBack ? (
          <Button variant="secondary" onClick={onBack}>Back</Button>
        ) : <div />}
        <Button
          variant="primary"
          onClick={handleContinue}
          disabled={!selectedPreset}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
