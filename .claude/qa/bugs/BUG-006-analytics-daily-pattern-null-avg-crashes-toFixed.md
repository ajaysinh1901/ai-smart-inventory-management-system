# Bug #006: Analytics dailySalesPattern Crashes — null.toFixed() When Sales Have No grandTotal

**Found:** 2026-04-29
**Severity:** High
**Status:** Open
**Assigned:** backend-coder

## Symptom

After the BUG-002 fix (`$total` → `$grandTotal`), the `GET /analytics/sales`
endpoint throws a 500 error when the database contains sales that were created
with the old schema (i.e., sales that have `total` but not `grandTotal`). The
crash is:

```
TypeError: Cannot read properties of null (reading 'toFixed')
```

## Steps to Reproduce

1. Have any sales in the DB created by the old sale controller (no `grandTotal` field).
2. Restart the server so the new analytics.controller.js is loaded.
3. `GET /api/v1/analytics/sales`

Can be reproduced without a server restart (tested against raw aggregation):

```js
const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/MERNDB').then(async () => {
  const db = mongoose.connection.db;
  const dailyPattern = await db.collection('sales').aggregate([
    {
      $group: {
        _id: { $dayOfWeek: '$createdAt' },
        avgRevenue: { $avg: { $toDouble: '$grandTotal' } },
        totalRevenue: { $sum: { $toDouble: '$grandTotal' } },
        count: { $sum: 1 },
      },
    },
  ]).toArray();

  const d = dailyPattern[0];
  console.log('avgRevenue:', d.avgRevenue);  // null (not 0!)
  console.log(d.avgRevenue.toFixed(2));       // CRASH
});
```

Output:
```
avgRevenue: null
TypeError: Cannot read properties of null (reading 'toFixed')
```

## Expected

- `GET /analytics/sales` returns 200 with `dailySalesPattern[].avgRevenue = 0`
  (or null-safe value) when sales lack `grandTotal`.
- After migration to new-schema sales, returns actual revenue averages.

## Actual

500 error with `"Cannot read properties of null (reading 'toFixed')"` because:
- Old-schema sales have no `grandTotal` field.
- `{ $avg: { $toDouble: '$grandTotal' } }` → `$toDouble(undefined)` → null
  per document → `$avg` of all-nulls → null.
- MongoDB `$sum` of nulls = 0 (safe), but `$avg` of nulls = null (not 0).
- Line 126: `parseFloat(d.avgRevenue.toFixed(2))` — `null.toFixed()` throws.

## Evidence

Direct aggregation test (run above): `avgRevenue: null` confirmed.
All 143 sales in current MERNDB lack `grandTotal` field (old schema).

Affected lines in `analytics.controller.js`:
- Line 126: `avgRevenue: parseFloat(d.avgRevenue.toFixed(2))` — no null guard
- Line 127: `totalRevenue: parseFloat(d.totalRevenue.toFixed(2))` — safe (`$sum` never null)

Note: `revenueTrend` on line 257 uses `$sum` for `revenue`, so it returns 0 — safe.
`avgOrderValue` on line 152 uses `|| 0` guard — safe.
Only `dailySalesPattern.avgRevenue` is the crash point.

## Root Cause Hypothesis

The BUG-004 fix correctly replaced Decimal128-returning expressions with
`$toDouble` wrappers. However, it did not add a null guard for `$avg` which
returns null (not 0) when all group documents have no `grandTotal` field.
This is a transition-period bug that affects any deployment with mixed old/new
schema sales.

## Suggested Fix

In `analytics.controller.js` at line 126, add null guard:

```js
avgRevenue: parseFloat((d.avgRevenue ?? 0).toFixed(2)),
```

Or coerce in the aggregation pipeline:

```js
avgRevenue: { $avg: { $ifNull: [{ $toDouble: '$grandTotal' }, 0] } },
```

## Severity Justification

High because:
1. This will crash `/analytics/sales` immediately after server restart with the fixed code.
2. Any install where old-schema sales exist (all current installs) will see 500 on the analytics page.
3. Dashboard sales chart will be broken.

## Verification

- [ ] Fix shipped
- [ ] `GET /analytics/sales` returns 200 when DB has only old-schema sales (no grandTotal)
- [ ] `dailySalesPattern[].avgRevenue` is `0.00` (not crash) for old-schema sales
- [ ] `dailySalesPattern[].avgRevenue` shows correct values for new-schema sales
