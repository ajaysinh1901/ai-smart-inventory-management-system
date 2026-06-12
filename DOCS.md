# SmartStock AI — Product & Technical Documentation

> **Status:** Phase 1 MVP locked
> **Last updated:** 2026-04-29
> **Stack:** MongoDB · Express 5 · React 19 · Vite 8 · Tailwind 3 · Gemini 2.5 Flash · Tesseract.js · i18next (English / Hindi)
> **Target market:** Indian SMB retailers, kirana shops, wholesalers, distributors

---

## 1. What SmartStock AI Is

**SmartStock AI is a billing, inventory, and credit-ledger app for Indian shopkeepers — with Hindi UI, GST invoices, UPI Scan-to-Pay, and a Gemini AI copilot that answers questions like "what should I reorder this week?" in plain English.**

It replaces three things shopkeepers usually juggle separately:

1. **A paper or Tally-style inventory book** — products, stock, suppliers, GRNs.
2. **A GST invoice template** — CGST/SGST/IGST splits, HSN codes, fiscal-year invoice numbering, PDF download, WhatsApp share, UPI QR.
3. **A khata (credit) notebook** — customer ledger, payments, outstanding balances, top-debtor tracking.

Then it adds two layers Indian SMBs almost never get:

4. **Smart alerts** — daily scan for low stock, out of stock, and dead stock.
5. **A Gemini-powered Copilot** that can answer "what should I reorder this week?" using live database context.

The product is single-tenant per workspace today (one company per install) with role-based staff access (admin / manager / staff).

---

## 2. Who It's For

### Target personas (from `specs/business/indian-market-review.md`)

| Persona | Profile | Their pain | What we give them | ARPU band |
|---------|---------|-----------|-------------------|-----------|
| **Mehul, 38** — Pune kirana + FMCG distributor | ₹6.5 cr/yr, 4 staff, 2,800 SKUs, ~120 invoices/day | "GSTR-1 ready ya nahi?" calls from CA every 27th | GST + (planned) e-invoicing IRN, AI reorder copilot, Tally export | ₹4,800–6,000/yr |
| **Sunita, 45** — single-doctor pharmacy, Indore | ₹1.4 cr/yr, 4,500 SKUs, 60% credit business | Loses ~₹40k/mo to forgotten dues; mistypes medicine names at the counter | Khata ledger with WhatsApp reminders, OCR GRN, (planned) barcode + expiry tracking | ₹2,400–3,600/yr |
| **Rohan, 29** — D2C apparel + Insta seller, Bengaluru | ₹85 lakh/yr across Shopify + Meesho + walk-in | Inventory drift across channels, GSTR reconciliation hell | Unified inventory + AI insights, single source of truth | ₹6,000–9,000/yr |

### Workspace roles (RBAC)

`User.role` enum is `admin / manager / staff`:

| Role | Scope |
|------|-------|
| **admin** | Full access — products, sales, suppliers, settings, user management, alert triggers |
| **manager** | Everything except user management |
| **staff** | Read-only mostly; can record sales, stock-in, and customer payments |

### Competitive position

| Capability | SmartStock | Vyapar | Tally | Khatabook | Zoho Books |
|-----------|:----------:|:------:|:-----:|:---------:|:----------:|
| Hindi + regional UI | ✅ | ✅ | ⚠️ partial | ✅ | ⚠️ EN-first |
| GST invoice (CGST/SGST/IGST) | ✅ | ✅ | ✅ | ❌ | ✅ |
| Khata ledger | ✅ | ✅ | ⚠️ DIY | ✅ | ⚠️ |
| OCR GRN from supplier invoice | ✅ | ❌ | ❌ | ❌ | ❌ |
| AI Copilot with tool-use | ✅ | ❌ | ❌ | ❌ | ⚠️ basic |
| One app for billing + khata + inventory | ✅ | ✅ | ✅ | ❌ ledger only | ✅ |
| Dark-mode modern UX | ✅ | ❌ | ❌ | ⚠️ | ⚠️ |

