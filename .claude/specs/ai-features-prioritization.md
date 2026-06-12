# CEO Memo: AI Feature Prioritization for SmartStock AI (India SMB)
Date: 2026-04-29 | Author: ceo | Stack: MERN (Express 5 / Mongoose / React 19 / Vite / Gemini)

## TL;DR — Ship This in Q1

| # | Feature | Status | Phase | Effort | SMB ROI | Pricing lever |
|---|---|---|---|---|---|---|
| 1 | Demand forecasting (real, not avg-of-60d) | PARTIAL | P1 (30d) | M | High | Pro tier ₹499/mo unlock |
| 2 | WhatsApp khata reminders + statement share | MISSING | P1 (30d) | M | Very High | Drives renewals; ₹299 plan moat |
| 3 | Reorder + supplier auto-PO draft | PARTIAL | P1 (30d) | S | High | Pro tier sticky |
| 4 | Bilingual (Hindi/Hinglish) AI chat | MISSING | P1 (30d) | S | High | Tier-2/3 city expansion |
| 5 | OCR upgrade: Gemini-vision invoices | PARTIAL | P2 (60d) | M | High | Pro tier; replaces Tesseract |
| 6 | Festival/seasonal demand boost layer | MISSING | P2 (60d) | M | Med | Diwali/Eid upsell window |
| 7 | Dead-stock liquidation playbook (auto-discount) | PARTIAL | P2 (60d) | S | Med | Frees working capital — retention |
| 8 | GST anomaly detector (HSN/rate mismatch) | MISSING | P2 (60d) | M | High | Compliance moat vs Vyapar |
| 9 | Customer churn / udhaar default predictor | MISSING | P3 (90d) | L | Med | Pro+ ₹999 tier |
| 10 | Voice-billing (Hindi STT) | MISSING | P3 (90d) | L | Med | Differentiator vs Tally/Vyapar |

**Recommended Q1 bundle (P1):** Features 1–4. All four make the ₹499/mo "AI Pro" plan undeniable for a kirana/distributor doing ₹5–20L/month. Build cost is ~5–7 dev-weeks on the existing stack. No new infra.

---

## Audit — Each of the 10 Wishlist Features Mapped to Our Codebase

> Wishlist arrived framed in .NET / Azure / SQL Server / Python FastAPI. **We are NOT migrating.** Translation rules below assume Express 5 + Mongoose + Gemini 2.5 Flash.

### 1. Demand Forecasting (the wishlist's "Prophet/ARIMA on Azure ML")

- **Status: PARTIAL.** `server/src/controllers/ai.controller.js:76-110` (`predictDemand`) computes a flat 60-day average daily sales × 30. No seasonality, no trend, no day-of-week. The "confidence %" is a fake heuristic (`60 + sales.length * 5`). Client surfaces it via `client/src/services/aiService.js:5` and `client/src/pages/AiInsightsPage.jsx`.
- **Honest enhancement:** Add a real time-series layer in `server/src/services/forecast.service.js` (new file). Two options, both cheap:
  - (a) **Holt-Winters / triple exponential smoothing** in pure JS (~120 LOC) — gives weekly seasonality and trend without any ML infra.
  - (b) **Gemini-as-forecaster** — feed last 90 days of daily sales aggregates as JSON to `gemini-2.5-flash` with a strict "return JSON {next7DaysQty:[…], reasoning:'…'}" prompt. Works because Gemini is decent at numeric pattern continuation for short horizons.
  - Recommended: ship (a) as the primary, use (b) as the "explain why" layer that the user sees. Keeps cost low and avoids "AI says so" black box.
- **What the customer sees:** "Atta — sells ~28 units/week, +18% in monsoon. Reorder 80 units by 12 May to avoid stockout on 19 May." Specific, dated, in rupees.
- **Effort: M | ROI: High | Phase: 1**

### 2. AI-Powered Reorder / Auto-PO

- **Status: PARTIAL.** `getReorderSuggestion` at `ai.controller.js:113-135` returns a quantity but never drafts a purchase order document. No PO collection exists (`Transaction.model.js` only has IN/OUT, not PO). Suppliers exist (`Supplier.model.js`) and are populated.
- **Build:** New `PurchaseOrder.model.js` (lean: supplierId, items[], status enum draft/sent/received, total, expectedDate). Endpoint `POST /api/v1/po/draft-from-ai` consumes the reorder suggestion and creates a draft PO. WhatsApp-share button ("Send PO to supplier") uses the same `wa.me/{phone}?text=...` pattern proposed in `customer-khata.md` §9.4.
- **Why now:** Suppliers are the #1 manual data-entry pain. Drafting a PO and pinging supplier on WhatsApp ends ~10 min of phone calls per stockout.
- **Effort: S | ROI: High | Phase: 1**

### 3. Smart Alerts / Predictive Stockout (wishlist: "Notification Service")

