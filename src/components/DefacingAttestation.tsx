import type { DefacingAttestation as DefacingAttestationType } from '../types/metadata';

interface DefacingAttestationProps {
  attestation: DefacingAttestationType;
  onUpdate: (updated: DefacingAttestationType) => void;
  /** Whether structural MRIs were detected in the data */
  hasStructuralMri: boolean;
}

/**
 * Defacing attestation component.
 *
 * Per governance framework GOV-001, structural MRI (T1w, T2w) in
 * ses-preimplant/anat/ and ses-postsurgery/anat/ must be defaced
 * before upload. The user must attest via checkbox that this was done.
 *
 * Records: user, timestamp, tool name, and tool version for the
 * ALCOA+ audit log.
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
            No structural MRI files (T1w, T2w) were detected in your data. Defacing attestation is not required for this upload.
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
                HIPAA Compliance Requirement
              </p>
              <p className="text-sm text-amber-700 mt-1">
                All structural MRI files (T1w, T2w) must be defaced or de-identified before upload to protect patient privacy. Defacing removes facial features from brain scans that could be used to identify a patient.
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
            <span className="font-medium">I confirm that all structural MRI files in this upload have been defaced or de-identified</span>
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
