# SmartStock AI — Phase 1 QA Consolidated Report
**Date:** 2026-05-19
**Method:** 5 parallel QA agents, live + API testing, ~400 test assertions total
**Verdict:** ❌ HOLD — do not ship. 6 critical issue clusters block production.

---

## Score
| Severity | Count (deduped) |
|----------|-----------------|
| Critical | 6 |
| High     | 18 |
| Medium   | 13 |
| Low      | 4 |
| **Total**| **~41 unique** |

Prior 11 bug reports (001–011): **all verified FIXED.** Regression suite 22/22 PASS.

---

## CRITICAL — must fix first (app is non-functional)

### C1 — Mongoose 9 pre-hook crash (4 models)
`function(next)` sync pre-hooks no longer receive `next` in Mongoose 9.3.1 / kareem 3.
Calling `next()` throws `TypeError: next is not a function`.
- `server/src/models/Product.model.js:139` → **no product can be created** (A2-01/A3-01/A4-01)
- `server/src/models/Settings.model.js:100` → **settings/workspace/onboarding all 500** (A1-01)
- `server/src/models/KhataEntry.model.js:43` → credit entries crash (A3-01)
- `server/src/models/StockAdjustment.model.js:87` → stock adjustments crash (A2-11)
**Fix:** convert hooks to `async function()` + `throw` instead of `next(err)`.

### C2 — Stock-In workflow points at a non-existent route
`InventoryPage.jsx` posts to `/api/v1/stock-adjustments` — route never registered.
`inventory.routes.js`, `inventory.controller.js`, `inventory.service.js` are **empty 0-byte files**. (A2-04)

### C3 — Credit (khata) sales always crash
`khata.service.js:16` `supportsTransactions()` mis-detects standalone MongoDB; tries
`session.withTransaction()` → MongoDB rejects → every credit sale & khata payment 500. (A3-02)

### C4 — Every printed invoice shows ₹0 CGST/SGST
`SalesPage.jsx` InvoiceModal reads `sale.gst.cgstAmount` / `item.cgstAmount` — wrong field
names. API stores `items[].cgst` / `items[].sgst`. Invoices are not legally valid. (A3-03)

### C5 — Gemini API key exposed in plaintext
`server/.env:5` holds a live `AIzaSy...` key; no `server/.gitignore`. **Rotate the key.** (SEC-001)

### C6 — Cross-account data exposure
`GET /sales`, `/transactions`, `/products`, `/analytics` have no `userId` scoping — any
account reads every other account's invoices, customers, revenue. Fix scope depends on the
tenancy decision below. (SEC-002, related A1-08)

---

## HIGH (18)
A1-02 settings validator missing `profile` section · A1-03 AI-config validator rejects all 3 real Gemini model IDs · A1-04 validator drops GSTIN/state/UPI/pin silently · A1-08 DELETE /sample-packs deletes ALL users' samples · A1-10/A1-11 Settings AI + Workspace sections non-functional / false success toast · A2-02 staff role can delete all products (no `authorize`) · A2-03 stock_status filter applied after pagination · A2-05 `reason:'manual'` not in StockAdjustment enum · A3-04 `discount` field silently ignored · A4-02 OCR save silent 0-processed for SKU-less items · A4-03 OCR `lineItems` vs `items` key mismatch · A4-04 analytics returns Decimal128 objects → charts render zero · A4-05 stockHealth double-counts products · A4-06 sales/report Decimal128 → KPI shows `[object Object]` · A4-07 ai/trends revenue $0 (`$sum` on virtual) · A4-08 ai/predict & ai/reorder 500 leak CastError · A4-09 smartAlerts cron severity enum mismatch → alerts never persist.

## MEDIUM (13)
A1-05 workspace.controller no try/catch · A1-06 ambiguous 429 message · A1-07 onboarding localStorage off-by-one (wizard never exits) · A2-06 low-stock false alerts when stock=0 & reorderLevel=0 · A2-07 Supplier model no schema validation · A2-08 inventory KPI counts current page only · A2-09 SuppliersPage uses undefined `p.price` · A2-10 SuppliersPage stock status uses legacy field · A3-05 zero-qty sale line accepted · A3-06 null price → opaque error · A4-10 shrinkage bad-date 500 leak · A4-11 Dashboard "GST This Month" always 0 · A4-12 AiInsightsPage infinite spinner on error · SEC-003 JWT 30d vs cookie 7d · SEC-004 CORS allows any localhost · SEC-006 3 smoke suites fail (axios devDep missing) · SEC-007 raw JWT in response body.

## LOW (4)
A1-09 User model default role mismatch · A2-12 adjust-stock min qty hardcoded 1 · A4-13 ScannerPage hardcoded fake recent scans · SEC-005 AI-chat limiter before validate · SEC-008 no rate limit on write endpoints.

---

## Per-agent reports
- `A1-auth-onboarding-settings.md`
- `A2-inventory-products-suppliers.md`
- `A3-sales-billing-gst.md`
- `A4-dashboard-analytics-ai-ocr.md`
- `A5-regression-security.md`
