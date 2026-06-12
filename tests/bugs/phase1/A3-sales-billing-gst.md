# A3 QA — Sales, Billing, GST, Khata: Bug Report

**Test Run:** 2026-05-19  
**Tester:** QA Agent A3  
**Live test script:** `tests/bugs/phase1/scripts/a3-gst-math.js` — 48 assertions, 42 PASS, 6 FAIL  
**Module scope:** Sale API, GST math, invoice numbering, khata/credit sales, SalesPage.jsx, QuickSalePage.jsx

---

## Bug #A3-01: Product creation crashes — "next is not a function"

**Severity:** Critical  
**Status:** Open  
**Assigned:** backend-coder  
**File:** `server/src/models/Product.model.js:139–200`

### Symptom
Every call to `POST /api/v1/products` returns `400 {"success":false,"message":"next is not a function"}`. No new products can be created via the API. The entire product onboarding workflow is blocked.

### Steps to Reproduce
1. Register a new account or use any valid token.
2. `POST /api/v1/products` with a valid body:
   ```json
   {"name":"Test","sku":"SKU-1","category":"Food","pricePerUnit":100,"unit":"pcs","saleByWeight":false,"stock":50}
   ```
3. Observe 400 response.

Reproduced directly in Node:
```
cd server && node -e "
require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/MERNDB').then(async () => {
  const Product = require('./src/models/Product.model');
  const p = new Product({ name:'T', sku:'T'+Date.now(), category:'C',
    pricePerUnit: mongoose.Types.Decimal128.fromString('100'),
    unit:'pcs', saleByWeight:false, stock: mongoose.Types.Decimal128.fromString('10') });
  await p.save(); // → throws 'next is not a function'
}).catch(console.error);
"
```

### Expected
Product created successfully with `201` and `{ success: true, data: {...} }`.

### Actual
`400 {"success":false,"message":"next is not a function"}`

Stack trace confirms the error is at `Product.model.js:200` — the final `next()` call in the `pre('validate', function(next))` hook.

### Root Cause
`Product.model.js` line 139 defines:
```js
productSchema.pre('validate', function (next) { ... next(); });
```
Mongoose 9 uses **kareem 3.x**, which changed the internal hook invocation mechanism. `kareem.execPre` in v3 no longer passes `next` as a callback argument to hook functions — instead it wraps them in a promise pipeline. The `function(next)` signature receives `next = undefined`, so `next()` throws `"TypeError: next is not a function"`.

Compare: `KhataEntry.model.js:43` and `StockAdjustment.model.js:87` also use `function(next)` style — those also break if triggered.

### Suggested Fix
Convert the Product model pre-validate hook to Mongoose 9 async style:
```js
// BEFORE (broken in Mongoose 9):
productSchema.pre('validate', function (next) {
  if (condition) return next(new Error('...'));
  next();
});

// AFTER (Mongoose 9 compatible):
productSchema.pre('validate', async function () {
  if (condition) throw new Error('...');
});
```
Apply the same fix to `KhataEntry.model.js` and `StockAdjustment.model.js`.

### Evidence
- Live test T1: `400 {"success":false,"message":"next is not a function"}` (reproduced twice)
- Direct Mongoose test: `Error: next is not a function ... at Product.model.js:200`
- `kareem` version: `3.2.0`, `mongoose` version: `9.3.1`

### Verification
- [ ] Fix shipped
- [ ] `POST /api/v1/products` returns 201 with product `_id`
- [ ] Product with `gstRate: 18` creates and returns correct GST rate
- [ ] Related hooks in `KhataEntry.model.js` and `StockAdjustment.model.js` also fixed

---

## Bug #A3-02: Credit sales always crash — "Transaction numbers are only allowed on a replica set member or mongos"

**Severity:** Critical  
**Status:** Open  
**Assigned:** backend-coder  
**File:** `server/src/services/khata.service.js:16–21, 116–125`

