# Spec: Customer + Khata (Running Ledger)
**Status:** Draft
**Owner:** architect-gst
**Implements:** New module — to be slotted as task K1 in PLAN.md

## 0. Audit findings (before the spec)

- `Sale.model.js` is **not scoped by `userId`** — it uses `createdBy` (User ref) only. `getSales` does not filter by `req.user.id` either. This is a multi-tenancy bug in the existing code. The Customer/Khata spec below uses `userId` as the scope field (matching `Settings.model.js`) and flags the Sale gap as out-of-scope-but-recommended.
- `Sale.invoiceNumber` has `unique: true` (global, not per-user) — preserved as-is.
- `Counter` model is keyed by `_id: invoice-${year}` — same atomic pattern will be reused for receipt numbers.
- Validators use `zod` with regex `^[0-9A-Z]{15}$` for GSTIN — reused below.
- Client `INDIAN_STATES` list confirmed at `client/src/pages/SalesPage.jsx:11-19` (36 entries: 28 states + 8 UTs). Spec uses identical strings.
- `SalesPage.jsx` invoice modal uses inline-styled HTML + `window.print()` — statement renderer follows the same pattern, no PDF service round-trip.

## 1. Problem

Indian SMB shopkeepers (kirana, electronics, distributors) extend informal credit ("udhaar") to regulars and track it in a paper notebook — the *khata*. Today SmartStock AI snapshots customer details into each `Sale` document but has no concept of:

1. A persistent **Customer** record across sales.
2. A **running ledger** of debits (credit sales) and credits (cash receipts) per customer, with a current outstanding balance.
3. A way to render a **statement of account** (PDF / WhatsApp share) for a customer over a date range.

This spec adds those three things without breaking existing Sale snapshots. The Sale's embedded `customer.{name,phone,gstin,...}` block is the historical, immutable invoice-of-record. The new `Customer` collection is a denormalized aggregate that powers udhaar, statements, and the "Top Debtors" dashboard tile.

**Non-goals:** GSTR-3B credit-note flow, supplier ledger (separate spec), multi-currency, partial-line refunds.

## 2. Architectural Decisions (with reasoning)

### D1. Separate `Customer` collection — do **not** move the embedded `Sale.customer` block.
**Why:** Invoices are legal documents under GST law (Sec 31, CGST Act). The customer name/GSTIN/address printed on Invoice INV-2025-00042 must remain forever the values that were on the invoice when issued, even if the customer later changes their address or GSTIN. Moving to a populated reference would make historical invoice reprints lie. The embedded snapshot stays; the new `Customer._id` is added as a **link**, not a replacement.

### D2. Ledger lives in its own collection: `KhataEntry` (NOT denormalized onto Sale + Payment).
**Why considered:**
| Approach | Pros | Cons |
|---|---|---|
| (a) Embed entries on Customer | One read for statement | Mongo doc size cap (16MB), unbounded array, breaks indexing |
| (b) Denormalize: read Sales + Payments side by side at query time | No new collection | Statement rendering does sort-merge on every fetch; adjustments don't fit |
| **(c) Separate KhataEntry collection** ✅ | Single source of truth, supports voucher types beyond Sale/Payment (Adjustment, OpeningBalance, Refund), one indexed query for statements, atomic balance via `$inc` on Customer | One extra collection |

**Recommended: (c).** Each KhataEntry is an immutable line; corrections happen via reversing entries (Adjustment), never UPDATE/DELETE. This matches double-entry accounting practice and keeps the audit trail clean.

### D3. `outstandingBalance` is denormalized on `Customer` and updated via atomic `$inc`.
**Why:** Statement rendering needs the current balance at the top of the page in O(1), not a sum of N entries. Recomputing from KhataEntry on every read is acceptable for low-volume shops but breaks the "Top Debtors" dashboard query (sort by balance). Source of truth is the KhataEntry stream; the Customer.outstandingBalance is a cache, refreshable via a `POST /customers/:id/recompute-balance` admin endpoint.

### D4. `runningBalance` is **stored** on each KhataEntry at write time.
**Why:** Statement PDFs must show "balance after this entry" on every line. Computing it client-side requires the full ledger; computing server-side via `$accumulator` on every render is expensive. We write it once at insert (under a per-customer lock) and never touch it again. Reorder/backdate is not supported in v1 — entries are append-only by `createdAt`.

### D5. Sign convention: **debit = positive, credit = negative**.
- Sale on credit → +1000 → outstandingBalance increases (customer owes more).
- Cash payment received → −1000 → outstandingBalance decreases.
- A negative `outstandingBalance` means the shop owes the customer (overpayment / advance).

## 3. Customer Schema

**File:** `server/src/models/Customer.model.js`

### 3.1 Field table

