/**
 * format.js — Shared formatting helpers (currency, dates, etc.)
 * Centralized so every page renders consistent INR + dates.
 */

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrDecimals = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a number as INR currency (no decimals by default). */
export const fmtINR = (n) => inrWhole.format(Number(n) || 0);

/** Format a number as INR with 2 decimals (use when paise matter). */
export const fmtINR2 = (n) => inrDecimals.format(Number(n) || 0);

/** Compact short integer (en-IN grouping). */
export const fmtNum = (n) =>
  typeof n === 'number'
    ? n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : '—';

/** Date in en-IN: "12 Apr 2026". */
export const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/** Date + time in en-IN: "12 Apr, 2:30 PM". */
export const fmtDateTime = (d) =>
  new Date(d).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
