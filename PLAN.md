# 📋 Project Plan — Smart Inventory Management System

> **Status:** Locked v3 · **Owner:** TBD · **Last updated:** 2026-04-10
> **Type:** General-purpose inventory management system for Indian SMBs (single-tenant, INR + GST, local deploy)

---

## 🔒 Locked Decisions

| # | Decision | Value |
|---|---|---|
| 1 | Business type | General-purpose (any SMB / shop) |
| 2 | Multi-warehouse | ❌ Phase 2+ — single location for MVP |
| 3 | Barcode scanning | ❌ Phase 2+ |
| 4 | Currency / locale | ✅ **INR + proper GST** (CGST / SGST / IGST, HSN codes) |
| 5 | Expiry / batch tracking | ❌ Skipped entirely |
| 6 | Auth model | ✅ **Single-tenant, 3 roles**: `super_admin` (seed) → `admin` (shop owner) → `staff` |
| 7 | Deployment | ✅ Local only — no CI/CD or cloud config |
| 8 | Mobile / PWA | ❌ Desktop browser only |

---

## 🎯 Vision

A modern, AI-powered inventory management system that any small-to-mid business can use to track stock in real-time, predict reorder needs, automate alerts, and get actionable insights from their sales and stock data — without needing a finance or data team.

---

## 🏆 Killer Demo Trio (the 3-minute "wow")

These three flows define success. Everything in Phase 1 exists to make them work end-to-end.

| # | Flow | Why it wins |
|---|------|-------------|
| 1 | **GST Invoice Generation** — Create a sale → auto-calculates CGST / SGST / IGST from HSN codes → generates a printable GST-compliant invoice (PDF + on-screen) | Massive pain point for Indian SMBs; pairs with locked INR + GST decision |
| 2 | **Invoice → OCR → Auto GRN** — Snap a supplier bill → Tesseract reads it → stock auto-updates after human review | Reuses existing Tesseract; massive time-saver vs manual entry |
| 3 | **AI Insights Copilot** — Ask Gemini "What's running low?", "Which products are dead stock?", "What should I reorder this week?" — answers built from live DB | Reuses existing Gemini integration; conversational layer over real data |

---

## 📦 Scope

