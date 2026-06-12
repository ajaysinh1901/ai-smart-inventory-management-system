# A2 QA Bug Report — Inventory, Products, Suppliers
**Date:** 2026-05-19
**Tester:** QA Agent A2
**Scope:** Products, Inventory (StockAdjustment), Suppliers — API + frontend static review

---

## Bug #A2-01: Product creation is completely broken — `pre('validate')` hook crashes on every create

**Severity:** Critical
**Status:** Open
**Assigned:** backend-coder

### Symptom
Every attempt to create a new product via `POST /api/v1/products` returns HTTP 400 with `"next is not a function"`. No new product can be added through the UI or API.

### Steps to Reproduce
```
POST /api/v1/products
Authorization: Bearer <any valid token>
Content-Type: application/json

{
  "name": "Test Flour",
  "sku": "TF-001",
  "category": "Food",
  "pricePerUnit": 10,
  "unit": "pcs",
  "saleByWeight": false,
  "stock": 5
}
```
Expected: `201 Created`
Actual: `400 {"success":false,"message":"next is not a function"}`

### Expected
A new product is created and returned with HTTP 201.

### Actual
HTTP 400. The error originates in `Product.model.js:200` — the final `next()` call in the `pre('validate')` hook throws `TypeError: next is not a function`.

### Evidence
```
TypeError: next is not a function
  at model.<anonymous> (server/src/models/Product.model.js:200:3)
  at Kareem.execPre (node_modules/kareem/index.js:68:39)
  at model._execDocumentPreHooks (node_modules/mongoose/lib/document.js:3198:29)
  at model.validate
```
Confirmed via direct Mongoose create call in server context. The hook receives `next` as an **object** (the document), not a function.

### Root Cause Hypothesis
`server/src/models/Product.model.js`, lines 139–201.

The hook is written as a synchronous callback style:
```js
productSchema.pre('validate', function (next) { ... next(); });
```
In **Mongoose 9** (v9.3.1, Kareem 3.2.0), `pre('validate')` no longer passes a `next` function when the hook is invoked via `Document.validate()` internally. The `next` parameter receives the document instance instead. The async form `async function() { throw new Error(...); }` is the correct pattern.

The **same bug exists** in `StockAdjustment.model.js` at line 87–95 (different hook, same pattern).

### Suggested Fix
Change both hooks from callback form to async form:
```js
// Product.model.js — replace entire pre('validate') block:
productSchema.pre('validate', async function () {
  if (this.saleByWeight === true && !DECIMAL_UNITS.has(this.unit)) {
    throw new Error('saleByWeight requires unit kg/g/l/ml');
  }
  if (this.saleByWeight === false && this.stock != null) {
    if (!weight.isWhole(this.stock)) {
      throw new Error('Decimal qty not allowed for non-weight unit (saleByWeight=false)');
    }
  }
  if (this.pricePerUnit != null) {
    const ppu = Number(this.pricePerUnit.toString());
    if (ppu <= 0) throw new Error('pricePerUnit must be greater than 0');
  }
  if (this.reorderLevel != null) {
    const rl = Number(this.reorderLevel.toString());
    if (rl < 0) throw new Error('reorderLevel must be >= 0');
  }
  // tareWeight and packSize rules — same pattern
  ...
});
```
Apply the same fix to `StockAdjustment.model.js`.

### Verification
- [ ] Fix shipped
- [ ] `POST /products` with valid body → 201 and product returned
- [ ] Invalid body (e.g. saleByWeight+pcs) → 400 with correct message
- [ ] Decimal stock on pcs → 400
- [ ] `StockAdjustment.create()` with `reason='other'` and no detail → 400 with correct message

---

## Bug #A2-02: Self-registered users get `staff` role but product routes have no role guard — inconsistent authz model

**Severity:** High
**Status:** Open
**Assigned:** backend-coder

### Symptom
A user who self-registers via `POST /auth/register` receives the `staff` role (intentional per `auth.service.js:14`). However, product routes (`/products`) have no `authorize()` guard — only `protect()`. This means:
1. A `staff` user CAN read, create, update, and delete products (no restriction).
2. A `staff` user CANNOT access supplier routes (which correctly have `authorize('admin', 'manager')`).

