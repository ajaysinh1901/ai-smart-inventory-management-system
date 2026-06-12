# SmartStock AI — Final QA & Deploy-Readiness Report
**Date:** 2026-05-19
**Scope:** Full multi-agent QA across all modules — auth, onboarding, settings, inventory,
products, suppliers, sales/billing/GST, dashboard, analytics, AI, OCR, scanner, khata.
**Method:** 5-agent discovery → 4-agent coordinated fixes → 3-agent re-test → Round 2 fixes.

---

## Verdict: ✅ READY TO DEPLOY — after 2 manual owner actions (see §4)

All 6 critical issue clusters and the high-severity functional bugs are fixed and
re-verified live. Two items remain that **only the repo owner can do** (rotate a
leaked API key, set one env var) — they are not code changes and block nothing else.

---

## 1. Score progression

| Phase | Critical | High | Medium | Low | Status |
|-------|----------|------|--------|-----|--------|
| Phase 1 discovery | 6 | 18 | 13 | 4 | ❌ HOLD |
| After Phase 2 fixes | 0 | ~2 | ~6 | 4 | 🟡 re-test |
| After Round 2 + re-test | 0 | 0 | low residual | low | ✅ SHIP |

Round 2 verification: **7/7 PASS** (`tests/bugs/phase2/round2-verify.js`).

---

## 2. Critical clusters — all resolved

| ID | Issue | Fix | Verified |
|----|-------|-----|----------|
| C1 | Mongoose 9 pre-hook crash (4 models) | Converted sync `function(next)` hooks → `async function()` in Product / Settings / KhataEntry / StockAdjustment models | ✅ products, settings, khata, adjustments all create |
| C2 | Stock-In route missing (empty files) | Built `inventory.routes/controller/service.js`, mounted at `/api/v1/stock-adjustments`; controller accepts both `delta` and `qtyChange` | ✅ adjustments create + list |
| C3 | Credit (khata) sales always 500 | `khata.service.js` transaction detection fixed for standalone MongoDB | ✅ credit sale + payment |
| C4 | Invoices showed ₹0 CGST/SGST | InvoiceModal field names corrected to `items[].cgst` / `items[].sgst` | ✅ invoice renders tax |
| C5 | Gemini API key in plaintext `.env` | `server/.gitignore` created; **key rotation = owner action** (§4) | ⚠️ owner action |
| C6 | Cross-account data exposure | **Not a bug** — tenancy confirmed *single shop, multiple staff*; shared data is intended | ✅ by design |

---

## 2b. CRITICAL — OCR PDF upload crashed the entire server (found & fixed post-report)

**Severity: Critical (availability).** The OCR scanner advertised PDF upload
(`accept=".pdf,…"`, a "GST invoice (PDF)" sample). But `tesseract.js` cannot
decode PDFs — when handed one it threw inside its worker via `process.nextTick`,
an **uncaught exception that killed the whole Node process** for every user.
Reproduced live from the running server's crash log.

**Fix (5 files):**
- `upload.middleware.js` — `fileFilter` now rejects PDF; images (JPG/JPEG/PNG) only.
- `ocr.service.js` — `extractText` validates the extension before OCR; PDF → HTTP 400.
- `ocr.controller.js` — `extractData` surfaces 400 client-input errors instead of opaque 500.
- `server.js` — added `uncaughtException` / `unhandledRejection` safety nets so a
  background-worker failure can never take the server down again.
- `ScannerPage.jsx` — UI no longer advertises PDF (`accept`, labels, sample, hint);
  also fixed two stray non-English strings (`बिल यहाँ डालें`, "OCR extract kar raha hai…").

**Verified live:** PDF upload → 400 with a clear message; server stays alive; PNG still works.

> **Product decision (please confirm):** PDF support was *removed* from OCR because
> true PDF OCR needs a PDF→image conversion step (ghostscript / pdf2pic) — an
> infrastructure dependency. If scanning PDF invoices is important, that conversion
> step can be added as a follow-up; say the word and it can be scoped.

---

## 2c. OCR module rebuilt — extraction now actually works

The OCR scanner was non-functional beyond the crash. Two further defects:

1. **Broken data contract.** `/ocr/extract` returned `vendorName` / `item.price` /
   `grandTotal`; the ScannerPage reads `vendor.name` / `item.unitPrice` / `total`.
   Every extracted price and total rendered as **₹0**. On save, the backend read
   `price`/`stock` while the UI sent `unitPrice`/`quantity` → products saved at
   **₹1 with 0 stock**.
