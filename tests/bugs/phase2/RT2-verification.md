# RT2 Phase 2 Verification Report
**Date:** 2026-05-19
**Re-test agent:** RT2
**Target:** http://localhost:5001/api/v1
**Scope:** Inventory / Products / Suppliers / Sales / GST (A2 + A3 bug clusters)

---

## Verification Table

| ID | Title | Phase 1 Status | Phase 2 Result | Evidence |
|----|-------|---------------|----------------|---------|
| A2-01 | Product creation (POST /products → 201) | OPEN (Critical) | **FIXED** | POST returns 201 with product `_id`; pre-validate async hook works |
| A2-02 | Staff role blocked from product mutations (403); admin/manager allowed | OPEN (High) | **FIXED** | Staff POST/DELETE/PATCH → 403; Manager POST → 201 |
| A2-03 | stock_status filter correct with pagination + correct meta.total | OPEN (High) | **FIXED** | limit=2 returns 2 out-of-stock items; meta.total=12 matches limit=1000 count |
| A2-04 | POST /api/v1/stock-adjustments exists and works (body uses qtyChange) | OPEN (Critical) | **FIXED** | 201 response with adjustment record; GET also returns 200 |
| A2-05 | reason='manual' accepted on stock adjustment | OPEN (High) | **FIXED** | POST with reason:'manual' → 201 |
| A2-06 | /products/low-stock excludes reorderLevel=0 products | OPEN (Medium) | **FIXED** | Product with stock=0/reorderLevel=0 excluded; stock=3/reorderLevel=5 included |
| A2-07 | Supplier model rejects bad GSTIN / bad email | OPEN (Medium) | **FIXED** | POST with invalid GSTIN → 400; bad email → 400; valid data → 201 |
| A2-11 | StockAdjustment creation does not crash | OPEN (High) | **PARTIAL FIX** | Hook throws correctly; BUT returns HTTP 500 instead of 400 when reason='other' without detail |
| A3-01 | Product creation works (same as A2-01) | OPEN (Critical) | **FIXED** | See A2-01 |
| A3-02 | CREDIT/KHATA sale succeeds (no 500) | OPEN (Critical) | **FIXED** | Credit sale → 201; invoice INV-2026-00144 created; payment.mode=credit confirmed |
| A3-04 | discount field applied to sale total | OPEN (High) | **FIXED** | discount=20 on ₹90 sale → grandTotal=70; sale.discount stored as 20 |
| A3-05 | zero-qty sale line rejected | OPEN (Medium) | **FIXED** | qty=0 on both /sales and /sales/preview → 400 "qty must be greater than 0" |
| A3-06 | null-price product gives clean user-facing error | OPEN (Medium) | **FIXED** | Returns 400 "Product has no price configured. Please set a price before selling." |

---

## NEW BUGS FOUND (regressions / missed items)

### NEW-01: gstRate field stripped by Zod validator — ALL new products have gstRate=0

**Severity:** Critical
**Status:** Open
**Assigned:** backend-coder

**Symptom:** `POST /api/v1/products` with `gstRate: 18` in the body creates the product with `gstRate: 0`. The `gstRate` field is not in `createProductSchema` or `updateProductSchema` in `product.validator.js`. The Zod middleware replaces `req.body` with parsed output (strips unknown fields), so `gstRate` never reaches the controller.

**Evidence:**
```
POST /products { gstRate: 18, ... } → 201 { gstRate: 0 }
DB query: 42 products have no gstRate field; only 1 has gstRate > 0 (pre-existing Paneer from prior tests)
product.validator.js createProductSchema: no gstRate field
```

**Impact:** Any product created via the API will have gstRate=0 → all their invoices show 0 GST → legal compliance failure. There is also no `PUT /:id` or `PATCH /:id` route that accepts gstRate (updateProductSchema also missing gstRate).

**Root cause:** `server/src/validators/product.validator.js` — `createProductSchema` and `updateProductSchema` both lack the `gstRate` field.

**Suggested fix:** Add `gstRate: z.number().refine(v => [0,5,12,18,28].includes(v), 'gstRate must be 0, 5, 12, 18, or 28').optional()` to both schemas.

---

### NEW-02: intraState detection inverted when customer.state provided but workspace.state unconfigured

**Severity:** High
**Status:** Open
**Assigned:** backend-coder

**Symptom:** When workspace state is blank (not configured), any sale where `customer.state` is explicitly set returns `intraState: false` (IGST), regardless of the customer's state. This is because `saleCompute.js:199` compares `customerState === workspaceState` and `'' !== 'gujarat'` → false.