The four columns where SmartStock wins clearly today: **AI Copilot with live tool-use, OCR-driven GRN, modern dark-mode UX, and a single app for billing + khata + inventory**.

---

## 2a. Pricing (indicative — see `PaywallOverlay.jsx`)

| Tier | Price | For | Key inclusions |
|------|------:|-----|---------------|
| **Free** | ₹0 | Single shop, one user, ≤ 50 invoices/mo | Inventory, sales, GST invoice, basic khata |
| **Growth** | **₹599 / mo** (₹4,999 / yr) | Persona B (Sunita-type pharmacies, kirana) | Unlimited invoices, full khata + WhatsApp reminders, OCR GRN, AI Copilot |
| **Pro** | TBD | Persona A (Mehul-type distributors) | Everything in Growth + e-invoicing (planned), GSTR export, multi-user, Hindi/regional UI, priority support |

Annual prepay carries a real (not fake) discount; Indian SMBs detect inflated MRPs in a single demo.

---

## 2b. First-run experience

`OnboardingWizard` walks every new admin through three steps in roughly 60 seconds:

1. **Company name + GSTIN** — used as the seller block on every invoice.
2. **State + address** — drives intra-state vs. inter-state GST detection.
3. **UPI ID + payee name** — encoded into the invoice QR code so customers can pay from the printout.

The wizard is bypassable for staff invitees and for anyone who already saved workspace settings.

---

## 3. Feature Map

### 3.1 Inventory (`/inventory`)
Product catalog with SKU, HSN code, GST rate, cost price, selling price, barcode, reorder threshold, supplier link.
- Search by name / SKU / category
- Stock adjustments (IN / OUT / ADJUST with reason)
- Low-stock indicator on every row
- Barcode lookup endpoint for scan-to-sell flows
- Soft delete (preserves history for old invoices)

### 3.2 Sales & GST Invoicing (`/sales`)
Create a sale with line items, choose customer, auto-calculate GST.
- **Intra-state** (seller state == buyer state): CGST + SGST, each at half the GST rate
- **Inter-state** (different state): IGST at full rate
- Per-line HSN frozen on the invoice (so historical invoices stay correct even if the product is later edited)
- Invoice number is gap-free per fiscal year (`INV-2026-00001`), allocated atomically via a `Counter` collection
- PDF generated server-side via pdfkit (A4, amount in words using Indian numbering: Crore / Lakh / Thousand)
- Print stylesheet hides chrome and fits A4
- WhatsApp share with prefilled invoice number + amount
- UPI QR code embedded (deep link `upi://pay?...`)
- Payment modes: cash / UPI / bank transfer / cheque / card / credit
- Discount guard: discount cannot exceed subtotal (prevents negative tax)
- Tally Prime XML export at `/api/v1/sales/tally.xml`

### 3.3 OCR Goods Receipt (`/scanner`)
Drag-drop a supplier invoice photo → Tesseract.js extracts text → heuristic parser pulls invoice number, vendor, line items, totals → user reviews and corrects → confirm creates a GRN, bumps stock atomically, and writes IN-type Transactions linked to the original image.
- Image formats: JPG / PNG, 10 MB cap
- Human review step is mandatory (OCR accuracy is ~70–85% on Indian invoices)

### 3.4 Customers & Khata (Credit Ledger)
Customer master with phone (`+91`-validated), GSTIN (15-char validated), state (36 Indian states / UTs), opening balance, credit limit (soft warning).

The khata is **append-only**:
- Sales auto-post a debit entry
- Payments post a credit entry (cash / UPI / cheque / bank, with receipt number)
- Adjustments post credit / debit (write-off, credit memo)
- Reversals create a new entry referencing the original; both get marked `isReversed: true` (the original is never edited)
- `runningBalance` is frozen on each entry at write time
- `Customer.outstandingBalance` is denormalized for fast reads, with a recompute endpoint to reconcile from the ledger

