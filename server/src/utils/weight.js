'use strict';

/**
 * weight.js — unit-of-measure display, parsing, and validation helpers.
 *
 * All qty values are accepted as Decimal128 | string | number and returned
 * as Decimal128. Decimal.js is used internally; JS Number is never used for
 * weight arithmetic.
 *
 * Units supported (v1, spec §B.1):
 *   pcs, kg, g, l, ml, dozen, box, packet
 *
 * spec: setup-flow-and-units.md §B.1, §B.4, §B.5, §B.8
 */

const Decimal = require('decimal.js');
const { Decimal128 } = require('mongoose').Types;

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert any accepted input to a Decimal.js instance.
 * @param {Decimal128|string|number|Decimal} v
 * @returns {Decimal}
 * @throws {Error} on NaN / Infinity / unknown type
 */
function _toDecimalJS(v) {
  if (v instanceof Decimal) return v;
  if (v instanceof Decimal128) {
    const s = v.toString();
    const d = new Decimal(s);
    if (!d.isFinite()) throw new Error(`weight: non-finite Decimal128 value "${s}"`);
    return d;
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`weight: non-finite number ${v}`);
    return new Decimal(String(v));
  }
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'nan')
      throw new Error(`weight: cannot parse "${v}" as a quantity`);
    const d = new Decimal(trimmed);
    if (!d.isFinite()) throw new Error(`weight: non-finite string value "${v}"`);
    return d;
  }
  throw new Error(`weight: unsupported type "${typeof v}" for value ${v}`);
}

/** Wrap a Decimal.js value into Decimal128. */
function _wrap(d) {
  return Decimal128.fromString(d.toFixed());
}

/** Round a Decimal.js value to the unit's declared precision. */
function _roundToUnit(d, unit) {
  const def = UNITS[unit];
  if (!def) throw new Error(`weight: unknown unit "${unit}"`);
  return d.toDecimalPlaces(def.decimals, Decimal.ROUND_HALF_UP);
}

// ---------------------------------------------------------------------------
// UNITS registry — single source of truth
// ---------------------------------------------------------------------------

/**
 * Unit definitions for all 8 v1 units (spec §B.1).
 *
 * Fields:
 *   code     {string}  machine code (same as key)
 *   label    {string}  English display label
 *   labelHi  {string}  Hindi display label
 *   decimals {number}  allowed decimal places for qty
 *   isWeight {boolean} true for kg, g
 *   isVolume {boolean} true for l, ml
 *   step     {string}  minimum entry step (informational, used by UI)
 */
const UNITS = {
  pcs:    { code: 'pcs',    label: 'Pieces',      labelHi: 'नग',      decimals: 0, isWeight: false, isVolume: false, step: '1' },
  kg:     { code: 'kg',     label: 'Kilogram',     labelHi: 'किलो',    decimals: 3, isWeight: true,  isVolume: false, step: '0.005' },
  g:      { code: 'g',      label: 'Gram',         labelHi: 'ग्राम',   decimals: 0, isWeight: true,  isVolume: false, step: '1' },
  l:      { code: 'l',      label: 'Litre',        labelHi: 'लीटर',    decimals: 2, isWeight: false, isVolume: true,  step: '0.01' },
  ml:     { code: 'ml',     label: 'Millilitre',   labelHi: 'मिलि',    decimals: 0, isWeight: false, isVolume: true,  step: '1' },
  dozen:  { code: 'dozen',  label: 'Dozen',        labelHi: 'दर्जन',   decimals: 0, isWeight: false, isVolume: false, step: '1' },
  box:    { code: 'box',    label: 'Box',          labelHi: 'डिब्बा',  decimals: 0, isWeight: false, isVolume: false, step: '1' },
  packet: { code: 'packet', label: 'Packet',       labelHi: 'पैकेट',   decimals: 0, isWeight: false, isVolume: false, step: '1' },
};