### Symptom
Any sale with `paymentMode: 'credit'` fails with HTTP 500: `"Failed to post khata entry: Transaction numbers are only allowed on a replica set member or mongos"`. Credit sales are completely non-functional on a standalone MongoDB instance (the default dev/production setup for this app).

### Steps to Reproduce
1. Create a customer with a phone number.
2. `POST /api/v1/sales` with `payment.mode: "credit"` and customer phone.
3. Observe 500 response with khata error.

### Expected
Sale created (201), khata debit entry posted, `outstandingBalance` incremented.

### Actual
500: `Failed to post khata entry: Transaction numbers are only allowed on a replica set member or mongos`

### Root Cause
`khata.service.js:16–21` — the `supportsTransactions()` function checks:
```js
const supportsTransactions = () => {
  const conn = mongoose.connection;
  return conn?.db?.topology?.s?.description?.type !== 'Single';
};
```
On the running MongoDB instance, `conn.db.topology.s.description` is an empty object — `type` is `undefined`. The expression `undefined !== 'Single'` evaluates to **`true`**, so `supportsTransactions()` incorrectly reports that transactions ARE supported.

Then at line 117–125:
```js
if (useTx) {
  const session = await mongoose.startSession();
  await session.withTransaction(async () => { ... });
}
```
`startSession()` succeeds on standalone but `withTransaction()` fails because standalone MongoDB does not support multi-document sessions with transaction numbers.

Direct verification:
```
topology type: undefined
supportsTransactions: true   ← BUG: should be false on standalone
```

### Suggested Fix
Use a more reliable transaction detection. The safest approach is to attempt `startSession()` and check if the connection is in a replicaSet topology:

```js
const supportsTransactions = () => {
  const conn = mongoose.connection;
  const topo = conn?.db?.topology;
  // MongoDB driver 6.x: topology.description.type is the authoritative value
  const topoType = topo?.description?.type
    || topo?.s?.description?.type;
  // ReplicaSetWithPrimary, Sharded, etc. → transactions supported
  // Single, Unknown, undefined → no transactions
  return topoType === 'ReplicaSetWithPrimary'
    || topoType === 'ReplicaSetNoPrimary'
    || topoType === 'Sharded';
};
```
Alternatively, wrap the `withTransaction` call in a try-catch and fall back to the compensating-$inc path on error.

### Evidence
- Live test T15: `"Failed to post khata entry: Transaction numbers are only allowed on a replica set member or mongos"` (reproduced twice)
- Live test T30: Same error for `POST /khata/payments`
- Node debug: `topology type: undefined`, `supportsTransactions: true` on standalone MongoDB

### Verification
- [ ] Fix shipped
- [ ] Credit sale with phone customer → 201, khata entry created, `outstandingBalance` > 0
- [ ] `POST /khata/payments` → 201, receipt number allocated
- [ ] Retry on a replica set to confirm transaction path still works

---

## Bug #A3-03: Invoice HTML displays ₹0 for CGST and SGST — all printed invoices show wrong tax amounts

**Severity:** Critical  
**Status:** Open  
**Assigned:** frontend-coder  
**Files:**  
- `client/src/pages/SalesPage.jsx:112–113` (InvoiceModal totals row)  
- `client/src/pages/SalesPage.jsx:298–301` (per-line tax amounts)

### Symptom
The "Tax Invoice" modal and printed invoice always shows `₹0.00` for CGST, SGST, and IGST, regardless of the actual tax amounts on the sale. This is a legal compliance failure — a GST invoice with zero-filled tax columns is not a valid tax document.

### Steps to Reproduce
1. Complete a sale for Paneer (5% GST), e.g. 0.5 kg @ ₹480 → CGST ₹6, SGST ₹6.
2. Open the invoice modal from the Sales page.
3. Observe the CGST and SGST rows — they show `₹0.00`.

### Expected
CGST: ₹6.00, SGST: ₹6.00 (or IGST: ₹12.00 for interstate).

### Actual
CGST: ₹0.00, SGST: ₹0.00.

