import { useState, useEffect, useMemo } from 'react';
import Button from './Button';
import SubjectMetadataForm from './SubjectMetadataForm';
import DatasetDescriptionForm from './DatasetDescriptionForm';
import DefacingAttestation from './DefacingAttestation';
import type { DetectionResult } from '../types/detection';
import { getEffectiveSession, getEffectiveModality, getEffectiveSubjectGroup } from '../types/detection';
import type {
  SubjectMetadata,
  DatasetDescription,
  DefacingAttestation as DefacingAttestationType,
  InstitutionConfig,
  SessionMetadata,
} from '../types/metadata';
import {
  createDefaultDatasetDescription,
  createDefaultAttestation,
  createDefaultInstitutionConfig,
} from '../types/metadata';
import type { ScannedFile } from '../types/files';
import { autoFillFromDroppedFiles } from '../lib/metadata';

interface MetadataStepProps {
  detectionResults: DetectionResult[];
  scannedFiles: ScannedFile[];
  onContinue: (metadata: MetadataOutput) => void;
  onBack: () => void;
}

/** Everything the metadata step produces */
export interface MetadataOutput {
  subjects: SubjectMetadata[];
  datasetDescription: DatasetDescription;
  defacingAttestation: DefacingAttestationType;
  institutionConfig: InstitutionConfig;
}

type TabId = 'institution' | 'subjects' | 'dataset' | 'defacing';