This is an inconsistency. If suppliers are admin/manager-only, products should have the same guard (product CRUD changes inventory value/cost — a sensitive operation), or the role model needs to be documented. As-shipped, staff can freely mutate the inventory ledger.

### Steps to Reproduce
1. `POST /auth/register` with any email → receive token with `role: staff`
2. `PATCH /api/v1/products/:id/stock` with that token → `200 OK` (stock mutated)
3. `DELETE /api/v1/products/:id` with that token → `200 OK` (product deleted)
4. `GET /api/v1/suppliers` with same token → `403 Forbidden`

### Expected
Either: all write operations on core data require manager/admin, OR the role model explicitly permits staff to mutate products (and should be documented).

### Actual
Staff can mutate products/stock, cannot read suppliers. No consistent access model.

### Evidence
- `server/src/routes/v1/product.routes.js:15` — `router.use(protect)` only, no `authorize`
- `server/src/routes/v1/supplier.routes.js:16` — `router.use(authorize('admin', 'manager'))`
- `server/src/services/auth.service.js:14` — `role: 'staff'` on all self-registrations
- Curl confirmed: staff token → `PATCH /products/:id/stock` → 200

### Root Cause Hypothesis
Product routes were never given role guards. The supplier routes were protected but the product routes were not updated when the authz model changed.

### Suggested Fix
Add `router.use(authorize('admin', 'manager'))` in `product.routes.js` after `protect`, or create a product-specific role policy that allows staff read-only. Coordinate with `architect-gst` to define the access model.

### Verification
- [ ] Fix shipped
- [ ] Staff token: GET /products → 200, POST /products → 403
- [ ] Manager token: POST /products → works as expected

---

## Bug #A2-03: `stock_status` filter is applied in-memory after pagination — wrong results and misleading `meta.total`

**Severity:** High
**Status:** Open
**Assigned:** backend-coder

### Symptom
When the user filters the inventory list by stock status (e.g. "Out of Stock"), the API returns 0 items even though 8 out-of-stock products exist in the database.

### Steps to Reproduce
```
GET /api/v1/products?stock_status=out&page=1&limit=10
```
- 43 total products in DB
- 8 have stock = 0 (out of stock)
- API returns `data: []`, `meta.total: 43`

Also:
```
GET /api/v1/products?stock_status=out&page=1&limit=2
→ data: [] (0 items even though 8 are out of stock)
```
versus:
```
GET /api/v1/products?stock_status=out&page=1&limit=1000
→ data: [8 products] (correct)
```

### Expected
`stock_status=out` should return all out-of-stock products correctly regardless of `limit`. `meta.total` should reflect the filtered count.

### Actual
The filter is applied on `products` after they are fetched from MongoDB with `skip/limit`. If the fetched page has no out-of-stock items, the response is empty — even if out-of-stock items exist on later pages that were never fetched. `meta.total` reports the unfiltered count (43), which is actively misleading.

### Evidence
```js
// product.controller.js lines 123-152:
let products = await Product.find(query)
  .skip(skip).limit(Number(limit));  // ← paginate first

if (stock_status === 'out') {
  products = products.filter(...);  // ← then filter in-memory
}

const total = await Product.countDocuments(query);  // ← unfiltered count
```
The `meta.total` is the count of the unfiltered MongoDB query, so with `stock_status=out` and 43 total products, `meta.total=43` is returned even when only 0–8 items appear in `data`.

### Root Cause Hypothesis
`server/src/controllers/product.controller.js`, lines 130–151 and 151–158. The stock_status filter must be part of the MongoDB query, not a post-fetch in-memory filter, so that pagination and total counts are correct. `reorderLevel` and `stock` are `Decimal128` fields, requiring `$expr` for comparisons.

### Suggested Fix
Build stock-status as part of the MongoDB aggregation pipeline using `$expr` for Decimal128 comparisons:
```js
if (stock_status === 'out') {
  query.$expr = { $lte: ['$stock', weight.fromNumberOrString(0)] };
}
// Then use countDocuments(query) after building the full query.
```
Or add a pre-indexed `stockStatus` field populated via a save middleware.

### Verification
- [ ] Fix shipped
- [ ] `GET /products?stock_status=out&page=1&limit=2` with 8 out-of-stock products → returns up to 2 out-of-stock products
- [ ] `meta.total` = 8 (filtered count), not 43

