import { Link, useLocation } from 'react-router-dom';
import { NeuronIcon } from './Icons';

export default function Navbar() {
  const location = useLocation();

  const links = [
    { to: '/', label: 'Home' },
    { to: '/docs', label: 'Documentation' },
    { to: '/tools', label: 'Pre-Processing' },
    { to: '/onboarding', label: 'Onboarding' },
    { to: '/about', label: 'About' },
  ];

  return (
    <header className="relative z-10 border-b bg-gradient-to-r from-[#011F5B] to-[#01326e]">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
        {/* Left: Logo + brand */}
        <Link to="/" className="flex items-center gap-3 no-underline">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10">
            <NeuronIcon size={24} color="#6DD3CE" />
          </div>
          <span className="text-white font-semibold text-base tracking-tight">
            NeuroGate
          </span>
        </Link>

        {/* Center: Nav links */}
        <nav className="flex items-center gap-7">
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

        {/* Right: CTA button */}
        <Link
          to="/tool"
          className="no-underline text-sm font-medium px-4 py-1.5 rounded-md transition-all"
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
      </div>
    </header>
  );
}
