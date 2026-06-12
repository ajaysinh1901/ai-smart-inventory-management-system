# Production Plan — SmartStock AI

> **Status:** Active · **Created:** 2026-04-28
> **Companion to:** [PLAN.md](PLAN.md) (locked vision) · [AGENTS_PLAN.md](AGENTS_PLAN.md) (agent system)
> **Goal:** Take the current MVP from "works on my machine" to "production-ready + visually polished"

---

## Where We Are Today

✅ **Already built** (from previous implementation pass):
- All 9 pages working with real backend data
- lucide-react icons everywhere (zero Material Symbols)
- Indian GST invoice format (CGST/SGST/IGST split, HSN codes, INR)
- Real OCR via Tesseract.js
- Settings backend wired (Profile, Workspace, AI Config, Notifications)
- Analytics page with recharts (revenue trend, category pie, inventory health)
- AI chatbot + dead-stock fix + enriched context
- Build clean, server boots clean

❌ **Still missing for production:**
1. **UI polish** — inconsistent loading/empty states, no toast feedback on most actions, sidebar can't collapse, no mobile layout, no keyboard shortcuts
2. **Production hardening** — no error boundary, no 404 page, no input validation on backend, no rate limiting active, bundle is 876kB un-split
3. **Feature gaps** — `super_admin` role, smart-alerts cron, PDF download for invoice (currently print-to-PDF only), CSV export, customer model
4. **Testing** — zero smoke tests, zero unit tests
5. **Deployment** — no `.env.example`, no Dockerfile, no production CORS config, no health endpoint

---

## Phase A — UI/UX Polish (visible win, do first)

**Goal:** Make the app *feel* professional. Every interaction should give feedback, every empty state should look intentional.

### A1. Design System Lockdown
- **Owner:** `frontend-coder`
- **Files:** `client/src/index.css`, `client/tailwind.config.js`, new `client/src/components/ui/*`
- **Tasks:**
  - Extract reusable primitives: `Card`, `Button` (variants: primary/secondary/danger/ghost), `Input`, `Select`, `Textarea`, `Modal`, `Badge`, `Skeleton`, `EmptyState`, `Toast`
  - Tailwind tokens: refine spacing scale, define `text-h1`/`text-h2`/`text-body`/`text-caption` utilities
  - Pick final accent palette: keep primary `#482de1`, add semantic `success` (green-600), `warning` (amber-500), `danger` (red-500), `info` (blue-500)
- **Accept:** All pages refactored to use the primitives. Zero ad-hoc Tailwind class soup repeated 3+ times.

### A2. Loading & Empty States Everywhere
- **Owner:** `frontend-coder`
- **Files:** All `client/src/pages/*.jsx`
- **Tasks:**
  - Skeleton loaders for: Dashboard tiles, all tables, chart containers, AI insights cards
  - Empty states with icon + heading + sub-text + primary CTA on: Inventory, Suppliers, Transactions, Sales, Scanner queue
  - Error banner pattern (red-50 bg, red-700 text, red-200 border, dismiss button) used consistently
- **Accept:** Disconnect MongoDB → every page degrades gracefully with "Couldn't load — Retry" instead of blank/broken UI.

### A3. Toast Feedback System
- **Owner:** `frontend-coder`
- **Files:** `client/src/components/ToastStack.jsx`, all pages with mutations
- **Tasks:**
  - Wrap every mutation (create product, create sale, save settings, etc.) with a toast: success ("Product saved") or error ("Failed: <reason>")
  - Toasts auto-dismiss after 3.5s, stackable, dismissible
- **Accept:** Click any save/delete button — get visual confirmation within 500ms.

### A4. Sidebar Collapse + Active State
- **Owner:** `frontend-coder`
- **Files:** `client/src/components/Sidebar.jsx`, `client/src/layouts/DashboardLayout.jsx`
- **Tasks:**
  - Collapse to icon-only (64px wide), persist to localStorage
  - Tooltip on hover when collapsed
  - Cleaner active state (left accent bar + bg highlight)
- **Accept:** Click collapse → sidebar shrinks → reload page → stays collapsed.

