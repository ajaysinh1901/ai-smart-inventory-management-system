/**
 * weight.js — Client-side unit-of-measure helpers.
 *
 * Mirrors the server's weight.js contract for display purposes only.
 * All math on the server uses Decimal128 — here we use JS numbers for display.
 *
 * Units shipped in v1:
 *   pcs | kg | g | l | ml | dozen | box | packet
 */

/** Decimal places used when displaying qty for a given unit */
export const UNIT_DECIMALS = {
  kg:     3,
  l:      3,
  g:      0,
  ml:     0,
  pcs:    0,
  dozen:  0,
  box:    0,
  packet: 0,
};

/** Step granularity for numeric inputs */
export const UNIT_STEP = {
  kg:     0.005,
  l:      0.01,
  g:      1,
  ml:     1,
  pcs:    1,
  dozen:  1,
  box:    1,
  packet: 1,
};

/** English labels */
export const UNIT_LABELS_EN = {
  pcs:    'Pieces',
  kg:     'Kilogram',
  g:      'Gram',
  l:      'Litre',
  ml:     'Millilitre',
  dozen:  'Dozen',
  box:    'Box',
  packet: 'Packet',
};

/** Short display suffixes */
export const UNIT_SUFFIX = {
  pcs:    'pcs',
  kg:     'kg',
  g:      'g',
  l:      'L',
  ml:     'ml',
  dozen:  'dozen',
  box:    'box',
  packet: 'packet',
};

/**
 * Units where saleByWeight = true makes sense.
 * auto-toggle to true when unit is kg or l (the most common weight-sale units).
 */
export const WEIGHT_UNITS = new Set(['kg', 'g', 'l', 'ml']);
export const AUTO_WEIGHT_UNITS = new Set(['kg', 'l']); // auto-toggle saleByWeight

/**
 * Format a qty + unit for display.
 *
 * @param {string|number|null} qty   - the raw qty value from the API (may be Decimal128 string)
 * @param {string} unit              - one of the 8 unit codes
 * @param {'decimal'|'mixed'} mode   - 'mixed' shows "1 kg 250 g", 'decimal' shows "1.250 kg"
 * @returns {string}
 */
export function formatQty(qty, unit = 'pcs', mode = 'decimal') {
  if (qty == null) return `0 ${UNIT_SUFFIX[unit] || unit}`;
  const n = parseFloat(String(qty));
  if (!Number.isFinite(n)) return `0 ${UNIT_SUFFIX[unit] || unit}`;

  const decimals = UNIT_DECIMALS[unit] ?? 0;
  const suffix   = UNIT_SUFFIX[unit] || unit;

  if (mode === 'mixed') {
    if (unit === 'kg') {
      const kg = Math.floor(Math.abs(n));
      const g  = Math.round((Math.abs(n) - kg) * 1000);
      const sign = n < 0 ? '-' : '';
      if (kg === 0) return `${sign}${g} g`;
      if (g === 0)  return `${sign}${kg} kg`;
      return `${sign}${kg} kg ${g} g`;
    }
    if (unit === 'l') {
      const l  = Math.floor(Math.abs(n));
      const ml = Math.round((Math.abs(n) - l) * 1000);
      const sign = n < 0 ? '-' : '';
      if (l === 0) return `${sign}${ml} ml`;
      if (ml === 0) return `${sign}${l} L`;
      return `${sign}${l} L ${ml} ml`;
    }
  }

  return `${n.toFixed(decimals)} ${suffix}`;
}

/**
 * Whether a unit allows decimal quantities (saleByWeight capable).
 *
 * @param {string} unit
 * @returns {boolean}
 */
export function isWeightUnit(unit) {
  return WEIGHT_UNITS.has(unit);
}

/**
 * Whether a given qty value is a whole number (no fractional part).
 * Used to validate pcs/dozen/box/packet quantities.
 *
 * @param {number} qty
 * @returns {boolean}
 */
export function isWholeNumber(qty) {
  const n = parseFloat(String(qty));
  if (!Number.isFinite(n)) return true; // treat empty/invalid as ok
  return Number.isInteger(n);
}