### Root Cause
**Bug 1 — Invoice totals row:**  
`SalesPage.jsx:112–113`:
```js
const cgstAmt = parseRupees(sale.gst?.cgstAmount ?? sale.cgstAmount ?? 0);
const sgstAmt = parseRupees(sale.gst?.sgstAmount ?? sale.sgstAmount ?? 0);
```
The API response stores per-line GST in `items[].cgst` and `items[].sgst` (Decimal128 strings). The legacy `sale.gst.cgstAmount` field is always `0` (the controller never populates it). `sale.cgstAmount` (top-level) doesn't exist. Both fall through to `0`.

**Bug 2 — Per-line tax amounts in the invoice table:**  
`SalesPage.jsx:298–301`:
```js
const lineCgst = isInterstate ? 0
  : parseRupees(item.cgstAmount) || (lineSubtotal * cgstRate) / 100;
```
The API returns `item.cgst`, but the code reads `item.cgstAmount`. Since `item.cgstAmount` is always `undefined`, it falls back to `(lineSubtotal * cgstRate) / 100` where `cgstRate` defaults to 9 (the legacy `sale.gst.cgstRate` default). So even the per-line fallback uses the wrong rate.

**Root of both bugs:** The new Decimal128 per-line fields are named `cgst`/`sgst`/`igst` but the invoice rendering code looks for `cgstAmount`/`sgstAmount`/`igstAmount`.

### Evidence
```
API response item keys: ['cgst', 'sgst', 'igst', ...]  ← correct names
InvoiceModal reads: item.cgstAmount               ← always undefined → 0
sale.gst.cgstAmount: 0 (always, never populated) ← confirmed via curl
```
- Live test T18d: `legacy.cgstAmount=0` for all 5 invoices checked.

### Suggested Fix
Update `InvoiceModal` to read from the correct fields:

**For totals row:** Sum `items[].cgst` / `items[].sgst` / `items[].igst`:
```js
const cgstAmt = sale.items.reduce((s, it) => s + parseRupees(it.cgst || 0), 0);
const sgstAmt = sale.items.reduce((s, it) => s + parseRupees(it.sgst || 0), 0);
const igstAmt = sale.items.reduce((s, it) => s + parseRupees(it.igst || 0), 0);
```

**For per-line amounts:**
```js
const lineCgst = isInterstate ? 0 : parseRupees(item.cgst ?? 0);
const lineSgst = isInterstate ? 0 : parseRupees(item.sgst ?? 0);
const lineIgst = isInterstate ? parseRupees(item.igst ?? 0) : 0;
```

### Verification
- [ ] Fix shipped
- [ ] Open invoice for Paneer 0.5kg: CGST shows ₹6.00, SGST shows ₹6.00
- [ ] Open invoice for an interstate sale: IGST shows correct amount
- [ ] Print invoice — verify tax section matches expected amounts

---

## Bug #A3-04: `discount` field accepted by validator but silently ignored in sale computation

**Severity:** High  
**Status:** Open  
**Assigned:** backend-coder  
**Files:**  
- `server/src/validators/sale.validator.js:76` (accepts `discount`)  
- `server/src/controllers/sale.controller.js:109` (never reads `discount`)  
- `server/src/models/Sale.model.js:209` (stores `discount` field)

### Symptom
Passing `discount: 50` in a sale request is accepted without error, but the `discount` is never applied to the sale computation. The `grandTotal` is unchanged, and `sale.discount` is stored as `0` (not even stored correctly).

### Steps to Reproduce
1. `POST /api/v1/sales` with `discount: 50` and a line item worth ₹252.
2. Observe: `sale.discount = 0`, `sale.grandTotal = 252`.

### Expected
Either: (a) discount is applied before GST computation and `grandTotal` reflects the discount, OR (b) the validator rejects the `discount` field with a clear error ("discount is not supported in the new sale format; use line-level pricing").

### Actual
`discount` is validated (passes 0.00+), never read by the controller, and stored as `0` on the Sale document.

