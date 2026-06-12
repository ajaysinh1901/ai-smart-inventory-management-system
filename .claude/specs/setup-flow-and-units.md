# Setup Flow & Units of Measure — SmartStock AI v1.4

**Author:** CEO
**Date:** 2026-04-29
**Status:** Approved for build
**Depends on:** customer-khata.md, ai-features-prioritization.md
**Owner of execution:** architect-gst (lead), fullstack split

---

## 0. TL;DR

Three problems, one release:

1. **Big vs small store** is a *defaults and visibility* problem, not a pricing-tier problem. Same codebase, different first-run defaults, different feature exposure. We ship a `storeProfile` enum on the workspace, not a separate plan.
2. **Kg/weight support** is the single biggest TAM unlock we have left in the kirana/grocery vertical. Without it ~60% of general stores cannot use us as their primary till. We add a `Unit` model, decimal stock, a scale-mode sale screen, and a paise-safe money path.
3. **Onboarding** today is a cliff. We replace the empty dashboard with a 5-step resumable wizard that guarantees a real GST invoice in under 5 minutes, with sample-data seeding for owners who refuse to type 100 SKUs cold.

Net commercial effect: lifts free-to-paid conversion (target 11% → 18%) and opens the grocery/kirana segment that today churns in week one.

---

## A. Segmentation Matrix — Big Store vs Small Store

We add `workspace.storeProfile: 'small' | 'big'` chosen in step 1 of onboarding. **One codebase, different defaults.** Switching profile is allowed any time from Settings → it just flips defaults, never wipes data.

| Dimension | Small store (kirana, ek-dukan) | Big store (multi-staff retail / distributor) |
|---|---|---|
| **Default landing** | Quick-Sale screen (scale-mode capable) | Dashboard with today's sales + low-stock |
| **Bulk import** | Hidden behind "Advanced". CSV exists but not promoted; expect 30–80 SKUs typed | Promoted on day 1. Excel/CSV import + Tally item master mapping |
| **Scanner workflow** | Camera barcode on phone, optional. Most kirana SKUs are loose so no barcode | USB HID scanner support on counter PC, focus-trap input field, beep on miss |
| **Multi-cashier** | Single owner login. `staff` role hidden in UI | Manager + multiple staff, per-cashier daily Z-report, shift open/close |
| **Branch/location** | Out of v1 entirely. One workspace = one shop | Single location in v1, but `locationId` foreign key is provisioned in schema for v1.5 |
| **Role gating** | `admin` only is the visible default; staff/manager toggles hidden in UI | All three roles surfaced; permission templates applied automatically |
| **Default views** | Big buttons, fewer columns, hide cost-price column from sale screen | Dense tables, cost margin column visible, keyboard shortcuts shown |
| **Perf budget** | Fast on 4G + ₹8k Android (sub-3s TTI, list virtualises after 200 rows) | Fast on broadband + desktop Chrome (handles 5,000-row product list) |
| **Invoice default** | Thermal 58mm / WhatsApp PDF | A4 GST invoice, print-preview, e-invoice IRN if turnover ≥ ₹5cr |
| **Reports default** | Today + this month, single page | Date-range, GSTR-1 export, party-wise outstanding |
| **AI suggestions tone** | "Aapka rice khatam hone wala hai" (one nudge at a time) | Daily digest with 5 nudges, exportable |

**Ruthless cuts** — these are *not* segmentation differences, they are everyone-features:

- GST compliance, HSN, e-way bill: same for both. A ₹6cr distributor and a ₹40L kirana both need correct GST.
- Khata: both segments need it. Big stores have credit customers too.
- WhatsApp share: universal.
- Payment QR: universal.

Anyone proposing a "Lite" plan with GST removed should be shown the door. Compliance is the whole reason they pay us.

---

## B. Unit-of-Measure Spec

### B.1 Units we ship (v1)

| Code | Label (en) | Label (hi) | Decimal? | Step | Display rule |
|---|---|---|---|---|---|
| `pcs` | Pieces | नग | No | 1 | "12 pcs" |
| `kg` | Kilogram | किलो | **Yes** | 0.005 | "1.250 kg" or "1 kg 250 g" toggle |
| `g` | Gram | ग्राम | Yes | 1 | "250 g" |
| `l` | Litre | लीटर | **Yes** | 0.01 | "1.25 L" |
| `ml` | Millilitre | मिलि | No | 1 | "500 ml" |
| `dozen` | Dozen | दर्जन | No | 1 | "2 dozen" (= 24 pcs internally? **No** — dozen is its own unit, no auto-conversion in v1) |
| `box` | Box | डिब्बा | No | 1 | "3 box" + boxSize attribute optional |
| `packet` | Packet | पैकेट | No | 1 | "5 packet" |

