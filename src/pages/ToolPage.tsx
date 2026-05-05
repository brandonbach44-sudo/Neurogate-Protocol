import { useState, useCallback } from 'react';
import FileDropZone from '../components/FileDropZone';
import MappingTable from '../components/MappingTable';
import MetadataStep from '../components/MetadataStep';
import ValidationStep from '../components/ValidationStep';
import ExportStep from '../components/ExportStep';
import AuditLogPanel from '../components/AuditLogPanel';
import { NeuronIcon } from '../components/Icons';
import NeuralParticles from '../components/NeuralParticles';
import type { MetadataOutput } from '../components/MetadataStep';
import type { ScannedFile } from '../types/files';
import type { DetectionResult, DetectionSummary, Session, Modality } from '../types/detection';
import { getEffectiveSession, getEffectiveModality } from '../types/detection';
import { runDetection, generateSummary } from '../lib/detection';
import { useAudit, downloadAuditJson } from '../lib/audit';

type AppStep = 'drop' | 'scanning' | 'mapping' | 'metadata' | 'validation' | 'export';

function ToolPage() {
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
      case 'export': return 5;
    }
  };

  return (
    <div className="min-h-screen relative" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 40%, #f1f5f9 100%)' }}>
      {/* Neural network background animation */}
      <NeuralParticles />

      {/* Header */}
      <header
        className="relative z-10 text-white py-4 px-6 border-b bg-gradient-to-r from-[#011F5B] to-[#01326e]"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/10">
              <NeuronIcon size={28} color="#6DD3CE" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">
                NeuroGate
              </h1>
              <p className="text-sm mt-0.5 text-blue-200">
                Multi-site epilepsy data compliance tool
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            {/* Step indicator */}
            <div className="flex items-center text-sm">
              {[
                { num: 1, label: 'Drop Files' },
                { num: 2, label: 'Mapping' },
                { num: 3, label: 'Metadata' },
                { num: 4, label: 'Validate' },
                { num: 5, label: 'Export' },
              ].map((s, i) => {
                const current = stepNumber(step);
                const isCompleted = current > s.num;
                const isActive = current === s.num;
                return (
                  <span key={s.num} className="flex items-center">
                    {i > 0 && (
                      <span
                        className="w-8 h-0.5 mx-1"
                        style={{
                          backgroundColor: isCompleted ? '#6DD3CE' : 'rgba(255,255,255,0.2)',
                        }}
                      />
                    )}
                    <span className="flex flex-col items-center gap-1">
                      <span
                        className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all duration-300"
                        style={{
                          backgroundColor: isCompleted
                            ? '#6DD3CE'
                            : isActive
                              ? '#6DD3CE'
                              : 'transparent',
                          color: isCompleted
                            ? '#011F5B'
                            : isActive
                              ? '#011F5B'
                              : 'rgba(255,255,255,0.5)',
                          border: isCompleted || isActive
                            ? 'none'
                            : '1.5px solid rgba(255,255,255,0.3)',
                        }}
                      >
                        {isCompleted ? '✓' : s.num}
                      </span>
                      <span
                        className="text-[10px] whitespace-nowrap"
                        style={{
                          color: isCompleted || isActive ? '#6DD3CE' : 'rgba(255,255,255,0.5)',
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        {s.label}
                      </span>
                    </span>
                  </span>
                );
              })}
            </div>

            {/* Audit log button */}
            <button
              onClick={() => setAuditPanelOpen(true)}
              className="relative px-3 py-1.5 text-xs font-medium rounded-lg transition-all bg-white/15 text-white hover:bg-white/25"
            >
              Audit Log
              {audit.getEntryCount() > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 text-xs rounded-full flex items-center justify-center font-semibold bg-[#6DD3CE] text-[#011F5B]">
                  {audit.getEntryCount()}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-10">
        {/* Step 1: Drop zone */}
        {step === 'drop' && (
          <div>
            {/* Hero section */}
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                Organize your neuroimaging data
              </h2>
              <p className="mt-3 max-w-lg mx-auto text-base leading-relaxed text-gray-500">
                Drop your patient data folder to auto-detect sessions and modalities,
                validate BIDS compliance, and export a ready-to-upload dataset.
              </p>
            </div>
            <FileDropZone onFilesScanned={handleFilesScanned} />

            {/* Feature cards below drop zone */}
            <div className="grid grid-cols-3 gap-4 mt-10 max-w-3xl mx-auto">
              {[
                {
                  title: 'Auto-Detection',
                  desc: '5-layer engine identifies sessions, modalities, and subject groups',
                  accent: '#00d4ff',
                },
                {
                  title: 'PHI Scanning',
                  desc: 'Flags potential patient identifiers before data leaves your site',
                  accent: '#ff6b6b',
                },
                {
                  title: 'ALCOA+ Audit Trail',
                  desc: 'Every correction and decision is logged for regulatory compliance',
                  accent: '#00d4ff',
                },
              ].map((feat) => (
                <div key={feat.title}
                  className="rounded-xl p-5 border border-gray-100 bg-white shadow-sm transition-all hover:shadow-md"
                >
                  <div className="w-8 h-8 rounded-lg mb-3 flex items-center justify-center"
                    style={{ backgroundColor: feat.accent + '15' }}>
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: feat.accent }} />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-800">{feat.title}</h3>
                  <p className="text-xs mt-1 leading-relaxed text-gray-500">{feat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scanning animation */}
        {step === 'scanning' && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="relative w-16 h-16 mb-6">
              <div className="absolute inset-0 border-4 rounded-full border-[#011F5B]/15" />
              <div className="absolute inset-0 border-4 border-t-transparent rounded-full animate-spin border-[#011F5B]" style={{ borderTopColor: 'transparent' }} />
              <div className="absolute inset-2 border-4 border-b-transparent rounded-full animate-spin border-[#011F5B]/30"
                style={{ borderBottomColor: 'transparent', animationDirection: 'reverse', animationDuration: '1.5s' }} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Analyzing your files...</h2>
            <p className="mt-2 text-gray-500">
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
              audit.addEntry('validation-passed', 'Validation passed, proceeding to export', {
                subjectCount: metadataOutput!.subjects.length,
                fileCount: detectionResults.length,
              }, 'system');
              setStep('export');
            }}
            onBack={() => setStep('metadata')}
          />
        )}
        {/* Step 5: Export */}
        {step === 'export' && metadataOutput && (
          <ExportStep
            detectionResults={detectionResults}
            subjects={metadataOutput.subjects}
            datasetDescription={metadataOutput.datasetDescription}
            institutionConfig={metadataOutput.institutionConfig}
            onBack={() => setStep('validation')}
            onExportComplete={() => {
              // Auto-download audit log with the export
              const exportedBy = metadataOutput!.defacingAttestation.attestedBy || 'user';
              downloadAuditJson(audit, exportedBy);

              audit.addEntry('export-completed', 'BIDS dataset exported as ZIP', {
                subjectCount: metadataOutput!.subjects.length,
                fileCount: detectionResults.length,
              }, 'system');
            }}
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

export default ToolPage;
