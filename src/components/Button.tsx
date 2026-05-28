import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md';
}

/**
 * Shared button with clear hover/active/focus affordances.
 * primary  - Penn Blue fill, lifts on hover, presses on active
 * secondary - white/border, subtle fill on hover
 * danger   - red fill
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center font-medium rounded-lg cursor-pointer ' +
    'transition-all duration-150 ease-in-out select-none ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
    'active:scale-[0.97] active:shadow-sm ';

  const sizes: Record<string, string> = {
    sm: 'px-3.5 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
  };

  const variants: Record<string, string> = {
    primary:
      'bg-[#011F5B] text-white shadow-sm ' +
      'hover:bg-[#01326e] hover:shadow-md hover:-translate-y-[1px] ' +
      'focus-visible:ring-[#011F5B] ' +
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sm',
    secondary:
      'bg-white text-gray-600 border border-gray-300 shadow-sm ' +
      'hover:bg-gray-50 hover:border-gray-400 hover:text-gray-800 hover:shadow-md hover:-translate-y-[1px] ' +
      'focus-visible:ring-gray-400 ' +
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sm',
    danger:
      'bg-red-600 text-white shadow-sm ' +
      'hover:bg-red-700 hover:shadow-md hover:-translate-y-[1px] ' +
      'focus-visible:ring-red-600 ' +
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sm',
  };

  return (
    <button
      disabled={disabled}
      className={`${base}${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