| Field | Type | Required | Default | Validator | Index | Notes |
|---|---|---|---|---|---|---|
| `userId` | ObjectId(ref: User) | yes | — | — | compound w/ phone, gstin | Workspace/tenant scope. Mirrors `Settings.userId`. |
| `name` | String | yes | — | trim, 1–120 chars | text index | Display name; not unique. |
| `phone` | String | no | `''` | regex `/^(\+91)?[6-9]\d{9}$/` after normalization | compound unique with userId, sparse | Primary lookup key for upsert from Sale. Stored normalized as `+91XXXXXXXXXX` (10-digit Indian mobile, leading 6/7/8/9). |
| `email` | String | no | `''` | RFC email or empty | — | Optional. |
| `gstin` | String | no | `''` | regex `/^[0-9A-Z]{15}$/` or empty | partial unique with userId where gstin != '' | Reused from `sale.validator.js`. B2B customers will have one; B2C won't. |
| `gstinHistory` | [{ gstin, changedAt }] | no | `[]` | gstin regex per entry | — | Audit trail. New entry pushed whenever gstin changes (see edge case E5). |
| `addressLine1` | String | no | `''` | max 200 | — | |
| `addressLine2` | String | no | `''` | max 200 | — | |
| `city` | String | no | `''` | max 80 | — | |
| `state` | String | no | `''` | enum from INDIAN_STATES (see §3.3) | — | Drives intra/inter-state GST when this customer is selected at billing. |
| `pinCode` | String | no | `''` | regex `/^\d{6}$/` or empty | — | |
| `country` | String | no | `'India'` | — | — | v1: hardcoded India. |
| `openingBalance` | Number | no | `0` | finite, 2-decimal | — | Set once at customer creation (legacy udhaar carry-over). On insert, an `OpeningBalance` KhataEntry is written so the ledger reconciles. |
| `creditLimit` | Number | no | `0` | `>= 0` | — | `0` means "no limit enforced". UI warns if a new credit sale would push outstandingBalance > creditLimit. Soft warning, not a hard block (kirana flow). |
| `outstandingBalance` | Number | no | `0` | finite | desc index for top-debtors | Denormalized; updated via `$inc` on every KhataEntry write. |
| `notes` | String | no | `''` | max 2000 | — | Free text ("brother of Ramesh", "always pays Saturday"). |
| `tags` | [String] | no | `[]` | each ≤ 30 chars, max 10 | — | e.g. `['wholesale', 'monthly']`. |
| `isActive` | Boolean | no | `true` | — | — | Soft-delete flag. Inactive customers hidden from billing autocomplete but ledger preserved. |
| `lastTransactionAt` | Date | no | `null` | — | — | Updated on every KhataEntry write. Used to surface "stale" customers. |
| `createdBy` | ObjectId(ref: User) | yes | `req.user.id` | — | — | Same pattern as `Sale.createdBy`. |
| `createdAt` / `updatedAt` | Date | auto | — | — | — | `timestamps: true`. |

### 3.2 Indexes (declared in schema)

```
{ userId: 1, phone: 1 }     unique, partial: { phone: { $exists: true, $ne: '' } }
{ userId: 1, gstin: 1 }     unique, partial: { gstin: { $exists: true, $ne: '' } }
{ userId: 1, name: 'text' } for autocomplete
{ userId: 1, outstandingBalance: -1 } for top-debtors query
{ userId: 1, isActive: 1, lastTransactionAt: -1 } for list view
```

The phone partial index is critical — without `partial`, every walk-in customer with empty phone collides on the empty-string key.

### 3.3 INDIAN_STATES enum

Mirror `client/src/pages/SalesPage.jsx:11-19` exactly. Export as a constant from `server/src/constants/indianStates.js` so client and server cannot drift. The 36 entries are:

```
Andhra Pradesh, Arunachal Pradesh, Assam, Bihar, Chhattisgarh, Goa, Gujarat,
Haryana, Himachal Pradesh, Jharkhand, Karnataka, Kerala, Madhya Pradesh,
Maharashtra, Manipur, Meghalaya, Mizoram, Nagaland, Odisha, Punjab,
Rajasthan, Sikkim, Tamil Nadu, Telangana, Tripura, Uttar Pradesh,
Uttarakhand, West Bengal, Andaman and Nicobar Islands, Chandigarh,
Dadra and Nagar Haveli and Daman and Diu, Delhi, Jammu and Kashmir,
Ladakh, Lakshadweep, Puducherry
```

Validator allows empty string OR one of the 36; not required.

## 4. KhataEntry Schema

**File:** `server/src/models/KhataEntry.model.js`

### 4.1 Field table

