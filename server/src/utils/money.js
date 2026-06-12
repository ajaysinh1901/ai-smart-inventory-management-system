'use strict';

/**
 * money.js — paise-safe arithmetic helpers for SmartStock AI
 *
 * All public functions accept and return mongoose.Types.Decimal128 at the
 * API boundary. Decimal.js is used internally for exact arithmetic.
 * JavaScript Number is never used for money math — only for display output.
 *
 * Rounding rule throughout: HALF_UP at boundaries only (line subtotal,
 * line tax, invoice total). Never round qty or rate mid-calculation.
 * Mirrors Tally behaviour per spec §B.3 and §B.8.
 *
 * spec: setup-flow-and-units.md §B.3, §B.6, §B.8
 */

const Decimal = require('decimal.js');
const { Decimal128 } = require('mongoose').Types;

// Configure Decimal.js: 20 significant digits, ROUND_HALF_UP.
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ---------------------------------------------------------------------------
// Internal helpers — never exported
// ---------------------------------------------------------------------------

/**
 * Convert any accepted input to a Decimal.js instance.
 * @param {Decimal128|string|number|Decimal} v
 * @returns {Decimal}
 * @throws {Error} if the value cannot be parsed as a finite number
 */
function _toDecimalJS(v) {
  if (v instanceof Decimal) return v;
  // Mongoose Decimal128 exposes its value via .toString()
  if (v instanceof Decimal128) {
    const s = v.toString();
    const d = new Decimal(s);
    if (!d.isFinite()) throw new Error(`money: non-finite Decimal128 value "${s}"`);
    return d;
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`money: non-finite number ${v}`);
    return new Decimal(String(v)); // String conversion avoids floating-point repr bugs
  }
  if (typeof v === 'string') {
    if (v.trim() === '' || v.trim().toLowerCase() === 'nan')
      throw new Error(`money: cannot parse "${v}" as a monetary value`);
    const d = new Decimal(v.trim());
    if (!d.isFinite()) throw new Error(`money: non-finite string value "${v}"`);
    return d;
  }
  throw new Error(`money: unsupported type "${typeof v}" for value ${v}`);
}

/**
 * Wrap a Decimal.js instance into a Mongoose Decimal128.
 * @param {Decimal} d
 * @returns {Decimal128}
 */
