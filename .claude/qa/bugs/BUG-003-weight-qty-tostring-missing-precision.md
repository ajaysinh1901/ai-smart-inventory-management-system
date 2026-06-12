# Bug #003: amountToQty Returns Qty Without Unit Precision in Raw toString() — Display Risk

**Found:** 2026-04-29
**Severity:** Medium
**Status:** Open
**Assigned:** backend-coder

## Symptom

`weight.amountToQty('500', '125', 'kg')` returns `Decimal128('4')`, whose
`.toString()` gives `"4"` not `"4.000"`. Similarly, `amountToQty('50','65','kg')`
returns `.toString()` of `"0.77"` not `"0.770"`. The raw `Decimal128.toString()`
does not zero-pad to unit precision.

This means if any caller uses `qty.toString()` directly (instead of
`weight.toString(qty, unit)`), the output will be `"4"` or `"0.77"` rather than
the spec-required `"4.000"` or `"0.770"`.

## Steps to Reproduce

```js
const weight = require('./server/src/utils/weight');
const qty6 = weight.amountToQty('500', '125', 'kg');
console.log(qty6.toString());           // "4"       ← missing precision
console.log(weight.toString(qty6, 'kg')); // "4.000" ← correct via helper
const qty7 = weight.amountToQty('50', '65', 'kg');
console.log(qty7.toString());           // "0.77"    ← missing trailing zero
console.log(weight.toString(qty7, 'kg')); // "0.770" ← correct via helper
```

## Expected

The `Decimal128` stored in the DB can have any precision (that is fine). But
wherever qty is serialized to a client-facing JSON or invoice line, it should
display to 3 decimal places for kg. The spec §5.2 says "stock: 3 dp for kg/l."
The `saleItemSchema.toJSON` transform does NOT call `weight.toString()`; it simply
calls `.toString()` on the Decimal128, which strips trailing zeros.

Concrete impact: A sale line for 4.000 kg of dal would serialize as `qty: "4"` in
the GET /sales/:id response rather than `qty: "4.000"`. On the invoice PDF this
prints "4 kg" instead of "4.000 kg" (or "4 kg 0 g" in mixed mode), which looks
inconsistent with other lines showing precision.

## Actual

The `saleItemSchema.toJSON` transform in `Sale.model.js` (lines 117-133) lists
`qty` as a plain Decimal128 field and converts it via `.toString()`:
```js
d128Fields.forEach((f) => {
  if (ret[f] != null && ret[f]._bsontype === 'Decimal128') {
    ret[f] = ret[f].toString();  // raw Decimal128 toString — no unit-aware padding
  }
});
```
It does not know the unit at this point, so it cannot call `weight.toString(qty, unit)`.

## Root Cause Hypothesis

The `saleItemSchema.toJSON` transform was written without a unit-aware serializer for
`qty`. The `unit` field is present on the same subdocument as `qty`, so it is
available at transform time. The fix is straightforward.

## Suggested Fix

In `Sale.model.js` `saleItemSchema.set('toJSON', {...})`, handle `qty` separately:
```js
// qty is unit-aware — use weight.toString for display precision
if (ret.qty != null && ret.qty._bsontype === 'Decimal128') {
  ret.qty = weight.toString(ret.qty, ret.unit || 'pcs');
}
```
This will produce `"4.000"` for kg, `"4"` for pcs, etc., matching spec §5.2.

## Severity

Medium. The stored Decimal128 value is mathematically correct (4 = 4.000). The issue
is purely a display/serialization one. However:
- Invoice line items will print "4 kg" instead of "4.000 kg" for exact-weight items.
- GSTR-1 export / Tally XML may print imprecise quantities.
- Not a data-loss bug. Existing tests pass because they compare via `parseFloat()`.

## Verification

- [ ] Fix shipped
- [ ] GET /sales/:id with an amount-first kg line → qty serializes as "4.000" not "4"
- [ ] GET /sales/:id with a 0.250 kg line → qty serializes as "0.250" (already correct)
- [ ] Invoice PDF for amount-first dal line shows "4.000 kg" not "4 kg"
