import React from 'react';

/**
 * <Money> — The canonical way to render rupee amounts in SmartStock.
 *
 * Visual signature:
 *   ₹ (brass) + integer rupees (Poppins 600 for hero, JetBrains Mono for table)
 *   + .paise (80% size, 60% opacity)
 *   Negative values: oxblood text + en-dash prefix
 *
 * Props:
 *   value    — number (rupees, may be negative)
 *   variant  — "hero" | "table" | "inline"  (default: "inline")
 *   className — additional classes on the outer span
 */
export default function Money({ value = 0, variant = 'inline', className = '' }) {
  const num = Number(value) || 0;
  const isNegative = num < 0;
  const abs = Math.abs(num);

  // Split into rupees and paise
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);

  // Format rupees with Indian grouping (lakhs)
  const formattedRupees = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(rupees);

  const paiseStr = paise.toString().padStart(2, '0');

  // Variant-driven classes
  const variantClasses = {
    hero:   'font-display font-semibold text-inherit',
    table:  'font-mono font-medium',
    inline: 'font-mono',
  };

  const outerClass = [
    'inline-flex items-baseline gap-[0.05em]',
    'tabular-nums',
    isNegative ? 'text-primary' : '',
    variantClasses[variant] || variantClasses.inline,
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={outerClass} aria-label={`${isNegative ? 'minus ' : ''}${formattedRupees} rupees ${paise} paise`}>
      {isNegative && (
        <span className="mr-[0.03em]" aria-hidden="true">&#8722;</span>
      )}
      {/* Rupee glyph — brass coloured, with hair-space after */}
      <span className="text-brass mr-[0.05em]" aria-hidden="true">&#x20B9;</span>
      {/* Integer rupees */}
      <span>{formattedRupees}</span>
      {/* Paise — 80% size, 60% opacity */}
      <span
        className="text-[0.8em] opacity-60 leading-none"
        aria-hidden="true"
      >
        .{paiseStr}
      </span>
    </span>
  );
}
