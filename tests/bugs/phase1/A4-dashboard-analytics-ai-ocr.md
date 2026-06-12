# A4 Bug Report — Dashboard, Analytics, AI Insights, OCR/Scanner, Reports, Alerts

**QA Agent:** A4
**Date:** 2026-05-19
**Phase:** Phase 1 — Discovery & Live Testing
**Servers tested:** http://localhost:5000/api/v1 (backend), http://localhost:5173 (frontend)
**Test account:** a4qa@test.com (staff role, fresh account)
**Total bugs found:** 13

---

## Bug #A4-01: OCR Save Crashes with "next is not a function" When SKU is Present

**Found:** 2026-05-19
**Severity:** Critical
**Status:** Open
**Assigned:** backend-coder

### Symptom
Calling `POST /api/v1/ocr/save` with items that include a `sku` field returns HTTP 500 with message `"next is not a function"`. Inventory is never updated. The feature is completely non-functional when SKU is provided — which is the only case that would actually upsert a real product.

### Steps to Reproduce
1. Authenticate as any user (staff or admin)
2. POST /api/v1/ocr/save with body:
   ```json
   {
     "vendor": "Test Vendor",
     "invoiceNumber": "INV-001",
     "items": [{ "name": "Widget", "sku": "TST-001", "quantity": 5, "price": 100, "total": 500, "category": "Test" }]
   }
   ```
3. Observe HTTP 500 response

### Expected
HTTP 201 with `{ products: [...], transactions: [...] }` — product upserted, transaction created.

### Actual
```
HTTP 500
{ "success": false, "message": "next is not a function" }
```
Reproduced 6+ times across all item shapes that reach `Product.create()` or `Product.findOneAndUpdate()`.