**Rule:** units are not interconvertible in v1. A product is sold in *one* UoM. If a shop wants atta in both 1kg packets and loose, that's two products: "Aashirvaad Atta 1kg Packet (pcs)" and "Aashirvaad Atta Loose (kg)". This is how kirana actually thinks.

### B.2 Schema delta

```
Product {
  ...existing,
  unit: { type: String, enum: [...8 codes], default: 'pcs', required: true },
  saleByWeight: { type: Boolean, default: false },   // shows scale-mode UI
  pricePerUnit: { type: Decimal128, required: true }, // was 'price'
  stock: { type: Decimal128, default: 0 },            // was Number
  reorderLevel: { type: Decimal128, default: 0 },
  packSize: { type: Decimal128, default: null },      // optional, for "1kg packet" hint
  tareWeight: { type: Decimal128, default: 0 },       // for paneer/sweets in box
}
```

`Decimal128` everywhere money or weight touches. **No `Number` for paise or grams.** A helper `money.js` and `weight.js` wraps Decimal128 → string for display, with paise rounding HALF_UP at the line-item level only (never mid-calculation).

### B.3 Money × weight interaction (the dangerous part)

Worked example: 250 g of rice at ₹65/kg.

```
qty_kg     = 0.250            (Decimal128)
rate_kg    = 65.00            (Decimal128)
line_net   = qty_kg * rate_kg = 16.25
```

GST 5% (HSN 1006):
```
gst        = 16.25 * 0.05    = 0.8125
round(line_net, 2)            = 16.25
round(gst, 2)                 = 0.81
line_total                    = 17.06
```

**Rules of the road:**

1. Round **only at boundaries** — line subtotal, line tax, invoice total. Never round qty or rate.
2. Paise rounding: HALF_UP, two decimals. ₹0.005 → ₹0.01.
3. Final invoice "round-off" line is allowed (kirana culture: ₹17.06 → ₹17). Stored as separate `roundOff` field, GSTR-1 unaffected.
4. Display preference per workspace: paise shown vs hidden. Default for `small`: hidden (round on display). Default for `big`: shown.

### B.4 Sale flow — scale mode

**Phone (kirana owner):**

```
[Quick Sale]
+----------------------------------+
| Search: "atta"                  |
+----------------------------------+
| Aashirvaad Atta Loose  ₹52/kg   |
| In stock: 24.500 kg             |
+----------------------------------+
[Tap product]

+----------------------------------+
|  ATTA LOOSE                     |
|  ₹52.00 / kg                    |
|                                  |
|     [  1.250  ] kg              |
|     -  [+100g] [+250g] [+500g]  |
|                                  |
|  Amount: ₹65.00                 |
|  [ Add to bill ]                |
+----------------------------------+
```

Numpad opens by default. +100g/+250g/+500g chips are sized for fat fingers. The amount-first toggle (enter ₹50, compute kg) is in the corner — kirana often sells "₹50 ka rice".

**Counter PC (big store, USB scale via OPOS or manual):**

- Scale-mode product → focus jumps to weight field, not qty.
- USB scale integration is **out of v1** (post-launch v1.6). v1 is manual entry, but the field is structured so the scale driver lands cleanly later.
- Keyboard: Enter = next item, F2 = amount-first, F4 = tare.

**Amount-first flow (critical for India):** customer says "paanch sau ka dal de do". Cashier types ₹500 → system back-computes 4.000 kg at ₹125/kg, prints both on bill.

### B.5 Stock-in variance (50kg sack delivers 49.7kg)

Purchase entry has two fields when the product is `saleByWeight`:

- **Invoiced qty** — what the supplier billed (50.000 kg)
- **Received qty** — what your scale showed (49.700 kg). Default = invoiced.

Variance (0.300 kg) is logged to `StockAdjustment` with reason `purchase-variance` and feeds a monthly "supplier shrinkage" report. Non-event in v1 UX, but the data is captured. This is how you catch the dal supplier who consistently underweighs.

