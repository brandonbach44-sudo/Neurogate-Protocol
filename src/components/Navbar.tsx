import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Wordmark from './Wordmark';

export default function Navbar() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { to: '/', label: 'Home' },
    { to: '/docs', label: 'Documentation' },
    { to: '/tools', label: 'Pre-Processing' },
    { to: '/onboarding', label: 'Onboarding' },
    { to: '/about', label: 'About' },
  ];

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="relative z-20 border-b bg-gradient-to-r from-[#011F5B] to-[#01326e]">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
        {/* Left: Logo + brand */}
        <Link to="/" className="flex items-center gap-3 no-underline flex-shrink-0" onClick={closeMenu}>
          <img
            src="/logo.png"
            alt="NeuroGate Protocol logo"
            className="w-14 h-14 object-contain"
          />
          <Wordmark size="lg" />
        </Link>

        {/* Center: Nav links (desktop only) */}
        <nav className="hidden md:flex items-center gap-7">
          {links.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className="no-underline text-sm transition-colors duration-200"
                style={{
                  color: isActive ? '#6DD3CE' : 'rgba(255,255,255,0.6)',
                  fontWeight: isActive ? 500 : 400,
                  borderBottom: isActive ? '2px solid #6DD3CE' : '2px solid transparent',
                  paddingBottom: '2px',
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: CTA button (desktop only) + hamburger (mobile) */}
        <div className="flex items-center gap-2">
          <Link
            to="/tool"
            className="hidden md:inline-flex no-underline text-sm font-medium px-4 py-1.5 rounded-md transition-all"
            style={{
              backgroundColor: '#6DD3CE',
              color: '#011F5B',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#5bc4bf';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#6DD3CE';
            }}
          >
            Open Tool
          </Link>

          {/* Hamburger toggle (mobile only) */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg transition-colors"
            style={{
              backgroundColor: menuOpen ? 'rgba(109,211,206,0.2)' : 'rgba(255,255,255,0.08)',
              color: '#ffffff',
            }}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <nav
          className="md:hidden border-t px-4 py-3 flex flex-col gap-1"
          style={{
            borderColor: 'rgba(255,255,255,0.1)',
            backgroundColor: '#011F5B',
          }}
        >
          {links.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={closeMenu}
                className="no-underline text-sm py-2.5 px-3 rounded-md transition-colors"
                style={{
                  color: isActive ? '#6DD3CE' : 'rgba(255,255,255,0.85)',
                  fontWeight: isActive ? 600 : 400,
                  backgroundColor: isActive ? 'rgba(109,211,206,0.10)' : 'transparent',
                }}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            to="/tool"
            onClick={closeMenu}
            className="no-underline text-sm font-semibold mt-2 px-4 py-2.5 rounded-md text-center transition-all"
            style={{
              backgroundColor: '#6DD3CE',
              color: '#011F5B',
            }}
          >
            Open Tool
          </Link>
        </nav>
      )}
    </header>
  );
}
