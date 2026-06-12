# Bug #001: CGST/SGST Split Inverted for Negative Amounts (Returns/Refunds)

**Found:** 2026-04-29
**Severity:** Critical
**Status:** Open
**Assigned:** backend-coder

## Symptom

When a refund/return sale is created with an odd-paise line tax (e.g., ₹0.81 tax on a
-0.500 kg paneer return), the CGST and SGST split is reversed compared to the spec.
The spec requires CGST to absorb the 1-paise residue for both positive and negative
amounts (mirroring Tally). For negative tax, CGST must be the larger-magnitude half.

## Steps to Reproduce

```js
const money = require('./server/src/utils/money');
const result = money.splitTax(money.fromNumberOrString('-0.81'), 'cgst-sgst');
console.log('cgst:', money.toString(result.cgst));  // BUG: prints -0.40
console.log('sgst:', money.toString(result.sgst));  // BUG: prints -0.41
```

Expected: cgst = -0.41, sgst = -0.40
Actual:   cgst = -0.40, sgst = -0.41

Additional failing cases:
- splitTax('-0.01'): cgst=0.00 sgst=-0.01   (expected cgst=-0.01 sgst=0.00)
- splitTax('-0.03'): cgst=-0.01 sgst=-0.02  (expected cgst=-0.02 sgst=-0.01)
- splitTax('-3.31'): cgst=-1.65 sgst=-1.66  (expected cgst=-1.66 sgst=-1.65)

Even values (e.g., -13.00 splits to -6.50/-6.50) are NOT affected.

## Expected

For any odd-paise total tax (positive or negative), CGST always receives the
extra paise: |CGST| >= |SGST|. This mirrors Tally Prime behaviour and CBIC
Rule 46 parity.

## Actual

For negative tax values, `floor()` on `-totalPaise/2` rounds towards negative
infinity rather than towards zero, which allocates the residue paise to SGST
instead of CGST. This is the opposite of the required behaviour.

Example trace for -0.81 (= -81 paise):
- `totalPaise = -81`
- `halfPaise = floor(-81/2) = floor(-40.5) = -41`  (floor rounds TOWARDS -inf)
- `cgstPaise = -81 - (-41) = -40`  (CGST gets the smaller magnitude half — WRONG)
- `sgst = -41/100 = -0.41`  (SGST gets the larger magnitude half — WRONG)

## Evidence

Run node:
```
cd server && node -e "
const money = require('./src/utils/money');
[-0.81, -0.01, -0.03, -3.31].forEach(v => {
  const r = money.splitTax(money.fromNumberOrString(String(v)), 'cgst-sgst');
  console.log(v + ': cgst=' + money.toString(r.cgst) + ' sgst=' + money.toString(r.sgst));
});
"
```

Output:
```
-0.81: cgst=-0.40 sgst=-0.41   (WRONG — SGST larger)
-0.01: cgst=0.00  sgst=-0.01   (WRONG — all residue to SGST)
-0.03: cgst=-0.01 sgst=-0.02   (WRONG — SGST larger)
-3.31: cgst=-1.65 sgst=-1.66   (WRONG — SGST larger)
```

## Root Cause Hypothesis

In `server/src/utils/money.js`, `splitGst()` uses `totalPaise.div(2).floor()` for
SGST paise. `floor()` rounds towards negative infinity. For positive values:
`floor(40.5) = 40` → SGST gets smaller half, CGST gets larger half. Correct.
For negative values: `floor(-40.5) = -41` → SGST gets larger-magnitude half.
Incorrect for negative; the spec requires `truncate()` (towards zero) instead of
`floor()` so that the residue always goes to CGST regardless of sign.

## Suggested Fix

In `splitGst()` in `server/src/utils/money.js`, replace:
```js
const halfPaise = totalPaise.div(2).floor();
```
with:
```js
const halfPaise = totalPaise.div(2).toDecimalPlaces(0, Decimal.ROUND_DOWN);
// ROUND_DOWN = truncate towards zero, works correctly for both positive and negative
```

This ensures for -81 paise: `trunc(-81/2) = trunc(-40.5) = -40`, so:
- sgst = -40 paise = -0.40 (smaller magnitude)
- cgst = -81 - (-40) = -41 paise = -0.41 (larger magnitude, absorbs residue)

## Severity Justification

Critical because:
1. Every refund with an odd-paise line tax produces wrong CGST/SGST on the credit note.
2. GSTR-1 filed from these credit notes has wrong CGST/SGST amounts — legal exposure.
3. Tally XML export of return vouchers will have transposed CGST/SGST values.
4. The spec §B.8 explicit requirement ("residue to CGST") is violated.

## Impact Scope

Affects:
- `POST /sales/:id/refund` — any refund line with odd-paise tax
- Tally XML export of return vouchers
- GSTR-1 credit note reconciliation

Does NOT affect positive sales (the forward-sale path is correct).

## Verification

- [ ] Fix shipped
- [ ] Rerun `splitTax('-0.81')` → cgst=-0.41, sgst=-0.40
- [ ] Rerun `splitTax('-0.01')` → cgst=-0.01, sgst=0.00
- [ ] Rerun `splitTax('-3.31')` → cgst=-1.66, sgst=-1.65
- [ ] Confirm T7 test (paneer return, currently passing with even split -6.50/-6.50) still passes
- [ ] Add new test: return line with odd-paise tax confirms CGST residue
- [ ] Related cases checked: positive splits unaffected