### B.6 Reorder thresholds for kg products

Threshold is in the **same unit as the product**. Atta loose with `reorderLevel = 5 kg` triggers low-stock when stock < 5.000 kg. No "5 packets" semantics — that's the pcs product.

AI restock suggestions (Phase 2 from ai-features spec) need the unit-aware velocity calc: "you sold 12.5 kg of atta last week, current stock 4 kg, reorder 25 kg" — not "you sold 12 of atta".

### B.7 Migration plan for existing integer-stock products

1. Backfill migration sets `unit='pcs'`, `saleByWeight=false`, `pricePerUnit=price`, `stock=Decimal128(stock)` for every existing product. Idempotent.
2. UI shows a one-time banner: "You can now sell by weight. Convert a product?" → opens product edit with the unit dropdown highlighted.
3. Old API endpoints (`POST /products` with integer `price`) accept legacy payload for 90 days, mapping to new schema server-side. Deprecation header set.
4. Reports unaffected — they read Decimal128 either way.

### B.8 Edge cases

| Case | Decision |
|---|---|
| Tare (paneer in dabba) | `tareWeight` field on product, subtracted at sale time. Visible toggle on scale-mode UI. |
| Packed vs loose same SKU | Two distinct products. Suggest naming convention "X (Loose)" / "X 1kg". |
| Display "1 kg 250 g" vs "1.250 kg" | Workspace setting `weightDisplay: 'mixed' \| 'decimal'`. Default `mixed` for `small`, `decimal` for `big`. |
| Half-paise on tax line | Round HALF_UP at line, not at tax breakdown. CGST and SGST split *after* rounding the total tax, with any 1-paise residue going to CGST (mirrors Tally). |
| Negative stock (sold what wasn't there) | Allow with warning, flag on report. Kirana reality — they'll reconcile later. |
| Decimal qty on `pcs` product | Reject. "1.5 toothbrush" is a bug. |

---

## C. Onboarding Flow

### C.1 Principle

**Time-to-first-invoice is the only metric that matters.** Target: 5 minutes from signup to a sharable GST invoice. Anyone who hits "first invoice" within session 1 has 4× higher D30 retention (industry benchmark; we'll instrument).

### C.2 Steps

Same wizard for both `small` and `big`. Step 1 picks the profile; later steps adapt.

| # | Step | Captures | Backend writes | Skip-default | Min-viable | Good-complete |
|---|---|---|---|---|---|---|
| 1 | **Welcome & Profile** | Store name, store type (kirana / pharmacy / general / wholesale / restaurant / other), `storeProfile` (small/big), language, state | `Workspace { name, type, storeProfile, defaultLang, state }` | Cannot skip. State is needed for CGST+SGST vs IGST. | Name + type + state | + GSTIN (validated), logo |
| 2 | **GST & Business** | GSTIN (optional), legal name, address, FY start | `Workspace.gst { gstin, legalName, address }` | Skip → workspace marked `gstRegistered: false`, invoices issue as "Bill of Supply" | Skip allowed | GSTIN entered + auto-fetched legal name |
| 3 | **Payment** | UPI ID, bank a/c last4 (optional) | `Workspace.payment { upiId, bankLast4 }` | Skip → invoices print without QR | UPI ID only | UPI + bank |
| 4 | **First products** | 3+ products OR pick sample pack | `Product[]` bulk insert | Cannot skip — must have ≥1 product to invoice | Type 3 products with name+price+unit | Sample pack of 30 + edit prices |
| 5 | **Opening stock** | Qty for each product | `StockAdjustment[]` reason `opening` | Skip → all stock = 0, warning shown | Skip allowed (most kirana don't count day 1) | Counted opening for each product |
| 6 | **First supplier** | Name, phone, GSTIN optional | `Supplier` | Skip allowed | Skip | One supplier added |
| 7 | **First invoice** | Pick customer (or "Walk-in"), pick 1+ products, share | `Invoice`, `Khata` entry if credit | **Cannot skip** — this is the activation event | Walk-in cash sale of 1 product | Named customer, multi-line, WhatsApp share |

**Activation = step 7 done.** We measure this religiously.

### C.3 Sample-data seeding

Three sample packs, picked in step 4 based on store type:

- **Kirana pack** (30 SKUs): atta loose 5kg+10kg+25kg, rice variants, dal 4 types, sugar, oil, salt, common Parle/Britannia FMCG, with realistic Indian pricing pre-filled in ₹/kg or per pack. Mix of `kg` and `pcs` units to teach UoM in the wizard.
- **Pharmacy pack** (25 SKUs): paracetamol, common OTC, with HSN 3004. All `pcs`.
- **General store pack** (40 SKUs): mix of stationery, FMCG, snacks.

Picking a pack inserts products with `isSample=true`. A "Clear sample products" button stays in Settings for 30 days.

### C.4 Big vs small branching

Same 7 steps. Differences inside steps:

- Step 1: small store hides "fiscal year start" advanced field
- Step 2: big store shows e-invoice toggle if turnover declared > ₹5cr
- Step 4: small store sees only sample-pack option prominently; big store sees "Import from Excel/Tally" as the primary CTA
- Step 7: small store ends on Quick-Sale screen; big store ends on Dashboard with a "Add staff" nudge

### C.5 Resume-after-leave

**Server-side** persistence is non-negotiable. Field `Workspace.onboarding = { currentStep, completedSteps[], dismissed: false, sampleSeedUsed }`.

LocalStorage caches the *form draft* of the current step only (so a closed tab doesn't lose the half-typed product). Every "Next" button writes server-side. Owner who signed up on phone Monday and continues on PC Tuesday picks up at the same step.

A persistent `Resume setup (3/7)` pill stays in the topbar until completion or explicit dismiss. Dismiss puts the wizard in Settings → Setup, never deleted.

### C.6 Mobile-first vs desktop-first per step

| Step | Primary device | Why |
|---|---|---|
| 1 Welcome | Mobile | Most owners sign up on phone via WhatsApp/Google ad |
| 2 GST | Either | GSTIN is often on a paper, slow either way |
| 3 Payment | Mobile | UPI ID is on the phone |
| 4 Products | **Desktop preferred for big**, mobile fine for small | Bulk import is desktop |
| 5 Opening stock | Mobile | Owner walks the shop counting |
| 6 Supplier | Mobile | Supplier's phone is in WhatsApp |
| 7 First invoice | Mobile for kirana, desktop for big | Matches their actual sale device |

All steps must *work* on both; "preferred" just drives default density.

### C.7 The 5-minute path (literal speed run)

1. Sign up (Google OAuth, 10s)
2. Step 1: name, kirana, small, Hindi, Gujarat (20s)
3. Step 2: skip GST (5s) — issue Bill of Supply
4. Step 3: enter UPI ID (15s)
5. Step 4: pick "Kirana sample pack" (5s) — 30 products seeded
6. Step 5: skip opening stock (2s)
7. Step 6: skip supplier (2s)
8. Step 7: walk-in customer, one item from sample, "Share on WhatsApp" → PDF generated (60s)

**Total: ~2 minutes.** The 5-minute target has 3 minutes of slack for typing, network, GSTIN lookup. Holds.

---

## D. Build Assignments

Order = dependency order. Critical path marked with **[CP]**.

| # | Chunk | Owner | Effort (pd) | Notes |
|---|---|---|---|---|
| 1 | **[CP]** Money + Weight helper libs (Decimal128 wrappers, paise rounding, mixed display) | backend-coder | 2 | Blocks everything money-touching |
| 2 | **[CP]** Product schema migration + backfill (unit, saleByWeight, Decimal128 stock/price, tare, packSize) | architect-gst (design) + backend-coder (impl) | 3 | Idempotent migration; legacy API for 90d |
| 3 | **[CP]** Sale flow API: scale-mode line items, amount-first computation, tare subtraction | backend-coder | 3 | Reuses helpers from #1 |
| 4 | Workspace.storeProfile + onboarding state model | backend-coder | 1 | Small |
| 5 | Sample-pack seed data (kirana/pharma/general — content + JSON fixtures) | architect-gst (content) + backend-coder (loader) | 2 | Content work matters; have a real kirana review the kirana pack |
| 6 | Onboarding wizard frontend (7 steps, resume, profile branching) | frontend-coder | 5 | Replace bare OnboardingWizard.jsx; mobile-first Tailwind |
| 7 | **[CP]** Quick-Sale screen with scale-mode UI (mobile + counter density) | frontend-coder + ui-designer | 4 | The activation surface |
| 8 | Product form: unit dropdown, saleByWeight toggle, tare, packSize, threshold-by-unit | frontend-coder | 2 | |
| 9 | Reorder/low-stock unit-aware logic (reports + AI feed) | backend-coder | 1 | Touches restock-suggestion AI feature |
| 10 | Stock-in variance UI (received vs invoiced) + StockAdjustment reason taxonomy | frontend-coder + backend-coder | 2 | |
| 11 | Invoice render: weight display ("1 kg 250 g"), paise toggle, round-off line | frontend-coder | 2 | A4 + thermal both |
| 12 | E2E test pack: 5-min onboarding speed run, scale-mode sale, kg invoice GSTR-1 export | qa-tester | 3 | Critical path verification |
| 13 | Money rounding + tax-split senior review (Tally parity, GSTR-1 sample, edge cases) | senior-tester | 2 | Sign-off gate before ship |
| 14 | Onboarding empty-state copy + Hindi/Gujarati strings | ui-designer | 1 | i18n already wired |

**Total:** ~33 person-days. With 2 devs in parallel (one backend, one frontend) plus architect-gst part-time and a tester, ~3 calendar weeks.

**Critical path:** #1 → #2 → #3 → #7 → #12 → #13. ~14 pd serialized.

---

## E. Anti-Scope (we are NOT doing in v1)

We will get asked for every one of these. Answer is no.

- USB / Bluetooth weighing scale integration. Manual weight entry only. Driver work in v1.6.
- Barcode label printing (Zebra / TVS roll printers). Out.
- Real-time multi-counter sync within a branch. One device at a time per workspace. Big-store v1 means "many SKUs", not "many tills".
- Multi-branch / multi-location. Schema-ready, UI not exposed.
- Dual-screen customer-facing POS display. Out.
- UoM auto-conversion (1 dozen ↔ 12 pcs, 1 kg ↔ 1000 g) in product master. Confusing in v1, ship in v1.5.
- Recipe / BOM (1 packet of namkeen = 0.250kg loose namkeen + packaging). Manufacturing feature, not v1.
- Per-cashier shift / Z-report. v1.5 alongside multi-cashier.
- Custom UoM beyond the 8. No "guntha", no "tola" v1.
- E-invoice (IRN) auto-generation API. We capture the toggle, integration is v1.5.
- Negative-stock hard block. Soft warning only — kirana reality wins.

---

## F. Pricing & Monetization Implication

Kg/UoM support does not justify a new tier — it is **table stakes** for the kirana/grocery vertical we already advertise to. Without it we are pretending. With it we can credibly target the ~14M Indian general/grocery stores currently on Vyapar or paper, where weight is the dominant sale shape. Internal model says onboarding completion (step 7 reached in session 1) correlates ~3.5–4× with month-2 paid conversion in comparable Indian SaaS (Khatabook, Refrens disclosed numbers). Translation: this release should move free-to-paid from ~11% to ~18% on new signups within one quarter, and cut week-1 churn on grocery signups by half. No new SKU on the price card; `Pro` (₹599/mo or ₹4,999/yr) absorbs all of it. We charge for compliance and AI, not for kilograms.

---

### Build assignments

- **architect-gst**: own schema design for Product UoM delta, sample-pack content curation, money/weight rounding spec sign-off, onboarding state machine
- **backend-coder**: money.js + weight.js helpers, schema migration + backfill, sale-flow API for scale mode + amount-first, sample-pack seed loader, workspace.storeProfile + onboarding state, unit-aware reorder logic, stock-in variance API
- **frontend-coder**: 7-step onboarding wizard (replace OnboardingWizard.jsx), Quick-Sale scale-mode UI (mobile + counter), product form unit fields, stock-in variance UI, invoice render updates, Hindi/Gujarati strings
- **ui-designer**: scale-mode UI wireframes (phone + counter), onboarding empty-state copy, sample-pack visual treatment, weight-display format toggle
- **qa-tester**: 5-min onboarding speed-run E2E, kg sale flow, GSTR-1 export with Decimal128 lines, migration idempotency
- **senior-tester**: Tally-parity review for paise rounding and CGST/SGST split residue, sign-off gate before ship

Critical path owner: **architect-gst** for first 3 days (schema + helpers spec), then **backend-coder** for the migration + sale-flow API, handing off to **frontend-coder** for the activation surface.

---

End of spec.
