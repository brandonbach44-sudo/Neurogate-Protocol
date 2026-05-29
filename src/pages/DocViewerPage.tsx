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

/* ─── Helpers ───────────────────────────────────────────────── */

/** Convert heading text to a URL-safe anchor id */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

interface TocEntry {
  level: 2 | 3;
  text: string;
  id: string;
}

/** Extract ## and ### headings from raw markdown */
function extractToc(markdown: string): TocEntry[] {
  const lines = markdown.split('\n');
  const entries: TocEntry[] = [];
  for (const line of lines) {
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    if (h2) entries.push({ level: 2, text: h2[1].trim(), id: slugify(h2[1].trim()) });
    else if (h3) entries.push({ level: 3, text: h3[1].trim(), id: slugify(h3[1].trim()) });
  }
  return entries;
}

/* ─── Table of Contents component ──────────────────────────── */
function TableOfContents({ entries }: { entries: TocEntry[] }) {
  // Only show ## (level 2) headings for compactness
  const topLevel = entries.filter(e => e.level === 2);

  if (topLevel.length === 0) return null;

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  return (
    <div className="mb-8 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#011F5B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="15" y2="12" />
          <line x1="3" y1="18" x2="18" y2="18" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#011F5B' }}>
          Jump to section
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {topLevel.map((entry, i) => (
          <button
            key={i}
            onClick={() => scrollTo(entry.id)}
            className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:border-[#011F5B] hover:text-[#011F5B] transition-colors text-gray-600 cursor-pointer"
          >
            {entry.text}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Custom heading renderers with anchor IDs ──────────────── */
function buildHeadingComponents() {
  const makeHeading = (Tag: 'h1' | 'h2' | 'h3' | 'h4') =>
    ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const text = typeof children === 'string'
        ? children
        : Array.isArray(children)
          ? children.map(c => (typeof c === 'string' ? c : '')).join('')
          : '';
      const id = slugify(text);
      return (
        <Tag id={id} {...props} style={{ scrollMarginTop: '80px' }}>
          {children}
        </Tag>
      );
    };

  return {
    h1: makeHeading('h1'),
    h2: makeHeading('h2'),
    h3: makeHeading('h3'),
    h4: makeHeading('h4'),
  };
}

const headingComponents = buildHeadingComponents();

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

  const toc = content ? extractToc(content) : [];

  // Split content at first --- so TOC sits after the title/metadata block
  const firstDivider = content.indexOf('\n---\n');
  const contentBefore = firstDivider !== -1 ? content.slice(0, firstDivider + 5) : '';
  const contentAfter  = firstDivider !== -1 ? content.slice(firstDivider + 5) : content;

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
    <div className="max-w-4xl mx-auto px-6 py-12 relative z-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-8">
        <Link to="/docs" className="no-underline hover:text-gray-700 transition-colors" style={{ color: '#6b7280' }}>
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
        <article className="doc-content bg-white rounded-2xl border border-gray-100 shadow-sm p-8 md:p-10">
          {/* Title + metadata block (before first ---) */}
          <Markdown remarkPlugins={[remarkGfm]} components={headingComponents}>
            {contentBefore}
          </Markdown>

          {/* Table of Contents — sits right after the header block */}
          <TableOfContents entries={toc} />

          {/* Rest of the document */}
          <Markdown remarkPlugins={[remarkGfm]} components={headingComponents}>
            {contentAfter}
          </Markdown>
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
