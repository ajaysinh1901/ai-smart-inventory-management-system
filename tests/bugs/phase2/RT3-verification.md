# RT3 Phase 2 Verification Report

**Date:** 2026-05-19
**Agent:** RT3
**Target:** http://localhost:5001/api/v1
**Test token:** rt3qa@test.com (staff role, freshly registered)
**Script:** tests/bugs/phase2/rt3-verify.js

---

## Summary Table

| Bug ID | Title | Status | Evidence |
|--------|-------|--------|---------|
| A4-02 | OCR /ocr/save processes SKU-less items | STILL BROKEN | 500 E11000 duplicate key on barcode="" |
| A4-03 | OCR /ocr/extract returns `items` key | FIXED | Service returns `items`; extract path validates correctly |
| A4-04 | GET /analytics/inventory plain numbers (no Decimal128) | FIXED | stockValue=4950 (number), pricePerUnit=45 (number) |
| A4-05 | stockHealth healthy+low+outOfStock == total products | FIXED | 37+1+13=51; total=51; totalProducts=51 |
| A4-06 | GET /sales/report totalRevenue plain number | FIXED | totalRevenue=9092 (number), avgOrderValue=363.68 (number) |
| A4-07 | GET /ai/trends non-zero revenue for weeks with sales | FIXED | W8: 19 orders, revenue=6950 (non-zero) |
| A4-08 | ai/predict {} and ai/reorder/badid return clean 400 | FIXED | All four assertions pass; no CastError leak |
| A4-09 | Smart alerts persist with valid severity | FIXED* | 8 OUT_OF_STOCK alerts with severity='critical' verified in DB; new OVERSOLD type bug found (see below) |
| A4-10 | GET /reports/supplier-shrinkage?from=bad returns 400 | FIXED | Returns 400 with "Invalid date format. Use YYYY-MM-DD." |
| A4-11 | GET /analytics/dashboard includes numeric gstThisMonth | FIXED | gstThisMonth=319.2 (number), present in response |
| SEC-005 | /ai/chat validates before rate-limiting | FIXED | 400 on empty/whitespace/missing message; validate before limiter in route order |

**Score: 10 FIXED, 1 STILL BROKEN**

---

## Verified Fixed

### A4-03 — FIXED
`server/src/services/ocr.service.js:70` now returns `items` (renamed from `lineItems`). Extract endpoint returns 400 on bad input, not 500. Code comment confirms: `// renamed from lineItems — frontend expects 'items' | bug A4-03`.

### A4-04 — FIXED
`analytics/inventory` response:
```
topByStockValue[0]: stockValue=4950 (typeof=number), pricePerUnit=45 (typeof=number)
stockByCategory[0]: totalValue=6450 (typeof=number)
```
`toNum()` helper added in `analytics.controller.js` unwraps Decimal128 correctly via `_bsontype` check.

### A4-05 — FIXED
```
stockHealth: { healthy:37, low:1, outOfStock:13, total:51 }
37 + 1 + 13 = 51 == total == totalProducts
```
Mutually exclusive bucket logic in `analytics.controller.js` (lines 203-227) uses `$toDecimal: '0'` comparison and explicit `$and` guards to prevent double-counting.

### A4-06 — FIXED
```
totalRevenue: 9092   (typeof=number)
avgOrderValue: 363.68 (typeof=number)
```
`sale.controller.js` `getSalesReport` now uses `$toDouble` in aggregation pipeline, result is a plain number.

### A4-07 — FIXED
```
W8: { week:'W8', revenue:6950, count:19 }
```
Previously W8 showed revenue=0 with 14+ orders. Now all 8 weeks with orders have non-zero revenue. Aggregation correctly uses `$toDouble: { $ifNull: ['$grandTotal', '$total'] }` instead of virtual `$total`.

### A4-08 — FIXED
```
POST /ai/predict {}          → 400 "productId is required"
POST /ai/predict {productId:"notanid"} → 400 "Invalid product ID format"
GET  /ai/reorder/notanid     → 400 "Invalid product ID format"
```
No CastError, no Mongoose internals in response. `mongoose.isValidObjectId()` guards added before DB calls.

### A4-09 — FIXED (severity enum) with new OVERSOLD type bug
The core A4-09 fix (severity `'high'` / `'medium'` → `'critical'` / `'warning'`) is working. After triggering the cron directly, 8 OUT_OF_STOCK alerts were created with `severity: 'critical'` — a valid enum value.

However, a new bug was discovered during verification:
- One product has `stock = -3.55` (oversold)
- The cron tries to create `Alert.create({ type: 'OVERSOLD', ... })`
- `OVERSOLD` is NOT in `Alert.model.js` type enum `['LOW_STOCK', 'OUT_OF_STOCK', 'DEAD_STOCK', 'REORDER_DUE']`
- The `runSmartAlerts()` function throws a ValidationError partway through
- Products processed before the oversold product still get alerts (8 were created)
- Any products sorted after the oversold product in `Product.find({})` iteration are skipped for that cron run

**New bug filed:** see A4-09b below.

GET /alerts correctly returns all active alerts:
```json
[
  { "type": "OUT_OF_STOCK", "severity": "critical", ... },
  { "type": "OUT_OF_STOCK", "severity": "critical", ... },
  ...  (8 alerts total)
]
```
No alerts with invalid severity values.