| Field | Type | Required | Default | Validator | Index | Notes |
|---|---|---|---|---|---|---|
| `userId` | ObjectId(ref: User) | yes | — | — | compound w/ customerId | Tenant scope. |
| `customerId` | ObjectId(ref: Customer) | yes | — | — | compound w/ userId, entryDate | Owning customer. |
| `voucherType` | String | yes | — | enum: `Sale`, `Payment`, `Refund`, `Adjustment`, `OpeningBalance` | — | See §4.2. |
| `direction` | String | yes | — | enum: `debit`, `credit` | — | Redundant with `amount` sign but stored explicitly to avoid sign bugs in reports. |
| `amount` | Number | yes | — | `>= 0`, finite, 2-decimal | — | Always non-negative. Sign comes from `direction`. |
| `runningBalance` | Number | yes | — | finite | — | Customer's outstandingBalance immediately AFTER this entry was applied. Frozen at write time. |
| `entryDate` | Date | yes | `Date.now` | — | desc | Business date (may differ from createdAt for backdated payments — though v1 disallows backdating, we keep the field for forward-compat). |
| `mode` | String | conditional | `''` | enum: `''`, `cash`, `upi`, `bank`, `cheque`, `card` | — | Required when voucherType = Payment or Refund. Empty for Sale/Adjustment/OpeningBalance. |
| `reference` | Object | no | `{}` | — | — | See §4.3. Polymorphic FK by voucherType. |
| `chequeNumber` | String | no | `''` | max 30 | — | Required when mode = cheque. |
| `chequeBank` | String | no | `''` | max 80 | — | Optional with cheque. |
| `upiTxnId` | String | no | `''` | max 50 | — | Optional with mode = upi. |
| `receiptNumber` | String | conditional | — | format `RCPT-YYYY-NNNNN` | unique when present | Allocated only for `Payment` and `Refund` via Counter (mirrors invoice numbering, see §6). |
| `notes` | String | no | `''` | max 1000 | — | |
| `createdBy` | ObjectId(ref: User) | yes | `req.user.id` | — | — | |
| `reversalOf` | ObjectId(ref: KhataEntry) | no | `null` | — | sparse | If this entry reverses an earlier one (e.g. bounced cheque), points to it. Used by reports to net out. |
| `isReversed` | Boolean | no | `false` | — | — | Set on the original when a reversal entry is posted. |
| `createdAt` / `updatedAt` | Date | auto | — | — | — | `timestamps: true`. |

### 4.2 voucherType semantics

| voucherType | direction | Effect on outstandingBalance | Source |
|---|---|---|---|
| `OpeningBalance` | debit (if owed) / credit (if advance) | +amount or −amount | Auto-written on Customer creation when `openingBalance != 0`. |
| `Sale` | debit | +amount | Auto-written by `sale.controller.createSale` when sale is on credit (see §7). |
| `Payment` | credit | −amount | Manual: `POST /khata/payments`. |
| `Refund` | debit | +amount | Triggered when a Sale.status flips to `refunded` AND the original sale had been recorded as a debit. |
| `Adjustment` | either | ± based on direction | Manual write-off, discount, rounding, bad debt. |

### 4.3 `reference` shape

Polymorphic; only one field populated per entry:

```
{
  saleId:      ObjectId(ref: Sale)        // when voucherType in [Sale, Refund]
  paymentNote: String                     // when voucherType = Payment   (free text)
  adjustmentReason: String                // when voucherType = Adjustment
}
```

### 4.4 Indexes

```
{ userId: 1, customerId: 1, entryDate: -1 }   primary statement query
{ userId: 1, customerId: 1, createdAt: -1 }   tiebreaker for same-day entries
{ receiptNumber: 1 }                          unique, partial: { receiptNumber: { $exists: true } }
{ userId: 1, voucherType: 1, entryDate: -1 }  for "all payments today" report
```

### 4.5 Hard rules

1. KhataEntry is **append-only**. No `findOneAndUpdate` on these documents except the controlled `isReversed` flag flip on the original when a reversal is posted.
2. `runningBalance` is computed once at insert under a per-customer write lock (§5) and never recomputed.
3. A `Sale` voucher must have `reference.saleId` set; without it, insert fails validation.

## 5. Concurrency & Atomicity

The write path for any KhataEntry is:

```
read Customer.outstandingBalance  →  compute newBalance  →  insert KhataEntry  →  $inc Customer.outstandingBalance
```

A naive implementation has a TOCTOU race: two concurrent payments both read balance=1000, both write runningBalance=900, final outstandingBalance ends at 800 (wrong; should be 800 with one of the entries showing rb=900 and the other rb=800).

**Required: MongoDB transaction (replica set).** The signed `KhataEntry.create` and `Customer.findOneAndUpdate({_id, $inc})` happen inside `session.withTransaction()`. The runningBalance written on the entry is the value returned by `findOneAndUpdate({...}, {$inc: {outstandingBalance: signedAmount}}, {new: true})` — i.e. the post-update authoritative value. Algorithm:

```
session.withTransaction(async () => {
  // 1. Atomic increment, returns the new balance.
  const updated = await Customer.findOneAndUpdate(
    { _id: customerId, userId, isActive: true },
    { $inc: { outstandingBalance: signedAmount },
      $set: { lastTransactionAt: now } },
    { new: true, session }
  );
  if (!updated) throw new Error('Customer not found or inactive');

  // 2. Insert entry with the post-increment balance.
  await KhataEntry.create([{
    ..., runningBalance: updated.outstandingBalance, ...
  }], { session });
});
```

