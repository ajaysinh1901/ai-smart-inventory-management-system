import React from 'react';

/**
 * <LedgerStrip> — The brand's calling card.
 *
 * Renders a JetBrains Mono uppercase metadata line — used standalone
 * in login footer, invoice PDF, anywhere outside a full PageHeader.
 *
 * Props:
 *   meta — string[] joined with ' · '
 *          defaults to ['SmartStock', 'FY 25–26', '₹ INR']
 */
export default function LedgerStrip({ meta }) {
  const parts = meta || ['SmartStock', 'FY 25–26', '₹ INR'];
  const line = parts.join(' · ');

  return (
    <p
      className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink/40 dark:text-paper/40"
      aria-label={line}
    >
      {line}
    </p>
  );
}