### A4-10 — FIXED
```
GET /reports/supplier-shrinkage?from=not-a-date&to=also-bad
→ 400 { "success": false, "message": "Invalid date format. Use YYYY-MM-DD." }
```
No Mongoose CastError in response. `new Date()` + `isNaN(date.getTime())` guard added at top of `getSupplierShrinkage`.

### A4-11 — FIXED
```
GET /analytics/dashboard
→ 200 { ..., "gstThisMonth": 319.2 }
```
Field is present (was missing entirely before fix). Value is a plain number. Computed via `Sale.aggregate` summing `taxTotal` for current month's non-cancelled sales with `$toDouble` conversion.

### SEC-005 — FIXED
```
POST /ai/chat { message: "" }     → 400 "Message is required"
POST /ai/chat { message: "   " }  → 400 "Message is required"  (Zod .trim().min(1))
POST /ai/chat {}                  → 400 "Invalid input: expected string"
```
Route order in `ai.routes.js` line 17:
```js
router.post('/chat', validate(chatSchema), aiChatLimiter, chatAssistant);
```
`validate(chatSchema)` runs before `aiChatLimiter` — invalid messages are rejected without consuming a rate-limit token.

---

## Still Broken

### A4-02 — STILL BROKEN (new root cause)

**Original symptom:** 201 returned but 0 products processed for SKU-less items.
**Current symptom:** 500 returned — different error, different failure mode.

**Evidence (reproduced twice):**
```
POST /ocr/save { items: [{ name: "SKUlessItemABC", quantity: 3, price: 150 }] }
→ HTTP 500
{ "success": false, "message": "E11000 duplicate key error collection: MERNDB.products index: barcode_1 dup key: { barcode: \"\" }" }
```

**Root cause:**
`Product.model.js` line 47-52 defines:
```js
barcode: {
  type: String,
  default: '',
  trim: true,
  index: { unique: true, sparse: true },
},
```
`sparse: true` on a unique index excludes `null` and `undefined` documents from uniqueness, but `""` (empty string) IS a real value subject to uniqueness. Because the schema sets `default: ''`, every newly created product (without an explicit barcode) gets `barcode: ""`. The second product with `barcode: ""` fails with a duplicate key error. The DB already has one product with `barcode: ""` from a previous test, so the first OCR save also fails.

**Also affects:** Any `Product.create()` call that does not supply a barcode — including the OCR save path, inventory stock-in for new products, and potentially the product creation endpoint itself.

**Note:** The previous A4-02 fix (auto-generating SKU) is correctly implemented in `ocr.controller.js` at line 120:
```js
const sku = item.sku || generateSkuFromName(name || 'ITEM');
```
But the fix is unreachable because `Product.create()` crashes on the barcode constraint before the SKU logic can succeed.

**Assigned:** backend-coder
**Fix:** Either (a) change `default: ''` to `default: undefined` (no default, sparse index then works) or (b) remove `default: ''` and ensure `sparse: true` so null/undefined barcodes are excluded from the uniqueness check. The barcode field should be `undefined`/`null` (not `""`) for products without a barcode.

---

## New Bug Found During Verification

### A4-09b — OVERSOLD alert type not in Alert model enum

**Found:** 2026-05-19
**Severity:** Medium
**Status:** Open
**Assigned:** backend-coder

**Symptom:**
`smartAlerts.cron.js` creates an alert with `type: 'OVERSOLD'` for products with negative stock. The `Alert.model.js` type enum is `['LOW_STOCK', 'OUT_OF_STOCK', 'DEAD_STOCK', 'REORDER_DUE']` — `'OVERSOLD'` is not included. The cron throws a Mongoose ValidationError, silently stopping processing for any products ordered after the oversold one in the iteration.

**Evidence:**
```
// Direct cron run (from test)
Cron error: Alert validation failed: type: `OVERSOLD` is not a valid enum value for path `type`.
// DB state: 1 product with stock=-3.55 (QA Test Product Paneer)
// 8 OUT_OF_STOCK alerts created (products before the oversold one in iteration)
// 0 alerts for products after it
```

**Fix options:**
1. Add `'OVERSOLD'` to the Alert model type enum (preferred — preserves intent)
2. Map oversold products to `'OUT_OF_STOCK'` type in the cron (acceptable interim fix)

---

## Additional Observation

**A4-03 client-side fix status (unverified in this pass):**
The backend service (`ocr.service.js`) was fixed to return `items`. Whether `ScannerPage.jsx` was also updated to read `extractedData.items` (instead of `extractedData.lineItems`) was NOT verified in this pass (frontend not in scope for RT3 API testing). If the frontend was NOT updated, OCR extract → review flow still shows empty table. Recommend frontend-coder confirm `ScannerPage.jsx` reads `extractedData.items`.

---

## Test Execution Details

- Script: `tests/bugs/phase2/rt3-verify.js`
- Port: 5001
- Total assertions: 35
- PASS: 32
- FAIL: 3 (all three are A4-02 — one underlying failure)
- Auth: staff role (rt3qa@test.com)
- A4-09 admin trigger: tested via direct DB/cron invocation from server working directory

**Cron severity validation confirmed by:**
1. Direct `runSmartAlerts()` call from server context
2. DB inspection: 8 active alerts with `severity='critical'` and `type='OUT_OF_STOCK'`
3. GET /alerts API response confirms valid severity values
