import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import NeuralParticles from './NeuralParticles';

function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      style={{
        position: 'fixed',
        bottom: '2rem',
        left: '1.5rem',
        zIndex: 50,
        background: '#011F5B',
        color: '#6DD3CE',
        border: '1px solid rgba(109,211,206,0.4)',
        borderRadius: '9999px',
        padding: '0.5rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        cursor: 'pointer',
        boxShadow: '0 4px 14px rgba(1,31,91,0.35)',
        fontSize: '0.8rem',
        fontWeight: 600,
        letterSpacing: '0.02em',
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 18px rgba(1,31,91,0.45)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 14px rgba(1,31,91,0.35)';
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
      Back to Top
    </button>
  );
}

export default function Layout() {
  return (
    <div
      className="min-h-screen relative flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 40%, #f1f5f9 100%)',
      }}
    >
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <NeuralParticles />
      <Navbar />
      <main id="main-content" className="relative z-10 flex-1">
        <Outlet />
      </main>
      <Footer />
      <BackToTopButton />
    </div>
  );
}