**Where `signedAmount = direction === 'debit' ? +amount : -amount`.**

**Fallback if not running a replica set:** Use `findOneAndUpdate` with `$inc` and capture the returned new balance (atomic per-document) — this still works without a transaction, but if the subsequent `KhataEntry.create` fails the balance increment must be rolled back via a compensating `$inc`. Document this in the controller. Recommend transactions in production; allow non-tx fallback in dev.

## 6. Receipt Numbering

Mirrors invoice numbering (`Sale.model.js:53-65`). Format: `RCPT-YYYY-NNNNN`. Year is the calendar year (consider FY-based if the team aligns invoices to FY too — currently invoices use calendar year). Reuse the `Counter` collection with `_id: receipt-${year}`. Allocated only for `Payment` and `Refund` voucher types — `Sale`, `Adjustment`, `OpeningBalance` do not get receipt numbers.

```
const counter = await Counter.findOneAndUpdate(
  { _id: `receipt-${year}` },
  { $inc: { seq: 1 } },
  { upsert: true, new: true, setDefaultsOnInsert: true, session }
);
const receiptNumber = `RCPT-${year}-${String(counter.seq).padStart(5, '0')}`;
```

## 7. Sales Integration — Diff Plan for `sale.controller.createSale`

Numbered changes; do not write code in this spec.

1. Extend `createSaleSchema` (zod) with one optional field on the request body: `paymentMode: z.enum(['cash','upi','bank','cheque','card','credit']).default('cash')`. `credit` means "post to khata, customer pays later"; everything else is settled-at-counter and does NOT touch khata.
2. After the existing block that builds `enrichedItems`, `subtotal`, `taxableAmount`, GST math, and computes `total`, but **before** `Sale.create`, insert a new resolution step:

   a. If `customer.phone` (normalized) or `customer.gstin` is present, run a `findOneAndUpdate` upsert on `Customer`:

   ```
   filter: { userId: req.user.id, $or: [{phone: normPhone}, {gstin}] excluding empty }
   update: { $setOnInsert: { name, phone, gstin, address, state, createdBy }, $set: { lastTransactionAt: now } }
   options: { upsert: true, new: true }
   ```

   Capture `customerDoc._id`.

   b. If neither phone nor gstin — it's a walk-in. Skip customer linking. Set `customerId = null`.

3. Add a new optional field `customerId` to the `Sale` schema (`server/src/models/Sale.model.js`):
   ```
   customerId: { type: ObjectId, ref: 'Customer', default: null, index: true }
   ```
   This is additive; existing snapshot block stays untouched.

4. Pass `customerId: customerDoc?._id ?? null` into the `Sale.create({...})` call.

5. After `Sale.create` succeeds, branch on `paymentMode`:
   - If `paymentMode !== 'credit'` → no khata entry. (Cash-and-carry; settled at counter.)
   - If `paymentMode === 'credit'` AND `customerId` is set → call new internal helper `khataService.postSaleDebit({ userId, customerId, saleId: sale._id, amount: sale.total, entryDate: sale.createdAt })`. This runs the §5 transactional flow.
   - If `paymentMode === 'credit'` AND `customerId` is NOT set → return 400: `"Credit sale requires a customer with phone or GSTIN."` Roll back stock (already in code) and the Sale (delete).

6. Stock rollback path (`rollbackStock`) does not need to know about khata — the khata write happens after Sale.create and is atomically tied to the Sale in the transaction.

7. The existing `getSales` should continue working unchanged. Add a sibling endpoint `GET /sales?customerId=...` filter (one extra line in the query builder).

8. **Out-of-scope-but-recommended fix:** the existing `Sale` queries do not filter by `req.user.id`, so a tenant can read another tenant's invoices. Out of scope for this spec but flag in the PR description.

## 8. API Surface

**Base path:** `/api/v1/customers` and `/api/v1/khata`. All routes use `protect` middleware. Validation via `validate(zodSchema)` middleware (mirrors `sale.routes.js:20`).

### 8.1 Customer routes (`server/src/routes/v1/customer.routes.js`)

| Method | Path | Body / Query | Response | Validator |
|---|---|---|---|---|
| GET | `/api/v1/customers` | `?q=&isActive=&hasOutstanding=&page=&limit=15&sort=-outstandingBalance` | `{ data: Customer[], meta: { total, page, totalPages } }` | listCustomersQuery |
| GET | `/api/v1/customers/top-debtors` | `?limit=10` | `{ data: [{ _id, name, phone, outstandingBalance, lastTransactionAt }] }` | — |
| GET | `/api/v1/customers/:id` | — | `{ data: Customer }` | objectId param |
| POST | `/api/v1/customers` | createCustomerBody | `{ data: Customer }` 201 | createCustomerSchema |
| PATCH | `/api/v1/customers/:id` | updateCustomerBody | `{ data: Customer }` | updateCustomerSchema |
| DELETE | `/api/v1/customers/:id` | — | `{ data: { _id, isActive: false } }` | objectId — soft delete only; hard delete blocked if outstandingBalance != 0 OR any KhataEntry exists |
| POST | `/api/v1/customers/:id/recompute-balance` | — | `{ data: { previous, recomputed } }` | admin-recompute, scans KhataEntry, fixes drift |