### Evidence
```
curl output: 500 {"success":false,"message":"next is not a function"}
Node test (live): ocr/save with sku: 500 {"success":false,"message":"next is not a function"}
```
Items without `sku` silently return `0 product(s) processed, 0 transaction(s) created` (see Bug #A4-02).

### Root Cause Hypothesis
`server/src/models/Product.model.js` pre-validate hook uses the `function(next)` sync signature (circa Mongoose 6 style). In Mongoose 9.3.1 running under Express 5, the pre-validate hook for `save()` and `create()` paths is called with async semantics — the `next` parameter may not be passed when the hook is declared as a `function(next)` without returning a Promise. When the hook body calls `next()` after async operations (e.g., checking `weight.isWhole(this.stock)`), `next` is `undefined` at that point, causing the crash.

### Suggested Fix
Convert the Product pre-validate hook (server/src/models/Product.model.js, lines 139-201) from `schema.pre('validate', function(next) { ... next(); })` to `schema.pre('validate', async function() { ... })`. Remove all `next()` calls; use `throw new Error(...)` for validation failures instead.

### Verification
- [ ] Fix shipped
- [ ] POST /ocr/save with sku field returns 201 and product is created in DB
- [ ] POST /ocr/save with no sku returns 201 and processes correctly
- [ ] Related cases: Product create via inventory API still works after hook change

---

## Bug #A4-02: OCR Save Silently Ignores All Items Without SKU (0 Products Processed)

**Found:** 2026-05-19
**Severity:** High
**Status:** Open
**Assigned:** backend-coder

### Symptom
When `POST /api/v1/ocr/save` receives items that do NOT include a `sku` field (which is the shape OCR extraction returns — see Bug #A4-03), it returns HTTP 201 but processes zero products and zero transactions. The inventory is never updated. No error is shown to the user; the UI would silently succeed while doing nothing.

### Steps to Reproduce
1. POST /api/v1/ocr/save with body:
   ```json
   {
     "vendor": "Test Vendor",
     "invoiceNumber": "INV-001",
     "items": [{ "name": "Widget", "quantity": 5, "price": 100, "total": 500 }]
   }
   ```
2. Observe HTTP 201 response

### Expected
Items without an explicit SKU should either: (a) auto-generate a SKU and create the product, or (b) return a 400 with clear message "Item 'Widget' is missing a SKU — cannot match to inventory."

### Actual
```
HTTP 201
{ "success": true, "message": "0 product(s) processed, 0 transaction(s) created.", "data": { "products": [], "transactions": [] } }
```

### Evidence
```
Live test: ocr/save no-sku: 201 "0 product(s) processed, 0 transaction(s) created."
```
The controller's item-processing loop (server/src/controllers/ocr.controller.js, lines 91-161) requires items to have a resolvable SKU to do a findOneAndUpdate. Items without a SKU produce no match and no error.

### Root Cause Hypothesis
`server/src/controllers/ocr.controller.js` conditionally processes items only when a matching product can be found by SKU. Items without SKU fall through silently. The OCR service (`parseInvoiceData`) never produces a `sku` field in its output, so 100% of real OCR-extracted items will silently produce 0 results.

### Suggested Fix
In `ocr.controller.js` saveExtractedData, after filtering items, check `if (processedCount === 0 && items.length > 0)` and return a 400 or 207 with a descriptive message. Alternatively, auto-generate SKU from `item.name` when none is present.

### Verification
- [ ] Fix shipped
- [ ] POST /ocr/save with name-only items either creates products or returns clear error
- [ ] Message accurately reflects what was and was not processed

---

## Bug #A4-03: OCR Extract Returns `lineItems` Key but Client Reads `items` Key — UI Always Shows Empty

**Found:** 2026-05-19
**Severity:** High
**Status:** Open
**Assigned:** frontend-coder (client mismatch) + backend-coder (review contract)

### Symptom
After a successful OCR extraction, `ScannerPage.jsx` displays no line items to the user for review. The edit table is empty. The user cannot review or correct extracted data before saving.

### Steps to Reproduce
1. Upload a valid invoice image via `POST /api/v1/ocr/extract`
2. The API returns `{ lineItems: [...] }` in `response.data.data`
3. `ScannerPage.jsx` reads `extractedData.items` (undefined) to populate the review table
4. Table renders empty

### Expected
Extracted line items should be displayed in the review table for user correction before saving.

### Actual
Review table is empty. `extractedData.items` is `undefined`.

### Evidence
- `server/src/services/ocr.service.js`, `parseInvoiceData()` (lines 18-74): returns `{ invoiceNumber, date, vendorName, lineItems, subtotal, tax, grandTotal }` — key is `lineItems`
- `client/src/pages/ScannerPage.jsx`, line 92: `setExtractedData(extractRes.data.data)` — stores the response directly
- `client/src/pages/ScannerPage.jsx`, line 108: `handleSave` posts `{ items: extractedData.items, ... }` — `items` is `undefined`
- Both the display table and the save call use `extractedData.items`, not `extractedData.lineItems`

### Root Cause Hypothesis
API contract mismatch: OCR service uses `lineItems` as the field name, but ScannerPage was written assuming `items`. Either the service should be changed to return `items`, or the client should read `lineItems`.

### Suggested Fix
Option A (preferred — minimal change): In `client/src/pages/ScannerPage.jsx`, replace all references to `extractedData.items` with `extractedData.lineItems`.
Option B: In `server/src/services/ocr.service.js`, rename `lineItems` to `items` in the return object.

### Verification
- [ ] Fix shipped
- [ ] Upload invoice image, extracted line items appear in review table
- [ ] Editing items and clicking Save correctly posts items to /ocr/save
- [ ] /ocr/save actually upserts products (requires Bug #A4-01 also fixed)

---

## Bug #A4-04: `analytics/inventory` topByStockValue Returns Decimal128 Objects — Causes NaN in Charts

**Found:** 2026-05-19
**Severity:** High
**Status:** Open
**Assigned:** backend-coder

### Symptom
The AnalyticsPage inventory bar chart renders with all bars at zero (NaN). `pricePerUnit` and `stockValue` fields in `topByStockValue` come from MongoDB as Decimal128 BSON objects `{"$numberDecimal":"480"}` rather than plain numbers. Recharts receives these objects and cannot render a numeric bar.

### Steps to Reproduce
1. GET /api/v1/analytics/inventory (authenticated)
2. Inspect `data.topByStockValue[0].stockValue` and `data.topByStockValue[0].pricePerUnit`

### Expected
```json
{ "stockValue": -1704.00, "pricePerUnit": 480 }
```

### Actual
```json
{ "stockValue": { "$numberDecimal": "-1704.00" }, "pricePerUnit": { "$numberDecimal": "480" } }
```

### Evidence
```
Live test output:
topByStockValue[0] pricePerUnit type: object {"$numberDecimal":"480"}
topByStockValue[0] stockValue type: object {"$numberDecimal":"-1704.00"}
```
`stockByCategory[0].totalValue` is also 0 (aggregation pipeline `$multiply` on Decimal128 → result is Decimal128, bypasses toJSON transform):
```
stockByCategory[0]: {"_id":"Laptops","totalStock":19,"totalValue":0,...}
```
Note: `totalValue: 0` for Laptops with 19 items in stock is itself wrong — it reflects the same Decimal128 aggregation issue.

### Root Cause Hypothesis
`server/src/controllers/analytics.controller.js`, `getInventoryReport` (lines 187-191): `$addFields: { stockValue: { $multiply: ['$pricePerUnit', '$stock'] } }`. MongoDB aggregation pipeline results are plain BSON and do NOT pass through Mongoose's `toJSON` transform. Decimal128 fields from the Product schema remain as `{$numberDecimal: "..."}` objects in the response.

### Suggested Fix
In `analytics.controller.js`, after the aggregate pipeline for topByStockValue, map the results to convert Decimal128 to numbers:
```js
topByStockValue = topByStockValue.map(item => ({
  ...item,
  pricePerUnit: item.pricePerUnit?.$numberDecimal !== undefined
    ? Number(item.pricePerUnit.$numberDecimal) : Number(item.pricePerUnit),
  stockValue: item.stockValue?.$numberDecimal !== undefined
    ? Number(item.stockValue.$numberDecimal) : Number(item.stockValue),
}));
```
Same treatment needed for `stockByCategory.totalValue`.

### Verification
- [ ] Fix shipped
- [ ] GET /analytics/inventory returns numeric stockValue in topByStockValue
- [ ] AnalyticsPage bar chart renders bars at correct heights
- [ ] stockByCategory.totalValue is a number

---

## Bug #A4-05: `analytics/inventory` stockHealth Total (51) Exceeds Actual Product Count (43) — Double-Counting

**Found:** 2026-05-19
**Severity:** High
**Status:** Open
**Assigned:** backend-coder

### Symptom
The inventory health breakdown reports `healthy: 42, low: 0, outOfStock: 9, total: 51` but there are only 43 products total. 8 products are counted in both `healthy` AND `outOfStock` simultaneously. The UI "Out of Stock" badge count is inflated.

### Steps to Reproduce
1. GET /api/v1/analytics/inventory (authenticated)
2. Check `data.stockHealth`

### Expected
`healthy + low + outOfStock == totalProducts` (no product counted twice)

### Actual
```json
{ "healthy": 42, "low": 0, "outOfStock": 9, "total": 51 }
```
51 > 43 total products. 8 products appear in both healthy and outOfStock.

### Evidence
```
Live test:
stockHealth: {"healthy":42,"low":0,"outOfStock":9,"total":51}
totalProducts: undefined  (totalProducts field missing from response)
```

### Root Cause Hypothesis
`server/src/controllers/analytics.controller.js`, lines 180-183: three separate `countDocuments` queries using `$expr: { $lte/$gt }` with Decimal128 fields. Legacy products have `reorderLevel: null` (Number type). In BSON comparison order, null is less than any number, so `$gt: ['$stock', null]` evaluates to `true` even for out-of-stock legacy products (stock = 0). Products with stock=0 and reorderLevel=null satisfy BOTH `$gt: [0, null]` (healthy) AND `$lte: [0, reorderLevel=null]` or a separate outOfStock query.

Additionally `totalProducts` field is absent from `data` (should be `data.totalProducts` but the field is `undefined` in the response).

### Suggested Fix
1. Add a null guard in all three queries: `$expr: { $and: [{ $ne: ['$reorderLevel', null] }, { $lte: ['$stock', '$reorderLevel'] }] }`
2. Ensure mutual exclusion: use `outOfStock` first (stock <= 0), then `low` (0 < stock <= reorderLevel), then `healthy` (stock > reorderLevel), with explicit guards.
3. Return `totalProducts` as `healthy + low + outOfStock` (after fixing mutual exclusion).

### Verification
- [ ] Fix shipped
- [ ] `healthy + low + outOfStock == totalProducts` for all product datasets
- [ ] No product counted in more than one category

---

## Bug #A4-06: `sales/report` Returns Decimal128 Objects for `totalRevenue` and `avgOrderValue`

**Found:** 2026-05-19
**Severity:** High
**Status:** Open
**Assigned:** backend-coder

### Symptom
GET /api/v1/sales/report returns `totalRevenue: {"$numberDecimal":"8842"}` and `avgOrderValue: {"$numberDecimal":"442.1"}` — raw BSON objects that JavaScript clients cannot use as numbers. Dashboard revenue KPIs will show `[object Object]` or `NaN` in the UI.

### Steps to Reproduce
1. GET /api/v1/sales/report?period=last7days (authenticated)
2. Inspect `data.totalRevenue`

### Expected
```json
{ "totalRevenue": 8842, "avgOrderValue": 442.1 }
```

### Actual
```json
{ "totalRevenue": { "$numberDecimal": "8842" }, "avgOrderValue": { "$numberDecimal": "442.1" } }
```

### Evidence
```
Live test:
sales/report full: 200 {"data":{"totalRevenue":{"$numberDecimal":"8842"},"avgOrderValue":{"$numberDecimal":"442.1"},...}}
```

### Root Cause Hypothesis
`server/src/controllers/sale.controller.js`, `getSalesReport` (line 601): aggregation pipeline uses `$sum: '$grandTotal'` where `grandTotal` is Decimal128. Aggregation results bypass Mongoose toJSON. The `revenueAgg[0]?.total` (or `totalRevenue`) is assigned directly to the response without conversion.

### Suggested Fix
After the aggregation, convert:
```js
totalRevenue: revenueAgg[0]?.totalRevenue?.$numberDecimal
  ? Number(revenueAgg[0].totalRevenue.$numberDecimal)
  : Number(revenueAgg[0]?.totalRevenue ?? 0)
```
Same for `avgOrderValue`.

### Verification
- [ ] Fix shipped
- [ ] GET /sales/report returns plain numbers for totalRevenue and avgOrderValue
- [ ] Dashboard revenue KPI displays correctly

---

## Bug #A4-07: AI Trends Shows W8 as 14 Orders / $0 Revenue Due to Virtual Field in Aggregation

**Found:** 2026-05-19
**Severity:** High
**Status:** Open
**Assigned:** backend-coder

### Symptom
`GET /ai/trends` reports the most recent week (W8) as having 14 orders but $0 revenue. This is false — orders exist but revenue is zero because the aggregation uses `$sum: '$total'`, and `total` is a Mongoose virtual field not stored in MongoDB. This causes a false -100% revenue trend, potentially triggering incorrect "business is failing" insights.

### Steps to Reproduce
1. GET /api/v1/ai/trends (authenticated)
2. Find the most recent week (W8)

### Expected
W8 revenue should reflect actual sales totals for those 14 orders.

### Actual
```json
{ "week": "W8", "revenue": 0, "count": 14 }
```

### Evidence
```
Live test:
W8 trends (14 orders, 0 revenue = virtual bug): {"week":"W8","revenue":0,"count":14}
Full array: W6={"revenue":9188.94,"count":40}, W7={"revenue":0,"count":0}, W8={"revenue":0,"count":14}
```
W8 has 14 orders but $0 revenue. W6 has revenue because it contains older (pre-migration) sales where `total` was stored as a Number field.

### Root Cause Hypothesis
`server/src/controllers/ai.controller.js`, `getTrends` (lines 244-273): aggregation pipeline groups on `$sum: '$total'`. After the chunk#3 schema migration, Sale documents store `grandTotal` (Decimal128) but NOT `total` as a stored field — `total` is a virtual on the Mongoose model that aggregation pipelines cannot see.

Same issue affects `localChatResponder` (lines 280-425) which reports $0 revenue when answering natural language queries.

### Suggested Fix
Replace `$sum: '$total'` with `$sum: '$grandTotal'` in the aggregation. Then convert the Decimal128 result:
```js
// After aggregation:
weeks.map(w => ({ ...w, revenue: Number(w.revenue?.$numberDecimal ?? w.revenue ?? 0) }))
```

### Verification
- [ ] Fix shipped
- [ ] W8 (and all weeks with new-schema sales) shows non-zero revenue
- [ ] Trend growth percentages are accurate
- [ ] localChatResponder also updated

---

## Bug #A4-08: `ai/predict` and `ai/reorder/:id` with Invalid ObjectId Leaks Raw Mongoose CastError (500)

**Found:** 2026-05-19
**Severity:** High
**Status:** Open
**Assigned:** backend-coder

### Symptom
Passing a non-ObjectId string to `POST /ai/predict` (body `{productId: "notanid"}`) or `GET /ai/reorder/notanid` returns HTTP 500 with raw Mongoose error message exposed to client: `"Cast to ObjectId failed for value \"notanid\" (type string) at path \"_id\""`. This is a security exposure (internal model details) and a poor user experience (cryptic error instead of "Invalid product ID").

Additionally, `POST /ai/predict` with an empty body `{}` returns 404 "Product not found" instead of 400 validation error — the missing `productId` is not validated.

### Steps to Reproduce
1. POST /api/v1/ai/predict with body `{ "productId": "notanid" }` → HTTP 500
2. GET /api/v1/ai/reorder/notanid → HTTP 500
3. POST /api/v1/ai/predict with body `{}` → HTTP 404 "Product not found"

### Expected
- Invalid ObjectId format → HTTP 400, message "Invalid product ID format"
- Missing productId → HTTP 400, message "productId is required"

### Actual
```
ai/predict bad id: 500 {"success":false,"message":"Cast to ObjectId failed for value \"notanid\" (type string) at path \"_id\" for model \"Product\""}
ai/reorder bad id: 500 {"success":false,"message":"Cast to ObjectId failed for value \"notanid\" (type string) at path \"_id\" for model \"Product\""}
ai/predict no body: 404 {"success":false,"message":"Product not found"}
```

### Root Cause Hypothesis
`server/src/controllers/ai.controller.js`:
- `predictDemand` (lines 88-123): no input validation on `req.body.productId`; calls `Product.findById(productId)` directly — invalid ObjectId throws an unhandled CastError from Mongoose
- `getReorderSuggestion` (lines 126-193): same pattern with `req.params.productId`
Neither function has a `mongoose.isValidObjectId()` guard or a try/catch that converts CastError to 400.

### Suggested Fix
Add validation before the DB call in both functions:
```js
if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });
if (!mongoose.isValidObjectId(productId)) return res.status(400).json({ success: false, message: 'Invalid product ID format' });
```

### Verification
- [ ] Fix shipped
- [ ] POST /ai/predict with no body returns 400
- [ ] POST /ai/predict with invalid ObjectId returns 400
- [ ] GET /ai/reorder/invalidid returns 400
- [ ] Mongoose internals no longer appear in error responses

---

## Bug #A4-09: Smart Alerts Cron Uses Severity Values Not in Alert Model Enum — OUT_OF_STOCK and LOW_STOCK Alerts Never Saved

**Found:** 2026-05-19
**Severity:** High
**Status:** Open
**Assigned:** backend-coder

### Symptom
The smartAlerts cron job attempts to create alerts for out-of-stock and low-stock events, but these alert documents are silently dropped by Mongoose validation. The `alerts` collection remains empty even when products are out of stock. Users never receive any stock alerts.

### Steps to Reproduce
1. Verify products are out of stock: GET /analytics/dashboard shows `lowStock: 1` and multiple outOfStock items
2. Trigger the cron or wait for it to run
3. GET /api/v1/alerts — returns empty `[]`
4. The "Stock Alert" widget on Dashboard always shows 0 alerts

### Expected
Alerts with `severity: 'critical'` and `severity: 'warning'` should be created for out-of-stock and low-stock products respectively.

### Actual
GET /alerts returns `[]` despite 9 out-of-stock products and 1 low-stock product existing.

### Evidence
- `server/src/models/Alert.model.js` line 10-13: enum is `['critical', 'warning', 'info']`
- `server/src/crons/smartAlerts.cron.js` line 102: `severity: 'high'` (for OUT_OF_STOCK)
- `server/src/crons/smartAlerts.cron.js` line 115: `severity: 'medium'` (for LOW_STOCK)
- Neither `'high'` nor `'medium'` is in the enum — Mongoose validation fails, `Alert.create()` throws, and the cron silently swallows the error (no alerts persisted)
- Live confirmation: `alerts list: 200 count= 0 data: []` despite known out-of-stock products

### Root Cause Hypothesis
The Alert model and the smartAlerts cron were developed independently with different enum conventions. The model uses `'critical'/'warning'/'info'` (3-level severity) but the cron uses `'high'/'medium'/'low'` (4-level severity). This is a pure value mismatch — no code path maps between them.

### Suggested Fix
In `server/src/crons/smartAlerts.cron.js`:
- Line 102: change `severity: 'high'` to `severity: 'critical'`
- Line 115: change `severity: 'medium'` to `severity: 'warning'`
Confirm that all other cron `severity` usages match the enum.

### Verification
- [ ] Fix shipped
- [ ] Trigger cron via POST /alerts/run-now (admin only)
- [ ] GET /alerts returns alerts for out-of-stock products with severity='critical'
- [ ] GET /alerts returns alerts for low-stock products with severity='warning'
- [ ] No validation errors in server logs

---

## Bug #A4-10: `reports/supplier-shrinkage` with Invalid Date Leaks Raw Mongoose Error (500)

**Found:** 2026-05-19
**Severity:** Medium
**Status:** Open
**Assigned:** backend-coder

### Symptom
`GET /reports/supplier-shrinkage?from=not-a-date&to=also-bad` returns HTTP 500 with the raw Mongoose error: `"Cast to date failed for value \"Invalid Date\" (type Date) at path \"createdAt\" for model \"StockAdjustment\""`. This exposes internal model and field names to clients and gives no actionable feedback.

### Steps to Reproduce
1. GET /api/v1/reports/supplier-shrinkage?from=not-a-date&to=also-bad

### Expected
HTTP 400, message: "Invalid date format. Use YYYY-MM-DD."

### Actual
```
HTTP 500
{ "success": false, "message": "Cast to date failed for value \"Invalid Date\" (type Date) at path \"createdAt\" for model \"StockAdjustment\"" }
```

### Evidence
```
Live test:
shrinkage bad dates: 500 {"success":false,"message":"Cast to date failed for value \"Invalid Date\" (type Date) at path \"createdAt\" for model \"StockAdjustment\""}
```

### Root Cause Hypothesis
`server/src/controllers/reports.controller.js` (lines 16-144): `getSupplierShrinkage` reads `req.query.from` and `req.query.to`, constructs `new Date(from)` without validation. `new Date("not-a-date")` produces `Invalid Date`. When passed into the Mongoose query, Mongoose throws a CastError that is caught by Express and forwarded to the error middleware, which includes the raw message.

### Suggested Fix
Add validation at the top of `getSupplierShrinkage`:
```js
const from = new Date(req.query.from);
const to = new Date(req.query.to);
if (isNaN(from.getTime()) || isNaN(to.getTime())) {
  return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });
}
```

### Verification
- [ ] Fix shipped
- [ ] GET /reports/supplier-shrinkage?from=bad&to=bad returns 400 with clear message
- [ ] GET /reports/supplier-shrinkage?from=2024-01-01&to=2024-12-31 returns 200

---

## Bug #A4-11: Dashboard `gstThisMonth` KPI Always Displays Zero

**Found:** 2026-05-19
**Severity:** Medium
**Status:** Open
**Assigned:** backend-coder (missing field in API response)

### Symptom
The Dashboard GST KPI card shows Rs 0 every month, regardless of actual tax collected on sales. The `gstThisMonth` field is not returned by any API endpoint.

### Steps to Reproduce
1. Log in, view Dashboard
2. Check the "GST This Month" KPI card — always shows 0

### Expected
The KPI should display the sum of `taxTotal` from all sales in the current calendar month.

### Actual
Card shows Rs 0.

### Evidence
- `client/src/pages/Dashboard.jsx` line 91: `gstThisMonth = report?.gstThisMonth ?? report?.taxAmountThisMonth ?? 0`
- GET /analytics/dashboard response keys: `totalProducts, lowStock, lowStockItems, totalInventoryValue, totalTransactions, inTransactions, outTransactions, categoryBreakdown, recentTransactions, topProducts` — no GST field
- GET /sales/report response keys do not include `gstThisMonth` or `taxAmountThisMonth`
- Both fallbacks resolve to `?? 0`, so the display is always zero

### Root Cause Hypothesis
The Dashboard controller (`analytics.controller.js` `getDashboardStats`) was not updated to compute and return `gstThisMonth` after the schema migration to `taxTotal` (Decimal128). The field is neither in the analytics/dashboard response nor in the sales/report response.

### Suggested Fix
In `analytics.controller.js`, `getDashboardStats`: add an aggregation to sum `taxTotal` for current month's sales:
```js
const gstAgg = await Sale.aggregate([
  { $match: { createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } } },
  { $group: { _id: null, total: { $sum: '$taxTotal' } } }
]);
const gstThisMonth = Number(gstAgg[0]?.total?.$numberDecimal ?? gstAgg[0]?.total ?? 0);
```
Return `gstThisMonth` in the dashboard response.

### Verification
- [ ] Fix shipped
- [ ] Dashboard GST KPI shows non-zero value when taxTotal sales exist for current month
- [ ] Value matches sum of taxTotal in raw DB query

---

## Bug #A4-12: AiInsightsPage Shows Infinite Loading Spinner on Any Fetch Error (No Error State)

**Found:** 2026-05-19
**Severity:** Medium
**Status:** Open
**Assigned:** frontend-coder

### Symptom
If any of the four parallel fetches in `AiInsightsPage.jsx` fails (network error, 500, timeout), the page remains stuck in a loading spinner forever. There is no error message, no retry button, and no indication to the user that something went wrong.

### Steps to Reproduce
1. Take the server offline or block one of the AI endpoints
2. Navigate to AI Insights page
3. Page shows loading spinner indefinitely with no feedback

### Expected
After fetch failure, show an error state with a message like "Could not load insights. Tap to retry."

### Actual
Infinite loading spinner. `.catch(console.error)` only logs to console — `setError()` is never called.

### Evidence
- `client/src/pages/AiInsightsPage.jsx` lines 144-153: four parallel fetches with `.catch(console.error)` only
- No `setError()` call on any catch path
- Loading is only cleared on successful response; never cleared on error
- `setLoading(false)` is in the `finally` block of only some fetches, not all

### Root Cause Hypothesis
Error states were not implemented in `AiInsightsPage.jsx`. The component was written with only the happy path in mind.

### Suggested Fix
Wrap the fetch block in a try/catch with shared error state:
```jsx
const [error, setError] = useState(null);
try {
  await Promise.all([fetchAiInsights(), fetchDeadStock(), fetchAiTrends(), fetchProducts()]);
} catch (err) {
  setError('Could not load AI insights. Please try again.');
} finally {
  setLoading(false);
}
```
Render `<ErrorMessage />` component when `error` is set.

### Verification
- [ ] Fix shipped
- [ ] Block /ai/insights endpoint, navigate to AI Insights — error message shown
- [ ] Retry button re-triggers the fetches

---

## Bug #A4-13: ScannerPage Displays Hardcoded Fake "Recent Scans" That Cannot Be Dismissed or Cleared

**Found:** 2026-05-19
**Severity:** Low
**Status:** Open
**Assigned:** frontend-coder

### Symptom
The Scanner page always shows two fake recent scan entries ("Apex Electronics", "Sharma Traders") that are hardcoded in the component. These are not real data and cannot be removed by the user. New users see a pre-populated scan history that doesn't reflect their actual scans, which is confusing and misleading.

### Steps to Reproduce
1. Log in as a fresh account with no scan history
2. Navigate to Scanner/OCR page
3. Observe "Recent Scans" section shows "Apex Electronics" and "Sharma Traders"

### Expected
"Recent Scans" should be empty for a new account, or populated from actual scan history stored in the database.

### Actual
Two hardcoded stub entries always appear regardless of actual scan history.

### Evidence
- `client/src/pages/ScannerPage.jsx` lines 15-19: `const RECENT_STUB = [{ vendor: 'Apex Electronics', ... }, { vendor: 'Sharma Traders', ... }]` hardcoded
- The component renders `RECENT_STUB` directly without any API call for actual scan history
- Sample gallery buttons (lines 42, 164) only call `setSelectedSample()` — they do not load any actual image file, so clicking a sample has no functional effect

### Root Cause Hypothesis
Placeholder/stub data was left in during development and never replaced with real API integration.

### Suggested Fix
Remove `RECENT_STUB` from `ScannerPage.jsx`. Fetch actual OCR history from `/api/v1/ocr/history` (if endpoint exists) or display "No recent scans" when history is empty. Remove non-functional sample gallery buttons or wire them to load actual sample images.

### Verification
- [ ] Fix shipped
- [ ] Fresh account sees "No recent scans" message
- [ ] After a successful scan, the entry appears in Recent Scans

---

## Summary

| # | Title | Severity | File(s) | Assigned |
|---|-------|----------|---------|----------|
| A4-01 | OCR save crashes "next is not a function" (SKU path) | Critical | server/src/models/Product.model.js:139-201 | backend-coder |
| A4-02 | OCR save silently processes 0 items when SKU absent | High | server/src/controllers/ocr.controller.js:91-161 | backend-coder |
| A4-03 | OCR extract returns `lineItems`, client reads `items` | High | server/src/services/ocr.service.js:18-74, client/src/pages/ScannerPage.jsx:92,108 | frontend-coder |
| A4-04 | analytics/inventory returns Decimal128 objects for stockValue/pricePerUnit | High | server/src/controllers/analytics.controller.js:187-191 | backend-coder |
| A4-05 | stockHealth double-counts products (51 total vs 43 actual) | High | server/src/controllers/analytics.controller.js:180-183 | backend-coder |
| A4-06 | sales/report totalRevenue/avgOrderValue are Decimal128 objects | High | server/src/controllers/sale.controller.js:601 | backend-coder |
| A4-07 | AI trends W8: 14 orders but $0 revenue (virtual field aggregation) | High | server/src/controllers/ai.controller.js:244-273 | backend-coder |
| A4-08 | ai/predict + ai/reorder leak CastError on invalid ObjectId | High | server/src/controllers/ai.controller.js:88-193 | backend-coder |
| A4-09 | Smart alerts cron uses severity 'high'/'medium' not in enum — no alerts ever saved | High | server/src/crons/smartAlerts.cron.js:102,115 | backend-coder |
| A4-10 | reports/supplier-shrinkage leaks Mongoose error on invalid date | Medium | server/src/controllers/reports.controller.js:16-144 | backend-coder |
| A4-11 | Dashboard gstThisMonth KPI always 0 (field not returned by API) | Medium | server/src/controllers/analytics.controller.js (getDashboardStats) | backend-coder |
| A4-12 | AiInsightsPage: infinite spinner on any fetch failure (no error state) | Medium | client/src/pages/AiInsightsPage.jsx:144-153 | frontend-coder |
| A4-13 | ScannerPage hardcoded fake recent scans (stub data never removed) | Low | client/src/pages/ScannerPage.jsx:15-19 | frontend-coder |

**Totals: 1 Critical, 7 High, 3 Medium, 1 Low — 12 assigned to backend-coder, 3 to frontend-coder**

---

## Evidence Reference

All bugs were verified live against `http://localhost:5000/api/v1` using Node.js HTTP scripts.
Test script: `tests/bugs/phase1/scripts/a4-analytics-ai-ocr.js`
Test run date: 2026-05-19

Key evidence snippets:

```
# A4-01 (Critical - OCR crash)
ocr/save with sku: 500 {"success":false,"message":"next is not a function"}

# A4-02 (High - silent 0 processed)
ocr/save no-sku: 201 "0 product(s) processed, 0 transaction(s) created."

# A4-04 (High - Decimal128 objects)
topByStockValue[0] pricePerUnit type: object {"$numberDecimal":"480"}
topByStockValue[0] stockValue type: object {"$numberDecimal":"-1704.00"}

# A4-05 (High - double-count)
stockHealth: {"healthy":42,"low":0,"outOfStock":9,"total":51}  (43 actual products)

# A4-06 (High - Decimal128 in sales report)
totalRevenue: {"$numberDecimal":"8842"}, avgOrderValue: {"$numberDecimal":"442.1"}

# A4-07 (High - virtual field aggregation)
W8: {"week":"W8","revenue":0,"count":14}  (14 orders, $0 revenue)

# A4-08 (High - CastError leak)
ai/predict bad id: 500 {"message":"Cast to ObjectId failed for value \"notanid\" (type string) at path \"_id\" for model \"Product\""}
ai/reorder bad id: 500 {"message":"Cast to ObjectId failed for value \"notanid\" (type string) at path \"_id\" for model \"Product\""}

# A4-09 (High - severity enum mismatch, confirmed by empty alerts with 9 out-of-stock products)
alerts list: count= 0 data: []  (despite 9 out-of-stock products)
smartAlerts.cron.js:102 severity:'high', :115 severity:'medium' NOT in Alert.model enum ['critical','warning','info']

# A4-10 (Medium - date validation leak)
shrinkage bad dates: 500 {"message":"Cast to date failed for value \"Invalid Date\" (type Date) at path \"createdAt\" for model \"StockAdjustment\""}

# A4-11 (Medium - missing GST field)
dashboard keys: totalProducts,lowStock,lowStockItems,totalInventoryValue,totalTransactions,...  (no gstThisMonth)
```
