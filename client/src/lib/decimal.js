/**
 * decimal.js — Client-side helpers for Decimal128 string values from the API.
 *
 * The backend serialises all Decimal128 fields to strings (e.g. "65.00").
 * These helpers parse them safely for UI math and format them for display.
 * On submit, send the value back as a string — the backend's
 * money.fromNumberOrString() accepts both number and string.
 */

/**
 * Parse a Decimal128 string (or number) from the API into a JS number.
 * Returns 0 for null / undefined / non-finite values — never throws.
 *
 * @param {string|number|null|undefined} s
 * @returns {number}
 */
export function parseRupees(s) {
  if (s == null) return 0;
  const n = parseFloat(String(s));
  if (!Number.isFinite(n)) return 0;
  return n;
}

/**
 * Format a rupee amount for display.
 * Respects paiseDisplay flag — when false, shows whole rupees only.
 *
 * @param {string|number} value
 * @param {{ paise?: boolean }} opts
 * @returns {string}  e.g. "₹52.00" or "₹52"
 */
export function formatRupees(value, { paise = true } = {}) {
  const n = parseRupees(value);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise ? 2 : 0,
    maximumFractionDigits: paise ? 2 : 0,
  }).format(n);
}

/**
 * Serialise a UI number input value to a string for the API.
 * API accepts both string and number; string is preferred (no precision loss).
 *
 * @param {number|string} v
 * @returns {string}  e.g. "65.00"
 */
export function toApiString(v) {
  const n = parseRupees(v);
  return String(n);
}
