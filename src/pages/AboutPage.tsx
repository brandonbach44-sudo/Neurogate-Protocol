import { useState } from 'react';
import { Link } from 'react-router-dom';

const PENN_BLUE = '#011F5B';
const PENN_BLUE_HOVER = '#01326e';
const TEAL = '#6DD3CE';
const TEAL_TEXT = '#0F6E56';
const EMAIL = 'brandon.bach44@gmail.com';
const GOOGLE_SCHOLAR_URL = 'https://scholar.google.com/citations?user=WvJtxmUAAAAJ&hl=en';

/* ─── Eyebrow pill ───────────────────────────────────────────── */
function Eyebrow({
  children,
  color = PENN_BLUE,
  bg = 'rgba(1,31,91,0.06)',
}: {
  children: React.ReactNode;
  color?: string;
  bg?: string;
}) {
  return (
    <span
      className="inline-block text-[11px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
      style={{ backgroundColor: bg, color }}
    >
      {children}
    </span>
  );
}

/* ─── Stat block ─────────────────────────────────────────────── */
function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-bold" style={{ color: PENN_BLUE }}>{value}</div>
      <div className="text-xs mt-1 text-gray-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}

/* ─── Pillar card ────────────────────────────────────────────── */
function PillarCard({
  title,
  body,
  accent,
  bg,
  icon,
}: {
  title: string;
  body: string;
  accent: string;
  bg: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-md transition-shadow duration-300">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
        style={{ backgroundColor: bg }}
      >
        {icon}
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-2" style={{ color: accent }}>
        {title}
      </h3>
      <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
    </div>
  );
}

