import React from 'react';

/**
 * Skeleton — placeholder for loading content.
 * Uses Tailwind `animate-shimmer` (defined in tailwind.config.js keyframes).
 * The shimmer gradient is theme-aware: lighter in light mode, dimmer in dark.
 */
export default function Skeleton({ className = '', ...rest }) {
  return (
    <div
      className={`relative overflow-hidden bg-paper-rule dark:bg-ink-rule rounded-lg ${className}`}
      aria-hidden="true"
      {...rest}
    >
      {/* Light mode: white shimmer at 40% opacity; dark mode: white at 6% — avoids glare */}
      <div
        className="absolute inset-0 animate-shimmer"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
        }}
      />
      {/* Dark-mode overlay to tame the brightness — hidden in light mode */}
      <div
        className="absolute inset-0 hidden dark:block animate-shimmer"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
        }}
      />
    </div>
  );
}