### ✅ In Scope (Phase 1 — MVP)
- Product catalog with SKU, **HSN code**, category, unit, **GST rate**
- Stock tracking with reorder thresholds
- Stock movements (stock-in, stock-out, adjustments)
- OCR-driven Goods Received Note (GRN) entry
- Sales recording with auto stock deduction
- **GST invoice generation** (CGST / SGST / IGST split, printable PDF)
- Supplier directory with **GSTIN** + transaction history
- Smart low-stock + reorder alerts
- Dashboard (today's sales, GST collected, low stock count, top movers)
- AI Insights chat (Gemini over inventory + sales context)
- **Single-tenant 3-role auth** (super_admin / admin / staff)

### 🟡 Phase 2
- **Barcode scanning** (phone camera + USB scanner)
- Purchase Order workflow (draft → sent → received)
- Multi-location / warehouse transfers
- ABC analysis (which 20% of products = 80% of revenue)
- Dead stock / slow-mover reports
- Stock aging report
- Auto reorder suggestions based on velocity
- WhatsApp / email alerts
- CSV / Excel import + export
- **GSTR-1 / GSTR-3B export** (filing-ready reports)

### 🔴 Out of Scope (for now)
- Multi-tenant SaaS billing
- Full accounting / GL integration
- Customer-facing storefront
- Manufacturing / BOM (this is for *trading*, not production)
- Payment gateway processing

---

## 🗺️ Phased Roadmap

### **Phase 0 — Foundation Audit** (current)
- [ ] Read existing models, controllers, and routes
- [ ] Document the current API surface
- [ ] Verify env setup (MongoDB connection, Gemini key, Tesseract install)
- [ ] Investigate and resolve `client/build_error.log`
- [ ] Confirm auth flow works end-to-end
- [ ] Decide whether to keep or remove the empty `socket/` folder

### **Phase 1 — MVP (Killer Demo Trio)**

#### 1.1 Product & Stock Foundation
- [ ] Audit `Product.model.js` — ensure it has: `sku`, `name`, `category`, `unit`, `hsnCode`, `gstRate`, `costPrice`, `sellingPrice`, `reorderLevel`, `reorderQty`, `isActive`
- [ ] Audit `Inventory.model.js` — ensure it tracks: `productId`, `quantityOnHand`, `lastMovementAt`
- [ ] Add unique index on `sku`
- [ ] Product CRUD UI with search + filter by category / low stock
- [ ] Seed list of common HSN codes + GST rates (5% / 12% / 18% / 28%)

#### 1.2 Stock Movements Engine
- [ ] New endpoint: `POST /stock/movement` with type = `IN | OUT | ADJUST`
- [ ] Atomic update — never let stock go negative without an explicit `allowNegative` override
- [ ] Audit trail per movement (who, when, why, reference doc)
- [ ] Stock movement history view per product

#### 1.3 Auth & Role System (single-tenant, 3 roles)
- [ ] Audit `User.model.js` — ensure `role: 'super_admin' | 'admin' | 'staff'`
- [ ] Seed script: create one super_admin from env vars on first boot
- [ ] Role-guard middleware: `requireRole(['admin', 'super_admin'])`
- [ ] User management UI (admin can create/disable staff; super_admin can do everything)
- [ ] Login + protected route wiring on the client

#### 1.4 GST Invoice Generation (Demo Trio #1)
- [ ] `Supplier` and `Customer` models carry `gstin` (validated 15-char format)
- [ ] On sale: compute per-line `taxableValue`, then split tax based on customer state vs shop state
  - Same state → CGST + SGST (each = gstRate / 2)
  - Different state → IGST (= gstRate)
- [ ] Invoice number generator (financial-year prefix, sequential, gap-free)
- [ ] PDF invoice template (HTML → PDF via `puppeteer` or `pdfkit`) — GST-compliant fields
- [ ] On-screen invoice preview before save
- [ ] Reprint / download from sales history

#### 1.5 OCR Invoice → GRN (Demo Trio #2)
- [ ] Upload invoice image endpoint (multer already wired)
- [ ] Tesseract parse → extract line items (item name, qty, unit price, tax)
- [ ] Review screen so the user can correct OCR mistakes before commit
- [ ] On confirm → bulk stock-in + supplier transaction record + GRN doc
- [ ] Link uploaded image to the GRN for audit

#### 1.6 Sales → Auto Stock Deduction
- [ ] On `Sale` create, deduct each line item from inventory atomically
- [ ] Insufficient-stock guard with override option (admin only)
- [ ] Sales history with filters (date range, customer, product)
- [ ] Daily sales summary tile on dashboard

#### 1.7 Smart Alerts
- [ ] Per-product `reorderLevel` field
- [ ] Daily `node-cron` job: scan inventory → write entries to `Alert` model when stock ≤ reorder level
- [ ] Dashboard alert panel + dismiss / snooze action

#### 1.8 AI Insights Copilot (Demo Trio #3)
- [ ] Build context bundle: low-stock list, top movers, dead stock, supplier list, recent sales summary, GST collected this month
- [ ] System prompt defining Gemini as an inventory analyst for an Indian SMB
- [ ] Streaming chat UI in `features/ai/`
- [ ] Tool use: let Gemini call typed helpers like `get_low_stock()`, `get_top_movers(days)`, `get_dead_stock(days)`, `get_gst_summary(month)`
- [ ] Suggested-question chips so users discover what they can ask

#### 1.9 Dashboard
- [ ] Tiles: Today's sales, GST collected (month), Low-stock count, Open alerts
- [ ] Charts (Recharts): Sales last 7 days, Top 10 products, Stock value over time
- [ ] Quick-action buttons: New Sale, Stock In, Open Copilot

### **Phase 2 — Operational Depth**
- [ ] Purchase Order workflow
- [ ] Multi-location / warehouse + transfer documents
- [ ] ABC analysis report
- [ ] Dead stock / slow mover report
- [ ] Stock aging report
- [ ] AI-powered reorder suggestions (velocity × lead time)
- [ ] WhatsApp / email daily digest
- [ ] CSV / Excel import & export

### **Phase 3 — SaaS-Ready**
- [ ] Multi-tenant data isolation
- [ ] Subscription / billing
- [ ] Onboarding wizard
- [ ] Public REST API + webhooks
- [ ] PWA + offline mode for warehouse staff

---

## 🗄️ Data Model Changes

### Likely new collections
- **GRN** — `{ supplierId, invoiceImageUrl, lineItems, totalAmount, totalTax, status, createdBy, createdAt }`
- **StockMovement** — `{ productId, type, quantity, reference, reason, userId, createdAt }`
- **Customer** — `{ name, gstin, billingState, phone, email }` (needed for B2B GST invoices)
- **Invoice** — `{ saleId, invoiceNumber, fyPrefix, sequence, pdfPath, gstBreakdown, createdAt }`
- **PurchaseOrder** *(Phase 2)* — `{ supplierId, lineItems, status, expectedDate, totalAmount }`

### Likely extensions
- **Product** — confirm/add: `sku` (unique), `category`, `unit`, `hsnCode`, `gstRate`, `reorderLevel`, `reorderQty`, `costPrice`, `sellingPrice`, `isActive`
- **Inventory** — add `lastMovementAt`
- **Sale** — add `deductionLog: [{ productId, qtyDeducted }]`, `cgst`, `sgst`, `igst`, `taxableValue`, `customerId`
- **Supplier** — add `gstin`, `billingState`
- **User** — confirm `role: 'super_admin' | 'admin' | 'staff'`
- **Settings** — add shop info: `shopName`, `shopGstin`, `shopState`, `shopAddress`, `invoicePrefix`

---

## 🧱 Tech Stack (already in place)

- **Frontend:** React 19, Vite 8, Tailwind 3, Framer Motion, Recharts, Axios, React Router 7
- **Backend:** Node, Express 5, Mongoose 9, JWT, Multer, Tesseract.js, Google Generative AI (Gemini)
- **Database:** MongoDB
- **Tooling:** ESLint, PostCSS

### Likely additions
- `node-cron` — alert scans, daily reports
- `joi` or `zod` — request validation
- `puppeteer` or `pdfkit` — GST invoice PDF generation
- `socket.io` *(optional)* — real-time stock updates across browser tabs (the `socket/` folder is already scaffolded)

---

## ❓ Open Questions

✅ All 8 setup questions answered. See **Locked Decisions** at the top.

---

## ✅ Success Criteria (MVP done = these all pass)

- [ ] Add a product with SKU + HSN + GST rate in <30 sec via UI
- [ ] Record a sale → GST splits correctly (CGST/SGST for intra-state, IGST for inter-state) → stock auto-deducts → printable invoice PDF generated
- [ ] Upload a sample supplier invoice image → review screen shows extracted line items → confirm → stock updates
- [ ] Low-stock alert fires when an item drops below reorder level
- [ ] Ask AI Copilot "what's running low?" → get an accurate answer pulled from live DB
- [ ] Dashboard shows today's sales, GST collected, low-stock count, and top movers correctly
- [ ] Super admin can create shop admins; admins can create staff; staff cannot manage users
- [ ] Demo trio runs end-to-end in under 5 minutes without manual fixups

---

## 🚧 Known Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `client/build_error.log` exists — current build may be broken | Unknown | Investigate first thing in Phase 0 |
| Tesseract OCR accuracy on real-world invoice formats | High | Always show a human-review screen before committing stock changes |
| Negative stock from race conditions | High | Use Mongo atomic `$inc` with conditional update |
| GST tax logic edge cases (reverse charge, exempt items, composite supply) | Medium | Stick to standard B2B/B2C in MVP; document the unsupported cases |
| Invoice number gap-free sequence under concurrent sales | Medium | Use a counter collection with `findOneAndUpdate` atomic increment |
| Gemini API costs scaling with chat usage | Medium | Cache responses; rate-limit per user; bound context window |
| `socket/` folder exists but no `socket.io` dependency | Low | Decide in Phase 0 — wire it up or delete it |

---

## 📅 Working Agreement

- One phase task at a time, marked done before starting the next
- Read existing code before writing new code
- Each Phase 1 sub-section ends with a working demo of just that piece
- No speculative abstractions — build what the demo trio needs, nothing more
- Confirm with user at every phase boundary before proceeding

---

## ⏭️ Next Step

Begin **Phase 0 — Foundation Audit**: read existing models, controllers, routes, and client wiring; document the current API surface; investigate `build_error.log`; verify Mongo + Gemini + Tesseract env; report gaps against the MVP scope above.
