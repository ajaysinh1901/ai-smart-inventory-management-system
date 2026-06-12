'use strict';

/**
 * Smoke tests for server/src/utils/weight.js
 * Run: node --test tests/smoke/utils-weight.test.js
 *
 * Uses only node:test and node:assert (no extra test runner needed).
 * spec: setup-flow-and-units.md §B.1, §B.4, §B.8
 */

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const path = require('path');
const {
  UNITS,
  formatQty,
  parseQty,
  subtractTare,
  validateQtyForUnit,
} = require(path.resolve(__dirname, '../../src/utils/weight'));

const { toDecimal } = require(path.resolve(__dirname, '../../src/utils/money'));
const { Decimal128 } = require('mongoose').Types;

// Helper: compare Decimal128 by string value.
function d128eq(actual, expected, msg) {
  const a = actual instanceof Decimal128 ? actual.toString() : String(actual);
  const e = expected instanceof Decimal128 ? expected.toString() : String(expected);
  assert.equal(a, e, msg);
}

// ---------------------------------------------------------------------------
// UNITS registry sanity
// ---------------------------------------------------------------------------
test('UNITS: all 8 v1 units are defined', () => {
  const required = ['pcs', 'kg', 'g', 'l', 'ml', 'dozen', 'box', 'packet'];
  for (const code of required) {
    assert.ok(UNITS[code], `UNITS["${code}"] should be defined`);
    assert.equal(UNITS[code].code, code, `code field should equal "${code}"`);
    assert.ok(typeof UNITS[code].label === 'string', 'label should be a string');
    assert.ok(typeof UNITS[code].decimals === 'number', 'decimals should be a number');
  }
});

test('UNITS: kg and l are the only decimal units (decimals > 0)', () => {
  const decimalUnits = Object.values(UNITS).filter(u => u.decimals > 0).map(u => u.code).sort();
  assert.deepEqual(decimalUnits, ['kg', 'l']);
});

test('UNITS: kg and l flagged correctly (isWeight/isVolume)', () => {
  assert.equal(UNITS.kg.isWeight, true);
  assert.equal(UNITS.l.isVolume, true);
  assert.equal(UNITS.pcs.isWeight, false);
  assert.equal(UNITS.pcs.isVolume, false);
});

// ---------------------------------------------------------------------------
// formatQty — decimal mode
// ---------------------------------------------------------------------------
test('formatQty decimal: 1.250 kg → "1.250 kg"', () => {
  assert.equal(formatQty(toDecimal('1.250'), 'kg', { mode: 'decimal' }), '1.250 kg');
});

test('formatQty decimal: 500 ml → "500 ml"', () => {
  assert.equal(formatQty(toDecimal('500'), 'ml', { mode: 'decimal' }), '500 ml');
});

test('formatQty decimal: 1.25 l → "1.25 l"', () => {
  assert.equal(formatQty(toDecimal('1.25'), 'l', { mode: 'decimal' }), '1.25 l');
});

test('formatQty decimal: 12 pcs → "12 pcs"', () => {
  assert.equal(formatQty(toDecimal('12'), 'pcs', { mode: 'decimal' }), '12 pcs');
});

// ---------------------------------------------------------------------------
// formatQty — mixed mode  (spec §B.8, B.4)
// ---------------------------------------------------------------------------
test('formatQty mixed: 1.250 kg → "1 kg 250 g"', () => {
  assert.equal(formatQty(toDecimal('1.250'), 'kg', { mode: 'mixed' }), '1 kg 250 g');
});

test('formatQty mixed: 1.500 l → "1 l 500 ml"', () => {
  assert.equal(formatQty(toDecimal('1.500'), 'l', { mode: 'mixed' }), '1 l 500 ml');
});

test('formatQty mixed: exactly 2 kg → "2 kg" (no sub-unit when remainder is zero)', () => {
  assert.equal(formatQty(toDecimal('2.000'), 'kg', { mode: 'mixed' }), '2 kg');
});

test('formatQty mixed: 0.250 kg → "0 kg 250 g"', () => {
  assert.equal(formatQty(toDecimal('0.250'), 'kg', { mode: 'mixed' }), '0 kg 250 g');
});

test('formatQty mixed: ml falls back to decimal (no mixed support)', () => {
  // ml does not support mixed, so mode: mixed falls through to decimal
  assert.equal(formatQty(toDecimal('500'), 'ml', { mode: 'mixed' }), '500 ml');
});

