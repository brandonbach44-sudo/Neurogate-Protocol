import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* ─── Document metadata lookup ──────────────────────────────── */
const DOC_META: Record<string, { title: string; id: string; file: string }> = {
  'gov-001': {
    title: 'Regulatory Governance Framework',
    id: 'GOV-001',
    file: '/docs/gov-001.md',
  },
  'sop-bids': {
    title: 'BIDS Data Structure',
    id: 'SOP-BIDS-001',
    file: '/docs/sop-bids.md',
  },
  'sop-pennsieve': {
    title: 'Pennsieve Upload Procedures',
    id: 'SOP-PENNSIEVE-001',
    file: '/docs/sop-pennsieve.md',
  },
  'sop-redcap': {
    title: 'REDCap Metadata Entry',
    id: 'SOP-REDCAP-001',
    file: '/docs/sop-redcap.md',
  },
  'sop-gui': {
    title: 'Compliance Tool User Guide',
    id: 'SOP-GUI-001',
    file: '/docs/sop-gui.md',
  },
  'onboarding': {
    title: 'Site Onboarding Checklist',
    id: 'ONBOARD-001',
    file: '/docs/onboarding.md',
  },
};

/* ═══ MAIN PAGE ═══════════════════════════════════════════════ */
export default function DocViewerPage() {
  const { docId } = useParams<{ docId: string }>();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const meta = docId ? DOC_META[docId] : null;

  useEffect(() => {
    if (!meta) {
      setError(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    fetch(meta.file)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.text();
      })
      .then((text) => {
        setContent(text);
        setLoading(false);
        window.scrollTo(0, 0);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [meta]);

  if (!meta) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Document not found</h1>
        <p className="mt-2 text-gray-500">The document you're looking for doesn't exist.</p>
        <Link to="/docs" className="mt-4 inline-block text-sm font-medium" style={{ color: '#011F5B' }}>
          Back to documentation
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-8">
        <Link to="/docs" className="no-underline hover:text-gray-600 transition-colors" style={{ color: '#9ca3af' }}>
          Documentation
        </Link>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="text-gray-600">{meta.id}</span>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="relative w-12 h-12 mb-4">
            <div className="absolute inset-0 border-4 rounded-full border-[#011F5B]/15" />
            <div
              className="absolute inset-0 border-4 border-t-transparent rounded-full animate-spin border-[#011F5B]"
              style={{ borderTopColor: 'transparent' }}
            />
          </div>
          <p className="text-sm text-gray-500">Loading document...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="text-center py-24">
          <h2 className="text-xl font-bold text-gray-900">Could not load document</h2>
          <p className="mt-2 text-sm text-gray-500">The file may not exist yet.</p>
          <Link to="/docs" className="mt-4 inline-block text-sm font-medium" style={{ color: '#011F5B' }}>
            Back to documentation
          </Link>
        </div>
      )}

      {/* Document content */}
      {!loading && !error && (
        <article className="doc-content">
          <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
        </article>
      )}

      {/* Back link */}
      {!loading && !error && (
        <div className="mt-12 pt-8 border-t border-gray-100">
          <Link
            to="/docs"
            className="no-underline inline-flex items-center gap-2 text-sm font-medium transition-colors"
            style={{ color: '#011F5B' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back to all documents
          </Link>
        </div>
      )}
    </div>
  );
}
