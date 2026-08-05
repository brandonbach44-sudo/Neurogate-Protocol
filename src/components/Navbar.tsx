import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Wordmark from './Wordmark';

type CliInstallStatus = 'idle' | 'installing' | 'success' | 'error';

export default function Navbar() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // window.neurogateDesktop only exists inside the Electron desktop
  // shell (see electron/preload.cjs) -- the hosted web build never gets
  // it, so this button is desktop-only by construction, not a feature
  // flag that needs separate configuration.
  const isDesktop = typeof window !== 'undefined' && !!window.neurogateDesktop;
  const [cliStatus, setCliStatus] = useState<CliInstallStatus>('idle');
  const [cliMessage, setCliMessage] = useState('');
  const [cliPanelOpen, setCliPanelOpen] = useState(false);

  async function handleInstallCli() {
    if (!window.neurogateDesktop) return;
    setCliStatus('installing');
    setCliPanelOpen(true);
    try {
      const result = await window.neurogateDesktop.installCli();

      // pathError means the file copy succeeded but the PATH update
      // itself failed -- surfacing this is the whole fix here. Silently
      // falling back to a generic message previously hid real failures
      // behind a false "already installed" success message.
      if (result.pathError) {
        setCliStatus('error');
        setCliMessage(
          `The CLI was copied to ${result.destPath}, but updating your PATH failed:\n${result.pathError}\n\n` +
          `You can run it directly with the full path above, or add ${result.destDir} to your PATH manually.`
        );
        return;
      }

      setCliStatus('success');
      if (result.platform === 'win32') {
        setCliMessage(
          result.addedToPath
            ? `Installed to ${result.destDir}. Open a NEW terminal window and run:`
            : `Already installed at ${result.destDir} (already on your PATH). Run:`
        );
      } else {
        setCliMessage(`Installed to ${result.destDir}. Add this folder to your PATH, then run:`);
      }
    } catch (err) {
      setCliStatus('error');
      setCliMessage(err instanceof Error ? err.message : String(err));
    }
  }

  function copyCommand() {
    navigator.clipboard?.writeText('neurogate').catch(() => {});
  }

  const links = [
    { to: '/', label: 'Home' },
    { to: '/docs', label: 'Documentation' },
    { to: '/tools', label: 'Pre-Processing' },
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
        <div className="relative flex items-center gap-2">
          {isDesktop && (
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={handleInstallCli}
                disabled={cliStatus === 'installing'}
                className="no-underline text-sm font-medium px-3 py-1.5 rounded-md border transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  color: 'rgba(255,255,255,0.85)',
                  borderColor: 'rgba(255,255,255,0.3)',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (cliStatus === 'installing') return;
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {cliStatus === 'installing' ? 'Installing...' : 'Install CLI'}
              </button>

              {cliPanelOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-96 rounded-lg border shadow-lg p-4 text-sm z-30"
                  style={{ backgroundColor: 'white', borderColor: '#e5e7eb', color: '#1f2937' }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-semibold">
                      {cliStatus === 'error' ? 'Install failed' : 'Install CLI'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCliPanelOpen(false)}
                      className="text-gray-400 hover:text-gray-600 leading-none"
                      aria-label="Close"
                    >
                      &times;
                    </button>
                  </div>

                  {cliStatus === 'installing' && <p className="text-gray-600">Copying the CLI and updating your PATH...</p>}

                  {cliStatus === 'success' && (
                    <>
                      <p className="text-gray-600 mb-2">{cliMessage}</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-gray-100 rounded px-2 py-1 text-xs">neurogate &lt;folder&gt;</code>
                        <button
                          type="button"
                          onClick={copyCommand}
                          className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                        >
                          Copy
                        </button>
                      </div>
                    </>
                  )}

                  {cliStatus === 'error' && <p className="text-red-600 whitespace-pre-line">{cliMessage}</p>}
                </div>
              )}
            </div>
          )}

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
