/**
 * Persistent contact widget.
 *
 * Floating in the bottom-right corner of every page. Clicking opens a small
 * popover showing the email address with two actions:
 *   - "Copy email" (uses navigator.clipboard, works everywhere)
 *   - "Open in mail app" (mailto link, works only if the user has a mail
 *     client configured)
 *
 * The popover approach is intentional: a bare mailto link silently does
 * nothing on systems with no associated handler (Chrome on Windows where
 * the user lives in browser-Gmail, etc.), which feels broken. Showing the
 * address with a Copy button makes the contact path discoverable on every
 * setup.
 */

import { useState, useEffect, useRef } from 'react';

const EMAIL = 'brandon.bach44@gmail.com';
const MAILTO = `mailto:${EMAIL}?subject=NeuroGate%20Protocol%20inquiry`;
const PENN_BLUE = '#011F5B';
const PENN_BLUE_HOVER = '#01326e';
const TEAL_TEXT = '#0F6E56';

export default function ContactButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close popover on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select-all so the user can copy manually
      const range = document.createRange();
      const selection = window.getSelection();
      const el = document.getElementById('contact-email-display');
      if (el && selection) {
        range.selectNodeContents(el);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-30 flex flex-col items-end"
    >
      {/* Popover */}
      {open && (
        <div
          className="mb-3 w-72 rounded-xl bg-white border border-gray-200 p-4"
          style={{ boxShadow: '0 12px 32px rgba(1,31,91,0.18), 0 4px 10px rgba(1,31,91,0.10)' }}
          role="dialog"
          aria-label="Contact options"
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
            Contact
          </div>
          <div
            id="contact-email-display"
            className="text-sm font-mono text-gray-900 break-all mb-3 select-all"
          >
            {EMAIL}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all"
              style={{
                backgroundColor: copied ? 'rgba(109,211,206,0.18)' : 'rgba(1,31,91,0.06)',
                color: copied ? TEAL_TEXT : PENN_BLUE,
              }}
            >
              {copied ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy email
                </>
              )}
            </button>
            <a
              href={MAILTO}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg no-underline transition-all"
              style={{ backgroundColor: PENN_BLUE, color: '#ffffff' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = PENN_BLUE_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = PENN_BLUE)}
              onClick={() => setOpen(false)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Open mail
            </a>
          </div>
          <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
            "Open mail" only works if you have a mail app set up. The Copy button works everywhere.
          </p>
        </div>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all"
        style={{
          backgroundColor: PENN_BLUE,
          color: '#ffffff',
          boxShadow: '0 6px 20px rgba(1,31,91,0.35), 0 2px 6px rgba(1,31,91,0.2)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = PENN_BLUE_HOVER;
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = PENN_BLUE;
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        aria-label={open ? 'Close contact options' : 'Open contact options'}
        aria-expanded={open}
        title="Contact"
      >
        {open ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        )}
        <span className="hidden sm:inline">{open ? 'Close' : 'Contact'}</span>
      </button>
    </div>
  );
}
