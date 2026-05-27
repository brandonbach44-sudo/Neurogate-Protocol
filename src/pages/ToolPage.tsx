import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import FileDropZone from '../components/FileDropZone';
import MappingTable from '../components/MappingTable';
import MetadataStep from '../components/MetadataStep';
import ValidationStep from '../components/ValidationStep';
import ExportStep from '../components/ExportStep';
import AuditLogPanel from '../components/AuditLogPanel';
import NeuralParticles from '../components/NeuralParticles';
import Wordmark from '../components/Wordmark';
import type { MetadataOutput } from '../components/MetadataStep';
import type { ScannedFile } from '../types/files';
import type { DetectionResult, DetectionSummary, Session, Modality } from '../types/detection';
import { getEffectiveSession, getEffectiveModality } from '../types/detection';
import { runDetection, generateSummary, readJsonSidecars } from '../lib/detection';
import { computeBidsNames } from '../lib/bids/bidsNaming';
import { useAudit, downloadAuditJson } from '../lib/audit';
import {
  saveToolSession,
  loadToolSession,
  clearToolSession,
  trySessionRestore,
  formatSavedAt,
  type PersistedSession,
} from '../lib/session/toolSession';

type AppStep = 'drop' | 'scanning' | 'mapping' | 'metadata' | 'validation' | 'export';

