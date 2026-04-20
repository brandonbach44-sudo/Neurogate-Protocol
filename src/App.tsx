import { useState, useCallback } from 'react';
import FileDropZone from './components/FileDropZone';
import MappingTable from './components/MappingTable';
import MetadataStep from './components/MetadataStep';
import ValidationStep from './components/ValidationStep';
import type { MetadataOutput } from './components/MetadataStep';
import type { ScannedFile } from './types/files';
import type { DetectionResult, DetectionSummary, Session, Modality } from './types/detection';
import { runDetection, generateSummary } from './lib/detection';

type AppStep = 'drop' | 'scanning' | 'mapping' | 'metadata' | 'validation';

function App() {
  const [step, setStep] = useState<AppStep>('drop');
  const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([]);
  const [detectionResults, setDetectionResults] = useState<DetectionResult[]>([]);
  const [summary, setSummary] = useState<DetectionSummary | null>(null);
  const [metadataOutput, setMetadataOutput] = useState<MetadataOutput | null>(null);

  // ── Handle files from the drop zone ───────────────────────────
  const handleFilesScanned = useCallback((files: ScannedFile[]) => {
    setScannedFiles(files);
    setStep('scanning');

    // Run detection engine (small delay so the UI shows the scanning state)
    setTimeout(() => {
      const results = runDetection(files);
      const sum = generateSummary(results);
      setDetectionResults(results);
      setSummary(sum);
      setStep('mapping');
    }, 500);
  }, []);

  // ── Update a single detection result (user correction) ────────
  const handleUpdateResult = useCallback((index: number, updates: Partial<DetectionResult>) => {
    setDetectionResults(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      const newSummary = generateSummary(next);
      setSummary(newSummary);
      return next;
    });
  }, []);

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
  }, []);

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
  }, []);

  // ── Handle metadata completion ────────────────────────────────
  const handleMetadataComplete = useCallback((metadata: MetadataOutput) => {
    setMetadataOutput(metadata);
    setStep('validation');
  }, []);

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
              // TODO: Upload step
              alert('Upload step coming soon!');
            }}
            onBack={() => setStep('metadata')}
          />
        )}
      </main>
    </div>
  );
}

export default App;
