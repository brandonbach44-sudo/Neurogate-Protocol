import type { DefacingAttestation as DefacingAttestationType } from '../types/metadata';
import { DEFACING_MODALITY_LABELS } from '../types/detection';

interface DefacingAttestationProps {
  attestation: DefacingAttestationType;
  onUpdate: (updated: DefacingAttestationType) => void;
  /** Whether structural MRIs were detected in the data */
  hasStructuralMri: boolean;
}

/**
 * Defacing attestation component.
 *
 * Per governance framework GOV-001, structural MRI (DEFACING_MODALITIES
 * in types/detection.ts) must be defaced before the dataset is shared.
 * The user must attest via checkbox that this was done. The confirmation
 * timestamp is kept, and leaving the Metadata step with the box ticked
 * adds a "defacing attested" entry to the audit log.
 */
export default function DefacingAttestation({
  attestation,
  onUpdate,
  hasStructuralMri,
}: DefacingAttestationProps) {

  const handleConfirmChange = (confirmed: boolean) => {
    onUpdate({
      ...attestation,
      confirmed,
      timestamp: confirmed ? new Date().toISOString() : null,
    });
  };

  if (!hasStructuralMri) {
    return (
      <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-800">
            Defacing Attestation
          </span>
        </div>
        <div className="p-5">
          <p className="text-sm text-gray-500 italic">
            No structural MRI ({DEFACING_MODALITY_LABELS}) was detected in your data. Defacing attestation is not required for this dataset.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-800">
          Defacing Attestation
        </span>
        <span className="text-xs text-red-500 ml-2">Required</span>
      </div>

      <div className="p-5 space-y-5">
        {/* Warning notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex gap-2">
            <span className="text-amber-600 text-lg mt-0.5">&#9888;</span>
            <div>
              <p className="text-sm font-medium text-amber-800">
                Required by GOV-001
              </p>
              <p className="text-sm text-amber-700 mt-1">
                All structural MRI ({DEFACING_MODALITY_LABELS}) must be defaced before the dataset is shared. Defacing removes facial features from brain scans that could be used to identify a patient.
              </p>
            </div>
          </div>
        </div>

        {/* Attestation checkbox */}
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="defacing-confirm"
            checked={attestation.confirmed}
            onChange={(e) => handleConfirmChange(e.target.checked)}
            className="mt-1 w-5 h-5 rounded border-gray-300 text-[#011F5B] focus:ring-[#011F5B]"
          />
          <label htmlFor="defacing-confirm" className="text-sm text-gray-700 cursor-pointer">
            <span className="font-medium">I confirm that all structural MRI files in this dataset have been defaced or de-identified</span>
            <span className="text-gray-500"> using an approved defacing tool before being included in this dataset.</span>
          </label>
        </div>

        {/* Confirmation timestamp */}
        {attestation.confirmed && attestation.timestamp && (
          <div className="ml-8 text-xs text-green-600">
            Confirmed at: {new Date(attestation.timestamp).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
