import { useState, useCallback } from 'react';
import FileDropZone from './components/FileDropZone';
import MappingTable from './components/MappingTable';
import MetadataStep from './components/MetadataStep';
import ValidationStep from './components/ValidationStep';
import AuditLogPanel from './components/AuditLogPanel';
import type { MetadataOutput } from './components/MetadataStep';
import type { ScannedFile } from './types/files';
import type { DetectionResult, DetectionSummary, Session, Modality } from './types/detection';
import { getEffectiveSession, getEffectiveModality } from './types/detection';
import { runDetection, generateSummary } from './lib/detection';
import { useAudit, downloadAuditJson } from './lib/audit';

type AppStep = 'drop' | 'scanning' | 'mapping' | 'metadata' | 'validation';

function App() {
  const [step, setStep] = useState<AppStep>('drop');
  const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([]);
  const [detectionResults, setDetectionResults] = useState<DetectionResult[]>([]);
  const [summary, setSummary] = useState<DetectionSummary | null>(null);
  const [metadataOutput, setMetadataOutput] = useState<MetadataOutput | null>(null);
  const [auditPanelOpen, setAuditPanelOpen] = useState(false);

  const audit = useAudit();

  // ── Handle files from the drop zone ───────────────────────────
  const handleFilesScanned = useCallback((files: ScannedFile[]) => {
    setScannedFiles(files);
    setStep('scanning');

    // Log file scan
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    audit.logFilesScanned(files.length, totalSize);

    // Run detection engine (small delay so the UI shows the scanning state)
    setTimeout(() => {
      const results = runDetection(files);
      const sum = generateSummary(results);
      setDetectionResults(results);
      setSummary(sum);
      setStep('mapping');

      // Log detection results
      audit.logDetectionCompleted(
        sum.totalFiles,
        sum.highConfidence,
        sum.mediumConfidence,
        sum.lowConfidence,
        sum.unclassified,
        sum.subjectGroups,
      );
    }, 500);
  }, [audit]);

  // ── Update a single detection result (user correction) ────────
  const handleUpdateResult = useCallback((index: number, updates: Partial<DetectionResult>) => {
    setDetectionResults(prev => {
      const next = [...prev];
      const old = next[index];
      next[index] = { ...old, ...updates };

      // Log corrections
      if (updates.userSession && updates.userSession !== getEffectiveSession(old)) {
        audit.logSessionCorrected(old.fileName, getEffectiveSession(old), updates.userSession);
      }
      if (updates.userModality && updates.userModality !== getEffectiveModality(old)) {
        audit.logModalityCorrected(old.fileName, getEffectiveModality(old), updates.userModality);
      }
      if (updates.userSubjectGroup && updates.userSubjectGroup !== old.subjectGroup) {
        audit.logSubjectCorrected(old.fileName, old.subjectGroup, updates.userSubjectGroup);
      }

      const newSummary = generateSummary(next);
      setSummary(newSummary);
      return next;
    });
  }, [audit]);

  // ── Bulk update session for selected files ────────────────────
  const handleBulkUpdateSession = useCallback((indices: number[], session: Session) => {
    setDetectionResults(prev => {
      const next = [...prev];
      for (const i of indices) {
        next[i] = { ...next[i], userSession: session };
      }
      setSummary(generateSummary(next));
      return next;
    });
    audit.logBulkSessionApplied(indices.length, session);
  }, [audit]);

  // ── Bulk update modality for selected files ───────────────────
  const handleBulkUpdateModality = useCallback((indices: number[], modality: Modality) => {
    setDetectionResults(prev => {
      const next = [...prev];
      for (const i of indices) {
        next[i] = { ...next[i], userModality: modality };
      }
      setSummary(generateSummary(next));
      return next;
    });
    audit.logBulkModalityApplied(indices.length, modality);
  }, [audit]);

  // ── Handle metadata completion ────────────────────────────────
  const handleMetadataComplete = useCallback((metadata: MetadataOutput) => {
    setMetadataOutput(metadata);
    setStep('validation');

    // Log metadata entries
    audit.logInstitutionConfigured(metadata.institutionConfig.prefix, metadata.institutionConfig.startingNumber);

    for (const subject of metadata.subjects) {
      audit.logSubjectMetadataEntered(subject.bidsSubjectId, subject.sessions.length);
    }

    const filledAuthors = metadata.datasetDescription.authors.filter(a => a.trim()).length;
    audit.logDatasetDescriptionEntered(metadata.datasetDescription.name, filledAuthors);

    if (metadata.defacingAttestation.confirmed) {
      audit.logDefacingAttested(
        metadata.defacingAttestation.toolName,
        metadata.defacingAttestation.toolVersion,
        metadata.defacingAttestation.attestedBy,
      );
    }
  }, [audit]);

  // ── Reset to start ───────────────────────────────────────────
  const handleStartOver = useCallback(() => {
    setStep('drop');
    setScannedFiles([]);
    setDetectionResults([]);
    setSummary(null);
    setMetadataOutput(null);
  }, []);

  // ── Get current step number for the indicator ─────────────────
  const stepNumber = (s: AppStep): number => {
    switch (s) {
      case 'drop': case 'scanning': return 1;
      case 'mapping': return 2;
      case 'metadata': return 3;
      case 'validation': return 4;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#011F5B] text-white py-4 px-6 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Epilepsy Data Uploader
            </h1>
            <p className="text-blue-200 text-sm mt-0.5">
              BIDS-compliant data organization &amp; upload
            </p>
          </div>
          <div className="flex items-center gap-6">
            {/* Step indicator */}
            <div className="flex items-center gap-2 text-sm">
              {[
                { num: 1, label: 'Drop Files' },
                { num: 2, label: 'Review Mapping' },
                { num: 3, label: 'Metadata' },
                { num: 4, label: 'Validate' },
                { num: 5, label: 'Upload' },
              ].map((s, i) => (
                <span key={s.num} className="flex items-center gap-2">
                  {i > 0 && <span className="text-blue-400">&rarr;</span>}
                  <span className={
                    stepNumber(step) === s.num
                      ? 'text-white font-medium'
                      : stepNumber(step) > s.num
                        ? 'text-blue-200'
                        : 'text-blue-400'
                  }>
                    {s.num}. {s.label}
                  </span>
                </span>
              ))}
            </div>

            {/* Audit log button */}
            <button
              onClick={() => setAuditPanelOpen(true)}
              className="relative px-3 py-1.5 text-xs font-medium bg-white/10 rounded-lg
                hover:bg-white/20 transition-colors"
            >
              Audit Log
              {audit.getEntryCount() > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-400 text-white
                  text-xs rounded-full flex items-center justify-center font-semibold">
                  {audit.getEntryCount()}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Step 1: Drop zone */}
        {step === 'drop' && (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-gray-800">
                Get Started
              </h2>
              <p className="text-gray-500 mt-2">
                Drop your patient data folder below to begin organizing for BIDS upload
              </p>
            </div>
            <FileDropZone onFilesScanned={handleFilesScanned} />
          </div>
        )}

        {/* Scanning animation */}
        {step === 'scanning' && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-12 h-12 border-4 border-[#011F5B] border-t-transparent rounded-full animate-spin mb-6" />
            <h2 className="text-xl font-semibold text-gray-800">Analyzing your files...</h2>
            <p className="text-gray-500 mt-2">
              Detecting sessions, modalities, and subject groups from {scannedFiles.length} files
            </p>
          </div>
        )}

        {/* Step 2: Mapping table */}
        {step === 'mapping' && summary && (
          <MappingTable
            results={detectionResults}
            summary={summary}
            onUpdateResult={handleUpdateResult}
            onBulkUpdateSession={handleBulkUpdateSession}
            onBulkUpdateModality={handleBulkUpdateModality}
            onContinue={() => setStep('metadata')}
            onBack={handleStartOver}
          />
        )}

        {/* Step 3: Metadata */}
        {step === 'metadata' && (
          <MetadataStep
            detectionResults={detectionResults}
            scannedFiles={scannedFiles}
            onContinue={handleMetadataComplete}
            onBack={() => setStep('mapping')}
          />
        )}

        {/* Step 4: Validation */}
        {step === 'validation' && metadataOutput && (
          <ValidationStep
            detectionResults={detectionResults}
            subjects={metadataOutput.subjects}
            datasetDescription={metadataOutput.datasetDescription}
            defacingAttestation={metadataOutput.defacingAttestation}
            institutionConfig={metadataOutput.institutionConfig}
            onContinue={() => {
              // Log the upload action (last entry before auto-download)
              audit.addEntry('upload-started', 'Upload initiated — upload integration pending Pennsieve meeting', {
                subjectCount: metadataOutput!.subjects.length,
                fileCount: detectionResults.length,
              }, 'system');

              // Auto-download the audit log
              const exportedBy = metadataOutput!.defacingAttestation.attestedBy || 'user';
              downloadAuditJson(audit, exportedBy);

              // TODO: Actual Pennsieve upload
              alert('Upload integration pending Pennsieve meeting. Your audit log has been downloaded.');
            }}
            onBack={() => setStep('metadata')}
          />
        )}
      </main>

      {/* Audit Log Panel (slide-out) */}
      <AuditLogPanel
        isOpen={auditPanelOpen}
        onClose={() => setAuditPanelOpen(false)}
      />
    </div>
  );
}

export default App;