**createCustomerBody** (zod):
```
{
  name: string (1..120) required,
  phone: string matching /^(\+91)?[6-9]\d{9}$/ optional,
  email: email optional,
  gstin: /^[0-9A-Z]{15}$/ optional,
  addressLine1: string optional,
  addressLine2: string optional,
  city: string optional,
  state: enum INDIAN_STATES optional,
  pinCode: /^\d{6}$/ optional,
  openingBalance: number (default 0),
  creditLimit: number >= 0 (default 0),
  notes: string max 2000 optional,
  tags: string[] optional
}
```

`openingBalance != 0` triggers an `OpeningBalance` KhataEntry inside the same transaction.

### 8.2 Khata routes (`server/src/routes/v1/khata.routes.js`)

| Method | Path | Body / Query | Response | Validator |
|---|---|---|---|---|
| GET | `/api/v1/khata/customers/:customerId/statement` | `?from=YYYY-MM-DD&to=YYYY-MM-DD&format=json\|pdf` | json: `{ customer, openingBalance, entries: KhataEntry[], closingBalance, totals: { totalDebit, totalCredit } }`; pdf: stream | statementQuery |
| GET | `/api/v1/khata/customers/:customerId/entries` | `?page=&limit=20&voucherType=` | paginated entries | — |
| POST | `/api/v1/khata/payments` | recordPaymentBody | `{ data: KhataEntry, customer: { _id, outstandingBalance } }` 201 | recordPaymentSchema |
| POST | `/api/v1/khata/adjustments` | recordAdjustmentBody | `{ data: KhataEntry, customer: { _id, outstandingBalance } }` 201 | adjustmentSchema |
| POST | `/api/v1/khata/entries/:id/reverse` | `{ reason: string }` | `{ data: KhataEntry (the reversal), customer }` | reverseSchema |
| GET | `/api/v1/khata/summary` | `?asOf=YYYY-MM-DD` | `{ totalReceivable, totalPayable, customerCount, agingBuckets: { '0-30': , '30-60': , '60-90': , '90+': } }` | — |

**recordPaymentBody:**
```
{
  customerId: objectId required,
  amount: number > 0 required,
  mode: enum cash|upi|bank|cheque|card required,
  entryDate: ISO date optional (default now; rejected if > now or < customer.createdAt),
  chequeNumber: string optional (required when mode=cheque),
  chequeBank: string optional,
  upiTxnId: string optional,
  notes: string max 1000 optional
}
```
Server allocates `receiptNumber`, posts a `Payment` credit entry via §5.

**adjustmentSchema:**
```
{
  customerId: objectId required,
  direction: enum debit|credit required,
  amount: number > 0 required,
  reason: string min 3 max 200 required,
  entryDate: ISO date optional
}
```

**reverseSchema:** body `{ reason: string min 3 max 200 }`. Posts a new entry with opposite direction, equal amount, voucherType matching original, `reversalOf = originalId`. Sets `isReversed = true` on original.

### 8.3 Sample request/response payloads

**POST /api/v1/khata/payments — request:**
```json
{
  "customerId": "65f1a2b3c4d5e6f700112233",
  "amount": 1500,
  "mode": "upi",
  "upiTxnId": "417823456712",
  "notes": "Partial payment for INV-2025-00042"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "_id": "65f2...",
    "userId": "65a0...",
    "customerId": "65f1a2b3c4d5e6f700112233",
    "voucherType": "Payment",
    "direction": "credit",
    "amount": 1500,
    "runningBalance": 3500,
    "receiptNumber": "RCPT-2025-00018",
    "mode": "upi",
    "upiTxnId": "417823456712",
    "entryDate": "2025-04-28T10:14:00.000Z",
    "notes": "Partial payment for INV-2025-00042",
    "createdAt": "2025-04-28T10:14:00.000Z"
  },
  "customer": {
    "_id": "65f1a2b3c4d5e6f700112233",
    "outstandingBalance": 3500
  }
}
```