export default function MetadataStep({
  detectionResults,
  scannedFiles,
  onContinue,
  onBack,
}: MetadataStepProps) {
  const [activeTab, setActiveTab] = useState<TabId>('institution');
  const [institutionConfig, setInstitutionConfig] = useState<InstitutionConfig>(createDefaultInstitutionConfig());
  const [subjects, setSubjects] = useState<SubjectMetadata[]>([]);
  const [datasetDescription, setDatasetDescription] = useState<DatasetDescription>(createDefaultDatasetDescription());
  const [attestation, setAttestation] = useState<DefacingAttestationType>(createDefaultAttestation());
  const [autoFilledSubjects, setAutoFilledSubjects] = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [autoFilledDataset, setAutoFilledDataset] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // ── Derive subject groups and sessions from detection results ──
  const subjectData = useMemo(() => {
    const groups = new Map<string, Set<string>>();

    for (const result of detectionResults) {
      const group = getEffectiveSubjectGroup(result);
      const session = getEffectiveSession(result);
      if (!groups.has(group)) {
        groups.set(group, new Set());
      }
      if (session) {
        groups.get(group)!.add(session);
      }
    }

    return groups;
  }, [detectionResults]);

  // ── Check if structural MRIs exist (for defacing attestation) ──
  const hasStructuralMri = useMemo(() => {
    return detectionResults.some(r => {
      const mod = getEffectiveModality(r);
      return mod === 'anat-T1w' || mod === 'anat-T2w' || mod === 'anat-FLAIR';
    });
  }, [detectionResults]);

  // ── Initialize subjects and try auto-fill on mount ────────────
  useEffect(() => {
    const init = async () => {
      // Build subject groups from scanned files
      const filesByGroup = new Map<string, ScannedFile[]>();
      for (const result of detectionResults) {
        const group = getEffectiveSubjectGroup(result);
        if (!filesByGroup.has(group)) {
          filesByGroup.set(group, []);
        }
        filesByGroup.get(group)!.push({
          relativePath: result.relativePath,
          name: result.fileName,
          size: result.fileSize,
          file: result.file,
        });
      }

      // Try auto-fill from dropped files
      const autoFilled = await autoFillFromDroppedFiles(scannedFiles, filesByGroup);

      // Track which subjects were auto-filled
      const filledSet = new Set<string>();
      if (autoFilled.sessionsBySubject.size > 0) {
        autoFilled.sessionsBySubject.forEach((_, key) => filledSet.add(key));
      }
      setAutoFilledSubjects(filledSet);

      // Pre-fill dataset description if found
      if (autoFilled.datasetDescription) {
        setDatasetDescription(prev => ({
          ...prev,
          ...autoFilled.datasetDescription,
        }));
        setAutoFilledDataset(true);
      }

      // Build initial subject metadata
      const initialSubjects: SubjectMetadata[] = [];
      let counter = institutionConfig.startingNumber;

      for (const [group, sessionSet] of subjectData) {
        // Check if auto-fill has session data for this group
        const autoSessions = autoFilled.sessionsBySubject.get(group);

        const sessions: SessionMetadata[] = [];
        for (const sessionId of sessionSet) {
          // Try to get auto-filled data for this session
          const autoSession = autoSessions?.find(s => s.sessionId === sessionId);
          sessions.push({
            sessionId: sessionId as any,
            acqTime: autoSession?.acqTime || '',
            age: autoSession?.age || '',
          });
        }

        // Sort sessions in clinical order
        const sessionOrder = ['ses-preimplant', 'ses-postimplant', 'ses-postsurgery'];
        sessions.sort((a, b) =>
          sessionOrder.indexOf(a.sessionId) - sessionOrder.indexOf(b.sessionId)
        );

        const prefix = institutionConfig.prefix || 'SITE';
        const paddedNum = String(counter).padStart(3, '0');

        initialSubjects.push({
          subjectGroup: group,
          bidsSubjectId: `sub-${prefix}${paddedNum}`,
          sessions,
        });
        counter++;
      }

      setSubjects(initialSubjects);
      setIsLoading(false);
    };

    init();
  }, []); // Run once on mount

  // ── Regenerate BIDS IDs when institution config changes ───────
  useEffect(() => {
    if (isLoading) return;
    setSubjects(prev => prev.map((subject, i) => {
      const prefix = institutionConfig.prefix || 'SITE';
      const paddedNum = String(institutionConfig.startingNumber + i).padStart(3, '0');
      return {
        ...subject,
        bidsSubjectId: `sub-${prefix}${paddedNum}`,
      };
    }));
  }, [institutionConfig.prefix, institutionConfig.startingNumber, isLoading]);

  // ── Update a single subject ───────────────────────────────────
  const updateSubject = (index: number, updated: SubjectMetadata) => {
    setSubjects(prev => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  };

  // ── Validation for "Continue" button ──────────────────────────
  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    if (!institutionConfig.prefix || !/^[A-Z]{2,6}$/.test(institutionConfig.prefix)) {
      errors.push('Institution prefix must be 2-6 uppercase letters');
    }

    if (!datasetDescription.name.trim()) {
      errors.push('Study name is required');
    }

    if (datasetDescription.authors.every(a => !a.trim())) {
      errors.push('At least one author is required');
    }

    if (hasStructuralMri) {
      if (!attestation.confirmed) {
        errors.push('Defacing attestation is required for structural MRI data');
      }
    }

    return errors;
  }, [institutionConfig, datasetDescription, attestation, hasStructuralMri]);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'institution', label: 'Institution Setup' },
    { id: 'subjects', label: 'Subject Sessions', count: subjects.length },
    { id: 'dataset', label: 'Dataset Description' },
    { id: 'defacing', label: 'Defacing Attestation' },
  ];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin mb-4" style={{ borderColor: '#011F5B', borderTopColor: 'transparent' }} />
        <p className="text-gray-500">Loading metadata forms...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Tab navigation */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-[#011F5B] text-[#011F5B]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-4">
        {/* Institution Setup */}
        {activeTab === 'institution' && (
          <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-5 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Institution Configuration</h3>
              <p className="text-xs text-gray-500">
                This determines how subject IDs are generated. Each institution gets a unique prefix.
              </p>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label htmlFor="ms-institution-prefix" className="block text-sm font-medium text-gray-700 mb-1">
                  Institution Prefix <span className="text-red-500">*</span>
                </label>
                <input
                  id="ms-institution-prefix"
                  type="text"
                  value={institutionConfig.prefix}
                  onChange={(e) => setInstitutionConfig(prev => ({
                    ...prev,
                    prefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6),
                  }))}
                  placeholder="e.g., CHOP, PENN, HUP"
                  maxLength={6}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2
                    hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none
                    uppercase tracking-wider"
                />
                <p className="text-xs text-gray-500 mt-1">2-6 uppercase letters identifying your institution</p>
              </div>

              <div className="w-40">
                <label htmlFor="ms-starting-number" className="block text-sm font-medium text-gray-700 mb-1">
                  Starting Number
                </label>
                <input
                  id="ms-starting-number"
                  type="number"
                  min="1"
                  value={institutionConfig.startingNumber}
                  onChange={(e) => setInstitutionConfig(prev => ({
                    ...prev,
                    startingNumber: Math.max(1, parseInt(e.target.value) || 1),
                  }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2
                    hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  First subject will be {institutionConfig.prefix || 'SITE'}{String(institutionConfig.startingNumber).padStart(3, '0')}
                </p>
              </div>
            </div>

            {/* Preview of generated IDs */}
            {subjects.length > 0 && institutionConfig.prefix && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 mb-2">Subject ID Preview:</p>
                <div className="flex flex-wrap gap-2">
                  {subjects.slice(0, 8).map(s => (
                    <span key={s.bidsSubjectId} className="text-xs font-mono bg-white border border-gray-200 rounded px-2 py-1">
                      {s.bidsSubjectId}
                    </span>
                  ))}
                  {subjects.length > 8 && (
                    <span className="text-xs text-gray-500 self-center">
                      +{subjects.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Subject Sessions */}
        {activeTab === 'subjects' && (
          <div className="space-y-4">
            {subjects.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No subjects detected. Go back to the mapping table to assign files to subjects.
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500">
                  Review the detected subjects and sessions below.
                  {autoFilledSubjects.size > 0 && ' Some fields were auto-filled from metadata files found in your data.'}
                </p>
                {subjects.map((subject, i) => (
                  <SubjectMetadataForm
                    key={subject.subjectGroup}
                    subject={subject}
                    onUpdate={(updated) => updateSubject(i, updated)}
                    autoFilled={autoFilledSubjects.has(subject.subjectGroup)}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* Dataset Description */}
        {activeTab === 'dataset' && (
          <DatasetDescriptionForm
            description={datasetDescription}
            onUpdate={setDatasetDescription}
            autoFilled={autoFilledDataset}
          />
        )}

        {/* Defacing Attestation */}
        {activeTab === 'defacing' && (
          <DefacingAttestation
            attestation={attestation}
            onUpdate={setAttestation}
            hasStructuralMri={hasStructuralMri}
          />
        )}
      </div>

      {/* Validation errors (only shown after user tries to continue) */}
      {showErrors && validationErrors.length > 0 && (
        <div className="mt-6 rounded-lg p-4" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <p className="text-sm font-medium mb-1" style={{ color: '#f87171' }}>Please complete the following before continuing:</p>
          <ul className="space-y-0.5">
            {validationErrors.map((err, i) => (
              <li key={i} className="text-sm flex items-start gap-1.5" style={{ color: '#fca5a5' }}>
                <span className="mt-0.5">&bull;</span>
                <span>{err}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-between mt-6">
        <Button variant="secondary" onClick={onBack}>Back to Mapping</Button>
        <Button
          variant="primary"
          onClick={() => {
            if (validationErrors.length > 0) {
              setShowErrors(true);
            } else {
              onContinue({
                subjects,
                datasetDescription,
                defacingAttestation: attestation,
                institutionConfig,
              });
            }
          }}
        >
          Continue to Validation
        </Button>
      </div>
    </div>
  );
}