### Root Cause
The `createSaleSchema` validator at line 76 accepts `discount: z.number().gte(0).optional()`. The controller at line 109 destructures `req.body` but never includes `discount`:
```js
const { lines, customer, payment, paymentMode: legacyMode, notes } = req.body;
```
`Sale.create({...})` also does not include `discount` in the payload. The Sale model has `discount: { type: Number, default: 0 }` which is never written.

Additionally, `saleCompute.js` has no discount parameter — there is no code path to apply a discount before GST calculation.

### Business Impact
If a shopkeeper passes a flat discount through this API (e.g., via an integration), they will see incorrect GST and incorrect totals on the invoice, creating a GST compliance risk.

### Suggested Fix
Either:
- **Option A (remove):** Remove `discount` from `createSaleSchema` and return a 400 with guidance.
- **Option B (implement):** Add `discount` parameter to `computeSale()`, subtract it from `subtotal` before computing tax, and pass it through the controller → `Sale.create`.

### Verification
- [ ] Fix shipped
- [ ] `POST /api/v1/sales` with `discount: 50` either rejects or applies correctly
- [ ] If applied: `sale.discount === 50` and `grandTotal` is reduced accordingly
- [ ] GST is computed on the post-discount taxable amount

---

## Bug #A3-05: Zero-quantity line accepted in preview and sale creation

**Severity:** Medium  
**Status:** Open  
**Assigned:** backend-coder  
**File:** `server/src/utils/saleCompute.js:60–67`

### Symptom
Passing `qty: "0"` in a sale line is accepted by both `/sales/preview` and `/sales` (for weight-based products). The response shows `lineSubtotal: 0`, `lineTax: 0`, `lineTotal: 0` — a zero-value line item on the invoice.

### Steps to Reproduce
1. `POST /api/v1/sales/preview` with `qty: "0"` for any product.
2. Observe 200 response with `lineSubtotal: "0"`.

### Expected
`400` with a message like `"qty must be greater than 0"`.

### Actual
`200` with a zero-value line item. For saleByWeight products the zero-qty sale is also persisted (stock unchanged but invoice entry created).

### Root Cause
`saleCompute.js:60–67` validates:
```js
if (saleType !== 'return' && money.isNegative(qtyD)) {
  throw ...
}
```
The check is `isNegative` — it catches negative qty but NOT zero. Zero slips through. The subsequent tare validation also allows zero because `0 >= 0`. The resulting `lineSubtotal = 0 * rate = 0` is valid arithmetic but not a valid sale.

### Suggested Fix
Add a zero-qty check after the negative check:
```js
if (saleType !== 'return' && money.isZero(qtyD)) {
  throw Object.assign(
    new Error(`qty must be greater than 0 (product: ${product.name})`),
    { statusCode: 400 }
  );
}
```