**GET /api/v1/khata/customers/:id/statement?from=2025-04-01&to=2025-04-30&format=json:**
```json
{
  "success": true,
  "data": {
    "customer": { "_id": "65f1...", "name": "Ramesh Traders", "phone": "+919876543210", "gstin": "27ABCDE1234F1Z5", "outstandingBalance": 3500 },
    "openingBalance": 5000,
    "entries": [
      { "entryDate": "2025-04-05", "voucherType": "Sale", "reference": { "saleId": "..." }, "invoiceNumber": "INV-2025-00042", "debit": 5000, "credit": 0, "runningBalance": 10000 },
      { "entryDate": "2025-04-15", "voucherType": "Payment", "receiptNumber": "RCPT-2025-00018", "debit": 0, "credit": 1500, "runningBalance": 8500, "mode": "upi" },
      { "entryDate": "2025-04-25", "voucherType": "Payment", "receiptNumber": "RCPT-2025-00021", "debit": 0, "credit": 5000, "runningBalance": 3500, "mode": "cash" }
    ],
    "closingBalance": 3500,
    "totals": { "totalDebit": 5000, "totalCredit": 6500 }
  }
}
```

## 9. Statement PDF / WhatsApp Layout

Follow `client/src/pages/SalesPage.jsx` invoice-modal pattern: inline-styled HTML rendered in a hidden iframe, `window.print()`. No PDFKit/Puppeteer for v1 (the existing `generateInvoicePDF` service exists for tax invoices; statements are an internal doc, not a GST document, so HTML+print is sufficient).

### 9.1 Header block

| Block | Contents |
|---|---|
| Top-left | Seller company name (from `Settings.workspace.companyName`), GSTIN, address, phone — pulled from Settings on render. |
| Top-right | Title: **"STATEMENT OF ACCOUNT"**. Period: `From DD-MMM-YYYY To DD-MMM-YYYY`. Generated on: `DD-MMM-YYYY HH:mm`. |
| Customer block (below header) | Name, phone, GSTIN (if present), address, state. From Customer doc, not embedded. |
| Amount Due callout (top-right, bordered, large font) | `₹{outstandingBalance}` with label "Amount Due" if positive, "Advance Balance" if negative, "Settled" if zero. |

### 9.2 Entries table — column list (left to right)

| # | Column | Width | Source | Format |
|---|---|---|---|---|
| 1 | Date | 80px | `entryDate` | `DD-MMM-YYYY` |
| 2 | Voucher Type | 90px | `voucherType` | "Sale", "Payment", "Refund", "Adjustment", "Opening" |
| 3 | Voucher No. | 110px | `invoiceNumber` (from joined Sale) or `receiptNumber` | string or `—` |
| 4 | Particulars / Notes | flex | `notes` or `reference.adjustmentReason` or "Sale on credit" / "Payment received via {mode}" | trim 80 chars |
| 5 | Debit (₹) | 90px right-aligned | `direction==='debit' ? amount : ''` | `1,500.00` (Indian grouping) |
| 6 | Credit (₹) | 90px right-aligned | `direction==='credit' ? amount : ''` | same |
| 7 | Balance (₹) | 100px right-aligned | `runningBalance` | bold; suffix `Dr` if positive, `Cr` if negative |

### 9.3 Footer block

- Totals row: blank | blank | blank | "TOTAL" | sum of debit | sum of credit | closing balance.
- "Opening Balance as on {from}" row at top of body.
- Line: "Amount in Words: {indian numberToWords helper from SalesPage.jsx}".
- Line: "This is a system-generated statement. For queries, contact {seller.phone}."
- Optional UPI QR (if `Settings.workspace.upiId` set and outstanding > 0) — encode `upi://pay?pa={upiId}&pn={payeeName}&am={outstanding}&cu=INR&tn=Statement-{customerId}`.

### 9.4 WhatsApp share

Same statement, additionally exposed as a public read-only URL `GET /api/v1/khata/statement-share/:token` where `token` is a signed JWT containing `{customerId, from, to, exp: 7days}`. Frontend builds a WhatsApp deep link `https://wa.me/{phone}?text={encodedText}` where text is "Hi {name}, here is your statement for {period}. Amount due: ₹{balance}. View: {shareUrl}". Token expiry prevents permanent leak.

## 10. Edge Cases