Top-debtors view sorts by outstanding balance descending. Statement endpoint returns full customer history (JSON or PDF).

### 3.5 Suppliers (`/suppliers`)
Supplier directory with GSTIN, contact, address. Links to all products sourced from that supplier and shows the stock-IN history. Stats endpoint returns order frequency and average lead time.

### 3.6 Smart Alerts
Daily cron (configurable, default `0 9 * * *` IST) scans every product:
- `OUT_OF_STOCK` (stock = 0) → critical
- `LOW_STOCK` (stock ≤ threshold) → warning
- `DEAD_STOCK` (no sales in last 30 days, stock > 0) → info

Alerts are upserted (no duplicates), surfaced in the top-nav bell badge, and listed at `/alerts` with dismiss action. Admins can trigger the scan on demand via `POST /alerts/run-now`.

### 3.7 AI Insights Copilot (`/ai-insights`)
Streaming chat backed by Gemini 2.5 Flash. The model has tool access:
- `get_low_stock()`
- `get_top_movers(days)`
- `get_dead_stock(days)`
- `get_gst_summary(month)`
- `get_supplier_list()`

Suggested-question chips are grouped by intent (inventory / sales / suppliers / dead-stock / operations). Rate limit is 20 req/min per IP to keep API costs predictable.

Adjacent endpoints:
- `POST /ai/predict` — 30-day demand forecast
- `GET /ai/dead-stock` — dead-stock list
- `GET /ai/reorder/:productId` — suggested reorder qty using velocity + lead time
- `GET /ai/trends` — sales-velocity trends, seasonal patterns
- `GET /ai/insights` — pre-computed daily insight feed

