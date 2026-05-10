import { Link } from 'react-router-dom';

const PENN_BLUE = '#011F5B';
const PENN_BLUE_HOVER = '#01326e';
const TEAL_TEXT = '#0F6E56';

/* ─── Quick-link card ────────────────────────────────────────── */
function QuickLink({
  to,
  label,
  desc,
  accent,
  bg,
}: {
  to: string;
  label: string;
  desc: string;
  accent: string;
  bg: string;
}) {
  return (
    <Link
      to={to}
      className="no-underline group block rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-all duration-300"
    >
      <div
        className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
        style={{ color: accent, backgroundColor: bg, padding: '2px 8px', borderRadius: '9999px', display: 'inline-block' }}
      >
        Go to
      </div>
      <div className="text-sm font-semibold text-gray-900 group-hover:text-[#011F5B] transition-colors">
        {label}
      </div>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{desc}</p>
    </Link>
  );
}

/* ═══ MAIN PAGE ═══════════════════════════════════════════════ */
export default function NotFoundPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-24 text-center">
      {/* Big 404 */}
      <div
        className="inline-block text-[120px] font-bold leading-none tracking-tight"
        style={{
          background: `linear-gradient(135deg, ${PENN_BLUE} 0%, ${TEAL_TEXT} 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        404
      </div>

      {/* Headline + description */}
      <h1 className="text-2xl font-bold text-gray-900 mt-4">Page not found</h1>
      <p className="mt-3 text-sm text-gray-500 leading-relaxed max-w-md mx-auto">
        The page you are looking for does not exist or may have moved. The links below will get
        you back on track.
      </p>

      {/* Primary CTA */}
      <div className="mt-8 flex items-center justify-center gap-3">
        <Link
          to="/"
          className="no-underline inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{ backgroundColor: PENN_BLUE, color: '#ffffff' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = PENN_BLUE_HOVER)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = PENN_BLUE)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Home
        </Link>
      </div>

      {/* Quick links to common destinations */}
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
        <QuickLink
          to="/tool"
          label="NeuroGate Tool"
          desc="Open the BIDS organization and validation workflow."
          accent={TEAL_TEXT}
          bg="rgba(109,211,206,0.12)"
        />
        <QuickLink
          to="/docs"
          label="Documentation"
          desc="Governance framework and SOPs for the initiative."
          accent={PENN_BLUE}
          bg="rgba(1,31,91,0.06)"
        />
        <QuickLink
          to="/onboarding"
          label="Onboarding"
          desc="Five-phase workflow for new participating sites."
          accent="#7c3aed"
          bg="rgba(124,58,237,0.08)"
        />
      </div>
    </div>
  );
}