- **Status: PARTIAL — and this is currently the honest one.** `server/src/crons/smartAlerts.cron.js:22-79` runs daily at 09:00 IST and writes `Alert` docs for OUT_OF_STOCK / LOW_STOCK / DEAD_STOCK. No prediction layer — it only fires *after* stock is already low.
- **Enhance:** Plug Feature 1's forecast in. New alert type `STOCKOUT_PREDICTED` fires when `daysUntilStockout < supplierLeadTime + 2`. Lead-time field needs to be added to `Supplier.model.js` (single integer field, default 3).
- **Channel:** Email already wired in `Settings.notifications.channels`. Add WhatsApp via shared helper from Feature 4.
- **Effort: S | ROI: High | Phase: 1** *(rolled into Feature 1's release)*

### 4. WhatsApp Integration (wishlist names "Twilio")

- **Status: MISSING in code, DESIGNED in `.claude/specs/customer-khata.md` §9.4 (share token + `wa.me` link).**
- **Build:** Three surfaces, one helper.
  - Helper: `server/src/services/whatsapp.service.js` — formats messages, builds `https://wa.me/{phone}?text={encodeURIComponent(...)}` deep links. **No Twilio/Meta API in v1** — use click-to-share (user taps "Send", their WhatsApp opens with pre-filled text). Zero cost, zero KYC, works on every Android.
  - Surfaces: (i) khata payment reminder, (ii) PO to supplier (Feature 2), (iii) invoice share post-billing (already partly wired in `SalesPage.jsx`).
  - **v2 only if customers ask:** Twilio/Gupshup for fully automated sends. Adds ₹0.30–0.85/message + business-verified WhatsApp number. Defer until we have 500+ paying users.
- **Why now:** WhatsApp is THE Indian SMB comms layer. Vyapar already does this; not having it is a deal-breaker for distributors managing 50+ retailer credits.
- **Effort: M | ROI: Very High | Phase: 1**

### 5. OCR Invoice Scanning (wishlist: "Form Recognizer / Azure Cognitive")

- **Status: PARTIAL.** `server/src/services/ocr.service.js` uses Tesseract + regex. Endpoint at `/api/v1/ocr/extract` (`server/src/controllers/ocr.controller.js`). Frontend at `client/src/pages/ScannerPage.jsx`. Works for clean printed invoices, fails badly on handwritten kirana bills, thermal receipts, photos at angles.
- **Honest enhancement:** Replace the regex parser with **Gemini 2.5 Flash multimodal**. Send image bytes + prompt "Extract supplier name, invoice no, date, GSTIN, line items[name,qty,price,hsn,gstRate], total." Returns clean JSON. Tesseract becomes the offline fallback. Cost: ~₹0.40/scan at current Gemini pricing — well within ₹499/mo plan economics if user does <500 scans/month.
- **Critical caveat:** Add a confirm-before-save UI step. Hallucinated HSN codes filed in GSTR-1 = real legal risk.
- **Effort: M | ROI: High | Phase: 2**

### 6. Festival / Seasonal Forecasting (NEW — not in wishlist but Indian-specific)

- **Status: MISSING.** Not in the 10. Adding because it is the single biggest Indian-market unlock that Vyapar/Tally don't have.
- **Build:** Static seasonality dictionary in `server/src/constants/festivals.js` (Diwali, Eid, Rakhi, Ganesh Chaturthi, Pongal, Christmas, etc. with date ranges and category multipliers per industry). Forecast service multiplies base prediction by (festival × category) lift factor.
- **What the customer sees:** "Diwali in 18 days. Sweets/Dry-fruits typically sell 3.4× normal. Reorder now: ₹1,42,000 of stock recommended."
- **Effort: M | ROI: Med (very high during Sep–Nov window, lower rest of year) | Phase: 2**

### 7. Dead-Stock Liquidation (wishlist: "Slow-moving inventory")

- **Status: PARTIAL.** `getDeadStock` at `ai.controller.js:138-178` lists ageing items + locked value. No action layer.
- **Enhance:** Add `POST /ai/markdown-suggestion/:productId` — Gemini receives {cost, currentPrice, daysUnsold, stockQty, category} and returns a 3-tier discount ladder (e.g. 10% now → 25% in 14d → return-to-supplier in 30d). Wire a one-click "Apply markdown" that updates `Product.price`. Optionally generate a WhatsApp blast template ("Limited time: ₹X off on Y").
- **Effort: S | ROI: Med | Phase: 2**

### 8. GST Anomaly / Compliance Co-pilot (NEW — replaces wishlist's vague "Compliance AI")

- **Status: MISSING.** No code today. The compliance work in `.claude/specs/gstr-1-3b-export.md` is structural (export shape), not anomaly detection.
- **Build:** Cron job + Gemini reasoning over a month's sales. Detects: HSN-code drift (same product, different HSN across invoices), rate mismatch (5% on something taxed at 18% normally), missing customer GSTIN on B2B-shaped sales (high invoice value to a non-walk-in), interstate flagged as intrastate.
- **Why now:** GSTR-1 mismatches trigger notices. SMB owners pay CAs ₹2,000–5,000/month partly for this. We become the cheaper safety net. Strong moat — Vyapar/Khatabook do not have this.
- **Effort: M | ROI: High | Phase: 2**

### 9. Customer Churn / Udhaar Default Predictor

- **Status: MISSING.** Khata foundation is specced in `.claude/specs/customer-khata.md` and now implemented (K1/K2 backend landed 2026-04-29). Once frontend ships and data accumulates, we have payment history.
- **Build (P3 — gated on 30+ days of khata data):** Service that scores each customer 0–100 on default risk based on payment delay history, outstanding age buckets, frequency drop. Surface as "At-risk debtors: ₹2.4L across 7 customers" tile.
- **Effort: L | ROI: Med | Phase: 3**

### 10. Voice Billing in Hindi (NEW — high-impact differentiator)

- **Status: MISSING.** No STT integration anywhere.
- **Build:** Web Speech API for input (zero infra) → text → existing chat/billing intent parser. Works on Chrome on Android, free. Hindi/Hinglish support is Chrome-native. For premium "always-on counter mic" mode, defer to v2.
- **Why now (or later):** This is the headline-grabbing feature for Tier-2/3 demos. But it requires the bilingual chat (Feature 4) to land first. Phase 3.
- **Effort: L | ROI: Med | Phase: 3**

---

## Fake-AI Traps to Avoid

The user explicitly said "no fake AI." Calling these out:

1. **Today's `predictDemand` is fake AI.** Confidence score `60 + sales.length * 5` is theatre. Either ship Holt-Winters (real maths) or label it "30-day average" honestly. Don't keep the current copy.
2. **"AI Insights" today is mostly rules + template strings** (`getInsights` at `ai.controller.js:11-73`). That's fine *as long as we don't market it as ML*. Honest framing: "Smart Insights" or "Auto-Reports." Save the "AI" label for Gemini-backed features.
3. **Wishlist's "Computer Vision shelf monitoring"** — only honest if a customer actually mounts a camera over their shelves. For 99% of Indian kirana stores: no. Drop it.
4. **Wishlist's "RL-based pricing optimization"** — premature. SMBs price by rule-of-thumb (cost × 1.2). RL needs months of A/B data we don't have. Replace with the markdown ladder (Feature 7) which is interpretable.
5. **OCR with Gemini (Feature 5)** — must show the parsed JSON in an editable form *before* save, with confidence flags per field. Never write GSTIN or HSN into a Sale doc without user confirmation. That's a tax-notice bug waiting to happen.

---

## Phasing Rationale (Indian SMB lens)

**Phase 1 (0–30 days, ~₹0 infra cost):** Features 1, 2, 3, 4. Targets the ₹499/mo Pro tier conversion. All four work on a 4G-only ₹8,000 Android phone (no heavy assets, no real-time camera). Drives churn down — once a kirana owner sees "5 customers due ₹12,400 today" delivered to WhatsApp, they renew.

**Phase 2 (30–60 days):** Features 5, 6, 7, 8. Lifts ARPU. Festival forecasting must ship before Sep 2026 to catch Diwali. GST anomaly detector is the moat against Vyapar/Khatabook for the next 12 months.

**Phase 3 (60–90 days):** Features 9, 10. Churn-prediction depends on khata data accumulating. Voice-billing is marketing-led — ship after the foundation is rock-solid.

**Pricing tier alignment:**
- **Free:** Existing rule-based insights, Tesseract OCR, basic alerts. Capped at 50 invoices/month.
- **Pro ₹499/mo (annual ₹4,499):** Features 1–7. Target persona: Mehul, 38, kirana in Pune, ₹8L/month turnover, gives udhaar to 30 regulars.
- **Pro+ ₹999/mo:** Features 8 + 9 (compliance + risk). Target: distributors and small wholesalers.

---

## Build Assignments

- **Feature 1 (forecast service):** `fullstack` — both `server/src/services/forecast.service.js` and refactor of `client/src/features/ai/components/DemandChart.jsx`.
- **Feature 2 (PO draft):** `backend-coder` for model + endpoint, `frontend-coder` for UI inside `SuppliersPage.jsx`.
- **Feature 3 (predictive alerts):** `backend-coder` — extend `smartAlerts.cron.js` once Feature 1 lands.
- **Feature 4 (WhatsApp share + bilingual chat):** `fullstack` — helper service is trivial; bilingual is a system-prompt change in `ai.service.js` chat handler.
- **Feature 5 (Gemini-vision OCR):** `backend-coder` — gut and replace `services/ocr.service.js` parser path; keep Tesseract as fallback.
- **Feature 6 (festival layer):** `backend-coder` — pure data file + multiplier in forecast service.
- **Feature 7 (markdown ladder):** `fullstack`.
- **Feature 8 (GST anomaly):** `architect-gst` first (rules taxonomy), then `backend-coder`.
- **Feature 9 (churn predictor):** `backend-coder` — gated on khata frontend landing first.
- **Feature 10 (voice):** `frontend-coder` — Web Speech API in `client/src/pages/SalesPage.jsx`.

**Cost of NOT shipping P1 in 30 days:** Vyapar's WhatsApp khata reminders + Khatabook's free credit-book combine to make ~₹400/mo of competitor pull. Each month we delay = ~₹50–80/seat in lost upgrade conversions across the existing user base.