---

## Bug #A2-04: `POST /stock-adjustments` route does not exist — `StockInVarianceModal` always 404s

**Severity:** Critical
**Status:** Open
**Assigned:** backend-coder

### Symptom
The "Stock In (Purchase Received)" modal in `InventoryPage` calls `createStockAdjustment` which POSTs to `/api/v1/stock-adjustments`. This route does not exist in the server. Every "Confirm Stock In" action from the UI silently fails with a 404.

### Steps to Reproduce
1. Open Inventory page
2. Click 3-dot menu on any product → "Stock In (Purchase Received)"
3. Enter a quantity and click "Confirm Stock In"
4. Observe: `POST /api/v1/stock-adjustments` → 404 `"API Route Not Found"`

### Expected
Stock is increased and a StockAdjustment record is created.

### Actual
404. No stock is added. No error is shown to the user in the UI (the error handler in `StockInVarianceModal` should show an error, but the user's experience is broken stock-in workflow).

### Evidence
- `client/src/services/stockAdjustmentService.js:37` — posts to `/stock-adjustments`
- `server/src/routes/v1/index.js` — no `/stock-adjustments` route registered
- `server/src/services/inventory.service.js` — **empty file** (0 bytes)
- `server/src/controllers/inventory.controller.js` — **empty file** (0 bytes)
- `server/src/routes/v1/inventory.routes.js` — **empty file** (0 bytes)
- The correct stock-in backend endpoint is `POST /transactions/stock-in` (in `transaction.controller.js`)
- `stockAdjustmentService.js:17` acknowledges this: `// TODO(api): POST /api/v1/stock-adjustments — not yet implemented server-side.`

### Root Cause Hypothesis
The frontend was written against a planned `/stock-adjustments` API that was never implemented. The backend stock-in flow uses `/transactions/stock-in` instead. The `inventory.routes.js`, `inventory.controller.js`, and `inventory.service.js` were scaffolded but left empty.

### Suggested Fix
Two options:
1. Implement `POST /stock-adjustments` (create the route, wire it to a new controller that calls `StockAdjustment.create()` and updates product stock)
2. Change `stockAdjustmentService.js` to call `POST /transactions/stock-in` using the correct body shape (`invoicedQty`, `receivedQty`, `supplierId`)

Option 2 is faster but requires aligning the frontend payload with the backend's expected shape.

### Verification
- [ ] Fix shipped
- [ ] Stock In modal → Confirm → stock increases → success message shown
- [ ] StockAdjustment record written to DB (verify via GET)

---

## Bug #A2-05: `StockInVarianceModal` sends `reason: 'manual'` but `StockAdjustment` model rejects it

**Severity:** High
**Status:** Open
**Assigned:** backend-coder

### Symptom
When a non-variance stock-in is confirmed (actual = invoiced), the frontend sends `reason: 'manual'` to the stock-adjustments endpoint. The `StockAdjustment` model's `REASON_ENUM` does not include `'manual'`, so even if the endpoint were implemented, the write would fail with a validation error.

### Steps to Reproduce
1. This bug is a code-level issue (no live repro possible since endpoint is 404 per A2-04).
2. Inspect `InventoryPage.jsx:525`:
   ```js
   reason: hasVariance ? reason : 'manual'
   ```
3. Inspect `StockAdjustment.model.js:9-17`:
   ```js
   const REASON_ENUM = ['opening','purchase-variance','sale','return','damage','count-correction','other'];
   // 'manual' is NOT in this list
   ```

### Expected
`reason: 'manual'` should be a valid reason for a manual stock correction.

### Actual
`StockAdjustment.create({ reason: 'manual', ... })` would throw a Mongoose ValidationError: `"reason must be one of: opening, purchase-variance, sale, return, damage, count-correction, other"`.

### Evidence
- `client/src/pages/InventoryPage.jsx:525`
- `server/src/models/StockAdjustment.model.js:9-17`

### Root Cause Hypothesis
The frontend was written with `'manual'` as a reason but the model was finalized without including it in the enum. Likely caused by the two being developed independently.

### Suggested Fix
Add `'manual'` to `REASON_ENUM` in `StockAdjustment.model.js`. Or change the frontend to use `'count-correction'` (semantically closest) for non-variance stock-in.

### Verification
- [ ] Fix shipped
- [ ] After A2-04 fix: Stock In without variance → StockAdjustment written with correct reason

---

## Bug #A2-06: `getLowStock` includes products with `stock=0` AND `reorderLevel=0` — false alerts

**Severity:** Medium
**Status:** Open
**Assigned:** backend-coder

### Symptom
`GET /api/v1/products/low-stock` uses `$expr: { $lte: ['$stock', '$reorderLevel'] }`. When both `stock=0` and `reorderLevel=0`, the condition `0 <= 0` is true, so a product with no configured reorder threshold appears in the low-stock list. This generates false alerts for products where the owner has not set a threshold.

### Steps to Reproduce
1. Create a product with `stock=0, reorderLevel=0`
2. `GET /api/v1/products/low-stock`
3. The product appears in the response

### Expected
Products with `reorderLevel=0` should not appear in low-stock alerts. A `reorderLevel=0` means "no threshold configured."

### Actual
The query `$lte: ['$stock', '$reorderLevel']` matches when both are 0, producing a spurious alert.

### Evidence
- `server/src/controllers/product.controller.js:273` — `{ $expr: { $lte: ['$stock', '$reorderLevel'] } }`
- The `getProducts` stock_status post-filter (`product.controller.js:135-136`) correctly adds `r > 0` as a guard for the 'low' status, but `getLowStock` doesn't.

### Root Cause Hypothesis
`getLowStock` was not updated to match the `getProducts` logic which checks `r > 0 && s <= r`.

### Suggested Fix
Add a `reorderLevel > 0` guard to the `getLowStock` query:
```js
Product.find({ $expr: {
  $and: [
    { $gt: ['$reorderLevel', weight.fromNumberOrString(0)] },
    { $lte: ['$stock', '$reorderLevel'] }
  ]
}})
```

### Verification
- [ ] Fix shipped
- [ ] Product with stock=0, reorderLevel=0 does NOT appear in /products/low-stock
- [ ] Product with stock=3, reorderLevel=5 DOES appear

---

## Bug #A2-07: `Supplier.model.js` has no schema-level validation — Zod-bypass writes corrupt data

**Severity:** Medium
**Status:** Open
**Assigned:** backend-coder

### Symptom
The `Supplier` model (`Supplier.model.js`) defines all fields as plain `String` with no validators. If validation middleware (Zod) is bypassed (e.g. direct DB write, integration tests, or future programmatic use), invalid data like malformed GSTINs, excessively long strings, or injection payloads can be persisted.

### Steps to Reproduce
Static code review. The mismatch is:
- `supplier.validator.js` — enforces `gstinRegex`, email format, max lengths
- `Supplier.model.js:3-10` — all fields are bare `String`, `{ type: String }` with no validation

### Expected
The Mongoose model should mirror the key constraints (GSTIN format, name required, reasonable maxlengths) as a defence-in-depth layer.

### Actual
```js
// Supplier.model.js
const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contactPerson: String,
  email: String,
  phone: String,
  address: String,
  gst: String,   // ← no regex, no maxlength, no format check
}, { timestamps: true });
```

A name of 50,000 characters, a malformed GSTIN, or a non-email in the email field all pass at the Mongoose level.

### Evidence
- `server/src/models/Supplier.model.js:3-10`
- Contrast with `server/src/validators/supplier.validator.js` which has full validation

### Root Cause Hypothesis
The Mongoose model was not updated when the Zod validator was added. Validators at one layer only creates a single point of failure.

### Suggested Fix
Add Mongoose-level validators to `Supplier.model.js`:
```js
gst: {
  type: String,
  validate: {
    validator: v => !v || /^[0-9A-Z]{15}$/.test(v),
    message: 'GSTIN must be 15 uppercase alphanumeric characters',
  },
},
name: { type: String, required: true, trim: true, maxlength: 120 },
email: { type: String, trim: true, match: [/.+@.+\..+/, 'Invalid email'] },
```

### Verification
- [ ] Fix shipped
- [ ] `Supplier.create({ gst: 'invalid' })` → ValidationError
- [ ] `Supplier.create({ name: 'x'.repeat(200) })` → ValidationError

---

## Bug #A2-08: KPI strip `lowCount` and `outCount` are computed from current page only — wrong totals displayed

**Severity:** Medium
**Status:** Open
**Assigned:** frontend-coder

### Symptom
On the Inventory page, the "Low Stock" and "Out of Stock" KPI cards show counts that are wrong when the total inventory exceeds the page limit (10 items). The counts reflect only the 10 products visible on the current page, not the full inventory.

### Steps to Reproduce
1. Have 43 products, 8 of which are out of stock
2. Load the Inventory page (page 1, limit 10)
3. Observe "Out of Stock" KPI card shows a number that doesn't match the real out-of-stock count

### Expected
"Out of Stock" KPI = 8 (the actual number across all products)

### Actual
"Out of Stock" KPI = number of out-of-stock products on the current page (0–10), almost certainly wrong.

### Evidence
`client/src/hooks/useInventory.js:128-138`:
```js
const lowCount = products.filter(p => {  // 'products' is only the current page (max 10 items)
  const stock   = parseRupees(p.stock);
  const reorder = parseRupees(p.reorderLevel ?? p.lowStockThreshold);
  return stock > 0 && reorder > 0 && stock <= reorder;
}).length;
const outCount = products.filter(p => parseRupees(p.stock) === 0).length;
```
`products` is the current page array from the server, not the full collection.

### Root Cause Hypothesis
The KPI counts should come from the API's `/products/low-stock` endpoint or a dedicated count endpoint, not from client-side filtering of a paginated result.

### Suggested Fix
In `useInventory.js`, call `fetchLowStock()` separately to get accurate counts. Or add query params to the products API to return filtered counts: `GET /products?count_only=true&stock_status=out`.

### Verification
- [ ] Fix shipped
- [ ] With 8 out-of-stock products and 43 total: Out of Stock KPI = 8 on page 1

---

## Bug #A2-09: `SuppliersPage` `DetailModal` — product price displayed as `undefined` for new-schema products

**Severity:** Medium
**Status:** Open
**Assigned:** frontend-coder

### Symptom
In `SuppliersPage`, the `DetailModal` product list displays `fmtINR(p.price)` for each product. New-schema products (created after the UoM migration) do not have `p.price` — they have `p.pricePerUnit`. The price column will display `₹0.00` or `₹NaN` for all new products.

### Steps to Reproduce
1. Create a product with `pricePerUnit` (not legacy `price` field)
2. Assign it to a supplier
3. Open the Suppliers page → View Details for that supplier → Products tab
4. Observe the "Price" column

### Expected
Price column shows the correct price (e.g. `₹45.00`).

### Actual
Price column shows `₹0.00` or `₹NaN` because `p.price` is undefined for new-schema products.

### Evidence
`client/src/pages/SuppliersPage.jsx:255`:
```jsx
<td className="px-4 py-3 font-bold text-ink dark:text-paper">{fmtINR(p.price)}</td>
```
New-schema products return `pricePerUnit` in the API response, not `price`. The `price` virtual in the Product model requires `pricePerUnit != null`, which is true for new products, but the frontend's `/suppliers/:id/products` response might not include the `price` virtual.

The supplier products endpoint (`supplier.controller.js:96`) selects:
```js
.select('name sku category pricePerUnit stock reorderLevel unit saleByWeight')
```
`price` (a virtual) is NOT in the select projection, so it won't be serialised.

### Root Cause Hypothesis
`SuppliersPage.jsx:255` was not updated to use `p.pricePerUnit ?? p.price` after the UoM migration. And the supplier products controller's `.select()` does not include `pricePerUnit` in the legacy projection was not updated.

### Suggested Fix
Change `SuppliersPage.jsx:255` to:
```jsx
{fmtINR(p.pricePerUnit ?? p.price)}
```

### Verification
- [ ] Fix shipped
- [ ] Supplier detail modal Products tab shows correct price for new-schema products

---

## Bug #A2-10: `SuppliersPage` `DetailModal` — stock status check uses legacy `lowStockThreshold` (always wrong for new products)

**Severity:** Medium
**Status:** Open
**Assigned:** frontend-coder

### Symptom
In `SuppliersPage.DetailModal`, the `getStockStatus` function uses `p.lowStockThreshold` to determine low-stock status. New-schema products use `p.reorderLevel`. All new products appear as "OK" even when they are low on stock.

### Steps to Reproduce
1. Create a product with `reorderLevel: 10, stock: 5` (should be "low")
2. Assign to a supplier
3. Open Suppliers page → View Details → Products tab
4. The status shows "OK" instead of "Low"

### Expected
Status shows "Low" for products with stock <= reorderLevel.

### Actual
`p.lowStockThreshold` is `undefined` for new products, so `p.stock <= p.lowStockThreshold` evaluates to `5 <= undefined` = `false`. All new products show "OK".

### Evidence
`client/src/pages/SuppliersPage.jsx:189-193`:
```js
const getStockStatus = (p) => p.stock === 0
  ? { label: 'Out', ... }
  : p.stock <= p.lowStockThreshold  // ← uses legacy field name
    ? { label: 'Low', ... }
    : { label: 'OK', ... };
```
The supplier products API response includes `reorderLevel`, not `lowStockThreshold`.

### Suggested Fix
```js
const getStockStatus = (p) => {
  const stock   = parseFloat(p.stock)   || 0;
  const reorder = parseFloat(p.reorderLevel ?? p.lowStockThreshold) || 0;
  if (stock === 0) return { label: 'Out', color: '...' };
  if (reorder > 0 && stock <= reorder) return { label: 'Low', color: '...' };
  return { label: 'OK', color: '...' };
};
```

### Verification
- [ ] Fix shipped
- [ ] Product with stock=5, reorderLevel=10 shows "Low" in supplier detail

---

## Bug #A2-11: `StockAdjustment.model.js` has same Mongoose 9 `pre('validate')` hook crash as Product model

**Severity:** High
**Status:** Open
**Assigned:** backend-coder

### Symptom
`StockAdjustment.model.js` contains the same `function(next)` style pre-validate hook that crashes in Mongoose 9. Any future code that creates a `StockAdjustment` with `reason: 'other'` will crash with `next is not a function`.

### Steps to Reproduce
Static code analysis (currently masked by A2-04 since the endpoint doesn't exist).

### Expected
`StockAdjustment.create({ reason: 'other', reasonDetail: 'test adjustment', ... })` → 201

### Actual
Would throw: `TypeError: next is not a function` at `StockAdjustment.model.js:94`

### Evidence
`server/src/models/StockAdjustment.model.js:87-95`:
```js
stockAdjustmentSchema.pre('validate', function (next) {  // ← same broken pattern
  if (this.reason === 'other') {
    const detail = (this.reasonDetail || '').trim();
    if (detail.length < 3) {
      return next(new Error("reasonDetail is required..."));
    }
  }
  next();  // ← crashes in Mongoose 9
});
```

### Suggested Fix
Same fix as A2-01 — convert to async form:
```js
stockAdjustmentSchema.pre('validate', async function () {
  if (this.reason === 'other') {
    const detail = (this.reasonDetail || '').trim();
    if (detail.length < 3) {
      throw new Error("reasonDetail is required (min 3 chars) when reason is 'other'");
    }
  }
});
```

### Verification
- [ ] Fix shipped
- [ ] `StockAdjustment.create({ reason: 'other', reasonDetail: 'ab', ... })` → ValidationError
- [ ] `StockAdjustment.create({ reason: 'other', reasonDetail: 'abc', ... })` → 201

---

## Bug #A2-12: `StockModal` in `InventoryPage` — minimum quantity is hardcoded to 1, cannot do sub-unit adjustments for weight products

**Severity:** Low
**Status:** Open
**Assigned:** frontend-coder

### Symptom
The "Adjust Stock" modal (`StockModal`) has `min={1}` and `onChange={e => setQty(Math.max(1, Number(e.target.value)))}`, forcing a minimum of 1 unit. For weight-based products (kg, l), this means users cannot adjust stock by 0.5 kg or 250 ml — only whole units can be adjusted via this modal.

### Steps to Reproduce
1. Open Inventory page for a `kg` (saleByWeight=true) product
2. Click Adjust Stock
3. Try to enter 0.5 (half a kilogram)
4. The field snaps to 1

### Expected
For weight units, decimal adjustments (e.g. 0.5 kg, 0.250 l) should be allowed.

### Actual
Minimum is enforced at 1 for all units. `Math.max(1, Number(e.target.value))` converts 0.5 to 1.

### Evidence
`client/src/pages/InventoryPage.jsx:729-730`:
```jsx
<input type="number" min={1} value={qty}
  onChange={e => setQty(Math.max(1, Number(e.target.value)))}
```

### Suggested Fix
Use the product's `UNIT_STEP` for `min` and remove the `Math.max(1, ...)` clamp for weight units:
```jsx
const unitStep = UNIT_STEP[product.unit] || 1;
const minQty   = isWeightUnit(product.unit) ? unitStep : 1;
// ...
<input type="number" min={minQty} step={unitStep} value={qty}
  onChange={e => setQty(Math.max(minQty, Number(e.target.value)))}
```

### Verification
- [ ] Fix shipped
- [ ] For a kg product: entering 0.5 in Adjust Stock modal → accepted, not snapped to 1

---

## Summary

| # | Title | Severity | Assigned |
|---|-------|----------|----------|
| A2-01 | `pre('validate')` hook crashes — ALL product creates broken (Mongoose 9 incompatibility) | **Critical** | backend-coder |
| A2-04 | `POST /stock-adjustments` route missing — Stock In modal always 404s | **Critical** | backend-coder |
| A2-02 | Staff role can mutate products — no `authorize()` guard on product routes | **High** | backend-coder |
| A2-03 | `stock_status` filter applied in-memory after pagination — wrong results, wrong total | **High** | backend-coder |
| A2-05 | Frontend sends `reason: 'manual'` which is not in `StockAdjustment` REASON_ENUM | **High** | backend-coder |
| A2-11 | `StockAdjustment.model.js` same Mongoose 9 pre-validate crash | **High** | backend-coder |
| A2-06 | `/products/low-stock` returns products with `reorderLevel=0` — false alerts | **Medium** | backend-coder |
| A2-07 | `Supplier.model.js` has no schema-level validation — Zod bypass writes corrupt data | **Medium** | backend-coder |
| A2-08 | KPI strip `lowCount`/`outCount` computed from current page only — wrong totals | **Medium** | frontend-coder |
| A2-09 | Supplier detail modal shows `p.price` (undefined for new products) — price column broken | **Medium** | frontend-coder |
| A2-10 | Supplier detail modal uses `p.lowStockThreshold` — all new-schema products show "OK" | **Medium** | frontend-coder |
| A2-12 | Adjust Stock modal: `min=1` hardcoded — sub-unit weight adjustments impossible | **Low** | frontend-coder |

**Total: 12 bugs — 2 Critical, 4 High, 5 Medium, 1 Low**

---

## Working Flows Verified

- Auth: `protect` middleware works correctly (401 on missing/invalid token)
- Auth: `authorize` middleware works correctly (403 on wrong role)
- `GET /products` pagination — correct meta structure, limit respected
- `GET /products?q=` search — works
- `GET /products/by-barcode/:code` — 404 on missing barcode, correct
- `GET /products/:id` with invalid ObjectId — correct 400
- Product validator: negative price, zero price, decimal stock on pcs, bad HSN, bad unit, duplicate SKU, name > 120 chars, bad gstRate — all correctly rejected
- Supplier validator: missing name, short GSTIN, lowercase GSTIN, invalid email — all correctly rejected
- `DELETE /suppliers/:id` with linked products — correctly returns 409
- Supplier CRUD (accessible with admin/manager role): all endpoints return correct status codes
- `/products/reorder-report` — returns 200 with grouped data
- `PATCH /products/:id/stock` for saleByWeight=true product: allows stock to go negative (correct per spec §2.3)
- `PATCH /products/:id/stock` for pcs product: over-decrease correctly returns 400

## Recommendation

**Hold — do not ship.**

Two Critical bugs block core workflows: no product can be created (A2-01) and the Stock In Purchase modal silently does nothing (A2-04). Fix A2-01 first (one-line async hook change in two model files), then A2-04 (route wiring). The High-severity authz bug (A2-02) should also be resolved before production as it allows any registered user to delete all inventory.