function ToolPage() {
  const [step, setStep] = useState<AppStep>('drop');
  const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([]);
  const [detectionResults, setDetectionResults] = useState<DetectionResult[]>([]);
  const [summary, setSummary] = useState<DetectionSummary | null>(null);
  const [metadataOutput, setMetadataOutput] = useState<MetadataOutput | null>(null);
  const [auditPanelOpen, setAuditPanelOpen] = useState(false);
  const [savedSession, setSavedSession] = useState<PersistedSession | null>(null);

  const audit = useAudit();

  // ── Save/resume: on mount, check for a sessionStorage-saved session ──
  useEffect(() => {
    const saved = loadToolSession();
    if (saved) setSavedSession(saved);
  }, []);

  // ── Save/resume: persist on every detection-state change ──────────────
  // Only file mappings and detection results are persisted, never metadata
  // step contents. SessionStorage clears when the tab closes.
  useEffect(() => {
    if (detectionResults.length > 0 && summary) {
      saveToolSession(detectionResults, summary);
    }
  }, [detectionResults, summary]);

  const handleDiscardSavedSession = useCallback(() => {
    clearToolSession();
    setSavedSession(null);
  }, []);

  // ── Handle files from the drop zone ───────────────────────────
  const handleFilesScanned = useCallback((files: ScannedFile[]) => {
    setScannedFiles(files);
    setStep('scanning');

    // Save/resume: if a saved session exists and the dropped files match
    // its file signatures, skip detection and restore the prior mapping
    // state directly.
    if (savedSession) {
      const restored = trySessionRestore(files, savedSession);
      if (restored) {
        setDetectionResults(computeBidsNames(restored));
        setSummary(savedSession.summary);
        setStep('mapping');
        setSavedSession(null);
        audit.addEntry(
          'session-restored',
          `Resumed prior session: ${restored.length} files restored from saved state`,
          { fileCount: restored.length },
          'system',
        );
        return;
      }
      // Files do not match the saved session; discard it and proceed fresh.
      clearToolSession();
      setSavedSession(null);
    }

    // Log file scan
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    audit.logFilesScanned(files.length, totalSize);

    // Run detection engine (small delay so the UI shows the scanning state)
    setTimeout(async () => {
      // Read any dcm2niix JSON sidecars first so the engine can use the
      // scanner's original scan names to classify generic NIfTI files.
      const sidecarMap = await readJsonSidecars(files);
      const results = runDetection(files, sidecarMap);
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
  }, [audit, savedSession]);

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

      // Recompute BIDS names so the preview, run- entities, and sidecar
      // pairing stay correct after the change.
      const renamed = computeBidsNames(next);
      setSummary(generateSummary(renamed));
      return renamed;
    });
  }, [audit]);

  // ── Bulk update session for selected files ────────────────────
  const handleBulkUpdateSession = useCallback((indices: number[], session: Session) => {
    setDetectionResults(prev => {
      const next = [...prev];
      for (const i of indices) {
        next[i] = { ...next[i], userSession: session };
      }
      const renamed = computeBidsNames(next);
      setSummary(generateSummary(renamed));
      return renamed;
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
      const renamed = computeBidsNames(next);
      setSummary(generateSummary(renamed));
      return renamed;
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
      audit.logDefacingAttested();
    }
  }, [audit]);

  // ── Reset to start ───────────────────────────────────────────
  const handleStartOver = useCallback(() => {
    setStep('drop');
    setScannedFiles([]);
    setDetectionResults([]);
    setSummary(null);
    setMetadataOutput(null);
    clearToolSession();
    setSavedSession(null);
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
        className="relative z-10 text-white py-4 px-4 sm:px-6 border-b bg-gradient-to-r from-[#011F5B] to-[#01326e]"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <Link
            to="/"
            className="no-underline flex items-center gap-3 group flex-shrink-0"
            aria-label="Back to NeuroGate Protocol home"
            title="Back to NeuroGate Protocol home"
          >
            <img
              src="/logo.png"
              alt="NeuroGate Protocol logo"
              className="w-20 h-20 object-contain group-hover:opacity-90 transition-opacity"
            />
            <div>
              <Wordmark size="lg" />
              <p className="hidden md:block text-sm mt-1 text-blue-200">
                Multi-site neural data compliance tool for epilepsy
              </p>
            </div>
          </Link>

          {/* Mobile-only compact step label */}
          <div className="flex md:hidden flex-col items-end text-right">
            <span className="text-[10px] uppercase tracking-widest text-blue-200">
              Step {stepNumber(step)} of 5
            </span>
            <span className="text-xs font-semibold text-[#6DD3CE]">
              {step === 'drop' || step === 'scanning' ? 'Drop Files' :
                step === 'mapping' ? 'Mapping' :
                step === 'metadata' ? 'Metadata' :
                step === 'validation' ? 'Validate' :
                'Export'}
            </span>
          </div>

          {/* Desktop-only step indicator */}
          <div className="hidden md:flex items-center text-sm">
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

          {/* Audit log button (always visible) */}
          <button
            onClick={() => setAuditPanelOpen(true)}
            className="relative flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-all bg-white/15 text-white hover:bg-white/25"
            aria-label="Open audit log panel"
          >
            <span className="hidden sm:inline">Audit Log</span>
            <svg className="sm:hidden" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="13" x2="15" y2="13" />
              <line x1="9" y1="17" x2="13" y2="17" />
            </svg>
            {audit.getEntryCount() > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 text-xs rounded-full flex items-center justify-center font-semibold bg-[#6DD3CE] text-[#011F5B]">
                {audit.getEntryCount()}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-10">
        {/* Screen-reader page title (the visible brand mark is the wordmark) */}
        <h1 className="sr-only">NeuroGate Protocol: neural data organization tool</h1>

        {/* Step 1: Drop zone */}
        {step === 'drop' && (
          <div>
            {/* Hero section */}
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                Organize your neural data
              </h2>
              <p className="mt-3 max-w-lg mx-auto text-base leading-relaxed text-gray-500">
                Drop your patient data folder to auto-detect sessions and modalities,
                validate BIDS compliance, and export a ready-to-upload dataset.
              </p>
            </div>

            {/* Saved-session banner (shown when sessionStorage has a prior run) */}
            {savedSession && (
              <div
                className="max-w-3xl mx-auto mb-6 rounded-xl border p-4 flex items-start gap-3"
                style={{
                  borderColor: '#6DD3CE',
                  backgroundColor: 'rgba(109,211,206,0.10)',
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#0F6E56"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  <polyline points="21 4 21 10 15 10" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900">
                    Saved progress from {formatSavedAt(savedSession.savedAt)}
                  </div>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    You had {savedSession.fileSignatures.length}{' '}
                    {savedSession.fileSignatures.length === 1 ? 'file' : 'files'} mapped.
                    Re-drop the same folder to pick up where you left off, or click Discard to
                    start fresh. Subject metadata is not saved and will need to be re-entered.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDiscardSavedSession}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                  style={{ color: '#0F6E56', backgroundColor: 'rgba(255,255,255,0.6)' }}
                >
                  Discard
                </button>
              </div>
            )}

            <FileDropZone onFilesScanned={handleFilesScanned} />

            {/* Feature cards below drop zone */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10 max-w-3xl mx-auto">
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
              // Record the export event in the audit log BEFORE downloading,
              // so the downloaded audit file includes the export-completed
              // entry that documents itself.
              audit.addEntry('export-completed', 'BIDS dataset exported as ZIP', {
                subjectCount: metadataOutput!.subjects.length,
                fileCount: detectionResults.length,
              }, 'system');
              downloadAuditJson(audit, 'user');
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
