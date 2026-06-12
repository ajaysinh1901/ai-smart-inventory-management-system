# Bug #002: Analytics Controller Uses Stale Field Names — All Revenue Aggregations Return Zero

**Found:** 2026-04-29
**Severity:** Critical
**Status:** Open
**Assigned:** backend-coder

## Symptom

The analytics endpoints (`/analytics/sales`, `/analytics/profit`) return zero for
all revenue-based metrics. `totalRevenue`, `avgOrderValue`, `totalTax`, and
`totalDiscount` in the sales and profit reports are always 0 or null, even when
sales exist. The sales-by-month, daily-pattern, and revenue-trend charts are
empty/zeroed.

## Steps to Reproduce

1. Create any sale via `POST /sales`.
2. Hit `GET /analytics/sales` — `totalRevenue` is 0.
3. Hit `GET /analytics/profit` — `totalRevenue` is 0, `totalTax` is 0.

Can be verified without a live server:
```js
const Sale = require('./server/src/models/Sale.model');
const storedPaths = Object.keys(Sale.schema.paths);
console.log('total in paths:', storedPaths.includes('total'));     // false — it's a virtual
console.log('taxAmount in paths:', storedPaths.includes('taxAmount')); // false — virtual
console.log('grandTotal in paths:', storedPaths.includes('grandTotal')); // true — stored field
```

## Expected

- `totalRevenue` = sum of `grandTotal` across completed sales
- `totalTax` = sum of `taxTotal` across sales
- The field `discount` = 0 for all new sales (stored field, but new sales don't set it to non-zero)

## Actual

All revenue aggregations in `analytics.controller.js` reference `$total`,
`$taxAmount`, and `$discount` in MongoDB aggregation `$sum`/`$avg` expressions.
These are Mongoose **virtual** fields. Aggregation pipelines run directly in MongoDB
and cannot see virtual fields — MongoDB returns `null` for any field reference that
does not exist in the stored document. `$sum` of nulls = 0.

## Evidence

In `server/src/controllers/analytics.controller.js`:
- Line 80:  `totalRevenue: { $sum: '$total' }`        — should be `'$grandTotal'`
- Line 82:  `avgOrderValue: { $avg: '$total' }`        — should be `'$grandTotal'`
- Line 114: `avgRevenue: { $avg: '$total' }`           — should be `'$grandTotal'`
- Line 115: `totalRevenue: { $sum: '$total' }`         — should be `'$grandTotal'`
- Line 135: `totalRevenue: { $sum: '$total' }`         — should be `'$grandTotal'`
- Line 137: `avgOrderValue: { $avg: '$total' }`        — should be `'$grandTotal'`
- Line 138: `totalDiscount: { $sum: '$discount' }`     — `$discount` IS stored but always 0 for new sales (acceptable)
- Line 139: `totalTax: { $sum: '$taxAmount' }`         — should be `'$taxTotal'`
- Line 225: `totalRevenue: { $sum: '$total' }`         — should be `'$grandTotal'`
- Line 226: `totalSubtotal: { $sum: '$subtotal' }`     — `$subtotal` IS stored (Decimal128), OK
- Line 227: `totalTax: { $sum: '$taxAmount' }`         — should be `'$taxTotal'`
- Line 228: `totalDiscount: { $sum: '$discount' }`     — stored, always 0
- Line 247: `revenue: { $sum: '$total' }`              — should be `'$grandTotal'`

Additional stale field references for sale line items:
- Line 102: `revenue: { $sum: '$items.subtotal' }`     — should be `'$items.lineSubtotal'`
- Line 103: `quantity: { $sum: '$items.quantity' }`    — should be `'$items.qty'`
- Line 268: `totalRevenue: { $sum: '$items.subtotal' }` — should be `'$items.lineSubtotal'`
- Line 269: `totalQuantity: { $sum: '$items.quantity' }` — should be `'$items.qty'`

Proof that `total` is a virtual, not a stored field:
```
node -e "
const Sale = require('./server/src/models/Sale.model');
console.log(Object.keys(Sale.schema.virtuals));
// Output: [ 'total', 'taxAmount', 'taxRate', 'id' ]
// All of these are JS-computed virtuals, never in MongoDB storage
"
```

## Root Cause Hypothesis

The Sale schema was refactored from old Number fields (`total`, `taxAmount`) to new
Decimal128 fields (`grandTotal`, `taxTotal`) in chunk #3 of the build. The Sale model
added virtuals to preserve backward compat for JavaScript consumers (`.total` works
when you access a Sale document in Node). However, the analytics controller was not
updated to use the new stored field names, so its MongoDB aggregation pipelines still
reference the old names. Because aggregations run in MongoDB server-side, virtual
fields are invisible.

## Suggested Fix

In `server/src/controllers/analytics.controller.js`:
1. Replace every `'$total'` with `'$grandTotal'`
2. Replace every `'$taxAmount'` with `'$taxTotal'`
3. Replace every `'$items.subtotal'` with `'$items.lineSubtotal'`
4. Replace every `'$items.quantity'` with `{ $toDouble: '$items.qty' }` (qty is Decimal128)

Note: `grandTotal` and `taxTotal` are Decimal128, so `$sum` will return Decimal128.
The result must be serialized to string or converted via `$toDouble` before returning
to the frontend.

## Severity Justification

Critical because:
1. The Dashboard `totalInventoryValue` actually works correctly (uses `$pricePerUnit`
   from the chunk #2 migration — that was fixed). But all **Sales** analytics are dead.
2. A store owner can create sales all day and see ₹0 revenue on their dashboard — they
   will immediately distrust the product and churn.
3. Month-on-month trend chart, daily pattern, top products by revenue — all show zeros.

## Verification

- [ ] Fix shipped
- [ ] GET /analytics/sales after creating a ₹500 sale → totalRevenue >= 500
- [ ] GET /analytics/profit → totalRevenue matches sum of grandTotal in Sale collection
- [ ] Revenue trend chart (last 7 days) shows actual revenue bars
- [ ] salesByCategory shows revenue values
- [ ] topProductsByRevenue shows actual revenue per product
