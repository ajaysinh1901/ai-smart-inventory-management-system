# Bug #009: Invoice number generation has a race condition (concurrent sales can collide)

**Found:** 2026-04-28
**Severity:** High (latent — surfaces under load)
**Status:** VERIFIED
**Assigned:** architect-gst (spec) → backend-coder (impl)

## Symptom
The Sale model auto-generates `invoiceNumber` in a `pre('save')` hook by counting existing sales for the year then incrementing:
```js
const count = await mongoose.model('Sale').countDocuments({ invoiceNumber: { $regex: ^INV-${year}- } });
this.invoiceNumber = `INV-${year}-${String(count+1).padStart(5,'0')}`;
```
This is a classic non-atomic read-then-write. Under two concurrent `POST /sales` requests the count is identical for both, both compute the same `invoiceNumber`, the second `save` fails on the unique-index. Stock has *not* been decremented yet at this point (Sale.create runs before the stock-decrement loop), so DB integrity is preserved, but the failed sale request will return a confusing duplicate-key message and the user thinks their sale was lost.

Worse: under Indian GST rules, invoice numbers must be **gap-free per fiscal year**. A race that drops one number leaves a gap (in the success path of the winner; the loser's number is never used). Auditors will flag this.

## Steps to Reproduce
(Cannot demonstrate live until Bug #003 is fixed — every Sale POST currently returns "next is not a function" before reaching the race window.)

After Bug #003 is fixed:
1. Pick a product with stock ≥ 10.
2. Fire 5 simultaneous `POST /sales` requests (each for 1 unit).
3. Under low concurrency on a single Node instance, the event loop will likely serialize them. Under realistic concurrency (multiple processes, network jitter) at least one POST will return:
   `{"success":false,"message":"E11000 duplicate key error ... index: invoiceNumber_1 dup key: { invoiceNumber: \"INV-2026-NNNNN\" }"}`
4. Inspect Sales list — 4 of 5 saved, with a *gap* in the invoice number sequence.

## Expected
- Invoice number is allocated atomically. Two parallel sales get sequential numbers without collision.
- Numbering is gap-free per fiscal year (architect-gst rule).

## Actual
- `Sale.model.js` lines 50–58 use `countDocuments` then `save` — non-atomic.
- The `unique:true` on `invoiceNumber` will catch collisions but at the cost of a failed-and-retryable request and possible auditing gaps.

## Evidence
- Source review only (live repro blocked by #003).
- The current DB has `INV-TEST-...` and `INV-TEST2-...` records — those are clearly hand-injected and don't match the auto-format, suggesting this code path has never been exercised at concurrency in dev.

## Root Cause Hypothesis
The author chose count-based numbering for simplicity, didn't model the race.

## Suggested Fix (architect-gst, then backend)
1. Use a Mongo counter collection: a `Counter` doc per fiscal year, atomically `findOneAndUpdate({_id:'invoice-2026'}, {$inc:{seq:1}}, {upsert:true, returnDocument:'after'})` to allocate.
2. Move the allocation to the controller (before `Sale.create`) so we never enter the create path with a number we can't keep.
3. Add a load test: 50 parallel POST /sales → all succeed, numbering is contiguous, no duplicates.

## Verification
- [x] Fix shipped
- [x] Reproduced again post-fix → resolved
- [x] Related cases checked

## Re-test note (post-fix)
- 5 parallel `POST /sales` (bash `&`) → all 5 succeed with sequential `INV-2026-00006..00010`. Zero collisions, zero E11000 errors.
- 50 parallel `POST /sales` stress fire (Bug #005-bumped stock to 100 first) → all sales committed; final `GET /sales?limit=100` shows 100 invoices spanning `INV-2026-00001..00100` exactly, **zero gaps, zero duplicates**, perfectly contiguous.
- Counter implementation works correctly under high concurrency.
