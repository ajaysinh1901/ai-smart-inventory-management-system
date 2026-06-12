import React from 'react';

/**
 * <StatusGlyph> — Replaces every coloured pill/badge in the app.
 *
 * Props:
 *   variant  — see VARIANTS below
 *   label    — optional override for the text
 *   className — extra classes on the outer span
 *
 * Renders: glyph + space + uppercase label
 * Font: JetBrains Mono 11px, tracked +0.08em
 * No background. No border. Semantic colour on text only.
 */

const VARIANTS = {
  // Sales / invoices
  paid:       { glyph: '●', text: 'PAID',      className: 'text-[#2E7D32] dark:text-[#4CAF50]' },
  completed:  { glyph: '●', text: 'PAID',      className: 'text-[#2E7D32] dark:text-[#4CAF50]' },
  due:        { glyph: '◐', text: 'DUE',       className: 'text-brass dark:text-brass-soft' },
  partial:    { glyph: '◐', text: 'PARTIAL',   className: 'text-brass dark:text-brass-soft' },
  pending:    { glyph: '◐', text: 'PENDING',   className: 'text-brass dark:text-brass-soft' },
  void:       { glyph: '○', text: 'VOID',      className: 'text-ink/40 dark:text-paper/40' },
  cancelled:  { glyph: '○', text: 'CANCELLED', className: 'text-ink/40 dark:text-paper/40' },

  // Inventory stock levels
  'in-stock':   { glyph: '●', text: 'IN STOCK', className: 'text-brass dark:text-brass-soft' },
  'low-stock':  { glyph: '◐', text: 'LOW',      className: 'text-primary dark:text-primary-soft' },
  out:          { glyph: '○', text: 'OUT',       className: 'text-ink/40 dark:text-paper/40' },

  // Transactions
  'stock-in':  { glyph: '↓', text: 'STOCK IN',  className: 'text-brass dark:text-brass-soft' },
  'stock-out': { glyph: '↑', text: 'STOCK OUT', className: 'text-primary dark:text-primary-soft' },
};

export default function StatusGlyph({ variant = 'pending', label, className = '' }) {
  const cfg = VARIANTS[variant] || VARIANTS.pending;
  const displayText = label ?? cfg.text;

  return (
    <span
      className={`
        inline-flex items-center gap-[0.35em]
        font-mono text-[11px] uppercase tracking-[0.08em]
        leading-none whitespace-nowrap
        ${cfg.className}
        ${className}
      `}
    >
      <span aria-hidden="true">{cfg.glyph}</span>
      {displayText}
    </span>
  );
}
