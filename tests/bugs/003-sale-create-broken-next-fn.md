# Bug #003: ALL Sale creations fail with "next is not a function"

**Found:** 2026-04-28
**Severity:** Critical
**Status:** VERIFIED
**Assigned:** backend-coder

## Symptom
Every `POST /api/v1/sales` call — minimal payload, full payload, with or without GST — returns HTTP 400 with body `{"success":false,"message":"next is not a function"}`. The single most important business flow (creating a sale + invoice) is **100% broken** end-to-end.

## Steps to Reproduce
1. Login as admin and capture cookie.
2. POST a minimal valid sale:
   ```
   curl -b admin.cookie -X POST http://localhost:5000/api/v1/sales \
     -H "Content-Type: application/json" \
     -d '{"customer":{"name":"X"},"items":[{"productId":"<any valid product id>","quantity":1,"unitPrice":1}]}'
   ```
3. Observe: `{"success":false,"message":"next is not a function"}` — HTTP 400.
4. Try with full payload (gst, discount, taxRate) — same error.
5. Try with just `{"items":[{...}]}` — same error.

## Expected
- HTTP 201 with `{success:true, data:{...sale with auto-generated invoiceNumber...}}`
- Stock decremented, OUT transaction created, sale persisted.

## Actual
- HTTP 400 every time, generic "next is not a function" message.
- A direct `Sale.create(...)` from `node -e ...` against the same DB succeeds and generates an `INV-2026-NNNNN` invoice. So the model itself is fine; the failure is somewhere on the request path.

## Evidence
- Live: `curl ... POST /sales` → reproduced 4+ times with different payloads, always same message.
- Direct script: `node -e "const Sale=require('./src/models/Sale.model'); ...Sale.create(...)"` → success, invoice INV-2026-00001 created.
- Sales list `GET /sales?limit=1` confirms the direct-Node sale was saved while every HTTP call failed.
- Server uptime ~2200s; sale.controller.js and Sale.model.js both saw mtimes after the server started, suggesting **the running process may be holding a stale require'd version** of the controller/model.

## Root Cause Hypothesis
1. **Most likely:** the running Node process loaded an older version of `sale.controller.js` or `Sale.model.js` that had a `pre('save', function(next) {... next() })`-style hook (or middleware-as-callback signature) that no longer matches the current code. The current files on disk are clean — but the process still has the old module cached. **Restart the server** as the first remediation step.
2. **Possible secondary:** if restart doesn't fix it, look for a `populate(..., callback)` style call anywhere in the chain. Mongoose 9 dropped callback support; calling `.populate('x', 'y', callback)` will throw "next is not a function" or similar.

## Suggested Fix
1. Stop the running server, run `node src/server.js` fresh, retry. If green → file follow-up to ensure dev workflow uses nodemon or hot-reload to avoid stale code.
2. If still red after restart, grep the server source for `function(next)` and `populate(..., function`.

## Verification
- [x] Fix shipped (server restarted and/or callback-style code removed)
- [x] Reproduced again post-fix → resolved
- [x] Related cases checked

## Re-test note (post-fix)
- 3 different payloads: minimal, full GST, multi-item — all return 201 with sequential invoiceNumbers (`INV-2026-00003`, `INV-2026-00004`, `INV-2026-00005`).
- GST math correct (e.g. subtotal 200, discount 5, tax 35.10, total 230.10).
- Stock decremented (HEE went from 50 → 44 across the 3 sales — 6 units consumed). OUT transaction creation visible.

## Note for follow-up cleanup
The DB currently contains 2 test sales with hand-crafted invoice numbers (`INV-TEST-...`, `INV-TEST2-...`) and negative totals. These pollute the dashboard's revenue chart (it shows "Today's Revenue: -₹82.6"). They should be deleted when the underlying bug #004 is also fixed.
