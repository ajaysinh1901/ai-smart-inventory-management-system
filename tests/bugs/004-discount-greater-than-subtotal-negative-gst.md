# Bug #004: Discount can exceed subtotal → negative taxable amount, negative GST, negative total (GST math is wrong; legal/compliance exposure)

**Found:** 2026-04-28
**Severity:** Critical
**Status:** VERIFIED
**Assigned:** architect-gst (spec) → backend-coder (impl)

## Symptom
The Sale create flow accepts any non-negative `discount` value with no upper bound. When `discount > subtotal` the controller computes:
- `taxableAmount = subtotal - discount`  ← becomes negative
- `cgst/sgst/igst = taxableAmount * rate`  ← negative tax amounts
- `total = taxableAmount + taxAmount`  ← deeply negative

The DB now contains invoices with `total: -56.64` and the dashboard's "Today's Revenue" reads **negative ₹**. The PDF invoice generates without crashing but `amountInWords(-25.96)` calls `numberToIndianWords(Math.floor(-25.96)) = numberToIndianWords(-26)` which indexes `ONES[-26]` = undefined → "Rupees undefined Only" on the printed invoice.

This is a **legal/compliance** issue under Indian GST: an invoice showing negative tax is not a valid tax invoice and exposes the user to assessor penalties.

## Steps to Reproduce
(Currently blocked by Bug #003 on the live HTTP path, but the data exists in the DB and demonstrates the math is wrong end-to-end. Once #003 is fixed, this is reproducible directly.)

1. Inspect existing test sales via API:
   ```
   curl -b admin.cookie http://localhost:5000/api/v1/sales?limit=5
   ```
2. Observe two records with negative totals:
   - INV-TEST-...:  subtotal=2,  discount=50,  taxAmount=-8.64,  total=-56.64
   - INV-TEST2-...: subtotal=3,  discount=25,  taxAmount=-3.96,  total=-25.96
3. Download the PDF for either:
   ```
   curl -b admin.cookie -o /tmp/inv.pdf http://localhost:5000/api/v1/sales/<id>/pdf
   ```
4. Open in any PDF reader → "Amount in words: Rupees undefined Only".
5. Open dashboard → Today's Revenue shows `-₹82.60`.
6. Once #003 is fixed, repro a fresh case:
   ```
   curl -b admin.cookie -X POST /api/v1/sales \
     -d '{"customer":{"name":"Repro"},"items":[{"productId":"<id>","quantity":1,"unitPrice":1}],"discount":50}'
   ```
   → expect 201 with negative total (bug).

## Expected
- Validator rejects `discount > subtotal` with HTTP 400 "Discount cannot exceed subtotal" (or clamps it server-side).
- `taxableAmount`, `taxAmount`, and `total` are guaranteed ≥ 0.
- For genuine credit notes / refunds, use a separate `refund` flow that issues a credit-note invoice — never a negative-total tax invoice.

## Actual
- Validator allows any `discount ≥ 0`. No cross-field check.
- `sale.controller.createSale` lines 35–54 multiplies a negative `taxableAmount` against the rate → all GST amounts are negative → total is doubly negative.
- Saved to DB and rolled into reports.

## Evidence
- DB sales already in the system show negative totals (see step 2).
- Source: `server/src/validators/sale.validator.js` line 67 — `discount: z.number().gte(0).optional()` (no upper bound).
- Source: `server/src/controllers/sale.controller.js` line 35 — `const taxableAmount = subtotal - discount;` (no clamp/guard).
- `GET /api/v1/sales/report` returns `totalRevenue:-82.6`, `avgOrderValue:-41.3`.
- `pdf.service.numberToIndianWords` does not handle negatives (`ONES[-26]` is undefined).

## Root Cause Hypothesis
Validator and controller author assumed clients would behave. No defensive cross-field validation. The PDF amount-in-words util was written for naturals only.

## Suggested Fix
1. In `sale.validator.js createSaleSchema`, add a `.refine(v => (v.discount ?? 0) <= sumOfItemsTimesPrice, "Discount cannot exceed subtotal")`. The validator can compute subtotal from `items` already in the schema.
2. Or, defensively in `sale.controller.createSale` after subtotal is known, return 400 if `discount > subtotal`.
3. Also in pdf.service `numberToIndianWords`, add `if (num < 0) return 'Negative ' + numberToIndianWords(-num);` (or assert ≥0 before calling).
4. Clean up the existing two negative-total invoices in DB after the fix is verified — they pollute reports.

## Verification
- [x] Fix shipped
- [x] Reproduced again post-fix → resolved
- [x] Related cases checked
- [ ] DB cleanup of `INV-TEST-...` and `INV-TEST2-...` records — orchestrator cleanup task

## Re-test note (post-fix)
- `POST /sales {discount:50, items:[{unitPrice:1,quantity:1}]}` → 400 `{"errors":[{"field":"discount","message":"Discount cannot exceed subtotal"}]}`.
- `GET /sales/report` → `totalRevenue: 338.66` (positive) — no longer shows negative revenue. Stale `INV-TEST-...` records appear to have been cleaned during fix; only auto-generated `INV-2026-NNNNN` records remain.