### A5. Top Nav Improvements
- **Owner:** `frontend-coder`
- **Files:** `client/src/components/TopNav.jsx`
- **Tasks:**
  - Functional global search (jump to product/supplier/sale by name/SKU/invoice)
  - Notification dropdown (reads from `Alert` model — depends on E1)
  - User menu dropdown (Profile, Settings, Logout)
- **Accept:** `Ctrl+K` opens global search; results group by entity type.

### A6. Dashboard Density & Hierarchy
- **Owner:** `frontend-coder`
- **Files:** `client/src/pages/Dashboard.jsx`
- **Tasks:**
  - Top row: 4 KPI tiles (Today's revenue, GST collected this month, Low-stock count, Open alerts)
  - Middle: Sales-last-30-days line chart (full width) + Top 5 products bar chart (right rail)
  - Bottom: Recent transactions table + Critical alerts panel
  - Quick-action floating bar: "New Sale", "Stock In", "Open Copilot"
- **Accept:** Dashboard tells you the 4 numbers that matter in <2s of looking.

### A7. Form Polish
- **Owner:** `frontend-coder`
- **Files:** All modals (Inventory, Suppliers, Sales, Settings)
- **Tasks:**
  - Inline validation (red border + helper text on blur)
  - Required-field asterisks
  - Disabled submit until valid
  - Loading spinner on submit button (not just full-screen overlay)
- **Accept:** Submit empty form → red helpers appear inline, no alert popups.

### A8. Mobile Responsiveness Pass
- **Owner:** `frontend-coder`
- **Files:** `Sidebar.jsx`, `DashboardLayout.jsx`, all pages
- **Tasks:**
  - Sidebar → hamburger drawer below `md` breakpoint
  - Tables → horizontal scroll with sticky first column below `md`
  - Modal → full-screen below `sm`
  - Touch-friendly tap targets (min 44×44px)
- **Accept:** App is usable on iPad (768px) and iPhone (375px).

### A9. Print Stylesheet for Invoices
- **Owner:** `frontend-coder`
- **Files:** `client/src/pages/SalesPage.jsx`, `client/src/index.css`
- **Tasks:**
  - `@media print` rules: hide sidebar/topnav/buttons, fit invoice to A4 page, ensure GST tables don't break across pages
  - "Download PDF" button on invoice modal triggers `window.print()` with print stylesheet
- **Accept:** Print preview shows clean A4 invoice, no UI chrome.

---

## Phase B — Production Hardening

### B1. React Error Boundary + 404 Page
- **Owner:** `frontend-coder`
- **Files:** `client/src/App.jsx`, new `client/src/components/ErrorBoundary.jsx`, new `client/src/pages/NotFoundPage.jsx`
- **Accept:** Throw an error in any page → ErrorBoundary catches → user sees "Something went wrong — Reload" instead of white screen.

### B2. Backend Input Validation
- **Owner:** `architect-gst` (specs) → `backend-coder` (impl)
- **Files:** `server/src/middlewares/validate.middleware.js` (new), all controllers
- **Tasks:**
  - Use `zod` or `joi` for schema validation
  - Validate: required fields, types, ranges, enums, GSTIN format (15 chars), HSN format
  - Return 400 with field-level errors, not 500 with stack traces
- **Accept:** `POST /products` with `price: -50` → 400 `{ field: 'price', message: 'must be positive' }`.

### B3. Rate Limiting Active
- **Owner:** `backend-coder`
- **Files:** `server/src/middlewares/rateLimiter.middleware.js`, `server/src/app.js`
- **Tasks:**
  - Mount `express-rate-limit` on `/api/v1/auth/*` (5 req/min) and `/api/v1/ai/chat` (20 req/min)
- **Accept:** Spam login endpoint 10 times → 6th request returns 429.

### B4. Code Splitting (bundle 876kB → <250kB initial)
- **Owner:** `frontend-coder`
- **Files:** `client/src/App.jsx`
- **Tasks:**
  - `React.lazy()` for: AnalyticsPage, AiInsightsPage, ScannerPage, SettingsPage (heaviest pages)
  - Suspense boundary with skeleton fallback
- **Accept:** `npm run build` initial chunk < 300kB; AnalyticsPage chunk loads on-demand.

### B5. Health Check + Logging
- **Owner:** `backend-coder`
- **Files:** new `server/src/routes/v1/health.routes.js`, `server/src/app.js`
- **Tasks:**
  - `GET /health` returns `{ status, db, uptime, version }`
  - Add `morgan` or simple request logger
- **Accept:** Curl `/health` returns 200 with DB status and process uptime.

### B6. Auth Hardening
- **Owner:** `backend-coder`
- **Files:** `server/src/controllers/auth.controller.js`, `server/src/middlewares/auth.middleware.js`
- **Tasks:**
  - JWT expiry to 7 days (currently 30)
  - Refresh-token rotation OR re-login on expiry (decide via architect)
  - Clear cookie on logout (already done, verify)
  - Lockout after 5 failed login attempts (15-min cooldown)
- **Accept:** 6 wrong passwords → "Account locked, try in 15 min."

---

## Phase C — Feature Completion

### C1. `super_admin` Role + Seed
- **Owner:** `architect-gst` (spec) → `backend-coder` (impl)
- **Files:** `server/src/models/User.model.js`, `server/src/migrations/seed.js`, `server/src/middlewares/auth.middleware.js`
- **Tasks:**
  - Add `super_admin` to role enum
  - Seed creates one super_admin from env (`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`)
  - super_admin can manage admins; admin can manage staff; staff is read-mostly
- **Accept:** Fresh DB → seed script → super_admin exists with role check working.

### C2. Smart Alerts Cron + Notification Bell
- **Owner:** `architect-gst` (spec) → `backend-coder` (impl) + `frontend-coder` (bell UI)
- **Files:** `server/src/crons/smartAlerts.cron.js`, `server/src/models/Alert.model.js`, `client/src/components/TopNav.jsx`
- **Tasks:**
  - Daily cron at 9am IST: scan products, write `Alert` docs for low-stock, dead-stock, reorder-due
  - `GET /alerts` endpoint, `PATCH /alerts/:id/dismiss`
  - Bell badge count in TopNav, dropdown lists alerts
- **Accept:** Trigger cron manually → alerts appear in bell within 5s.

### C3. PDF Invoice Generator (server-side)
- **Owner:** `architect-gst` (template spec) → `backend-coder` (impl)
- **Files:** new `server/src/services/pdf.service.js`, `server/src/controllers/sale.controller.js`
- **Tasks:**
  - Use `pdfkit` (server) — exact GST-compliant layout per spec 04
  - `GET /sales/:id/pdf` returns binary PDF with proper Content-Type
- **Accept:** Download PDF, open in any reader, all GST fields legible and correctly formatted.

### C4. Customer Model + Customer Picker
- **Owner:** `architect-gst` (spec) → `backend-coder` + `frontend-coder`
- **Files:** new `server/src/models/Customer.model.js`, controller, routes, `client/src/pages/CustomersPage.jsx`
- **Tasks:**
  - Customer schema: name, gstin, email, phone, billingAddress, shippingAddress, state
  - Sales modal: customer dropdown with search + "Add new" inline
  - Sales filterable by customer
- **Accept:** Create customer → use in sale → sale links to customer ID, not just inline name.

### C5. CSV Export
- **Owner:** `backend-coder`
- **Files:** new `server/src/services/csv.service.js`, controllers
- **Tasks:**
  - Endpoints: `GET /products/export`, `GET /sales/export?from=&to=`, `GET /transactions/export`
  - Stream CSV (no in-memory build for large datasets)
- **Accept:** 1000 sales export to CSV in < 3s, opens cleanly in Excel.

### C6. Audit Log
- **Owner:** `architect-gst` → `backend-coder`
- **Files:** new `server/src/models/AuditLog.model.js`, middleware
- **Tasks:**
  - Log: who, when, action (create/update/delete), entity, before/after diff (compact)
  - Visible in Settings → Audit tab (super_admin only)
- **Accept:** Edit a product → audit entry exists → super_admin sees it in UI.

---

## Phase D — Testing

### D1. Smoke Test Suite (per `qa-tester`)
- **Owner:** `qa-tester`
- **Files:** `tests/smoke/*.test.js`
- **Tasks:** One file per resource (auth, product, supplier, transaction, sale-gst, ai, analytics, settings, ocr) — see `tests/smoke/README.md`
- **Accept:** `for f in tests/smoke/*.test.js; do node "$f"; done` exits 0 on green run.

### D2. Critical-Path E2E (optional, after D1)
- **Owner:** `qa-tester`
- **Tool:** Playwright
- **Tasks:** Three flows — login → create sale → download invoice; upload OCR → save to inventory; chat with AI assistant
- **Accept:** All three pass on a clean seed.

---

## Phase E — Deployment Prep

### E1. Environment Hygiene
- **Owner:** `backend-coder` + `frontend-coder`
- **Files:** new `server/.env.example`, new `client/.env.example`, `README.md`
- **Tasks:** Document every required env var, never commit real secrets, add `.env*` to `.gitignore` (verify).
- **Accept:** Fresh clone → copy `.env.example` → fill values → `npm install && npm run dev` works.

### E2. Dockerfile + docker-compose
- **Owner:** `backend-coder`
- **Files:** new `server/Dockerfile`, new `client/Dockerfile`, root `docker-compose.yml`
- **Tasks:** 3 services — mongo, server (Node 20), client (Vite preview / nginx)
- **Accept:** `docker compose up` → app reachable on `http://localhost:3000`.

### E3. Production CORS + HTTPS notes
- **Owner:** `backend-coder`
- **Files:** `server/src/app.js`, `README.md`
- **Tasks:** CORS reads from `CLIENT_URL` env var; document HTTPS setup behind nginx/Caddy.
- **Accept:** Deploy guide in README is reproducible by another engineer.

---

## Recommended Execution Order

```
Week 1-2:  Phase A (UI Polish)               ← biggest visible impact
Week 3:    Phase B (Hardening)               ← protects against demo embarrassment
Week 4-5:  Phase C (Features)                ← C1, C2, C3 are highest value
Week 6:    Phase D (Testing) + Phase E (Deploy prep)
```

Skip Phase E entirely if "deploy after testing" still means "later." It's there for when you're ready.

---

## Agent Assignment Cheat Sheet

| Phase | architect-gst | backend-coder | frontend-coder | qa-tester |
|---|---|---|---|---|
| A (UI) | — | — | A1–A9 | — |
| B (Hardening) | B2, B6 spec | B2, B3, B5, B6 | B1, B4 | — |
| C (Features) | C1, C2, C3, C4, C6 specs | C1, C2, C3, C4, C5, C6 | C2, C4 | — |
| D (Testing) | — | — | — | D1, D2 |
| E (Deploy) | — | E1, E2, E3 | E1 | — |

---

## Acceptance Criteria for "Production Ready"

The website is production-ready when **all** of these are true:

- [ ] Every page has loading + empty + error states
- [ ] Every mutation gives toast feedback
- [ ] No 500 errors visible to user (always returns structured 4xx with field details)
- [ ] Bundle initial chunk < 300kB
- [ ] Auth lockout works
- [ ] Health endpoint returns 200
- [ ] All 9 smoke test files pass
- [ ] Mobile (375px) is usable
- [ ] Invoice prints cleanly to A4
- [ ] Smart alerts cron fires daily and writes to DB
- [ ] super_admin seed works on fresh DB
- [ ] PDF invoice download works server-side
- [ ] `.env.example` exists for both client and server
- [ ] Docker compose brings up the full stack
- [ ] README has step-by-step setup that a stranger can follow

---

## Open Questions to Resolve Before Phase C

1. **Customer model now or later?** C4 doubles the data model surface — defer to Phase 2 if MVP scope is tight.
2. **PDF library — pdfkit or puppeteer?** pdfkit is lighter (no Chromium), puppeteer renders existing HTML invoice unchanged. Recommend **pdfkit** for server cost.
3. **Refresh tokens?** Adds complexity. For local single-tenant deploy, 7-day JWT + re-login on expiry is fine.
4. **CSV export streaming?** If `< 5000` rows, in-memory is OK. Stream only if scaling. Default to in-memory for MVP.
5. **Multi-tab session sync?** localStorage event listener for logout-everywhere. Skip for MVP.
