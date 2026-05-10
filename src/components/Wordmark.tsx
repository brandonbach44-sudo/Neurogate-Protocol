/**
 * NeuroGate wordmark.
 *
 * Two-line lockup: the brand "NeuroGate" sits on top in a heavier weight,
 * with "PROTOCOL" letter-spaced underneath so its width visually matches
 * the line above (classic Starbucks / Harley-Davidson style subtitle).
 *
 * Defaults are tuned for dark Penn-Blue backgrounds (white over teal).
 * Pass `topColor` / `bottomColor` to retheme for light backgrounds.
 *
 * The `letterSpacing` values below are hand-tuned for the Inter font at
 * the two supported sizes. If the alignment looks off after a font swap,
 * adjust those numbers.
 */

interface WordmarkProps {
  size?: 'sm' | 'lg';
  topColor?: string;
  bottomColor?: string;
  className?: string;
}

const SIZE_CONFIG = {
  sm: {
    topClass: 'font-semibold tracking-tight text-base',
    bottomClass: 'font-semibold uppercase text-[7px] tracking-[0.18em] text-center -mt-[1px]',
  },
  lg: {
    topClass: 'font-semibold tracking-tight text-xl',
    bottomClass: 'font-semibold uppercase text-[9px] tracking-[0.18em] text-center -mt-[1px]',
  },
} as const;

export default function Wordmark({
  size = 'sm',
  topColor = '#ffffff',
  bottomColor = '#6DD3CE',
  className = '',
}: WordmarkProps) {
  const cfg = SIZE_CONFIG[size];

  return (
    <span
      className={`inline-flex flex-col items-stretch leading-none ${className}`}
      aria-label="NeuroGate Protocol"
    >
      <span className={cfg.topClass} style={{ color: topColor }} aria-hidden="true">
        NeuroGate
      </span>
      <span
        className={cfg.bottomClass}
        style={{ color: bottomColor }}
        aria-hidden="true"
      >
        Protocol
      </span>
    </span>
  );
}
