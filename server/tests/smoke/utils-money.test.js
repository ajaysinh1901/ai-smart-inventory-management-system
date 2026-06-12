'use strict';

/**
 * Smoke tests for server/src/utils/money.js
 * Run: node --test tests/smoke/utils-money.test.js
 *
 * Uses only node:test and node:assert (no extra test runner needed).
 * spec: setup-flow-and-units.md §B.3, §B.8
 */

const { test } = require('node:test');
const assert   = require('node:assert/strict');

// Resolve from the server root so this file can be run from anywhere.
const path = require('path');
const {
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
} = require(path.resolve(__dirname, '../../src/utils/money'));

const { Decimal128 } = require('mongoose').Types;

// Helper: compare two Decimal128 values by their string representation.
function d128eq(actual, expected, msg) {
  const a = actual instanceof Decimal128 ? actual.toString() : String(actual);
  const e = expected instanceof Decimal128 ? expected.toString() : String(expected);
  assert.equal(a, e, msg);
}

// ---------------------------------------------------------------------------
// toDecimal
// ---------------------------------------------------------------------------
test('toDecimal: accepts a plain number', () => {
  const result = toDecimal(65);
  assert.ok(result instanceof Decimal128, 'should return Decimal128');
  assert.equal(result.toString(), '65');
});

test('toDecimal: accepts a string', () => {
  d128eq(toDecimal('16.25'), toDecimal('16.25'));
});

test('toDecimal: accepts another Decimal128', () => {
  const d = Decimal128.fromString('99.99');
  d128eq(toDecimal(d), d);
});

test('toDecimal: throws on NaN string', () => {
  assert.throws(() => toDecimal('nan'), /money/i);
});

test('toDecimal: throws on Infinity', () => {
  assert.throws(() => toDecimal(Infinity), /money/i);
});

// ---------------------------------------------------------------------------
// Worked example: 250 g rice @ ₹65/kg  (spec §B.3)
// ---------------------------------------------------------------------------
test('worked example: 250 g rice @ ₹65/kg — line_net = 16.25', () => {
  const qty  = toDecimal('0.250');   // 250 g expressed in kg
  const rate = toDecimal('65.00');   // ₹/kg
  const lineNet = multiply(qty, rate);
  d128eq(roundPaise(lineNet), toDecimal('16.25'), 'line_net after roundPaise');
});

test('worked example: 250 g rice @ ₹65/kg — gst@5% = 0.81', () => {
  const lineNet = toDecimal('16.25');
  const gst     = multiply(lineNet, toDecimal('0.05')); // 0.8125 before rounding
  d128eq(roundPaise(gst), toDecimal('0.81'), 'gst rounded to paise');
});

test('worked example: 250 g rice @ ₹65/kg — line_total = 17.06', () => {
  const lineNet    = toDecimal('16.25');
  const gstRounded = toDecimal('0.81');
  const lineTotal  = add(lineNet, gstRounded);
  d128eq(lineTotal, toDecimal('17.06'), 'line_total');
});

// ---------------------------------------------------------------------------
// HALF_UP boundary
// ---------------------------------------------------------------------------
test('roundPaise: 0.005 → 0.01 (HALF_UP)', () => {
  d128eq(roundPaise(toDecimal('0.005')), toDecimal('0.01'));
});

test('roundPaise: 0.004 → 0.00 (rounds down)', () => {
  d128eq(roundPaise(toDecimal('0.004')), toDecimal('0.00'));
});

test('roundPaise: 0.8125 → 0.81 (HALF_UP truncates here)', () => {
  d128eq(roundPaise(toDecimal('0.8125')), toDecimal('0.81'));
});

test('roundPaise: 0.815 → 0.82 (HALF_UP rounds up)', () => {
  d128eq(roundPaise(toDecimal('0.815')), toDecimal('0.82'));
});

// ---------------------------------------------------------------------------
// CGST/SGST split — odd-paise residue goes to CGST (Tally parity, spec §B.8)
// ---------------------------------------------------------------------------
test('splitGst cgst-sgst: ₹0.81 → cgst=0.41, sgst=0.40 (CGST gets residue paise)', () => {
  const { cgst, sgst } = splitGst({ totalTax: toDecimal('0.81'), mode: 'cgst-sgst' });
  d128eq(cgst, toDecimal('0.41'), 'cgst');
  d128eq(sgst, toDecimal('0.40'), 'sgst');
});

test('splitGst cgst-sgst: ₹1.00 → cgst=0.50, sgst=0.50 (even split)', () => {
  const { cgst, sgst } = splitGst({ totalTax: toDecimal('1.00'), mode: 'cgst-sgst' });
  d128eq(cgst, toDecimal('0.50'), 'cgst');
  d128eq(sgst, toDecimal('0.50'), 'sgst');
});