2. **Weak engine.** tesseract.js + regex could not reliably read invoice photos
   and never produced the GSTIN / tax data the UI advertised.

**Fix:**
- `ocr.service.js` — extraction now runs through **Gemini Vision (`gemini-2.5-flash`)**,
  which reads the invoice image directly and returns structured JSON. tesseract+regex
  is kept as an automatic fallback when no API key is configured. All paths return one
  canonical shape (`vendor{name,taxId}`, `items[{name,quantity,unitPrice,total,hsn}]`,
  `subtotal`, `tax`, `total`).
- `ocr.controller.js` — `saveExtractedData` reads the canonical item fields, saves the
  real price + stock, and resolves/creates a Supplier from the extracted vendor.
- `ScannerPage.jsx` — contract aligned; two non-English strings fixed.

**Verified live end-to-end** (`tests/bugs/phase2/ocr-verify.js`, 14/14 PASS) against a
real invoice image: Gemini read the vendor name, GSTIN, invoice no., date, all 3 line
items with correct quantities/prices, and the ₹5,397 grand total; products were saved
with the correct price and stock and linked to a supplier.

> Note: OCR quality depends on the Gemini API key being valid (see §4 item 1).
> Without a key it silently falls back to the weaker tesseract+regex engine.

---

## 3. Round 2 fixes (this session) — all verified

| ID | Bug | Fix | Result |
|----|-----|-----|--------|
| NEW-01 | `gstRate` stripped by the Zod product validator → every product saved at 0% → ₹0 GST on all invoices | Added `gstRate` enum field to `createProductSchema` + `updateProductSchema` (`product.validator.js`) | ✅ gstRate=18 persists; sale of 2× ₹100 charges ₹36 GST |
| NEW-02 | Blank workspace state classified sales as inter-state → wrong IGST | `saleCompute.js` defaults to intra-state (CGST/SGST) when workspace state is unset | ✅ cgst=9 sgst=9 igst=0 |
| A4-02 | `barcode` field `default: ''` collided under unique+sparse index → E11000 on 2nd barcode-less product / OCR save | Removed `default: ''` from `Product.model.js`; cleaned existing `barcode:''` doc; dropped stale index (rebuilds on boot) | ✅ two barcode-less products save |
| A2-11 / NEW-03 | Model validation errors returned HTTP 500 instead of 400 | Attached `statusCode: 400` to thrown errors in Product / KhataEntry / StockAdjustment pre-validate hooks | ✅ bad adjustment → 400 |
| A4-09b | `OVERSOLD` alert type missing from enum → cron alerts never persisted | Added `'OVERSOLD'` to `Alert.model.js` type enum | ✅ Alert validates |

Earlier fixes also applied & verified: settings validator (profile/aiConfig/workspace sections),
analytics/AI/OCR Decimal128 → number conversions, product-route `authorize` guards,
JWT 7-day cap in code, CORS env-gating, write-endpoint rate limiter, business-profile
setup (store name / GSTIN / state / UPI) end-to-end.

---

## 4. Owner action items before go-live (NOT code — must be done by you)

1. **Rotate the Gemini API key.** `server/.env:5` holds a live key (`AIzaSy…`) that was
   committed in plaintext. Generate a new key in Google AI Studio, revoke the old one,
   and put the new value in `server/.env`. *An agent must not do this.*
2. **Set `JWT_EXPIRE=7d`** in `server/.env` (currently `30d`). The code already caps
   tokens at 7 days; aligning the env var avoids confusion. Optional but recommended.
3. Confirm `server/.env` is **not** committed to git going forward (`.gitignore` now covers it).

---

## 5. Residual / non-blocking (safe to ship, fix post-launch)

- Low-severity polish items from Phase 1 (LOW bucket): adjust-stock min-qty hardcoded,
  ScannerPage demo "recent scans", AI-chat limiter ordering — cosmetic, no data risk.
- No rate limit on every write endpoint (a global write limiter was added; per-route
  tuning can come later).
- Recommend smoke suites be wired into CI before the next release.

---

## 6. How to run the verification yourself

```
# backend must be running (default port 5000)
cd "Clg Mern"
API_URL=http://localhost:5000/api/v1 node tests/bugs/phase2/round2-verify.js
```
Expect `=== ROUND 2: ALL PASS ===`.

Per-module detail: `tests/bugs/phase1/CONSOLIDATED-REPORT.md` + `A1…A5` reports;
re-test detail: `tests/bugs/phase2/RT1…RT3-verification.md`.
