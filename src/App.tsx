import { useState } from 'react';
import FileDropZone from './components/FileDropZone';
import FileList from './components/FileList';
import type { ScannedFile } from './types/files';

function App() {
  const [files, setFiles] = useState<ScannedFile[]>([]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#011F5B] text-white py-4 px-6 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Epilepsy Data Uploader
            </h1>
            <p className="text-blue-200 text-sm mt-0.5">
              BIDS-compliant data organization &amp; upload
            </p>
          </div>
          <div className="text-sm text-blue-200">
            Penn Epilepsy Dataset
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        {files.length === 0 ? (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-gray-800">
                Get Started
              </h2>
              <p className="text-gray-500 mt-2">
                Drop your patient data folder below to begin organizing for BIDS upload
              </p>
            </div>
            <FileDropZone onFilesScanned={setFiles} />
          </div>
        ) : (
          <div>
            <FileList files={files} />
            <div className="flex justify-center gap-4 mt-6">
              <button
                onClick={() => setFiles([])}
                className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Start Over
              </button>
              <button
                className="px-5 py-2.5 text-sm font-medium text-white bg-[#011F5B] rounded-lg hover:bg-[#012a7a] transition-colors"
              >
                Continue to Mapping
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