### 3.8 Dashboard (`/`)
Four KPI tiles (today's sales, GST collected this month, low-stock count, open alerts), a 30-day revenue line chart, top-5 products bar chart, recent transactions table, and quick-action buttons (New Sale, Stock In, Open Copilot).

### 3.9 Analytics (`/analytics`)
Recharts-powered reports: revenue trend (30-day line), category breakdown (pie), inventory health (stock value + turnover by category), profit analysis (revenue − COGS, margin % by product).

### 3.10 Settings (`/settings`)
Tabs:
1. **Profile** — name, email, job title
2. **Workspace** — company name, GSTIN, address, state, UPI ID, payee name (used on every invoice)
3. **AI Configuration** — model selector, sensitivity, dead-stock detection toggle
4. **Integrations** — placeholder (Slack, WhatsApp planned)
5. **Notifications** — channel toggles (email / push / Slack) per alert type
6. **User Management** (admin only) — list staff, set roles, deactivate

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  CLIENT (React 19 + Vite 8, port 5173)                       │
│  ──────────────────────────────────────────────────────────  │
│  Pages → Services (axios) → Backend                          │
│  Context: Auth, Theme (dark mode), Toast                     │
│  Tailwind: Bahi-Red palette, Fraunces / Inter Tight / Mono   │
│  Code-split: Analytics, AI, Scanner, Settings (React.lazy)   │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTPS  /api/v1/*
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  SERVER (Express 5, Node 20, port 5000)                      │
│  ──────────────────────────────────────────────────────────  │
│  Routes → Validators (Zod) → Controllers → Services          │
│  Middleware: protect (JWT), authorize (role), rate-limit,    │
│              upload (multer), validate, error                │
│  Crons: smartAlerts.cron (node-cron, daily 9am)              │
│  Utils: pdf.service (pdfkit), ocr.service (tesseract.js),    │
│         tally.service (XML), khata.service (ledger)          │
└────────────────┬───────────────────────────┬─────────────────┘
                 │                           │
                 ▼                           ▼
┌──────────────────────────┐   ┌─────────────────────────────┐
│  MongoDB                 │   │  Google Gemini 2.5 Flash    │
│  Collections (10):       │   │  Tool-use enabled chat      │
│  User · Product · Sale · │   │  20 req/min rate-limited    │
│  Customer · KhataEntry · │   └─────────────────────────────┘
│  Supplier · Transaction· │
│  Settings · Alert ·      │
│  Counter (atomic seqs)   │
└──────────────────────────┘
```

---

## 5. Data Model

### Collections

| Collection | Purpose | Key fields |
|-----------|---------|-----------|
| **User** | Auth + RBAC | `name`, `email`, `password` (bcrypt), `role` ∈ {admin, manager, staff} |
| **Product** | Catalog | `sku` (unique), `name`, `hsnCode` (4–8 digits), `barcode` (unique sparse), `stock`, `price`, `costPrice`, `lowStockThreshold`, `supplierId` |
| **Sale** | Invoices | `invoiceNumber` (gap-free), `customer`, `items[]`, `gst.{cgst,sgst,igst}`, `subtotal`, `total`, `paymentMode` |
| **Customer** | Buyer master | `phone` (+91), `gstin` (15), `state`, `openingBalance`, `creditLimit`, `outstandingBalance` |
| **KhataEntry** | Append-only ledger | `voucherType`, `direction` (debit/credit), `amount`, `runningBalance`, `mode`, `receiptNumber`, `isReversed` |
| **Supplier** | Vendor directory | `name`, `gst`, `phone`, `address` |
| **Transaction** | Stock movement audit | `productId`, `type` (IN/OUT), `quantity`, `saleId`, `notes` |
| **Settings** | Workspace config | `workspace.{companyName, gstin, state, upiId}`, `aiConfig`, `notifications` |
| **Alert** | Inventory alerts | `type`, `severity`, `productId`, `status` |
| **Counter** | Atomic sequence | `_id` (e.g. `invoice-2026`), `seq` |

### Relationships

```
User ──1:1── Settings
User ──1:N── Customer ──1:N── KhataEntry
User ──1:N── Sale ──N:1── Customer
                   └── items[] ──N:1── Product
                                          └── Transaction (audit)
                                          └── Alert (cron-generated)
Supplier ──1:N── Product
```

### Atomic invariants

- **Invoice numbering:** `Counter.findOneAndUpdate({_id}, {$inc:{seq:1}})` — race-free, gap-free.
- **Stock deduction:** `Product.findOneAndUpdate({_id, stock:{$gte:qty}}, {$inc:{stock:-qty}})` — fails atomically on oversell.
- **Khata posting:** Append-only `KhataEntry` + `$inc` on `Customer.outstandingBalance` in the same operation.
- **Reversal:** New entry with `reversalOf` ref; both sides flipped to `isReversed: true`. Original entry never mutated otherwise.

---

## 6. API Surface (`/api/v1/*`)

REST API across 13 domains, 47 endpoints today. Full reference:

<details>
<summary><b>Auth (5)</b></summary>

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | — | Create user |
| POST | `/auth/login` | — | JWT issue |
| GET | `/auth/me` | ✓ | Current user |
| PUT | `/auth/update` | ✓ | Update name/email |
| POST | `/auth/logout` | — | Clear token |
</details>

<details>
<summary><b>Products (8)</b></summary>

| Method | Path | Purpose |
|---|---|---|
| GET | `/products` | List + search |
| POST | `/products` | Create |
| GET | `/products/:id` | Read |
| PUT | `/products/:id` | Update |
| DELETE | `/products/:id` | Soft delete |
| PATCH | `/products/:id/stock` | Adjust stock |
| GET | `/products/low-stock` | Below threshold |
| GET | `/products/by-barcode/:code` | Scan lookup |
</details>

<details>
<summary><b>Sales (5)</b></summary>

| Method | Path | Purpose |
|---|---|---|
| POST | `/sales` | Create (atomic) |
| GET | `/sales` | List + filter |
| GET | `/sales/:id` | Read |
| GET | `/sales/:id/pdf` | PDF download |
| GET | `/sales/report` | Aggregated report |
| GET | `/sales/tally.xml` | Tally export |
</details>

<details>
<summary><b>Customers (7)</b></summary>

| Method | Path | Purpose |
|---|---|---|
| POST | `/customers` | Create |
| GET | `/customers` | List + search |
| GET | `/customers/:id` | Read |
| PATCH | `/customers/:id` | Update |
| DELETE | `/customers/:id` | Soft delete |
| GET | `/customers/top-debtors` | Top N by balance |
| POST | `/customers/:id/recompute-balance` | Reconcile from ledger |
</details>

<details>
<summary><b>Khata (5)</b></summary>

| Method | Path | Purpose |
|---|---|---|
| POST | `/khata/payments` | Record payment |
| POST | `/khata/adjustments` | Write-off / credit memo |
| POST | `/khata/entries/:id/reverse` | Reverse entry |
| GET | `/khata/customers/:customerId/entries` | Ledger lines |
| GET | `/khata/customers/:customerId/statement` | Full statement |
| GET | `/khata/summary` | Total exposure, aging |
</details>

<details>
<summary><b>Suppliers (8)</b> · <b>Transactions (6)</b> · <b>Alerts (4)</b> · <b>Analytics (4)</b> · <b>OCR (3)</b> · <b>AI (7)</b> · <b>Settings (3)</b> · <b>Health (1)</b></summary>

See section 6 of the explore report for the full list. Key ones:
- `POST /ai/chat` (rate-limited 20/min) — Gemini chat with tool use
- `POST /ocr/save` — confirm GRN after review
- `GET /analytics/dashboard` — KPI tiles data
- `POST /alerts/run-now` (admin) — trigger smart-alerts scan
</details>

---

## 7. Auth & Security

- **Hashing:** bcryptjs, 10 rounds
- **Token:** JWT (HS256), 7-day expiry (`JWT_EXPIRES_IN`)
- **Storage:** localStorage on client + HTTP-only cookie support; `withCredentials: true` on axios
- **Header injection:** Axios request interceptor attaches Bearer token automatically
- **Rate limits:**
  - Auth endpoints: 15 req/min/IP
  - AI chat: 20 req/min/IP
  - Global: 200 req/min/IP
  - Bypassed when `NODE_ENV=test`
- **Validation:** Zod schemas on every POST/PUT route. Returns `400` with field-level errors, never a 500 stack.
- **Format guards:** GSTIN regex (15 chars), Indian phone (`+91[6-9]\d{9}`), HSN (4–8 digits), state (enum of 36 Indian states/UTs).
- **No oversell:** atomic conditional update on `Product.stock`.
- **No double-spend on invoice numbers:** atomic Counter.

---

## 8. Frontend Stack & Conventions

### Localisation
- `react-i18next` with English and Hindi locales in `client/src/i18n/locales/`.
- Language switcher (`components/LanguageSwitcher.jsx`) in the top nav; selection persists to `localStorage`.
- All user-facing strings flow through `t()` — no hard-coded English in shipped pages.

### Styling
- Tailwind 3 with `darkMode: 'class'`, toggled via `ThemeContext`, persisted to `localStorage`.
- Brand palette ("Bahi" — accountant's ledger book):
  - **Primary** `#8B1E1E` (Bahi Red) — buttons, errors
  - **Brass** `#C8973F` — paid / settled states
  - **Paper** `#F4EFE6` — light background (ivory)
  - **Ink** `#14110D` — dark text (lamp-black)
- Fonts (self-hosted woff2 in repo root):
  - **Display:** Fraunces (headers)
  - **Body:** Inter Tight (UI text)
  - **Mono:** JetBrains Mono (numerics, code)
- Custom animations: `fadeIn`, `slideUp`, `shimmer`, `modalFade`, `modalSlide`, `pulseSoft`.
- Print stylesheet hides sidebar/topnav and fits invoice to A4.

### State management
- `AuthContext` — current user, login/logout/register
- `ThemeContext` — light/dark
- `ToastContext` — stackable transient notifications

### Routing
React Router 7. Public: `/login`. Everything else is wrapped in `DashboardLayout` and gated by `PrivateRoute`. `Analytics`, `AiInsights`, `Scanner`, `Settings` are lazy-loaded to keep the initial bundle under 300 kB.

### Reusable UI primitives (`components/ui/`)
Button · Input · Select · Textarea · Card · Modal · Badge · Skeleton · EmptyState · ErrorBanner · PageHeader · KpiStrip · LedgerStrip · Money · StatusGlyph · PaywallOverlay

---

## 9. Backend Stack & Conventions

- **Express 5** with versioned routes mounted at `/api/v1`.
- **Mongoose 9** for MongoDB; all schemas in `server/src/models/`.
- **Validators** (Zod) sit between routes and controllers.
- **Services** (`server/src/services/`) hold reusable business logic — `pdf.service`, `ocr.service`, `khata.service`, `tally.service`, `inventory.service`, `auth.service`, `user.service`, `ai.service` (Gemini orchestrator, tool dispatch).
- **Crons** lazy-load `node-cron` so a missing dep doesn't crash boot. The smart-alerts cron is the only one wired today.
- **Error middleware** returns clean JSON, never HTML stacks.

---

## 10. Notable Implementation Details

### GST math
```
gross  = Σ (qty × unitPrice)
taxable = gross − discount     (discount ≤ gross enforced)
if seller.state == buyer.state:
    cgst = taxable × rate / 2
    sgst = taxable × rate / 2
    igst = 0
else:
    cgst = sgst = 0
    igst = taxable × rate
total = taxable + cgst + sgst + igst
```
Each tax field is `.toFixed(2)` to avoid float drift. HSN is frozen per line.

### Invoice number allocation
```js
const { seq } = await Counter.findOneAndUpdate(
  { _id: `invoice-${fiscalYear}` },
  { $inc: { seq: 1 } },
  { new: true, upsert: true }
);
const invoiceNumber = `INV-${fiscalYear}-${String(seq).padStart(5, '0')}`;
```

### Atomic stock deduction
```js
const updated = await Product.findOneAndUpdate(
  { _id, stock: { $gte: quantity } },
  { $inc: { stock: -quantity } },
  { new: true }
);
if (!updated) throw new Error('Insufficient stock');
```

### Khata reversal
The original entry is **never** mutated. A new entry is written with the inverse direction and `reversalOf: originalId`. Both records get `isReversed: true` so audit trails stay intact. `runningBalance` on the new entry uses the post-reversal balance.

### PDF invoice
pdfkit, A4, 40 px margins. Two-column header (seller left, buyer right). Dynamic tax columns: inter-state shows IGST only; intra-state shows CGST + SGST. Amount in words uses Indian numbering (Crore / Lakh / Thousand). UPI QR encoded in the footer.

### OCR pipeline
1. Multer accepts JPG/PNG up to 10 MB → stores under `uploads/`
2. `tesseract.js` `recognize(filePath, 'eng')` returns raw text
3. Heuristic regex extracts invoice no, date, vendor, line items, totals
4. Frontend shows a review form
5. On confirm: GRN doc created, bulk `$inc` on `Product.stock`, `Transaction` rows of type IN

### AI tool use
Gemini 2.5 Flash gets a system prompt that frames it as an inventory analyst for an Indian SMB. Tool definitions are typed (JSON schema). On each turn the model can request a tool call; the server executes the matching service function and returns the result back into the model context. Streaming responses are sent to the client over SSE-style chunked transfer.

---

## 11. Local Development

```bash
# 1. Backend
cd server
cp .env.example .env       # set MONGODB_URI, JWT_SECRET, GEMINI_API_KEY, CLIENT_URL
npm install
npm start                   # listens on :5000

# 2. Frontend
cd client
cp .env.example .env       # set VITE_API_URL=http://localhost:5000/api/v1
npm install
npm run dev                 # Vite on :5173
```

Visit http://localhost:5173 and register the first user.

### Environment variables

**`server/.env`**
```
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/MERNDB
JWT_SECRET=<32+ random chars>
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
GEMINI_API_KEY=<your-gemini-api-key>
SMART_ALERTS_CRON=0 9 * * *
```

**`client/.env`**
```
VITE_API_URL=http://localhost:5000/api/v1
```

---

## 12. Production Hardening Checklist

- [ ] `JWT_SECRET` ≥ 64 random chars, stored in secret manager
- [ ] `NODE_ENV=production` (re-enables full rate limiter)
- [ ] CORS locked to production `CLIENT_URL`
- [ ] No `console.log` in production code paths
- [ ] `/health` returns DB ping + uptime + version
- [ ] Logs shipped to centralised store (Morgan → file or stdout → log aggregator)
- [ ] Daily MongoDB backup (mongodump cron)
- [ ] Tesseract `uploads/` directory mounted on persistent volume, periodic cleanup
- [ ] Gemini API key on a separate quota tier from prototype use
- [ ] HTTPS termination at the reverse proxy (nginx / Caddy)
- [ ] Cron timezone explicitly IST (`TZ=Asia/Kolkata`)

---

## 13. Roadmap

**Phase 1.5 — counter readiness (next 30 days)**
- Camera-based barcode scan via `@zxing/browser` (`barcode` field already in `Product`)
- 58 mm thermal-printer invoice template (ESC/POS via browser print)

**Phase 2 — compliance & growth (Q3)**
- **E-invoicing (IRN + signed QR)** via a sandbox-certified GSP (ClearTax / Masters India / IRIS) — required as the GST e-invoicing turnover threshold keeps dropping
- **WhatsApp Business API** for automated khata payment reminders (not just `wa.me?text=` links)
- GSTR-1 / GSTR-3B JSON export so the customer's CA stays inside SmartStock
- Purchase Order workflow (PO → GRN match)
- Multi-location / warehouse transfers
- Per-tenant token accounting on the Gemini Copilot (prerequisite for SaaS pricing)

**Phase 3 — SaaS**
- Multi-tenant with workspace-scoped data
- Razorpay subscription billing
- Tier enforcement on the existing `PaywallOverlay`

---

## 14. Glossary

| Term | Meaning |
|------|---------|
| **GSTIN** | 15-character GST registration number |
| **HSN** | Harmonised System of Nomenclature — product tax code (4–8 digits) |
| **CGST / SGST** | Central / State GST — applies on intra-state sales |
| **IGST** | Integrated GST — applies on inter-state sales |
| **GRN** | Goods Received Note — record of inward stock |
| **Khata** | Hindi for "ledger" — running credit account per customer |
| **Dead stock** | Inventory that hasn't sold in 30+ days |
| **Counter** | MongoDB collection used for atomic sequence allocation |
| **HSM** | (not used here) |

---

## 15. File-Level Index

**Backend (`server/src/`)**
- `models/` — 10 Mongoose schemas
- `routes/v1/` — REST endpoints, mounted on `/api/v1`
- `controllers/` — 13 controllers (one per domain)
- `services/` — 8 service modules (PDF, OCR, khata, tally, inventory, auth, user, ai)
- `middleware/` — auth, rate-limit, validate, upload, error
- `validators/` — 10 Zod schemas
- `crons/` — `smartAlerts.cron.js`
- `constants/` — `indianStates.js`
- `app.js`, `server.js` — bootstrap

**Frontend (`client/src/`)**
- `pages/` — 11 top-level pages
- `components/` — Sidebar, TopNav, ErrorBoundary, OnboardingWizard, HelpChatbot
- `components/ui/` — 16 reusable primitives
- `layouts/DashboardLayout.jsx` — protected shell
- `context/` — Auth, Theme, Toast
- `services/` — 8 axios-based API modules
- `hooks/`, `utils/` — formatters, icon map, chart theme

---

*This document reflects the codebase as of the date above. For business strategy and pricing, see `PRODUCTION_PLAN.md`. For agent-orchestration rules, see `AGENTS_PLAN.md`. For phase-by-phase delivery plan, see `PLAN.md`.*
