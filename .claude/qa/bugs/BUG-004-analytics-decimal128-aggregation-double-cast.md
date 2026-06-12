# Bug #004: Analytics Aggregation Casts Decimal128 to Double — Floating-Point Drift on Large Inventories

**Found:** 2026-04-29
**Severity:** High
**Status:** Open
**Assigned:** backend-coder

## Symptom

In `getSalesReport` and `getProfitAnalysis`, aggregation results that return
Decimal128 revenue figures are then processed with `.toFixed(2)` called directly
on a JavaScript value that may be a Decimal128 object, not a Number:

```js
// analytics.controller.js lines 125-128
const dailySalesPattern = dailyPattern.map((d) => ({
  avgRevenue: parseFloat(d.avgRevenue.toFixed(2)),   // d.avgRevenue is Number (from $avg of $total which is null) — currently zero, but after fix this will be Decimal128
  totalRevenue: parseFloat(d.totalRevenue.toFixed(2)), // same issue
```

Additionally, the `dashboard` aggregation correctly uses:
```js
const totalInventoryValue = valueAgg[0]?.totalValue?.toString() || '0';
```
But sales aggregations in `getSalesReport` use `parseFloat(... .toFixed(2))` which
will fail or lose precision when the aggregate result is Decimal128.

## Steps to Reproduce

After BUG-002 is fixed (replacing `$total` with `$grandTotal`), the aggregation
returns Decimal128 objects. The subsequent `.toFixed(2)` call on a Decimal128
object will throw `TypeError: d.avgRevenue.toFixed is not a function` because
Decimal128 objects do not have `.toFixed()`.

## Expected

Sales revenue aggregation results should be serialized as strings (matching the
Decimal128-first pattern used in `getDashboardStats`), or cast via
`Number(d.toString())` before calling `.toFixed(2)`.

## Actual

The code assumes `d.avgRevenue` is a JavaScript Number (which it was when `$total`
was a Number virtual). After fixing BUG-002, it becomes Decimal128, and
`.toFixed()` will throw.

## Root Cause Hypothesis

The analytics controller was only partially updated for the Decimal128 migration.
The dashboard stat (`totalInventoryValue`) was updated to use `.toString()`, but
the pattern was not propagated to the chart aggregation formatters in
`getSalesReport` and `getProfitAnalysis`.

## Suggested Fix

For each aggregation result that produces a Decimal128 revenue figure, wrap with
`Number(d.avgRevenue?.toString() || 0)` before calling `.toFixed(2)`. Or better:
return the Decimal128 values as strings and let the frontend parse them.

Example fix for `dailySalesPattern`:
```js
avgRevenue: parseFloat(Number(d.avgRevenue?.toString() || 0).toFixed(2)),
totalRevenue: parseFloat(Number(d.totalRevenue?.toString() || 0).toFixed(2)),
```

Or use `$toDouble` in the aggregation pipeline to coerce at the DB level:
```js
avgRevenue: { $avg: { $toDouble: '$grandTotal' } }
```

## Severity

High. This bug is latent — it will throw a 500 error on the `/analytics/sales`
and `/analytics/profit` endpoints immediately after BUG-002 is fixed, because
fixing the field names will return Decimal128 where Number is expected. Even
without BUG-002, the bug may surface if any sale stores `grandTotal` as Decimal128
and the aggregation somehow returns it (Decimal128 type promotion in $sum).

## Verification

- [ ] Fix shipped (must happen with BUG-002 fix, same PR)
- [ ] GET /analytics/sales returns 200 (not 500) with correct numeric values
- [ ] dailySalesPattern.avgRevenue is a number with 2 decimal places
- [ ] No "toFixed is not a function" errors in server logs