test('formatQty mixed: pcs falls back to decimal', () => {
  assert.equal(formatQty(toDecimal('5'), 'pcs', { mode: 'mixed' }), '5 pcs');
});

// ---------------------------------------------------------------------------
// parseQty
// ---------------------------------------------------------------------------
test('parseQty: plain decimal string for kg', () => {
  d128eq(parseQty('1.250', 'kg'), toDecimal('1.250'));
});

test('parseQty: mixed "1 kg 250 g" → 1.250 kg', () => {
  d128eq(parseQty('1 kg 250 g', 'kg'), toDecimal('1.250'));
});

test('parseQty: sub-unit only "250g" for kg unit → 0.250 kg', () => {
  d128eq(parseQty('250g', 'kg'), toDecimal('0.250'));
});

test('parseQty: mixed "1 l 500 ml" → 1.500 l', () => {
  d128eq(parseQty('1 l 500 ml', 'l'), toDecimal('1.500'));
});

test('parseQty: plain "500" for ml → 500 ml', () => {
  d128eq(parseQty('500', 'ml'), toDecimal('500'));
});

test('parseQty: Decimal128 input passthrough', () => {
  const input = toDecimal('1.250');
  d128eq(parseQty(input, 'kg'), toDecimal('1.250'));
});

test('parseQty: throws on unparseable string', () => {
  assert.throws(() => parseQty('???', 'kg'), /cannot parse/i);
});

// ---------------------------------------------------------------------------
// subtractTare  (spec §B.8)
// ---------------------------------------------------------------------------
test('subtractTare: 1.500 kg gross - 0.250 kg tare = 1.250 kg net', () => {
  d128eq(
    subtractTare(toDecimal('1.500'), toDecimal('0.250'), 'kg'),
    toDecimal('1.250')
  );
});

test('subtractTare: throws when tare equals qty', () => {
  assert.throws(
    () => subtractTare(toDecimal('0.500'), toDecimal('0.500'), 'kg'),
    /tare.*must be less/i
  );
});

test('subtractTare: throws when tare exceeds qty', () => {
  assert.throws(
    () => subtractTare(toDecimal('0.200'), toDecimal('0.500'), 'kg'),
    /tare.*must be less/i
  );
});

// ---------------------------------------------------------------------------
// validateQtyForUnit  (spec §B.8 — "1.5 toothbrush is a bug")
// ---------------------------------------------------------------------------
test('validateQtyForUnit: 1.5 pcs → invalid', () => {
  const result = validateQtyForUnit(toDecimal('1.5'), 'pcs');
  assert.equal(result.valid, false, 'fractional pcs should be rejected');
  assert.ok(result.message, 'should include a message');
});

test('validateQtyForUnit: 12 pcs → valid', () => {
  const result = validateQtyForUnit(toDecimal('12'), 'pcs');
  assert.equal(result.valid, true);
});

test('validateQtyForUnit: 1.250 kg → valid', () => {
  const result = validateQtyForUnit(toDecimal('1.250'), 'kg');
  assert.equal(result.valid, true);
});

test('validateQtyForUnit: 1.5 dozen → invalid', () => {
  const result = validateQtyForUnit(toDecimal('1.5'), 'dozen');
  assert.equal(result.valid, false);
});

test('validateQtyForUnit: 3 box → valid', () => {
  const result = validateQtyForUnit(toDecimal('3'), 'box');
  assert.equal(result.valid, true);
});

test('validateQtyForUnit: 0.5 ml → invalid (integer unit)', () => {
  const result = validateQtyForUnit(toDecimal('0.5'), 'ml');
  assert.equal(result.valid, false);
});

test('validateQtyForUnit: 1.25 l → valid (decimal unit)', () => {
  const result = validateQtyForUnit(toDecimal('1.25'), 'l');
  assert.equal(result.valid, true);
});

test('validateQtyForUnit: negative qty → invalid', () => {
  const result = validateQtyForUnit(toDecimal('-1'), 'kg');
  assert.equal(result.valid, false);
});

test('validateQtyForUnit: unknown unit → invalid with message', () => {
  const result = validateQtyForUnit(toDecimal('1'), 'tola');
  assert.equal(result.valid, false);
  assert.ok(result.message);
});