**Evidence:**
```
Workspace state: '' (empty, not configured)
Preview with customer.state='Gujarat': intraState=false, IGST=12 (WRONG)
Preview with customer.state='Maharashtra': intraState=false, IGST=12 (accidentally correct)
Preview with no state: intraState=true, CGST=6+SGST=6 (correct)
Actual persisted sale (no state): intraState=true, CGST=6, SGST=6, grandTotal=252 (correct)
```

**Impact:** Any shopkeeper who sets a customer's state (e.g., Gujarat) but hasn't configured workspace state will get IGST invoices for local customers — legally incorrect. The fix in A3-02 (credit sales) exposed this because credit sales commonly include customer details including state.

**Root cause:** `server/src/utils/saleCompute.js:197-199`. When workspaceState is empty, the fallback should be `intraState=true` (assume local) rather than comparing empty string to customer state.

**Suggested fix:**
```js
const intraState = !customerState || customerState.trim() === ''
  ? true
  : !workspaceState || workspaceState.trim() === ''
    ? true  // workspace state not configured → assume intra
    : customerState.trim().toLowerCase() === workspaceState.trim().toLowerCase();
```

---

### NEW-03 (Residual from A2-11): StockAdjustment pre-validate error returns HTTP 500 not 400

**Severity:** Medium
**Status:** Open
**Assigned:** backend-coder

**Symptom:** POST /stock-adjustments with `reason: 'other'` and no `reasonDetail` returns HTTP 500 with message "reasonDetail is required (min 3 chars) when reason is 'other'". Should be HTTP 400.

**Evidence:**
```
POST /api/v1/stock-adjustments { reason: 'other' } → HTTP 500 (expected 400)
Direct Mongoose test: err.name = 'Error' (not 'ValidationError')
```

**Root cause:** `inventory.controller.js:46` checks `err.name === 'ValidationError'` to return 400. But Mongoose 9 async pre-validate hook that throws a plain `Error` does NOT wrap it in a `ValidationError` — it propagates as a plain `Error`. The `statusCode` property is also absent, so it falls through to 500.

**Suggested fix:** In `inventory.controller.js:46`, also check for the specific error message pattern, or add `statusCode: 400` to the thrown error in `StockAdjustment.model.js:94`:
```js
const e = new Error("reasonDetail is required (min 3 chars) when reason is 'other'");
e.statusCode = 400;
throw e;
```

---

## GST Math Regression Assessment

**Summary:** GST math engine (CGST/SGST split, HALF_UP rounding, round-off) is **CORRECT** when conditions are right.

| Check | Result |
|-------|--------|
| CGST/SGST split (intrastate, 5% GST) | PASS: CGST=6, SGST=6 for 0.5kg @ ₹480 |
| IGST (interstate, 5% GST) | PASS: IGST=12 for 0.5kg @ ₹480 |
| Grand total (subtotal + tax) | PASS: 240+12=252 |
| Round-off field present | PASS |
| GST persisted to DB (items[].cgst/sgst) | PASS: correct Decimal128 values stored |
| NEW-01: gstRate stripped on create | **FAIL**: new products always have gstRate=0 → all new-product invoices show 0 GST |
| NEW-02: intraState with unconfigured workspace | **FAIL**: explicit customer state → IGST even for local customers |

**Bottom line:** The underlying math and storage are fixed (CGST/SGST fields now correctly populated in sale items, replacing the old `sale.gst.cgstAmount` bug from A3-03). However, two new issues undermine GST correctness end-to-end: gstRate is stripped on product creation (NEW-01), and intrastate detection fails when workspace is unconfigured (NEW-02).

---

## Score Summary

| Result | Count | IDs |
|--------|-------|-----|
| FIXED | 12 | A2-01, A2-02, A2-03, A2-04, A2-05, A2-06, A2-07, A3-01, A3-02, A3-04, A3-05, A3-06 |
| PARTIAL FIX (residual) | 1 | A2-11 (HTTP 500 instead of 400) |
| NEW CRITICAL | 1 | NEW-01 (gstRate stripped) |
| NEW HIGH | 1 | NEW-02 (intraState inverted) |
| NEW MEDIUM | 1 | NEW-03 (500 vs 400 on stock adjustment) |

---

## Recommendation

**Hold — do not ship to production.**

12 of 13 tracked bugs are fixed and the core GST math engine is correct. However, NEW-01 is a critical regression: every product created via the API after Phase 2 has gstRate=0, which means all their invoices will be GST-free regardless of the actual tax rate. This directly undermines the legal compliance requirement that drove the original bug fixes. Fix NEW-01 first (add gstRate to product.validator.js schemas), then address NEW-02 and NEW-03 before re-testing.