/* ═══ MAIN PAGE ═══════════════════════════════════════════════ */
export default function AboutPage() {
  const [emailCopied, setEmailCopied] = useState(false);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setEmailCopied(true);
      window.setTimeout(() => setEmailCopied(false), 2000);
    } catch {
      // Clipboard API unavailable; silently ignore.
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">
      {/* ─── HERO ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-14">
        <div className="md:col-span-2">
          <Eyebrow>About NeuroGate</Eyebrow>
          <h1 className="text-3xl font-bold text-gray-900 mt-4 leading-tight">
            A governance framework
            <br />
            for neural data
            <br />
            <span style={{ color: PENN_BLUE }}>in epilepsy.</span>
          </h1>
          <p className="mt-4 text-sm text-gray-500 leading-relaxed max-w-lg">
            NeuroGate Protocol combines a regulatory governance framework with a browser-based
            tool that helps research sites organize, validate, and prepare BIDS-compliant
            neural data in epilepsy ready for multi-site sharing through cloud and on-premise
            standardized data infrastructure toward building a learning health system. The
            framework is the spine; the tool is one of its implementations.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Link
              to="/docs/gov-001"
              className="no-underline inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: PENN_BLUE, color: '#ffffff' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = PENN_BLUE_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = PENN_BLUE)}
            >
              Read the framework
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link
              to="/tool"
              className="no-underline inline-flex items-center px-5 py-2 rounded-lg text-sm font-medium border transition-all"
              style={{ borderColor: '#d1d5db', color: '#374151' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = PENN_BLUE)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#d1d5db')}
            >
              Try the tool
            </Link>
          </div>
        </div>
        <div className="flex items-end md:justify-end">
          <div className="md:text-right">
            <div className="text-3xl font-bold" style={{ color: PENN_BLUE }}>2026</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">In development</div>
          </div>
        </div>
      </div>

      {/* ─── WHY THIS EXISTS ─────────────────────────────── */}
      <section className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm mb-14">
        <Eyebrow>The problem</Eyebrow>
        <h2 className="text-2xl font-bold text-gray-900 mt-3 mb-4">Sharing neural data is hard for the right reasons.</h2>
        <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
          Multi-site epilepsy research depends on sharing neural data across institutions, and
          that data is sensitive: imaging carries facial features and identifying headers,
          electrophysiology carries patient identifiers in recording headers, and all of it
          carries clinical context that needs careful handling. Each site has its own conventions,
          and BIDS, FAIR, ALCOA+, and HIPAA all impose real requirements that are easy to get
          wrong without a shared structure. NeuroGate Protocol is designed to make doing the right
          thing the path of least resistance.
        </p>
      </section>

      {/* ─── THREE PILLARS ───────────────────────────────── */}
      <section className="mb-14">
        <div className="mb-6">
          <Eyebrow>What NeuroGate is</Eyebrow>
          <h2 className="text-2xl font-bold text-gray-900 mt-3">Three things, working together</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <PillarCard
            title="A governance framework"
            body="GOV-001 defines the regulatory pillars (FAIR, ALCOA+, HIPAA, NIH DMSP) and the QMS structure all SOPs trace back to. Every operational deliverable maps to a specific framework requirement."
            accent={PENN_BLUE}
            bg="rgba(1,31,91,0.08)"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={PENN_BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            }
          />
          <PillarCard
            title="Four operational SOPs"
            body="BIDS data structure, REDCap metadata entry, the tool user guide, and an optional Pennsieve upload reference. Each SOP is procedural step-by-step, with quick-reference sections for day-to-day use."
            accent={TEAL_TEXT}
            bg="rgba(109,211,206,0.16)"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={TEAL_TEXT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="13" y2="17" />
              </svg>
            }
          />
          <PillarCard
            title="A browser-based tool"
            body="A 5-step workflow that organizes, validates, and exports BIDS-compliant datasets entirely client-side. PHI scanning, defacing attestation, and a full ALCOA+ audit log are built in."
            accent="#7c3aed"
            bg="rgba(124,58,237,0.08)"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            }
          />
        </div>
      </section>

      {/* ─── STATS BAR ───────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-100 bg-white py-8 px-6 mb-14 shadow-sm">
        <div className="grid grid-cols-2 md:flex md:items-center md:justify-around gap-6 md:gap-0">
          <StatBlock value="11" label="Modalities" />
          <div className="hidden md:block w-px h-10 bg-gray-200" />
          <StatBlock value="3" label="Clinical sessions" />
          <div className="hidden md:block w-px h-10 bg-gray-200" />
          <StatBlock value="6" label="Documents" />
          <div className="hidden md:block w-px h-10 bg-gray-200" />
          <StatBlock value="100%" label="Client-side" />
        </div>
      </section>

      {/* ─── PROJECT STATUS + AUTHOR ─────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-14">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <Eyebrow>Project status</Eyebrow>
          <h2 className="text-xl font-bold text-gray-900 mt-3 mb-3">Currently in beta</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            The framework and SOPs are being validated internally first, then with one external
            partner site before broader adoption. The tool is functional and the documentation is
            in draft, pending review. NeuroGate is in active development and intended to be a
            long-lived resource for the multi-site neural data sharing community in epilepsy.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(109,211,206,0.15)', color: TEAL_TEXT }}>
            <span style={{ color: TEAL }}>&#9679;</span>
            Beta, in active development
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <Eyebrow color={TEAL_TEXT} bg="rgba(109,211,206,0.12)">Built by</Eyebrow>
          <h2 className="text-xl font-bold text-gray-900 mt-3 mb-1">Brandon Bach</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Project lead, framework author, and tool developer. The work spans regulatory writing,
            front-end engineering, and biomedical informatics, anchored on the goal of making
            multi-site neural data sharing in epilepsy easier to do correctly.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCopyEmail}
              className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{
                backgroundColor: emailCopied ? 'rgba(109,211,206,0.18)' : 'rgba(1,31,91,0.06)',
                color: emailCopied ? TEAL_TEXT : PENN_BLUE,
              }}
              title={emailCopied ? 'Email copied to clipboard' : 'Click to copy email'}
            >
              {emailCopied ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Email copied
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  {EMAIL}
                </>
              )}
            </button>
            <a
              href="https://github.com/brandonbach44-sudo/Epilepsy_GUI"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: 'rgba(1,31,91,0.06)', color: PENN_BLUE }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.95 10.95 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.71 21.39 24 17.08 24 12 24 5.65 18.85.5 12 .5z" />
              </svg>
              GitHub repo
            </a>
            <a
              href={GOOGLE_SCHOLAR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: 'rgba(1,31,91,0.06)', color: PENN_BLUE }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 1L1 7l4 2.18v6L12 19l7-3.82v-6L21 8.5V14h2V7L12 1zM5.27 9.5L12 13l6.73-3.5L12 6 5.27 9.5z" />
              </svg>
              Google Scholar
            </a>
          </div>
        </div>
      </section>

      {/* ─── CTA BANNER ─────────────────────────────────── */}
      <div
        className="rounded-2xl px-6 md:px-10 py-8 md:py-10"
        style={{ background: `linear-gradient(135deg, ${PENN_BLUE} 0%, ${PENN_BLUE_HOVER} 100%)` }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start md:items-center">
          <div className="md:col-span-2">
            <Eyebrow color={TEAL} bg="rgba(109,211,206,0.15)">Get started</Eyebrow>
            <h3 className="text-2xl font-bold text-white mt-3">
              Try the tool or read the framework.
            </h3>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
              The tool runs in your browser with no installation. The documentation pages cover
              the governance framework, four SOPs, and the site onboarding workflow.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <Link
              to="/tool"
              className="no-underline inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all w-full justify-center"
              style={{ backgroundColor: TEAL, color: PENN_BLUE }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#5bc4bf')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = TEAL)}
            >
              Open the tool
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link
              to="/docs"
              className="no-underline inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-medium border transition-all w-full justify-center"
              style={{ borderColor: 'rgba(255,255,255,0.3)', color: '#ffffff' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = TEAL)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)')}
            >
              Browse documentation
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