function _wrap(d) {
  return Decimal128.fromString(d.toFixed()); // toFixed() keeps all digits, no scientific notation
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert any accepted input to Decimal128.
 * Throws on NaN, Infinity, or unparseable strings.
 *
 * @param {Decimal128|string|number} value
 * @returns {Decimal128}
 * @example
 *   toDecimal('16.25') // → Decimal128("16.25")
 *   toDecimal(65)      // → Decimal128("65")
 */
function toDecimal(value) {
  return _wrap(_toDecimalJS(value));
}

/**
 * Multiply two Decimal128 values without rounding. Use roundPaise() at
 * the appropriate boundary after accumulation.
 *
 * @param {Decimal128|string|number} a
 * @param {Decimal128|string|number} b
 * @returns {Decimal128}
 * @example
 *   multiply(toDecimal('0.250'), toDecimal('65.00')) // → Decimal128("16.25")
 */
function multiply(a, b) {
  return _wrap(_toDecimalJS(a).mul(_toDecimalJS(b)));
}

/**
 * Add two Decimal128 values without rounding.
 *
 * @param {Decimal128|string|number} a
 * @param {Decimal128|string|number} b
 * @returns {Decimal128}
 * @example
 *   add(toDecimal('16.25'), toDecimal('0.81')) // → Decimal128("17.06")
 */
function add(a, b) {
  return _wrap(_toDecimalJS(a).plus(_toDecimalJS(b)));
}

/**
 * Subtract b from a without rounding.
 *
 * @param {Decimal128|string|number} a
 * @param {Decimal128|string|number} b
 * @returns {Decimal128}
 * @example
 *   subtract(toDecimal('17.06'), toDecimal('16.25')) // → Decimal128("0.81")
 */
function subtract(a, b) {
  return _wrap(_toDecimalJS(a).minus(_toDecimalJS(b)));
}

/**
 * Round a monetary amount to 2 decimal places using HALF_UP.
 * This is the correct paise-rounding function — call it only at line
 * boundaries, never mid-calculation.
 *
 * @param {Decimal128|string|number} amount
 * @returns {Decimal128}
 * @example
 *   roundPaise(toDecimal('0.8125')) // → Decimal128("0.81")
 *   roundPaise(toDecimal('0.005'))  // → Decimal128("0.01")  [HALF_UP]
 */
function roundPaise(amount) {
  return _wrap(_toDecimalJS(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
}

// Unit decimal precision map per spec §B.1.
// 0 = integer-only (pcs, dozen, box, packet, ml, g)
// 3 = kg, l gets 2 (spec says step 0.01 for l)
const _UNIT_DECIMALS = {
  kg:     3,
  l:      2,
  g:      0,
  ml:     0,
  pcs:    0,
  dozen:  0,
  box:    0,
  packet: 0,
};

/**
 * Round a quantity to the correct decimal precision for the given unit.
 * Precision is HALF_UP. Rejects unknown units.
 *
 * @param {Decimal128|string|number} qty
 * @param {string} unit  one of: kg, l, g, ml, pcs, dozen, box, packet
 * @returns {Decimal128}
 * @example
 *   roundQty(toDecimal('0.2504'), 'kg') // → Decimal128("0.250")
 *   roundQty(toDecimal('3.7'),    'pcs') // → Decimal128("4")
 */
function roundQty(qty, unit) {
  const decimals = _UNIT_DECIMALS[unit];
  if (decimals === undefined) throw new Error(`money.roundQty: unknown unit "${unit}"`);
  return _wrap(_toDecimalJS(qty).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP));
}

/**
 * Split a rounded total-tax amount into CGST + SGST (intrastate) or IGST
 * (interstate). For CGST/SGST, any 1-paise residue from halving an odd-paise
 * total goes to CGST — matching Tally behaviour per spec §B.8.
 *
 * @param {{ totalTax: Decimal128|string|number, mode: 'cgst-sgst'|'igst' }} options
 * @returns {{ cgst?: Decimal128, sgst?: Decimal128, igst?: Decimal128 }}
 * @example
 *   splitGst({ totalTax: toDecimal('0.81'), mode: 'cgst-sgst' })
 *   // → { cgst: Decimal128("0.41"), sgst: Decimal128("0.40") }
 *
 *   splitGst({ totalTax: toDecimal('1.00'), mode: 'igst' })
 *   // → { igst: Decimal128("1.00") }
 */
function splitGst({ totalTax, mode }) {
  if (mode === 'igst') {
    return { igst: roundPaise(totalTax) };
  }
  if (mode === 'cgst-sgst') {
    // Work in integer paise to avoid any floating-point drift.
    const totalPaise = _toDecimalJS(totalTax)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .mul(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP); // should already be integer

    const halfPaise = totalPaise.div(2).toDecimalPlaces(0, Decimal.ROUND_DOWN); // truncate toward zero = SGST gets smaller-magnitude half (works for +ve and -ve)
    const cgstPaise = totalPaise.minus(halfPaise); // CGST absorbs the residue paise

    const cgst = _wrap(cgstPaise.div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
    const sgst = _wrap(halfPaise.div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
    return { cgst, sgst };
  }
  throw new Error(`money.splitGst: unknown mode "${mode}". Expected 'cgst-sgst' or 'igst'.`);
}

/**
 * Apply kirana round-off to the nearest whole rupee using HALF_UP rounding.
 * Returns the final rupee total and the signed round-off amount stored on the
 * invoice in the `roundOff` field. GSTR-1 uses the pre-round-off total; this
 * is display-only and customer-facing.
 *
 * Resolved deviation (chunk #1 → chunk #3): spec §3.1 and spec §3.3 rows #9/#10
 * both require HALF_UP (₹284.50 → ₹285, ₹17.06 → ₹17). The earlier floor()
 * implementation was incorrect per the locked spec. HALF_UP is now canonical.
 *
 * roundOff is negative when rounded down (₹17.06 → -0.06),
 * positive when rounded up (₹284.50 → +0.50).
 *
 * @param {Decimal128|string|number} amount
 * @returns {{ finalTotal: Decimal128, roundOff: Decimal128 }}
 * @example
 *   addRoundOff(toDecimal('17.06'))  // → { finalTotal: Decimal128("17"),  roundOff: Decimal128("-0.06") }
 *   addRoundOff(toDecimal('284.50')) // → { finalTotal: Decimal128("285"), roundOff: Decimal128("0.50") }
 */
function addRoundOff(amount) {
  const d = _toDecimalJS(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const finalD = d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP); // HALF_UP to nearest rupee
  const roundOffD = finalD.minus(d); // negative = rounded down, positive = rounded up

  return {
    finalTotal: _wrap(finalD),
    roundOff:   _wrap(roundOffD.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)),
  };
}

/**
 * Format a monetary amount as a display string with the rupee symbol.
 *
 * @param {Decimal128|string|number} amount
 * @param {{ showPaise?: boolean }} [options]
 * @returns {string}
 * @example
 *   formatPaise(toDecimal('17.06'))                    // → "₹17.06"
 *   formatPaise(toDecimal('17.06'), { showPaise: false }) // → "₹17"
 */
function formatPaise(amount, { showPaise = true } = {}) {
  const d = _toDecimalJS(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (showPaise) {
    return `₹${d.toFixed(2)}`;
  }
  // Hide paise — display the rounded-down rupee amount (no extra rounding up).
  return `₹${d.floor().toFixed(0)}`;
}

/**
 * Sum a single Decimal128 column from an array of objects (e.g. invoice line
 * items). Handles Mongoose Decimal128 fields transparently.
 *
 * @param {Array<object>} lines  array of objects (e.g. sale line items)
 * @param {string} key           property name holding the Decimal128 value
 * @returns {Decimal128}
 * @example
 *   sumLines([{ lineTotal: toDecimal('17.06') }, { lineTotal: toDecimal('32.50') }], 'lineTotal')
 *   // → Decimal128("49.56")
 */
function sumLines(lines, key) {
  const total = lines.reduce((acc, line) => {
    const v = line[key];
    if (v === undefined || v === null) return acc;
    return acc.plus(_toDecimalJS(v));
  }, new Decimal(0));
  return _wrap(total);
}

// ---------------------------------------------------------------------------
// Spec §3.1 aliases — fromNumberOrString, toString, isZero, isNegative, inr,
// splitTax. These are the canonical names used by all callers in chunk #2.
// ---------------------------------------------------------------------------

/**
 * Alias for toDecimal — canonical name per spec §3.1.
 * Accepts number, string, or Decimal128; returns Decimal128.
 * Throws on NaN, Infinity, null, undefined, empty string.
 */
const fromNumberOrString = toDecimal;

/**
 * Serialize a Decimal128 money value to a 2-decimal-place string.
 * Returns "65.00", not "₹65.00". spec §3.1 / §5.1.
 *
 * @param {Decimal128|string|number} v
 * @returns {string}  e.g. "65.00"
 */
function toString(v) {
  const d = _toDecimalJS(v);
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/**
 * True if value rounds to zero. spec §3.1.
 * @param {Decimal128|string|number} v
 * @returns {boolean}
 */
function isZero(v) {
  return _toDecimalJS(v).isZero();
}

/**
 * True if value is strictly negative. spec §3.1.
 * @param {Decimal128|string|number} v
 * @returns {boolean}
 */
function isNegative(v) {
  return _toDecimalJS(v).isNegative();
}

/**
 * Display helper — formats as ₹65.00 or ₹65.
 * Alias for formatPaise with renamed option key per spec §3.1.
 * @param {Decimal128|string|number} v
 * @param {{ paise?: boolean }} [opts]
 * @returns {string}
 */
function inr(v, { paise = true } = {}) {
  return formatPaise(v, { showPaise: paise });
}

/**
 * Split total tax into CGST/SGST or IGST.
 * Alias for splitGst with different arg shape per spec §3.1.
 * @param {Decimal128|string|number} totalTax
 * @param {'cgst-sgst'|'igst'} [mode='cgst-sgst']
 * @returns {{ cgst: Decimal128, sgst: Decimal128, igst: Decimal128 }}
 */
function splitTax(totalTax, mode = 'cgst-sgst') {
  const result = splitGst({ totalTax, mode });
  const zero = Decimal128.fromString('0');
  return {
    cgst: result.cgst  || zero,
    sgst: result.sgst  || zero,
    igst: result.igst  || zero,
  };
}

module.exports = {
  // Original chunk #1 exports
  toDecimal,
  multiply,
  add,
  subtract,
  roundPaise,
  roundQty,
  splitGst,
  addRoundOff,
  formatPaise,
  sumLines,
  // Spec §3.1 canonical names
  fromNumberOrString,
  toString,
  isZero,
  isNegative,
  inr,
  splitTax,
};
