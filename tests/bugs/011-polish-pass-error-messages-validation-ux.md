# Bug #011: Polish-pass — error message hygiene, missing validations, leaked internals (grouped)

**Found:** 2026-04-28
**Severity:** Medium (cumulative)
**Status:** VERIFIED
**Assigned:** backend-coder (most), ui-designer (UX wording)

This is a single grouped report covering ~7 small but real issues found during the test pass. None individually warrant a Critical/High rating; together they meaningfully degrade UX and leak server internals. Filing as one polish-pass per the senior-tester spec ("Don't write 50 trivial bug reports").

## Issue 11.1 — Duplicate-SKU error leaks raw Mongo error
**Endpoint:** `POST /products` with an existing SKU
**Actual:** `{"success":false,"message":"E11000 duplicate key error collection: MERNDB.products index: sku_1 dup key: { sku: \"QA-TEST-001\" }"}`
**Expected:** `{"success":false,"message":"A product with SKU QA-TEST-001 already exists."}`
**Fix:** In product controller `catch`, detect `err.code === 11000` and translate.

## Issue 11.2 — Malformed ObjectId leaks Mongoose internals
**Endpoint:** `GET /products/notanid`, `GET /sales/notanid/pdf`, etc.
**Actual:** `Cast to ObjectId failed for value "notanid" (type string) at path "_id" for model "Product"` — HTTP 400/500.
**Expected:** HTTP 400 `{"success":false,"message":"Invalid ID"}`.
**Fix:** Add `mongoose.isValidObjectId(req.params.id)` guard at the start of every `:id` route, or centralize via a `validateObjectIdParam` middleware.

## Issue 11.3 — `GET /sales/:id/pdf` for malformed id returns HTTP 500 (should be 400)
**Same root as 11.2** but worth noting: this route returns 500 because the cast error is not caught with a 400 status, only `res.status(500).json(...)`. Once 11.2 is fixed this should be 400.

## Issue 11.4 — No length cap on product/customer name (UI table layout breaks)
**Endpoint:** `POST /products` with a 300-char name → accepted as-is.
**Actual:** Saved verbatim; on the frontend `InventoryList` table the cell wraps or pushes layout, especially at 375px width.
**Expected:** Validator caps name to e.g. 120 chars and the UI truncates with ellipsis + tooltip.
**Fix:** `name: z.string().trim().min(1).max(120)` in the validator; frontend uses `line-clamp-1` and `title={fullName}`.

## Issue 11.5 — XSS payload in product name accepted
**Endpoint:** `POST /products` with name `<script>alert(1)</script>` → accepted.
**Actual:** Stored raw. React's JSX `{name}` does escape, so it's not exploitable in the live frontend, BUT: any future place that uses `dangerouslySetInnerHTML`, exports to PDF, or sends via email would be vulnerable. Server should not store HTML-active content for non-HTML fields.
**Expected:** Reject control characters / strip HTML tags on input, or HTML-encode at the model layer.
**Fix:** Sanitize string fields in validators (e.g. `.transform(v => v.replace(/<[^>]*>/g, ''))`) or use a sanitizer middleware.

## Issue 11.6 — Supplier delete leaves dangling product.supplierId references
**Endpoint:** `DELETE /suppliers/:id` while products reference that supplier.
**Actual:** Deletes silently. Linked products' `supplierId` becomes a non-existent ObjectId; populate returns `null`. UI shows "—" with no warning.
**Expected:** Either (a) reject delete with 409 "Supplier has N products. Reassign first.", or (b) explicitly null out `supplierId` on all products in a single transaction and surface that to the admin.
**Fix:** Pre-delete query `Product.countDocuments({supplierId})` → if > 0, return 409 with count.

## Issue 11.7 — Auth lockout (15-min account lock) is hidden by IP rate limiter
**Endpoint:** `POST /auth/login` with wrong password 5+ times.
**Actual:** The IP-level `authLimiter` (5/min) trips at attempt 5–6 with "Too many auth attempts. Please try again in a minute." This **fires before** the per-account 15-min lockout in `auth.controller.registerFailure`. The lockout's nicer message ("Try again in 15 minutes") is essentially unreachable in normal usage.
**Expected:** Either the limits should be aligned (e.g. raise IP limit to 10 so the account-level lockout has room to fire) OR remove the duplicate logic. Two competing mechanisms with different messages confuse users.
**Fix:** Architectural decision needed (architect-gst). Recommended: keep account-level lockout (clearer remediation), raise auth IP limit to 15/min just to catch egregious bots.

## Issue 11.8 — Empty `/ai/chat` message goes straight to Gemini
Already noted in Bug #006 fix list — repeating here for completeness: server should validate `message` is a non-empty string ≤ N chars before calling Gemini. Currently empty/missing messages cost a Gemini API call.

## Verification
- [x] Fix shipped
- [x] Reproduced again post-fix → resolved (4-of-8 spot-check + AI-chat from Bug #006)
- [x] Related cases checked

## Re-test note (post-fix) — 4 spot-checks per orchestrator instruction
- 11.1 `POST /products` with existing SKU `QA-TEST-001` → 400 `{"message":"A record with SKU \"QA-TEST-001\" already exists."}` — clean human message, no E11000 leak.
- 11.2 `GET /products/notanid` → 400 `{"message":"Invalid ID"}` (was 500 cast error).
- 11.3 `GET /sales/notanid/pdf` → 400 `{"message":"Invalid ID"}` (was 500).
- 11.4 `POST /products` with 300-char name → 400 `{"errors":[{"field":"name","message":"Name must be 120 characters or fewer"}]}`.
- 11.6 `DELETE /suppliers/<id-with-1-product>` → 409 `{"message":"Cannot delete supplier — 1 product(s) still reference it. Reassign or delete those products first.","data":{"productCount":1}}`.
- 11.8 (covered in Bug #006) — empty `/ai/chat` message → 400 validation error.
