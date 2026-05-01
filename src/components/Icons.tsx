/**
 * SVG icons for the Epilepsy Data Uploader.
 * Science/neurology themed where appropriate.
 */

interface IconProps {
  size?: number;
  className?: string;
  color?: string;
}

const defaults = { size: 20, className: '', color: 'currentColor' };

/** Folder icon (for BIDS Structure) */
export function FolderIcon({ size = defaults.size, className, color = defaults.color }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** Shield/lock icon (for PHI / Privacy) */
export function ShieldIcon({ size = defaults.size, className, color = defaults.color }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <rect x="10" y="10" width="4" height="5" rx="1" />
      <circle cx="12" cy="8" r="1.5" />
    </svg>
  );
}

/** Clipboard/checklist icon (for Required Files) */
export function ClipboardIcon({ size = defaults.size, className, color = defaults.color }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  );
}

/** Link icon (for Cross-Session) */
export function LinkIcon({ size = defaults.size, className, color = defaults.color }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/** File icon (for File Format) */
export function FileIcon({ size = defaults.size, className, color = defaults.color }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  );
}

/** Tag/metadata icon (for Metadata) */
export function TagIcon({ size = defaults.size, className, color = defaults.color }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

/** Brain icon (for Defacing / neurology theme) */
export function BrainIcon({ size = defaults.size, className, color = defaults.color }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Left hemisphere */}
      <path d="M12 2C9.5 2 7.5 3.5 7 5.5C5.5 5.5 4 7 4 9c0 1.5.8 2.8 2 3.5C5.5 13.5 5 15 5 16c0 2.5 2 4.5 4.5 4.5c1.5 0 2.5-.5 2.5-.5" />
      {/* Right hemisphere */}
      <path d="M12 2c2.5 0 4.5 1.5 5 3.5C18.5 5.5 20 7 20 9c0 1.5-.8 2.8-2 3.5.5 1 1 2.5 1 3.5 0 2.5-2 4.5-4.5 4.5-1.5 0-2.5-.5-2.5-.5" />
      {/* Central fissure */}
      <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="2 2" strokeWidth="1.2" />
      {/* Sulci (brain folds) */}
      <path d="M8 9c1 .5 2.5.5 4 0" strokeWidth="1.2" />
      <path d="M12 9c1.5.5 3 .5 4 0" strokeWidth="1.2" />
      <path d="M7 14c1.5.5 3 .5 5 0" strokeWidth="1.2" />
      <path d="M12 14c1.5.5 3 .5 5 0" strokeWidth="1.2" />
    </svg>
  );
}

/** Checkmark circle icon (for validation passed) */
export function CheckCircleIcon({ size = defaults.size, className, color = defaults.color }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 11.5 14.5 16 9.5" />
    </svg>
  );
}

/** X circle icon (for validation failed) */
export function XCircleIcon({ size = defaults.size, className, color = defaults.color }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

/** Neuron/network icon (for the header branding) */
export function NeuronIcon({ size = defaults.size, className, color = defaults.color }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={color}
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Cell body */}
      <circle cx="16" cy="16" r="5" fill={color} fillOpacity="0.15" />
      {/* Dendrites */}
      <path d="M11.5 13L7 8" />
      <path d="M6 9.5L7 8l1.5.5" />
      <path d="M12 17.5L6 20" />
      <path d="M7 18.5L6 20l1.5 1" />
      <path d="M13.5 11.5L12 6" />
      <path d="M10.5 7L12 6l1 1.5" />
      {/* Axon */}
      <path d="M21 16h5" />
      <circle cx="28" cy="16" r="1.5" fill={color} fillOpacity="0.3" />
      {/* Axon terminals */}
      <path d="M20 12.5L24 8" />
      <circle cx="25" cy="7" r="1" fill={color} fillOpacity="0.3" />
      <path d="M20 19.5L24 24" />
      <circle cx="25" cy="25" r="1" fill={color} fillOpacity="0.3" />
    </svg>
  );
}
