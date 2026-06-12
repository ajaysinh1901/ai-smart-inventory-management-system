# Bug #005: Stock can go arbitrarily negative via PATCH /products/:id/stock

**Found:** 2026-04-28
**Severity:** High
**Status:** VERIFIED
**Assigned:** backend-coder

## Symptom
The `PATCH /api/v1/products/:id/stock` endpoint with `{"type":"decrease","quantity":N}` blindly subtracts `N` from the current stock with no lower bound. A single request can drive a 12-unit product to -99,982. There is also no atomic guard, so the same flaw exposes a TOCTOU race under concurrent decrement.

## Steps to Reproduce
1. Pick any product (e.g. id `69ba8da8cafef6f51eb0acc6`, current stock 12).
2. Send:
   ```
   curl -b admin.cookie -X PATCH http://localhost:5000/api/v1/products/<id>/stock \
     -H "Content-Type: application/json" \
     -d '{"type":"decrease","quantity":99999}'
   ```
3. Observe response: `success:true`, `data.stock: -99987` (or similar).
4. Reload Inventory page → product shows negative stock.

## Expected
- HTTP 400 if `quantity > currentStock` with message "Insufficient stock. Available: <n>".
- Or, an atomic `findOneAndUpdate({_id, stock:{$gte:quantity}}, {$inc:{stock:-quantity}})` that returns null when no update happens, then 400.

## Actual
- `product.controller.updateStock` reads stock, subtracts, saves. No bounds check, no atomicity.
- `Transaction.createTransaction` correctly rejects OUT > stock, but this PATCH bypasses the transaction route entirely.

## Evidence
- Live test: stock 12 → request decrease 99999 → result stock -99987. Confirmed.
- Source: `server/src/controllers/product.controller.js` lines 67–77.
- Validator only checks `quantity > 0`, not `quantity ≤ stock`.

## Root Cause Hypothesis
The author treated `updateStock` as a simple admin override, forgetting the `decrease` branch needs the same insufficient-stock guard that `createTransaction` has.

## Suggested Fix
- In `updateStock`, before saving, if `type === 'decrease' && quantity > product.stock` → return 400.
- Or unify with the transaction controller logic (decrementing stock should always go through `createTransaction`).
- Use atomic Mongo update with conditional filter to also close the concurrency window.

## Verification
- [x] Fix shipped
- [x] Reproduced again post-fix → resolved
- [x] Related cases checked

## Re-test note (post-fix)
- `PATCH /products/<HEE id>/stock {type:"decrease", quantity:99999}` on a 44-stock product → 400 `{"message":"Insufficient stock. Available: 44"}`.
- Subsequent `GET /products/<HEE id>` confirms stock unchanged at 44 (no negative).
- Sale path also enforces `Insufficient stock for "HEE". Available: 0` once drained — both paths bounded.
