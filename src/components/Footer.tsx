import { Link } from 'react-router-dom';
import { NeuronIcon } from './Icons';

const TEAL = '#6DD3CE';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="relative z-10 mt-20 border-t bg-gradient-to-r from-[#011F5B] to-[#01326e]"
      style={{ borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-3 gap-12">
          {/* ─── Brand + tagline ─────────────────────────── */}
          <div>
            <Link to="/" className="flex items-center gap-3 no-underline">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
              >
                <NeuronIcon size={22} color={TEAL} />
              </div>
              <span className="text-white font-semibold text-base tracking-tight">
                NeuroGate
              </span>
            </Link>
            <p
              className="mt-4 text-xs leading-relaxed max-w-xs"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
              A governance framework and browser-based tool for multi-site epilepsy neuroimaging
              data sharing. All processing runs in your browser; no data leaves your machine.
            </p>
          </div>

          {/* ─── Quick links ─────────────────────────────── */}
          <div>
            <div
              className="text-[10px] font-bold uppercase tracking-widest mb-4"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              Explore
            </div>
            <ul className="space-y-2.5">
              {[
                { to: '/', label: 'Home' },
                { to: '/docs', label: 'Documentation' },
                { to: '/tools', label: 'Pre-Processing' },
                { to: '/onboarding', label: 'Onboarding' },
                { to: '/about', label: 'About' },
                { to: '/tool', label: 'Open Tool' },
              ].map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="no-underline text-sm transition-colors"
                    style={{ color: 'rgba(255,255,255,0.7)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = TEAL)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* ─── Project info ────────────────────────────── */}
          <div>
            <div
              className="text-[10px] font-bold uppercase tracking-widest mb-4"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              Project
            </div>
            <ul className="space-y-2.5">
              <li className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                UPenn MRA Capstone
              </li>
              <li>
                <a
                  href="https://github.com/brandonbach44-sudo/Epilepsy_GUI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-underline inline-flex items-center gap-2 text-sm transition-colors"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = TEAL)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.95 10.95 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.71 21.39 24 17.08 24 12 24 5.65 18.85.5 12 .5z" />
                  </svg>
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="mailto:bach2@seas.upenn.edu"
                  className="no-underline text-sm transition-colors"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = TEAL)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* ─── Bottom row ──────────────────────────────────── */}
        <div
          className="mt-10 pt-6 flex items-center justify-between text-xs"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          <span style={{ color: 'rgba(255,255,255,0.45)' }}>
            &copy; {year} Brandon Bach
          </span>
          <span style={{ color: 'rgba(255,255,255,0.45)' }}>
            Built with React, Vite, and Tailwind &middot; Hosted on Vercel
          </span>
          <span style={{ color: 'rgba(255,255,255,0.45)' }}>
            <span style={{ color: TEAL }}>&#9679;</span> Beta
          </span>
        </div>
      </div>
    </footer>
  );
}