test('splitGst cgst-sgst: ₹0.01 → cgst=0.01, sgst=0.00 (all residue to CGST)', () => {
  const { cgst, sgst } = splitGst({ totalTax: toDecimal('0.01'), mode: 'cgst-sgst' });
  d128eq(cgst, toDecimal('0.01'), 'cgst');
  d128eq(sgst, toDecimal('0.00'), 'sgst');
});

test('splitGst igst: returns igst only', () => {
  const result = splitGst({ totalTax: toDecimal('5.00'), mode: 'igst' });
  assert.ok('igst' in result, 'should have igst key');
  assert.ok(!('cgst' in result), 'should not have cgst key');
  d128eq(result.igst, toDecimal('5.00'));
});

test('splitGst: throws on unknown mode', () => {
  assert.throws(() => splitGst({ totalTax: toDecimal('1.00'), mode: 'bad' }), /mode/i);
});

// ---------------------------------------------------------------------------
// Round-off (spec §B.3 rule 3)
// ---------------------------------------------------------------------------
test('addRoundOff: ₹17.06 → final=17, roundOff=-0.06', () => {
  const { finalTotal, roundOff } = addRoundOff(toDecimal('17.06'));
  d128eq(finalTotal, toDecimal('17'),    'finalTotal');
  d128eq(roundOff,   toDecimal('-0.06'), 'roundOff');
});

test('addRoundOff: ₹16.49 → final=16, roundOff=-0.49', () => {
  const { finalTotal, roundOff } = addRoundOff(toDecimal('16.49'));
  d128eq(finalTotal, toDecimal('16'),    'finalTotal');
  d128eq(roundOff,   toDecimal('-0.49'), 'roundOff');
});

test('addRoundOff: ₹100.00 → final=100, roundOff=0.00', () => {
  const { finalTotal, roundOff } = addRoundOff(toDecimal('100.00'));
  d128eq(finalTotal, toDecimal('100'), 'finalTotal');
  d128eq(roundOff,   toDecimal('0'),   'roundOff');
});

// ---------------------------------------------------------------------------
// formatPaise
// ---------------------------------------------------------------------------
test('formatPaise: showPaise=true (default)', () => {
  assert.equal(formatPaise(toDecimal('17.06')), '₹17.06');
});

test('formatPaise: showPaise=false hides paise', () => {
  assert.equal(formatPaise(toDecimal('17.06'), { showPaise: false }), '₹17');
});

test('formatPaise: whole rupee amount shows .00 when paise shown', () => {
  assert.equal(formatPaise(toDecimal('100')), '₹100.00');
});

// ---------------------------------------------------------------------------
// roundQty
// ---------------------------------------------------------------------------
test('roundQty: kg rounds to 3 decimals', () => {
  d128eq(roundQty(toDecimal('1.2504'), 'kg'), toDecimal('1.250'));
});

test('roundQty: pcs rounds to 0 decimals (integer)', () => {
  d128eq(roundQty(toDecimal('3.7'), 'pcs'), toDecimal('4'));
});

test('roundQty: l rounds to 2 decimals', () => {
  d128eq(roundQty(toDecimal('1.255'), 'l'), toDecimal('1.26'));
});

test('roundQty: throws on unknown unit', () => {
  assert.throws(() => roundQty(toDecimal('1'), 'tola'), /unknown unit/i);
});

// ---------------------------------------------------------------------------
// sumLines
// ---------------------------------------------------------------------------
test('sumLines: sums a Decimal128 column', () => {
  const lines = [
    { lineTotal: toDecimal('17.06') },
    { lineTotal: toDecimal('32.50') },
    { lineTotal: toDecimal('0.44') },
  ];
  d128eq(sumLines(lines, 'lineTotal'), toDecimal('50.00'));
});

test('sumLines: handles missing/null values gracefully', () => {
  const lines = [
    { lineTotal: toDecimal('10.00') },
    { lineTotal: null },
    { lineTotal: undefined },
    { lineTotal: toDecimal('5.00') },
  ];
  d128eq(sumLines(lines, 'lineTotal'), toDecimal('15.00'));
});

test('sumLines: empty array returns 0', () => {
  d128eq(sumLines([], 'lineTotal'), toDecimal('0'));
});

// ---------------------------------------------------------------------------
// add / subtract
// ---------------------------------------------------------------------------
test('add: basic addition', () => {
  d128eq(add(toDecimal('16.25'), toDecimal('0.81')), toDecimal('17.06'));
});

test('subtract: basic subtraction', () => {
  d128eq(subtract(toDecimal('17.06'), toDecimal('16.25')), toDecimal('0.81'));
});