| ID | Case | Expected behavior |
|---|---|---|
| E1 | Partial payment | Customer outstanding is 5000. Payment of 1500 → entry inserted with runningBalance=3500. Customer.outstandingBalance=3500. Statement shows partial. |
| E2 | Overpayment | Outstanding=1000. Payment of 1500 → runningBalance=−500. Customer.outstandingBalance=−500. Header shows "Advance Balance ₹500". Next sale on credit consumes the advance first (amount > advance increases the debit; system does not auto-allocate, the −500 just sits there until next debit naturally reduces it). |
| E3 | Refund of a credit sale | Original Sale was a `Sale` debit of 1000. When `Sale.status` flips to `refunded`, the controller posts a `Refund` voucher with `direction='credit'`, amount=1000, reference.saleId=original. Net outstanding reduced. The original `Sale` debit entry stays (audit trail); refund is a new line. |
| E4 | Refund of a cash sale (paymentMode != credit) | No khata involvement at all — the cash was already paid. Refund is a stock + till adjustment, handled outside khata. |
| E5 | Customer GSTIN changes | Update endpoint pushes prior gstin to `gstinHistory` array with timestamp before overwriting. Future invoices snapshot the new gstin. Past Sale.customer.gstin snapshots remain immutable (they were the legal value at issue time). |
| E6 | Inactive customer | `isActive=false`. Hidden from billing autocomplete. POST /khata/payments to an inactive customer is allowed (still settling old debt) — log warning. POST /sales attempting to upsert/link an inactive customer must reactivate it (set isActive=true) and post a notice in the response. |
| E7 | Hard delete attempt | Blocked when `outstandingBalance != 0` OR `KhataEntry.countDocuments({customerId}) > 0`. Return 409 with message "Customer has ledger history; soft-delete (deactivate) instead." |
| E8 | Phone-only duplicate at upsert | Two customers have GSTIN A (B2B) and phone X (B2C). A new sale comes in with GSTIN=A and phone=X. The `$or` upsert may match either. **Rule:** GSTIN match takes precedence (B2B ledger), phone match is fallback. Implement as two sequential `findOne` calls: try gstin first, fall back to phone, only upsert if neither found. |
| E9 | Concurrent payments | §5 transaction guarantees serialized application. Without transactions, the `$inc` is still atomic; the only risk is a stale `runningBalance` on one of the two entries (off by the other entry's amount). Statement render should warn if `customerDoc.outstandingBalance !== last entry.runningBalance` and offer the recompute endpoint. |
| E10 | Reversed cheque (bounced) | POST `/khata/entries/:id/reverse` with reason "Cheque bounced". Posts a `Payment`-type entry with `direction='debit'` (the inverse of original `credit`), `reversalOf=originalId`. Original.isReversed=true. Outstanding restored. |
| E11 | Backdated payment (entryDate < latest entry's createdAt) | v1: rejected with 400 "Entries must be in chronological order. Use Adjustment to record corrections." (Backdating breaks runningBalance correctness without a full ledger replay.) |
| E12 | Customer credit limit exceeded | Sale on credit where `customer.outstandingBalance + sale.total > creditLimit`. Soft warning returned in response: `{ data: sale, warnings: ['Credit limit ₹X exceeded by ₹Y'] }`. Sale still created. |
| E13 | Walk-in customer (no phone, no GSTIN) | `customerId=null` on Sale. `paymentMode='credit'` rejected with 400 (see §7.5). Cash-and-carry only. |
| E14 | Phone number with country code variants | Normalize at write: strip spaces/dashes, ensure leading `+91`. `9876543210` → `+919876543210`. `+91 9876543210` → `+919876543210`. `09876543210` → reject (leading 0 is landline-style). |
| E15 | Opening balance set via PATCH after creation | Disallowed — opening balance can only be set at creation. To correct, post an `Adjustment`. Returns 400 if `openingBalance` is in PATCH body. |

## 11. Migration Plan (backfill from existing Sales)

**Script:** `server/scripts/backfillCustomers.js`. Run once. Idempotent.

Steps:

1. Aggregate all existing `Sale` documents grouped by `(createdBy, customer.phone)` where phone is non-empty, and separately by `(createdBy, customer.gstin)` where gstin is non-empty. Pick the most recent sale's `customer` block as the canonical name/address/state.

2. For each group, upsert a `Customer` with:
   - `userId = createdBy`
   - `phone = normalize(customer.phone)`
   - `gstin = customer.gstin || ''`
   - `name = customer.name`
   - `address`, `state` from snapshot
   - `openingBalance = 0` (do NOT auto-create udhaar — historical sales were assumed cash unless flagged)
   - `creditLimit = 0`
   - `isActive = true`

3. For each Sale, set `Sale.customerId = customerDoc._id` if a match was found. Bulk update via `updateMany`.

4. Sales with neither phone nor GSTIN remain `customerId=null` (walk-ins).

5. **Do NOT** auto-create KhataEntry rows for historical sales. The premise is "from this date forward, credit sales hit khata"; back-dating ledger from cash-receipt-history-we-don't-have would be wrong. If a user has a paper khata, they enter `openingBalance` per customer manually after migration runs.

6. Print summary: customers created, sales linked, sales unlinked (walk-ins), conflicts (one phone matched multiple GSTINs — ask user to merge).

7. Write a `migration-log.json` file with per-user counts so the migration can be audited.

## 12. Tests to Write (for qa-tester)

1. **Customer create with valid phone +919876543210** → 201, doc has `phone: '+919876543210'`, opening balance 0, no KhataEntry written.
2. **Customer create with openingBalance=5000** → 201 + one KhataEntry voucherType=OpeningBalance direction=debit amount=5000 runningBalance=5000.
3. **Customer create with invalid GSTIN '27ABCDE1234F1Z5x'** → 400 "Invalid GSTIN".
4. **Customer create duplicate phone same userId** → 409 "Customer with this phone already exists".
5. **Customer create duplicate phone different userId** → 201 (multi-tenant isolation).
6. **POST /sales with paymentMode='credit', customer.phone='+919876543210', total=1000** on an existing customer with balance=500 → Sale created, customer.outstandingBalance=1500, KhataEntry voucherType=Sale direction=debit amount=1000 runningBalance=1500 reference.saleId=newSaleId.
7. **POST /sales with paymentMode='credit', no phone, no GSTIN** → 400, stock rolled back, no Sale created.
8. **POST /sales with paymentMode='cash'** → Sale created, NO KhataEntry, customer.outstandingBalance unchanged.
9. **POST /khata/payments amount=1500 mode=upi** on customer with balance=5000 → 201, runningBalance=3500, customer.outstandingBalance=3500, receiptNumber matches `RCPT-\d{4}-\d{5}`.
10. **POST /khata/payments amount=6000 mode=cash** on customer with balance=5000 → 201, runningBalance=−1000, customer.outstandingBalance=−1000.
11. **POST /khata/payments mode=cheque without chequeNumber** → 400.
12. **GET /khata/customers/:id/statement?from=2025-04-01&to=2025-04-30** with 1 sale (5000) and 2 payments (1500, 5000) → openingBalance=0, totalDebit=5000, totalCredit=6500, closingBalance=−1500, entries length 3 in chronological order.
13. **POST /khata/entries/:id/reverse** on a payment of 1500 → original isReversed=true, new entry direction=debit amount=1500 reversalOf=originalId, customer.outstandingBalance increased by 1500.
14. **DELETE /customers/:id** with outstandingBalance=500 → 409 "Customer has ledger history".
15. **DELETE /customers/:id** with balance=0 and entries=0 → 200 (or alternately soft delete: isActive=false).
16. **POST /khata/payments** concurrently x10, each amount=100 on balance=2000 → final outstandingBalance=1000, exactly 10 KhataEntry rows, runningBalance values are 1900,1800,...,1000 in some order with no duplicates.
17. **GET /customers/top-debtors?limit=5** → returns 5 highest outstandingBalance customers desc, only with balance > 0, scoped to userId.
18. **POST /customers/:id/recompute-balance** after manually corrupting outstandingBalance → response shows previous (wrong) and recomputed (correct) values, customer doc updated.
19. **Multi-tenant leak test:** user A creates customer; user B GET /customers returns empty list, GET /customers/:idOfA returns 404.
20. **GSTIN history:** PATCH customer.gstin from `27AAAAA1111A1Z5` to `27BBBBB2222B1Z5` → gstinHistory array length 1 with old value and changedAt timestamp.

## 13. Open Questions for Orchestrator

1. Calendar year vs. financial year for receipt numbers? Existing invoices use calendar year; FY would be more GST-idiomatic but break consistency. Recommendation: keep calendar year for now, raise FY migration as a separate spec.
2. Should `Sale.userId` be added in this PR (multi-tenancy fix) or kept separate? Recommendation: separate PR; this spec already touches enough.
3. Do we want a "Send via WhatsApp" button now, or stub it for v2? §9.4 spec covers the share-token approach; implementation is +30 min.
4. Hard delete vs. soft delete only — kirana users may want to truly purge a typo customer with 0 entries. Recommendation: hard-delete allowed when zero entries AND zero balance; soft-delete otherwise.

---

**Verdict:** Spec is ready for `backend-coder` implementation. Estimated 2 backend tasks (K1: schemas + customer CRUD; K2: khata entries + statement) plus 1 frontend task (K3: Khata page + statement modal mirroring SalesPage invoice modal).

---

**Files referenced (read-only audit):**
- `server/src/models/Sale.model.js` (snapshot pattern, Counter usage)
- `server/src/models/Product.model.js` (index/timestamps style)
- `server/src/models/Settings.model.js` (userId scope pattern)
- `server/src/controllers/sale.controller.js` (createSale flow to splice into)
- `server/src/validators/sale.validator.js` (zod regex style, gstinRegex reused)
- `server/src/routes/v1/sale.routes.js` (route registration style)
- `client/src/pages/SalesPage.jsx` (INDIAN_STATES list lines 11-19, numberToWords helper, print-modal pattern)

**Files to be created by backend-coder:**
- `server/src/constants/indianStates.js`
- `server/src/models/Customer.model.js`
- `server/src/models/KhataEntry.model.js`
- `server/src/services/khata.service.js`
- `server/src/controllers/customer.controller.js`
- `server/src/controllers/khata.controller.js`
- `server/src/validators/customer.validator.js`
- `server/src/validators/khata.validator.js`
- `server/src/routes/v1/customer.routes.js`
- `server/src/routes/v1/khata.routes.js`
- `server/scripts/backfillCustomers.js`

**Flag for backend-coder:** the architect noticed `Sale.userId` is missing — existing queries leak across tenants. Out-of-scope for this spec but raise in PR description.
