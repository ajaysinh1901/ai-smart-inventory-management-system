import React from 'react';
import LedgerStrip from './LedgerStrip';

/**
 * <PageHeader> — The Ledger Strip page header.
 *
 * Brand signature:
 *   Line 1: Poppins SemiBold page title (text-3xl)
 *   Line 2: 2px oxblood rule (full width)
 *   Line 3: JetBrains Mono uppercase metadata
 *
 * Props:
 *   title    — string (required)
 *   meta     — string[] joined with ' · '  (default: ['SmartStock', 'FY 25–26', '₹ INR'])
 *   actions  — ReactNode (right-aligned, placed alongside title line)
 *   className — additional wrapper classes
 *
 * NOTE: The old `icon` and `description` props are intentionally dropped.
 * One icon per page MAX — pass it via `actions` if truly needed.
 */
export default function PageHeader({
  title,
  meta,
  actions,
  className = '',
  // Legacy props accepted but ignored (icon, description)
  icon: _icon,
  description: _description,
}) {
  return (
    <header className={`mb-6 ${className}`}>
      {/* Title row + optional right-side actions */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display font-semibold text-3xl tracking-tight text-ink dark:text-paper leading-tight">
          {title}
        </h1>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0 mt-1">
            {actions}
          </div>
        )}
      </div>

      {/* 2px oxblood rule — full width */}
      <div className="ledger-rule mt-3 mb-2" aria-hidden="true" />

      {/* Metadata line — JetBrains Mono uppercase tracked */}
      <LedgerStrip meta={meta} />
    </header>
  );
}
