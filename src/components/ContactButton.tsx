/**
 * Persistent contact button.
 *
 * Floating in the bottom-right corner of every page (including /tool, since
 * it lives outside the Routes block in App.tsx). Opens a mailto: link with a
 * pre-filled subject so inbound emails are easy to triage.
 *
 * Sized down on mobile to icon-only, full pill with text on tablet+.
 */

const PENN_BLUE = '#011F5B';
const PENN_BLUE_HOVER = '#01326e';

export default function ContactButton() {
  return (
    <a
      href="mailto:brandon.bach44@gmail.com?subject=NeuroGate%20Protocol%20inquiry"
      className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-30 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold no-underline transition-all"
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
      aria-label="Contact Brandon by email"
      title="Contact Brandon"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
      <span className="hidden sm:inline">Contact</span>
    </a>
  );
}