### Verification
- [ ] Fix shipped
- [ ] `POST /api/v1/sales/preview` with `qty: "0"` → 400
- [ ] `POST /api/v1/sales` with `qty: "0"` → 400
- [ ] `qty: "0"` on a return sale still accepted (zero return is a no-op but caller's responsibility)

---

## Bug #A3-06: Products with null `pricePerUnit` cause opaque 400 "money: unsupported type" error

**Severity:** Medium  
**Status:** Open  
**Assigned:** backend-coder  
**File:** `server/src/utils/saleCompute.js:110` + `server/src/utils/money.js:52`

### Symptom
Many seeded products in the DB have `pricePerUnit: null`. When any of these products are included in a sale, the API returns `400 {"success":false,"message":"money: unsupported type \"undefined\" for value undefined"}`. The error message is technical/internal and gives the user no actionable guidance.

Additionally, the sale controller does not validate that `product.pricePerUnit` is non-null before calling `computeSale()`, leaving the check to happen deep in the math utils with an unhelpful error.

### Steps to Reproduce
1. Include a product with `pricePerUnit: null` in a sale request.
2. Observe: `400 {"message":"money: unsupported type \"undefined\" for value undefined"}`.

### Expected
`400 {"message":"Product \"TP-Link WiFi Adapter\" has no price configured. Please set a price before selling."}` (user-friendly, actionable).

### Actual
`400 {"message":"money: unsupported type \"undefined\" for value undefined"}` — opaque error referencing internal helper.

### Root Cause
`saleCompute.js:110`:
```js
const rateD = money.fromNumberOrString(product.pricePerUnit);
```
`product.pricePerUnit` is `undefined` (serialized from Mongoose as null → JS undefined). `money.fromNumberOrString` throws its internal error message. No guard exists before this call.

Separate issue: these products have null prices due to bug #A3-01 (product creation was broken) and the seed data not including prices for some products.

### Suggested Fix
In `fetchProducts()` or `computeSale()`, validate that each product has a defined `pricePerUnit` before computing:
```js
if (!product.pricePerUnit) {
  throw Object.assign(
    new Error(`Product "${product.name}" has no price configured. Please set a price before selling.`),
    { statusCode: 400 }
  );
}
```

### Verification
- [ ] Fix shipped
- [ ] Sale with null-price product → 400 with user-friendly message
- [ ] Sale with properly-priced product → unaffected

---

## Summary

| # | Title | Severity | File | Assigned |
|---|-------|----------|------|----------|
| A3-01 | Product creation crashes: "next is not a function" | **Critical** | `server/src/models/Product.model.js:139–200` | backend-coder |
| A3-02 | Credit sales always crash: topology detection broken → wrong transaction mode | **Critical** | `server/src/services/khata.service.js:16–21` | backend-coder |
| A3-03 | Invoice shows ₹0 CGST/SGST — field name mismatch (`cgst` vs `cgstAmount`) | **Critical** | `client/src/pages/SalesPage.jsx:112–113, 298–301` | frontend-coder |
| A3-04 | `discount` field accepted but never applied to GST or grandTotal | **High** | `server/src/controllers/sale.controller.js:109` | backend-coder |
| A3-05 | Zero-quantity line accepted; should be rejected | **Medium** | `server/src/utils/saleCompute.js:60–67` | backend-coder |
| A3-06 | Null `pricePerUnit` product gives opaque internal error message | **Medium** | `server/src/utils/saleCompute.js:110` | backend-coder |

---

## Verified-working flows

- **GST math (intrastate):** CGST/SGST split, HALF_UP rounding, odd-paise residue to CGST — all correct per spec §B.8
- **GST math (interstate):** IGST applied when workspace.state is set and differs from customer.state — correct
- **Round-off:** `addRoundOff()` produces correct whole-rupee `grandTotal` and signed `roundOff` — correct
- **Amount-first mode:** `qty = amount / rate` step-rounded for kg — correct
- **Tare deduction:** `net_qty = gross - tare` correctly reduces `lineSubtotal` — correct
- **Tare > qty rejected:** correct
- **Negative qty on non-return rejected:** correct
- **Fractional qty on pcs rejected:** correct
- **Oversell guard (integer units):** `409 INSUFFICIENT_STOCK` — correct
- **Oversell on weight units:** allowed with `lineWarnings` in response — correct per spec
- **Invoice number allocation:** `findOneAndUpdate({$inc:{seq:1}}, {upsert:true})` — race-free; 8 concurrent sales produced 8 unique invoice numbers
- **Stock decrement:** sale correctly decrements `Product.stock` by qty
- **Refund:** stock restored, `RET-` prefix, original sale marked `status: 'refunded'`
- **Decimal precision:** `3 × 0.001kg × ₹480 = ₹1.44` — no JS float drift
- **Missing/empty lines → 400:** correct
- **Invalid/non-existent productId → 400/404:** correct
- **Unauthenticated → 401:** correct
- **Invoice PDF:** returns 200 + `application/pdf`
- **Tally XML:** returns 200 + `application/xml`
- **Credit sale validation:** correctly rejects credit sale without phone/GSTIN
