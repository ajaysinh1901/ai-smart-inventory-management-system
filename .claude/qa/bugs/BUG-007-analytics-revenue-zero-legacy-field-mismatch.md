# Bug #007: Analytics Revenue Returns ₹0 — Legacy Sales Use `total` Field, Not `grandTotal`

**Found:** 2026-04-29
**Severity:** Critical
**Status:** Open
**Assigned:** backend-coder

## Symptom

After the BUG-002 fix was applied (replacing `$total` with `$grandTotal` in analytics
aggregations), all revenue-based analytics metrics return ₹0:

- `GET /api/v1/analytics/sales` → `totalRevenue: 0`, `avgOrderValue: 0`
- `GET /api/v1/analytics/profit` → `totalRevenue: 0`, `totalTax: 0`
- Both `salesByMonth[*].totalRevenue` and `dailySalesPattern[*].totalRevenue` are 0

The dashboard shows 146 orders processed but ₹0 in revenue. This is visible to every
user immediately on login.

## Steps to Reproduce

1. Start `server/src/server.js` with the BUG-002 fix applied (current code on disk).
2. `GET /api/v1/analytics/sales` with a valid admin token.
3. Observe `totalRevenue: 0` despite 146 sales in the database.

Confirm via MongoDB directly:

```js
// In mongosh or node:
db.sales.aggregate([
  { $group: { _id: null,
    byGrandTotal: { $sum: { $toDouble: '$grandTotal' } },  // → 0
    byTotal:      { $sum: { $toDouble: '$total' } },        // → 9651281.85
    count: { $sum: 1 }
  }}
])
```

Output:
```
[{ _id: null, byGrandTotal: 0, byTotal: 9651281.85, count: 146 }]
```

## Expected

`GET /api/v1/analytics/sales` returns `totalRevenue` reflecting all 146 sales
(approximately ₹9,651,282).

## Actual

`totalRevenue: 0` and `avgOrderValue: 0` across all analytics endpoints.
`totalOrders: 146` is correct (uses `$sum: 1`), making the discrepancy obvious.

## Evidence

```
Field audit of sales collection:
  Total sale docs:             146
  Docs with 'grandTotal' field:  2  (new-schema sales created on 2026-04-29)
  Docs with 'total' field:     144  (all seed/legacy sales)

Aggregation:
  $toDouble '$grandTotal' → 0      (null for 144/146 docs)
  $toDouble '$total'      → 9651281.85  (correct, covers all legacy docs)
```

The BUG-002 fix correctly replaced stale field names for future new-schema sales,
but the existing 144 seed documents (created by the legacy controller) stored their
invoice total in the field `total`, not `grandTotal`. The aggregation now misses
all legacy data.

## Root Cause Hypothesis

BUG-002's fix changed analytics aggregations from `$total` → `$grandTotal` to match
the new Sale schema. However, the database is in a **mixed state**: legacy documents
(144) have `total`, new-schema documents (2) have `grandTotal`. The fix is correct
for new documents but breaks all reporting on legacy data.

The fix needs to use `$ifNull` to coalesce both fields:

```js
$toDouble: { $ifNull: ['$grandTotal', '$total'] }
```

Or alternatively, the analytics controller should sum BOTH fields:

```js
totalRevenue: { $sum: { $toDouble: { $ifNull: ['$grandTotal', '$total'] } } }
```

This is a standard mixed-schema migration pattern: always coalesce old+new field
during the transition period, until a migration script backfills `grandTotal` on
all legacy documents.

## Scope

Every `$toDouble: '$grandTotal'` expression in `analytics.controller.js`:

| Line | Field | Fix |
|------|-------|-----|
| 80  | salesByMonth.totalRevenue | `$ifNull: ['$grandTotal', '$total']` |
| 82  | salesByMonth.avgOrderValue | same |
| 114 | dailyPattern.avgRevenue | same |
| 115 | dailyPattern.totalRevenue | same |
| 135 | totalMetrics.totalRevenue | same |
| 137 | totalMetrics.avgOrderValue | same |
| 225 | profit.totalRevenue | same |
| 247 | revenueTrend.revenue | same |

`taxTotal` → `taxAmount` (legacy field): line 139 `$taxTotal` and line 227 `$taxTotal`
may also be zero for legacy docs — needs confirmation (see Note below).

## Note on taxTotal / taxAmount

Legacy sale docs appear to use `taxAmount` (not `taxTotal`). The analytics profit
endpoint shows `totalTax: 0` which supports this. Should also be coalesced:

```js
totalTax: { $sum: { $toDouble: { $ifNull: ['$taxTotal', '$taxAmount'] } } }
```

## Severity Justification

Critical because:
1. Every user sees ₹0 revenue on the dashboard immediately — this looks like a data
   loss bug to the business owner.
2. The `salesByMonth` chart will be flat (all zeros), making historical trending
   useless.
3. `avgOrderValue: 0` also breaks any AI/analytics features that rely on this metric.
4. The bug is fully regression: the analytics reported correctly on the OLD server
   (which still used `$total`). The BUG-002 fix introduced this breakage.

## Suggested Fix

In `server/src/controllers/analytics.controller.js`, replace every:
```js
{ $toDouble: '$grandTotal' }
```
with:
```js
{ $toDouble: { $ifNull: ['$grandTotal', '$total'] } }
```

And every:
```js
{ $toDouble: '$taxTotal' }
```
with:
```js
{ $toDouble: { $ifNull: ['$taxTotal', '$taxAmount'] } }
```

Long-term: write a one-time migration script that adds `grandTotal` and `taxTotal`
fields to all legacy documents so the coalesce is no longer needed.

## Verification

- [ ] Fix shipped
- [ ] `GET /api/v1/analytics/sales` returns `totalRevenue` ≈ ₹9,651,282
- [ ] `dailySalesPattern[*].avgRevenue` are non-zero for all 7 days
- [ ] `salesByMonth` shows non-zero revenue for all 6 months
- [ ] `GET /api/v1/analytics/profit` returns non-zero `totalRevenue` and `totalTax`
- [ ] New-schema sales (with `grandTotal`) are still included correctly