// Units that support mixed display (spec §B.8 and §B.3):
//   kg → "1 kg 250 g"
//   l  → "1 l 250 ml"
const _MIXED_SUPPORT = new Set(['kg', 'l']);
const _MIXED_SUB_UNIT = { kg: 'g', l: 'ml' };
const _MIXED_FACTOR   = { kg: 1000, l: 1000 }; // 1 kg = 1000 g, 1 l = 1000 ml

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format a quantity for display.
 *
 * mode='decimal' always renders "1.250 kg" (using the unit's decimal precision).
 * mode='mixed'   renders "1 kg 250 g" for kg and l; falls back to decimal for
 *                all other units (spec §B.8).
 *
 * @param {Decimal128|string|number} qty
 * @param {string} unit
 * @param {{ mode?: 'decimal'|'mixed' }} [options]
 * @returns {string}
 * @example
 *   formatQty(toDecimal('1.250'), 'kg', { mode: 'mixed' })   // → "1 kg 250 g"
 *   formatQty(toDecimal('1.250'), 'kg', { mode: 'decimal' }) // → "1.250 kg"
 *   formatQty(toDecimal('500'),   'ml', { mode: 'mixed' })   // → "500 ml"  (no mixed for ml)
 */
function formatQty(qty, unit, { mode = 'decimal' } = {}) {
  const def = UNITS[unit];
  if (!def) throw new Error(`weight.formatQty: unknown unit "${unit}"`);

  const d = _toDecimalJS(qty);

  if (mode === 'mixed' && _MIXED_SUPPORT.has(unit)) {
    const wholeD = d.floor();
    const subUnitCode = _MIXED_SUB_UNIT[unit];
    const factor = _MIXED_FACTOR[unit];
    const remainder = d.minus(wholeD).mul(factor).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    if (remainder.isZero()) {
      // e.g. exactly 2 kg → "2 kg"
      return `${wholeD.toFixed(0)} ${unit}`;
    }
    return `${wholeD.toFixed(0)} ${unit} ${remainder.toFixed(0)} ${subUnitCode}`;
  }

  // Decimal mode (or units that don't support mixed)
  return `${d.toDecimalPlaces(def.decimals, Decimal.ROUND_HALF_UP).toFixed(def.decimals)} ${unit}`;
}

/**
 * Parse a quantity string into a Decimal128 value in the unit's base.
 *
 * Accepts:
 *   "1.250"       → Decimal128("1.250") for kg
 *   "1 kg 250 g"  → Decimal128("1.250") (kg)
 *   "1250g"       → parses as 1250 g; if unit='kg', still returns 1250
 *                   (no unit conversion — caller must pass the right unit)
 *   "1 l 500 ml"  → Decimal128("1.500") for l
 *
 * For plain numeric strings the value is returned in the declared unit as-is.
 * Mixed formats (e.g. "1 kg 250 g") are converted to the base unit.
 *
 * @param {string|number|Decimal128} input
 * @param {string} unit
 * @returns {Decimal128}
 * @example
 *   parseQty('1 kg 250 g', 'kg') // → Decimal128("1.250")
 *   parseQty('0.250',      'kg') // → Decimal128("0.250")
 *   parseQty('1250',       'g')  // → Decimal128("1250")
 */
function parseQty(input, unit) {
  const def = UNITS[unit];
  if (!def) throw new Error(`weight.parseQty: unknown unit "${unit}"`);

  // Accept Decimal128 / number directly
  if (input instanceof Decimal128 || typeof input === 'number') {
    return _wrap(_roundToUnit(_toDecimalJS(input), unit));
  }

  const raw = String(input).trim();

  // Try mixed format: "1 kg 250 g" or "1 l 500 ml"
  if (_MIXED_SUPPORT.has(unit)) {
    const subUnit = _MIXED_SUB_UNIT[unit];
    const factor  = _MIXED_FACTOR[unit];
    // Regex: optional leading integer + unit label, then optional sub-unit part
    // e.g. "1 kg 250 g", "2kg 500g", "0 kg 750 g", "750g" (sub-unit only)
    const mixedRe = new RegExp(
      `^\\s*(\\d+)\\s*${unit}\\s+(\\d+)\\s*${subUnit}\\s*$`, 'i'
    );
    const subOnlyRe = new RegExp(`^\\s*(\\d+(?:\\.\\d+)?)\\s*${subUnit}\\s*$`, 'i');
    const baseOnlyRe = new RegExp(`^\\s*(\\d+(?:\\.\\d+)?)\\s*${unit}\\s*$`, 'i');

    let mixedMatch = raw.match(mixedRe);
    if (mixedMatch) {
      const whole = new Decimal(mixedMatch[1]);
      const sub   = new Decimal(mixedMatch[2]).div(factor);
      return _wrap(_roundToUnit(whole.plus(sub), unit));
    }

    let baseOnlyMatch = raw.match(baseOnlyRe);
    if (baseOnlyMatch) {
      return _wrap(_roundToUnit(new Decimal(baseOnlyMatch[1]), unit));
    }

    let subOnlyMatch = raw.match(subOnlyRe);
    if (subOnlyMatch) {
      // e.g. "250g" when unit is kg → 250/1000 = 0.250 kg
      return _wrap(_roundToUnit(new Decimal(subOnlyMatch[1]).div(factor), unit));
    }
  }

  // Plain numeric string (or fallback for non-mixed units)
  // Strip a trailing unit label if present (e.g. "500 ml", "12pcs")
  const plainRe = new RegExp(`^\\s*(\\d+(?:\\.\\d+)?)\\s*(?:${unit})?\\s*$`, 'i');
  const plainMatch = raw.match(plainRe);
  if (plainMatch) {
    return _wrap(_roundToUnit(new Decimal(plainMatch[1]), unit));
  }

  throw new Error(`weight.parseQty: cannot parse "${raw}" as "${unit}"`);
}

/**
 * Subtract a tare weight from a gross qty. Used for paneer/sweets in dabba.
 * Throws if tare >= qty (spec §B.8).
 *
 * @param {Decimal128|string|number} qty        gross weight in unit
 * @param {Decimal128|string|number} tareWeight tare weight in same unit
 * @param {string} unit
 * @returns {Decimal128}  net weight, rounded to unit precision
 * @example
 *   subtractTare(toDecimal('1.500'), toDecimal('0.250'), 'kg') // → Decimal128("1.250")
 */
function subtractTare(qty, tareWeight, unit) {
  const def = UNITS[unit];
  if (!def) throw new Error(`weight.subtractTare: unknown unit "${unit}"`);

  const qtyD  = _toDecimalJS(qty);
  const tareD = _toDecimalJS(tareWeight);

  if (tareD.gte(qtyD)) {
    throw new Error(
      `weight.subtractTare: tare (${tareD.toFixed()}) must be less than gross qty (${qtyD.toFixed()}) for unit "${unit}"`
    );
  }

  return _wrap(_roundToUnit(qtyD.minus(tareD), unit));
}

/**
 * Validate that a qty is appropriate for the given unit. Fractional quantities
 * are rejected for integer-only units (pcs, dozen, box, packet, g, ml) per
 * spec §B.8 ("1.5 toothbrush is a bug").
 *
 * @param {Decimal128|string|number} qty
 * @param {string} unit
 * @returns {{ valid: boolean, message?: string }}
 * @example
 *   validateQtyForUnit(toDecimal('1.5'), 'pcs')  // → { valid: false, message: '...' }
 *   validateQtyForUnit(toDecimal('1.250'), 'kg') // → { valid: true }
 */
function validateQtyForUnit(qty, unit) {
  const def = UNITS[unit];
  if (!def) return { valid: false, message: `Unknown unit "${unit}"` };

  const d = _toDecimalJS(qty);

  if (d.isNegative()) {
    return { valid: false, message: `Quantity cannot be negative for unit "${unit}"` };
  }

  if (def.decimals === 0) {
    // Must be a non-negative integer
    if (!d.isInteger()) {
      return {
        valid: false,
        message: `Fractional quantity ${d.toFixed()} is not allowed for unit "${unit}" (must be a whole number)`,
      };
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Spec §3.2 aliases — fromNumberOrString, toString, isWhole, multiply,
// subtractTare (already exported), amountToQty.
// ---------------------------------------------------------------------------

/**
 * Alias for parseQty-like conversion: accepts number/string/Decimal128,
 * returns Decimal128 without unit-rounding (preserves all digits).
 * spec §3.2 fromNumberOrString.
 *
 * @param {Decimal128|string|number} v
 * @returns {Decimal128}
 */
function fromNumberOrString(v) {
  return _wrap(_toDecimalJS(v));
}

/**
 * Serialize a Decimal128 quantity to a string with unit-appropriate decimal
 * places. spec §3.2 / §5.2.
 *
 * | unit        | decimal places |
 * | kg, l       | 3              |
 * | everything else | 0          |
 * Note: spec §5.2 says kg/l → 3, g/ml → 0. But weight.js UNITS has l=2.
 * The toJSON transform uses this; for JSON responses we follow spec §5.2 (3 dp for kg/l).
 *
 * @param {Decimal128|string|number} v
 * @param {string} unit
 * @returns {string}
 */
function toString(v, unit) {
  const def = UNITS[unit];
  const decimals = def ? def.decimals : 0;
  // Override: spec §5.2 says stock JSON uses 3 dp for kg/l
  const jsonDecimals = (unit === 'kg' || unit === 'l') ? 3 : decimals;
  const d = _toDecimalJS(v);
  return d.toDecimalPlaces(jsonDecimals, Decimal.ROUND_HALF_UP).toFixed(jsonDecimals);
}

/**
 * True if the value has no fractional part. Used by validator rule §2.2.3.
 * spec §3.2 isWhole.
 *
 * @param {Decimal128|string|number} v
 * @returns {boolean}
 */
function isWhole(v) {
  return _toDecimalJS(v).isInteger();
}

/**
 * Multiply a weight qty by a rate — re-exported from money semantics.
 * Returns unrounded Decimal128. spec §3.2 multiply.
 *
 * @param {Decimal128|string|number} qty
 * @param {Decimal128|string|number} rate
 * @returns {Decimal128}
 */
function multiply(qty, rate) {
  return _wrap(_toDecimalJS(qty).mul(_toDecimalJS(rate)));
}

/**
 * Back-compute quantity from a target amount and rate per unit.
 * spec §3.2 amountToQty. Throws if rate is 0.
 *
 * Step rounding per spec §B.1: kg → 0.005, l → 0.01, others → 1.
 *
 * @param {Decimal128|string|number} amount    total money amount
 * @param {Decimal128|string|number} ratePerUnit price per unit
 * @param {string} unit
 * @returns {Decimal128}   qty rounded to unit step
 */
const _STEP = { kg: '0.005', l: '0.01' };

function amountToQty(amount, ratePerUnit, unit) {
  const a = _toDecimalJS(amount);
  const r = _toDecimalJS(ratePerUnit);
  if (r.isZero()) throw new Error('weight: cannot back-compute qty when rate is 0');

  const qty = a.div(r); // unrounded exact qty

  const stepStr = _STEP[unit];
  if (!stepStr) {
    // Integer units: round to nearest whole number HALF_UP
    return _wrap(qty.toDecimalPlaces(0, Decimal.ROUND_HALF_UP));
  }

  // Step rounding: round to nearest multiple of step, HALF_UP
  const step = new Decimal(stepStr);
  const rounded = qty.div(step).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(step);

  // Format to the step's decimal places
  const stepDecimals = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
  return _wrap(rounded.toDecimalPlaces(stepDecimals, Decimal.ROUND_HALF_UP));
}

/**
 * Alias — spec §3.2 subtractTare returns Decimal128('0') if net < 0 (not throw).
 * Overrides the strict-throw version exported as subtractTare.
 * @param {Decimal128|string|number} grossQty
 * @param {Decimal128|string|number} tareQty
 * @returns {Decimal128}
 */
function subtractTareSafe(grossQty, tareQty) {
  const gross = _toDecimalJS(grossQty);
  const tare  = _toDecimalJS(tareQty);
  const net   = gross.minus(tare);
  return net.isNegative() ? _wrap(new Decimal(0)) : _wrap(net);
}

module.exports = {
  // Original chunk #1 exports
  UNITS,
  formatQty,
  parseQty,
  subtractTare,
  validateQtyForUnit,
  // Spec §3.2 canonical names
  fromNumberOrString,
  toString,
  isWhole,
  multiply,
  amountToQty,
  subtractTareSafe,
};
