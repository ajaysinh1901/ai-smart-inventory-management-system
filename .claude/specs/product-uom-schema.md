# Spec: Product UoM Schema Migration
**Status:** Draft
**Owner:** architect-gst
**Implements:** Build chunk #2 in `.claude/specs/setup-flow-and-units.md` (§B.2, §B.7)
**Depends on:** Build chunk #1 (money.js + weight.js helpers) — sections 3 of this doc define their contracts
**Consumed by:** backend-coder

---

## 0. Audit findings (read before designing)

Before reading the design, know what exists:

- **No `Workspace` model.** The repo's "workspace" block lives on `Settings.model.js` (`workspace: { companyName, gstin, state, upiId, ... }`), keyed by `userId`. `storeProfile`, `onboarding`, `weightDisplay`, and `paiseDisplay` from setup-flow-and-units.md §B.3 / §C.5 land **here**, not in a new collection. A separate spec will cover the Settings extension; this spec only references the fields it needs.
- **Current Product schema** (`server/src/models/Product.model.js`): `name, sku (unique), category, price (Number), costPrice (Number), hsnCode, barcode (sparse unique), stock (Number), lowStockThreshold (Number, default 10), supplierId`. No userId scoping (multi-tenancy gap, out of scope here, flagged for a separate spec).
- **Callers that read `price` or `stock` as Numbers** (every one of these is touched by this migration — full list in §6):
  - `controllers/product.controller.js` — CRUD, low-stock filter, atomic stock decrement
  - `controllers/sale.controller.js` — line-item math, atomic stock reservation
  - `controllers/transaction.controller.js` — IN/OUT stock mutation
  - `controllers/ocr.controller.js` — bulk product create/update from invoice scan
  - `controllers/analytics.controller.js` — `$multiply: ['$price', '$stock']` aggregations (5 places)
  - `controllers/ai.controller.js` — restock suggestions, dead-stock value
  - `controllers/supplier.controller.js` — supplier-product list select
  - `controllers/alert.controller.js` — populated low-stock alerts
  - `crons/smartAlerts.cron.js` — low-stock + dead-stock alert generator
  - `migrations/seed-professional.js` — seed data writer (Numbers everywhere)
- **Validators** at `server/src/validators/product.validator.js` use Zod and currently reject decimal `stock` (`.int()`). Validators must be rewritten — see §6.
- **Sale model** snapshots `unitPrice` and `subtotal` as `Number`. Out of scope for **this** chunk (sale-flow API is build chunk #3); but the migration must not break existing Sale rows. Sale lines stay Number for now and are converted at chunk #3.

---

## 1. Problem

Per setup-flow-and-units.md §B, the kirana/grocery vertical needs to sell by weight. Today `Product.stock` and `Product.price` are JavaScript `Number` (IEEE-754 double). Two consequences:

1. **Decimal stock impossible.** A kirana cannot have 24.500 kg of atta — `Number` is fine for the value, but the validator forces integer, and the `$inc` math drifts on long sale chains (0.1 + 0.2 ≠ 0.3).
2. **Paise drift.** ₹65 × 0.250 = 16.25 in math, but `(65 * 0.25).toFixed(2)` and `(0.25 * 65).toFixed(2)` both happen to round correctly today; ₹65.55 × 1.337 does not, and the GSTR-1 line will mismatch Tally by 1–2 paise. CBIC requires line-level paise integrity (Rule 46, CGST Rules).

Migration to `Decimal128` everywhere money or weight is stored, plus three new fields (`unit`, `saleByWeight`, `tareWeight`, `packSize`), plus rename `price` → `pricePerUnit` and `lowStockThreshold` → `reorderLevel` to match the parent spec.

**Non-goals (this spec):** sale flow API changes, scale-mode UI, Sale model conversion, sample-pack content, AI reorder logic. Those are separate chunks.

---

## 2. Final Product Schema (target state)

### 2.1 Field table

| Field | Type | Required | Default | Validator | Index | Notes |
|---|---|---|---|---|---|---|
| `name` | String | yes | — | trim, 1–120 chars, strip HTML | text-search compound (see 2.4) | unchanged |
| `sku` | String | yes | — | trim, 1–64 chars, uppercase | `{ unique: true }` | unchanged |
| `category` | String | yes | — | trim, 1–80 chars | none | unchanged |
| `hsnCode` | String | no | `''` | regex `^(\d{4}\|\d{6}\|\d{8})?$` (4/6/8 digits or empty) | none | unchanged but now also validated |
| `barcode` | String | no | `''` | trim | `{ unique: true, sparse: true }` | unchanged |
| `unit` | String | yes | `'pcs'` | `enum: ['pcs','kg','g','l','ml','dozen','box','packet']` | none | **NEW** — lowercase enum, locked. No casing variants. |
| `saleByWeight` | Boolean | yes | `false` | — | none | **NEW** — true only when `unit ∈ {kg, g, l, ml}`. Mongoose pre-validate hook enforces. |
| `pricePerUnit` | Decimal128 | yes | — | `> 0` (see §2.2) | none | **RENAMED from `price`**. Stored as Decimal128. Helper rule: always set via `money.fromNumberOrString(v)`. |
| `costPrice` | Decimal128 | no | `Decimal128('0')` | `>= 0` | none | converted from Number |
| `stock` | Decimal128 | yes | `Decimal128('0')` | none (negative allowed — see §2.3) | `1` (ascending) — see §2.4 | converted from Number. Decimals allowed only when `saleByWeight=true`. |
| `reorderLevel` | Decimal128 | no | `Decimal128('0')` | `>= 0` | none | **RENAMED from `lowStockThreshold`**. Same UoM as `stock` per §B.6. Default 0 (was 10) — 0 means "never alert"; `lowStockThreshold: 10` legacy default is preserved by the migration script for existing docs. |
| `packSize` | Decimal128 | no | `null` | `> 0` when set, else `null` | none | **NEW** — optional. Hint for "1kg packet". Free-form positive number. |
| `tareWeight` | Decimal128 | no | `Decimal128('0')` | `>= 0` AND `< stock` if stock > 0 — see §2.3 | none | **NEW** — only meaningful when `saleByWeight=true`. Subtracted at sale time, not stored on stock. |
| `supplierId` | ObjectId(Supplier) | no | — | — | none | unchanged |
| `isSample` | Boolean | no | `false` | — | none | **NEW** — set by sample-pack seeder (§C.3). Used by "Clear sample products" UI. |
| `schemaVersion` | Number | yes | `2` | enum `[1, 2]` | none | **NEW — migration sentinel.** Existing docs implicitly = 1; migration writes 2. Idempotency check is `schemaVersion === 2`. |
| `createdAt` / `updatedAt` | Date | auto | — | — | none | from `timestamps: true` |

Note on the legacy `price` and `lowStockThreshold` fields: **the migration writes the new fields and unsets the old ones in the same `updateOne` call.** They are not retained as hidden mirrors — that's what the legacy-API compat layer at the controller level is for (§4.6).

### 2.2 Validator rules (Mongoose `.validate` hooks)

1. **`pricePerUnit` must be > 0.** Free samples and giveaways are out-of-scope for v1; if a kirana wants to bill ₹0 they create a 100%-discount line on the invoice. Spec rationale: a product master row with `pricePerUnit = 0` causes divide-by-zero in the amount-first flow (§B.4: "₹500 → kg = 500 / pricePerUnit"). Reject at schema level.
2. **`saleByWeight === true` ⟹ `unit ∈ {kg, g, l, ml}`.** The four decimal-capable units. Mongoose `pre('validate')` hook throws `Error("saleByWeight requires unit kg/g/l/ml")`.
3. **`saleByWeight === false` ⟹ `stock` must be a whole number** (Decimal128 with zero fractional part). Rejects "1.5 toothbrush" per §B.8. Implementation: `weight.isWhole(stock)` helper from chunk #1.
4. **`reorderLevel` must be `>= 0`.** Negative thresholds are nonsense.
5. **`tareWeight < pricePerUnit-irrelevant, < packSize`** when both set, else `tareWeight < 1e9` (sanity cap). Reasoning: tare on paneer dabba is typically 20–80 g; cap at 9 digits of grams catches data-entry typos.
6. **`unit` enum is lowercase only.** No `'KG'`, no `'Kg'`. Validator throws on mixed case to prevent two products with same SKU drifting on case in `$in` queries. Mongoose enum string match is case-sensitive — relying on that.
7. **Stock can be negative.** Allowed per §B.8 ("kirana reality wins"). No validator. See §2.3 for read-side handling.

### 2.3 Negative stock — explicit handling

Allowed with a soft warning, NOT a hard block. Index/sort behavior:

- The `stock: 1` ascending index treats negatives normally (sorts before 0). The low-stock query `$expr: { $lte: ["$stock", "$reorderLevel"] }` will catch negatives (since negative ≤ any non-negative threshold) — that's the desired behavior: "your books say -2 kg of atta, this is more urgent than low-stock".
- Frontend low-stock list MUST visually distinguish negative (red "Oversold") from low (amber). Backend returns a virtual `stockStatus: 'oversold' | 'out' | 'low' | 'healthy'` (see 2.5).
- Reports query for "oversold" uses `{ stock: { $lt: 0 } }`. Index supports it.
- `$inc` on a negative stock during a sale is allowed — no atomic-conditional `{ stock: { $gte: qty } }` guard for `saleByWeight=true` products (kirana sells what they have, even if the books haven't caught up). For `saleByWeight=false` products (pcs/dozen/box/packet), the existing atomic-conditional decrement in `sale.controller.js` is preserved — toothbrush count cannot go below 0 silently.
- **Per-product setting `allowOversell: Boolean, default: false`** is OUT of scope. Decision driven by `saleByWeight` flag alone.

### 2.4 Indexes

Existing:
- `sku` — `{ unique: true }` (kept)
- `barcode` — `{ unique: true, sparse: true }` (kept)

New:
- `stock` — `{ stock: 1 }` ascending. Powers low-stock cron + analytics. ~10–50ms saved on a 5k-SKU store.
- `userId` — NOT added in this spec (multi-tenancy gap is a separate spec). When that lands it will be a compound `{ userId: 1, sku: 1 }` unique index, which subsumes the current global SKU uniqueness.
- `category` — `{ category: 1 }`. Already filtered by analytics groupBy. Cheap.
- Text index — NOT added. Current `q` search uses `$regex`; converting to `$text` is a separate refactor.

### 2.5 Virtuals / getters / toJSON transform

Backend-coder MUST add these on the schema:

```js
// Virtual: legacy field mirror for 90-day API compat (see §4.6)
productSchema.virtual('price').get(function () {
  return money.toString(this.pricePerUnit); // string with 2-decimal paise
});
productSchema.virtual('lowStockThreshold').get(function () {
  return Number(this.reorderLevel.toString()); // legacy was Number
});

// Virtual: stock status for UI
productSchema.virtual('stockStatus').get(function () {
  const s = Number(this.stock.toString());
  const r = Number(this.reorderLevel.toString());
  if (s < 0) return 'oversold';
  if (s === 0) return 'out';
  if (r > 0 && s <= r) return 'low';
  return 'healthy';
});

// toJSON transform — flatten Decimal128 to strings (see §5)
productSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ['pricePerUnit', 'costPrice', 'stock', 'reorderLevel', 'packSize', 'tareWeight'].forEach(f => {
      if (ret[f] != null && ret[f]._bsontype === 'Decimal128') ret[f] = ret[f].toString();
      // null-safe: packSize can be null
    });
    return ret;
  },
});
productSchema.set('toObject', { virtuals: true });
```

The transform converts every Decimal128 field to its string representation **before** JSON serialization. Result: API responses contain `"pricePerUnit": "65.00"` not `"pricePerUnit": { "$numberDecimal": "65" }`. Locked decision — string with explicit decimal precision (see §5.1).

### 2.6 Example payload (full schema, post-migration)

```json
{
  "_id": "664f3a8b1c2d3e4f5a6b7c8d",
  "name": "Aashirvaad Atta Loose",
  "sku": "ATTA-LOOSE",
  "category": "Grocery > Atta",
  "hsnCode": "1101",
  "barcode": "",
  "unit": "kg",
  "saleByWeight": true,
  "pricePerUnit": "52.00",
  "costPrice": "44.50",
  "stock": "24.500",
  "reorderLevel": "5.000",
  "packSize": null,
  "tareWeight": "0.020",
  "supplierId": "664f3a8b1c2d3e4f5a6b7c01",
  "isSample": false,
  "schemaVersion": 2,
  "stockStatus": "healthy",
  "price": "52.00",
  "lowStockThreshold": 5,
  "createdAt": "2026-04-29T10:15:00.000Z",
  "updatedAt": "2026-04-29T10:15:00.000Z"
}
```

(`price` and `lowStockThreshold` are virtuals for legacy API compat. `stockStatus` is virtual.)

---

## 3. Money & Weight Helpers — Function Contracts (chunk #1, dependency)

These helpers are written in build chunk #1 but consumed by chunk #2. Locking signatures here so the migration's backfill tests can use them.

Two files: `server/src/utils/money.js` and `server/src/utils/weight.js`. **Always use these — never `new mongoose.Types.Decimal128()` directly anywhere outside these two files.** Lint rule (eslint custom or grep CI gate) enforces this. The reasoning is single-source-of-truth for HALF_UP rounding and zero/null/NaN guards.

Helpers internally use the `decimal.js` library (NOT `bignumber.js`, NOT `big.js` — pinned to `decimal.js` for HALF_UP default and Decimal128 string round-trip). Add to `server/package.json`.

### 3.1 `money.js` — function signatures

| Function | Signature | Returns | Notes |
|---|---|---|---|
| `fromNumberOrString` | `(v: number\|string\|Decimal128) → Decimal128` | Decimal128 | Master constructor. NaN → throws `Error('money: NaN')`. null/undefined → throws. Empty string → throws. Negative → allowed (returns/refunds). |
| `toString` | `(v: Decimal128) → string` | `"123.45"` | Always 2 decimal places. Pads `.0` to `.00`. Used by toJSON transforms. |
| `multiply` | `(qty: Decimal128, rate: Decimal128) → Decimal128` | unrounded Decimal128 | Mid-calculation. NEVER rounds. |
| `roundPaise` | `(amount: Decimal128) → Decimal128` | rounded to 2 dp HALF_UP | Boundary-only call. ₹0.005 → ₹0.01. |
| `add` | `(...amounts: Decimal128[]) → Decimal128` | sum, unrounded | Variadic. |
| `subtract` | `(a: Decimal128, b: Decimal128) → Decimal128` | unrounded | |
| `splitTax` | `(totalTax: Decimal128, mode: 'cgst-sgst'\|'igst' = 'cgst-sgst') → { cgst: D128, sgst: D128, igst: D128 }` | object with two non-zero of three | For `cgst-sgst`: split totalTax / 2, round each HALF_UP, **assign any 1-paise residue to CGST** (mirrors Tally per §B.8). For `igst`: igst = totalTax (rounded), cgst = sgst = 0. |
| `addRoundOff` | `(invoiceTotal: Decimal128) → { finalTotal: D128, roundOff: D128 }` | object | `finalTotal = round(invoiceTotal, 0)` (whole rupees, HALF_UP); `roundOff = finalTotal - invoiceTotal`. roundOff can be positive or negative. ₹17.06 → finalTotal ₹17, roundOff –₹0.06. |
| `inr` | `(v: Decimal128, opts?: { paise: boolean }) → string` | `"₹65.00"` or `"₹65"` | Display only. `paise: false` rounds to whole rupees for display (storage unchanged). |
| `isZero` | `(v: Decimal128) → boolean` | | |
| `isNegative` | `(v: Decimal128) → boolean` | | for return-line guards |

**Edge cases (mandatory):**

- **Zero qty:** `multiply(0, 65) → Decimal128('0')`. Not an error; an item being added before qty entry is normal in the UI.
- **Negative qty (returns/refunds):** `multiply(-1.5, 65) → Decimal128('-97.5')`. Allowed. `roundPaise(-0.005) → -0.01` (HALF_UP away from zero — explicit per §B.3, not banker's rounding).
- **null `pricePerUnit`:** `fromNumberOrString(null)` throws. Callers must check `if (product.pricePerUnit == null) return reject` before invoking.
- **NaN guard:** every entry point (`fromNumberOrString`) calls `Number.isNaN(parseFloat(v))` after string conversion and throws.
- **Decimal128 from Mongoose vs constructor:** Mongoose returns `mongoose.Types.Decimal128`; the BSON driver returns `bson.Decimal128`. They're structurally identical (`_bsontype === 'Decimal128'`, `bytes` Buffer). `fromNumberOrString` accepts both via duck-type check on `_bsontype`.
- **Mongoose `Decimal128.fromString` requires a string**; `fromNumber` exists but is buggy on some versions for very small fractions. Helper always converts to string first via `decimal.js`.

### 3.2 `weight.js` — function signatures

| Function | Signature | Returns | Notes |
|---|---|---|---|
| `fromNumberOrString` | `(v) → Decimal128` | | Same as money.fromNumberOrString. |
| `toString` | `(v: Decimal128, unit: string) → string` | `"24.500"` for kg, `"24"` for pcs | Decimal places per unit per §B.1: kg/l → 3, g/ml → 0, pcs/dozen/box/packet → 0. |
| `formatWeight` | `(qty: D128, unit: string, mode: 'mixed'\|'decimal' = 'decimal') → string` | `"1 kg 250 g"` or `"1.250 kg"` | `mixed` only valid for `kg` (split into kg+g) and `l` (split into l+ml). For other units, falls back to decimal. |
| `isWhole` | `(v: Decimal128) → boolean` | | True if no fractional part. Used by validator rule §2.2.3. |
| `multiply` | `(qty, rate) → Decimal128` | unrounded | Re-exported from money for symmetry — same function. |
| `subtractTare` | `(grossQty: D128, tareQty: D128) → Decimal128` | net qty | Used at sale time. If result < 0, returns Decimal128('0') (cannot sell negative net). |
| `amountToQty` | `(amount: D128, ratePerUnit: D128) → Decimal128` | computed qty | The "₹500 ka rice" inverse. Throws if rate is 0. Returns qty rounded to step granularity per §B.1 (kg → 0.005, l → 0.01). Step rounding is HALF_UP. |

**Edge cases:**

- **Zero rate in amountToQty:** throws `Error('weight: cannot back-compute qty when rate is 0')`. Caller must short-circuit.
- **Step rounding edge:** `amountToQty(50, 65, 'kg')` → 50/65 = 0.7692... → step 0.005 → 0.770 (HALF_UP at the step boundary). Guarantees printed qty matches what was sold.

### 3.3 Test fixture table (for chunk #13 senior-tester sign-off)

backend-coder writes the unit tests; qa-tester asserts against these inputs. senior-tester reviews money math against Tally for parity.

| # | Scenario | qty | unit | rate (₹) | GST % | Intra/Inter | Expected line subtotal | Expected line tax | CGST | SGST | IGST | Line total | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Atta loose 250g @ ₹65/kg | 0.250 | kg | 65.00 | 5 | intra | 16.25 | 0.81 | 0.41 | 0.40 | 0 | 17.06 | parent §B.3; 1-paise residue → CGST |
| 2 | Cold drink 500ml @ ₹40/L | 0.500 | l | 40.00 | 12 | intra | 20.00 | 2.40 | 1.20 | 1.20 | 0 | 22.40 | even split |
| 3 | Notebooks 2 dozen @ ₹120/dozen | 2 | dozen | 120.00 | 18 | inter | 240.00 | 43.20 | 0 | 0 | 43.20 | 283.20 | inter-state IGST |
| 4 | Toothpaste 1 pcs @ ₹95 | 1 | pcs | 95.00 | 18 | intra | 95.00 | 17.10 | 8.55 | 8.55 | 0 | 112.10 | clean split |
| 5 | Sugar 1.337 kg @ ₹49.50/kg | 1.337 | kg | 49.50 | 5 | intra | 66.18 | 3.31 | 1.66 | 1.65 | 0 | 69.49 | 1-paise residue → CGST; multiply yields 66.1815 → roundPaise → 66.18 |
| 6 | Amount-first ₹500 of dal @ ₹125/kg | 4.000 | kg | 125.00 | 0 | n/a | 500.00 | 0.00 | 0 | 0 | 0 | 500.00 | exempt; weight.amountToQty(500, 125) → 4.000 |
| 7 | Amount-first ₹50 of rice @ ₹65/kg | 0.770 | kg | 65.00 | 5 | intra | 50.05 | 2.50 | 1.25 | 1.25 | 0 | 52.55 | step rounding 0.769230... → 0.770; line subtotal back to ₹50.05 (not ₹50 exact — UI must show this) |
| 8 | Return: 0.5 kg paneer @ ₹520/kg | -0.500 | kg | 520.00 | 5 | intra | -260.00 | -13.00 | -6.50 | -6.50 | 0 | -273.00 | negative qty propagates; tax also negative |
| 9 | Round-off: invoice subtotal ₹17.06 | — | — | — | — | — | — | — | — | — | — | finalTotal 17.00, roundOff -0.06 | parent §B.3; whole-rupee rounding HALF_UP; -0.06 as a separate line |
| 10 | Round-off: invoice subtotal ₹284.50 | — | — | — | — | — | — | — | — | — | — | finalTotal 285.00, roundOff +0.50 | HALF_UP rounds up at .5 |

(Rows 1, 5, 7, 8, 9 are the load-bearing ones — they expose the rounding rules. Senior-tester gate at chunk #13 reviews these against Tally for parity.)

---

## 4. Migration Script Behavior

File: `server/src/migrations/2026-04-29-product-uom.js`. Run via `node server/src/migrations/2026-04-29-product-uom.js`. NPM script `migrate:uom`.

### 4.1 Pre-conditions (assert before any write)

1. MongoDB connection established and writable.
2. `Product` collection exists.
3. Free disk = at least 2× current `Product` collection size (the WiredTiger update overhead during a column-type rewrite). If less, **abort with error** — do not silently degrade.
4. **Backup confirmed.** Migration script reads env var `BACKUP_VERIFIED=yes`. If not set, prints "Run a mongodump first; export BACKUP_VERIFIED=yes" and exits 1. Non-negotiable for a destructive type migration.
5. No active `sale.create` in the last 60 seconds (heuristic: query `Sale` with `createdAt: { $gte: now - 60s }` — if any, prompt with "Active sales detected, continue? [y/N]"). Reasoning: a sale in flight with `$inc` on stock during the migration could land a Number into a Decimal128 field and cause a type-mismatch error on next read.

### 4.2 Idempotency check

A document is "already migrated" iff `schemaVersion === 2`. The migration's batch query is:

```
{ $or: [ { schemaVersion: { $exists: false } }, { schemaVersion: { $lt: 2 } } ] }
```

Re-running the migration after partial completion picks up where it left off. Re-running after full completion is a no-op (returns "0 documents to migrate, exiting").

### 4.3 Order of operations

1. **Phase 1 — Add new fields with defaults (no read-write yet).** Update the Mongoose schema definition file in code. This is a code deploy, not a data write. Existing docs continue to work because Mongoose tolerates missing fields with defaults on read.
2. **Phase 2 — Backfill in batches of 500.** Cursor over `find(idempotencyQuery)`, for each doc compute the new field set, write via `updateOne` with `{ $set: newFields, $unset: { price: '', lowStockThreshold: '' }, $set: { schemaVersion: 2 } }`. Per-document log: `[migrate] _id=X sku=Y old.price=N → pricePerUnit="N.NN" stock=N → "N.000" unit=pcs`.
3. **Phase 3 — Verify count.** After backfill, assert `countDocuments({ schemaVersion: 2 }) === countDocuments({})`. If not, log the SKUs of the unmigrated docs and exit non-zero.
4. **Phase 4 — Index creation.** `db.products.createIndex({ stock: 1 })` and `{ category: 1 }`. Done last so the backfill writes don't hit the new index.
5. **Phase 5 — Mark migration done.** Insert into a new collection `_migrations` (created if absent): `{ _id: '2026-04-29-product-uom', completedAt: new Date(), docsMigrated: N }`. Subsequent `npm run migrate:uom` runs short-circuit on this sentinel.

### 4.4 Per-document transformation

For each doc matching the idempotency query, compute new fields:

```
unit          = 'pcs'                        // fixed default for backfill, per §B.7
saleByWeight  = false
pricePerUnit  = money.fromNumberOrString(oldDoc.price)            // Number → Decimal128
costPrice     = money.fromNumberOrString(oldDoc.costPrice ?? 0)
stock         = weight.fromNumberOrString(oldDoc.stock ?? 0)
reorderLevel  = weight.fromNumberOrString(oldDoc.lowStockThreshold ?? 10)
                // Special-case the legacy default 10 → keep behavior
packSize      = null
tareWeight    = Decimal128('0')
isSample      = false
schemaVersion = 2
$unset        : price, lowStockThreshold
```

**Edge cases in the data:**

- `oldDoc.price` is undefined or 0 → log warning `[migrate] _id=X sku=Y has invalid price ${val}, defaulting to Decimal128('0.01')`. **Do NOT fail the doc** — kirana data has ghosts. Flag in the migration report for human review post-run.
- `oldDoc.stock` is negative → preserved as-is (negative stock is allowed, per §2.3). Log `[migrate] _id=X sku=Y has negative stock ${val}, preserving`.
- `oldDoc.lowStockThreshold` is missing → default 10 (preserves legacy default behavior). Note this is different from the **new doc default** which is 0. The migration mirrors **observed** legacy behavior.
- `oldDoc.barcode` is `''` (empty string) → unchanged. Sparse index handles this.

### 4.5 Rollback plan

If migration aborts mid-run:

- **Auto-rollback NOT supported.** A partially migrated collection is fine to leave — re-running the script picks up the unmigrated tail (`schemaVersion < 2`).
- If rollback to v1 schema is needed (e.g., bad bug in v2 code path), restore from the mongodump taken pre-migration (the `BACKUP_VERIFIED` precondition guarantees one exists). There is no inline rollback script. This is intentional — rebuilding Decimal128 → Number is lossy and would silently corrupt fractional stock.
- A failure on a single doc (e.g., `pricePerUnit` validator rejects 0) is logged but does NOT abort the batch. The doc is left at v1; the script exits non-zero at Phase 3 with the failed SKUs. Fix the data manually, re-run.

### 4.6 Legacy API compatibility (90-day deprecation window)

Per §B.7 of the parent spec. Implemented at the controller level, not the schema level.

- **Request side** (`POST /products`, `PUT /products/:id`): a request body containing `price` (no `pricePerUnit`) is accepted. Controller maps `price → pricePerUnit` before the Mongoose call. Same for `lowStockThreshold → reorderLevel`. Triggered by absence of `pricePerUnit` in the body.
- **Response side**: every product response includes both new fields AND legacy virtuals `price` and `lowStockThreshold` (defined on the schema, see §2.5). Old clients keep working. No additional controller logic.
- **Deprecation header**: every response from the product controller adds `Deprecation: Sun, 27 Jul 2026 00:00:00 GMT` and `Sunset: Sun, 27 Jul 2026 00:00:00 GMT` (90 days from migration date 2026-04-29). RFC 8594. Frontend can warn on these headers.
- **Cutoff**: in the controller, env var `LEGACY_PRODUCT_API_UNTIL=2026-07-27`. After that date, requests with legacy `price` field return `410 Gone, "Use pricePerUnit. See /docs/migration-2026-04."`. Sentinel virtual mirrors stay (cheap, never expire).

---

## 5. Decimal128 Read/Write Patterns

### 5.1 JSON serialization rule (locked)

**Decimal128 fields serialize as strings, not numbers, not `{$numberDecimal: "..."}` objects.**

Example:
```json
{ "pricePerUnit": "65.00", "stock": "24.500" }
```
NOT `"pricePerUnit": 65.00` (number — loses precision when client parses with `JSON.parse`) and NOT `"pricePerUnit": { "$numberDecimal": "65.00" }` (extended JSON — leaks BSON shape to API consumers, breaks the existing client which does `Number(p.price)`).

Why string? Because `Number.parseFloat("65.00")` is safe on the client (numbers display fine), but `JSON.stringify` of a JS number loses trailing zeros (`65.00 → "65"`) and the server cannot trust the client to round-trip. A string preserves the exact stored precision, and the client decides whether to parse to a number for math or keep as a string for display.

The frontend MUST use a `parseRupees(s)` helper that calls `parseFloat(s)` then asserts the result is finite. (Frontend-coder writes this; out of scope here.)

### 5.2 Decimal precision per field

| Field | Decimal places stored | Decimal places returned in JSON |
|---|---|---|
| `pricePerUnit` | unlimited (Decimal128 native) | 2, padded |
| `costPrice` | unlimited | 2, padded |
| `stock` | unlimited | depends on unit: 3 for kg/l, 0 for pcs/g/ml/dozen/box/packet |
| `reorderLevel` | unlimited | same as `stock` |
| `packSize` | unlimited | 3 for kg/l, 0 otherwise; `null` stays null |
| `tareWeight` | unlimited | 3 for kg/l, 0 otherwise |

The toJSON transform (§2.5) reads `this.unit` to decide precision for stock-like fields. Backend-coder: enrich the transform to consult `ret.unit` when formatting `stock`, `reorderLevel`, `packSize`, `tareWeight`.

### 5.3 Aggregations on Decimal128 (the gotcha)

**Good news:** MongoDB `$sum` and `$multiply` over Decimal128 fields return Decimal128 natively (per [MongoDB $sum docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/sum/) — type promotion follows int→long→double→decimal). No `$toDecimal` cast needed if every input is already Decimal128.

**Bad news:** if a pipeline mixes Decimal128 with literal numbers (e.g., `{ $multiply: ['$stock', 0.05] }`), the result is Decimal128 but the literal is coerced to double first — introducing the very floating-point error we migrated away from. **Rule:** all literals in aggregation pipelines that touch money or weight MUST be wrapped in `{ $toDecimal: '0.05' }` or stored as Decimal128 constants. Lint check: grep the analytics controller for `$multiply` and `$divide` and audit each.

The five existing analytics aggregations (lines 16, 168, 185, 192 of `analytics.controller.js`) currently do `$multiply: ['$price', '$stock']`. Once price and stock are both Decimal128, this works correctly **as written** — no code change needed. But the **field names** change: `$price → $pricePerUnit`. See §6.

### 5.4 Helper rule (lint-enforced)

> "Always use the Decimal128 helper in `money.js` / `weight.js`. Never `new mongoose.Types.Decimal128()` directly outside those two files."

Add a custom ESLint rule or grep CI gate:
```
grep -rn "Types.Decimal128(" server/src/ \
  | grep -v "src/utils/money.js" \
  | grep -v "src/utils/weight.js" \
  && exit 1
```
(qa-tester asserts this gate is in CI before merging chunk #1.)

---

## 6. Indexes and Query Impact — Per-File Touch List

Every reader of the legacy `price` / `stock` / `lowStockThreshold` fields. backend-coder makes these changes as part of chunk #2 (or in the same PR — they cannot ship separately or product CRUD breaks).

| File | Change | Reasoning |
|---|---|---|
| `server/src/models/Product.model.js` | Full rewrite per §2 | The schema doc itself |
| `server/src/validators/product.validator.js` | `price` → `pricePerUnit` (Zod number ≥ 0.01); `stock` is no longer `.int()` — accept any number ≥ 0 (or any number, since negative is allowed); add `unit` enum, `saleByWeight` boolean, `tareWeight` ≥ 0, `packSize` > 0 nullable, `reorderLevel` rename. Legacy `price` and `lowStockThreshold` accepted via `.transform` step that maps to new names | Validator runs **before** the controller, so legacy-field rewrite happens here in one place. Saves duplicating the mapping in `createProduct` and `updateProduct`. |
| `server/src/controllers/product.controller.js` | Lines 49–51 stock-status filter: change to `Number(p.stock.toString())`. Line 122 atomic decrement: still works on Decimal128 with `$inc`, BUT condition `{ stock: { $gte: quantity } }` requires `quantity` to be Decimal128 — wrap with `weight.fromNumberOrString(quantity)`. Line 145 low-stock $expr: change `"$lowStockThreshold"` → `"$reorderLevel"`. Line 133 `current.stock` interpolation: format via `weight.toString(current.stock, current.unit)`. Add Deprecation/Sunset headers per §4.6. | Most-touched file. |
| `server/src/controllers/sale.controller.js` | Line 57 `unitPrice = item.unitPrice ?? product.price`: change to `?? product.pricePerUnit`. Line 64 `subtotal: unitPrice * item.quantity`: switch to `money.multiply(qty, rate)` and round at end. Line 254 rollback `$inc: { stock: r.quantity }`: wrap quantity in `weight.fromNumberOrString`. Atomic stock guard logic: see §2.3 — for `saleByWeight=true` products, drop the `{ stock: { $gte: qty } }` clause; for others, keep it. **NOTE:** the full sale-flow rewrite is build chunk #3; this PR only touches the field-name rename and Decimal128-safety, NOT the scale-mode logic. | Field rename only in this chunk; flow change in chunk #3. |
| `server/src/controllers/transaction.controller.js` | Lines 12, 13, 18, 19, 134–136: every `product.stock` read/write must handle Decimal128. Use `weight.add(product.stock, weight.fromNumberOrString(quantity))` for IN, `subtract` for OUT. Line 136 `Math.max(0, ...)` clamp: REMOVE — negative stock is allowed (§2.3). Replace with logging. | Significant rewrite. |
| `server/src/controllers/ocr.controller.js` | Lines 108–111: `product.stock += Number(stock || 0)` → `product.stock = weight.add(product.stock, weight.fromNumberOrString(stock || 0))`. `product.price = Number(price)` → `product.pricePerUnit = money.fromNumberOrString(price)`. Line 114 `Product.create({...})`: rename payload fields. | OCR feeds new products; must use new field names. |
| `server/src/controllers/analytics.controller.js` | Every `$price` → `$pricePerUnit` (5 occurrences: lines 16, 168, 185, 192, plus implicit in stockByCategory). Every `$lowStockThreshold` → `$reorderLevel` (lines 178, 179). The `$multiply: ['$price', '$stock']` pipeline returns Decimal128 — the response handler then either calls `.toString()` on it (preferred, lossless) or wraps in `Number(...)` for display (acceptable for chart axes). Pick `.toString()` for totals; `Number(...)` for ranks/sort keys. | 7 query touch-ups. None are query-plan-changing. |
| `server/src/controllers/ai.controller.js` | Every `.price` → `.pricePerUnit` (~20 occurrences across lines 14, 79, 115, 131, 140, 167, 170, 224, 285, 288, 305, 306, 322, 364, 400). Wrap `p.stock * p.price` math in `Number(p.pricePerUnit.toString()) * Number(p.stock.toString())` — AI heuristics tolerate float; this is a display path, not a money path. `daysUntilStockout = Math.floor(product.stock / avgDailySales)` → `Math.floor(Number(product.stock.toString()) / avgDailySales)`. | Mechanical rename + Decimal128 unwrap. |
| `server/src/controllers/supplier.controller.js` | Line 95 select string: `'name sku category price stock lowStockThreshold'` → `'name sku category pricePerUnit stock reorderLevel unit saleByWeight'`. Line 122 aggregate: `$price` → `$pricePerUnit`. | Two-line change. |
| `server/src/controllers/alert.controller.js` | Line 16 populate select: `'name sku stock lowStockThreshold'` → `'name sku stock reorderLevel unit'`. | One line. |
| `server/src/crons/smartAlerts.cron.js` | Lines 30–31, 41, 46, 64: `p.lowStockThreshold` → `p.reorderLevel`. `p.stock === 0` and `p.stock <= threshold`: change to `Number(p.stock.toString()) === 0`, etc. The dead-stock cron (line 64) must also handle the new units. | ~6 lines. Cron does not need to be unit-aware in v1 (per parent spec — "AI restock suggestions" unit-aware logic is build chunk #9, not #2). |
| `server/src/migrations/seed-professional.js` | Update CATALOG and `productDocsToInsert` to use new field names. Add `unit: 'pcs'` and `saleByWeight: false` to every seed product. The current dev seed deals only in pcs (electronics) — no change to semantics. | Seed does not run in prod; nice-to-have for dev parity. |
| `server/src/migrations/seed.js` | Same as above — rename fields in the two `Product.create` calls. | Two-doc seed file. |
| `server/src/services/inventory.service.js` (if it reads price/stock) | Audit. | Likely needs same field-rename treatment. |
| `server/src/services/ai.service.js` | Audit for `.price` / `.stock` math. | |
| Frontend | Out of scope of this spec. Frontend-coder will get a parallel "client-side Decimal128 contract" doc in chunk #6. The legacy `price` virtual buys 90 days for the client to migrate. | |

**No schema-breaking changes to Sale / Transaction / Customer / Khata in this PR.** Their numeric fields stay `Number`. Sale-side migration is build chunk #3.

---

## 7. StockAdjustment Reason Taxonomy

A new model `StockAdjustment` is created in this chunk (referenced by §B.5 of the parent spec for stock-in variance). Schema is minimal:

```js
{
  productId:    ObjectId(Product), required, indexed,
  delta:        Decimal128, required,             // signed: +0.300 = stock-in, -0.300 = shrinkage
  reason:       String, enum (see below), required,
  reasonDetail: String, optional, max 200 chars,  // free-form note ("supplier short by 0.3 kg")
  invoicedQty:  Decimal128, optional,             // populated only for purchase-variance
  receivedQty:  Decimal128, optional,             // populated only for purchase-variance
  unit:         String, required (snapshot of product.unit at time of adjustment)
  userId:       ObjectId(User), required, indexed,
  saleId:       ObjectId(Sale), optional,         // present when reason='sale'
  createdAt, updatedAt: timestamps
}
```

### 7.1 Reason enum (v1)

| Reason | User-selectable? | Auto-generated? | When emitted |
|---|---|---|---|
| `opening` | Yes (in onboarding wizard, step 5) | Yes (by onboarding seeder) | First-time stock count entry |
| `purchase-variance` | No (system only) | Yes | Stock-in form when receivedQty ≠ invoicedQty |
| `sale` | No | Yes | On every successful Sale.create — one StockAdjustment per line item |
| `return` | No | Yes | On Sale.refund (refund flow exists in `sale.controller.js`) |
| `damage` | Yes | No | Manual entry by owner |
| `count-correction` | Yes | No | Manual entry — "I counted, books said 10, actual is 8" |
| `other` | Yes | No | Manual catch-all with reasonDetail required |

`enum: ['opening', 'purchase-variance', 'sale', 'return', 'damage', 'count-correction', 'other']`. Locked. Adding to this enum is a schema migration; subtracting is not allowed.

**Validator:** when `reason === 'other'`, `reasonDetail` is required (min 3 chars). Otherwise optional.

**Index:** `{ productId: 1, createdAt: -1 }` for the per-product audit trail view. `{ userId: 1, reason: 1, createdAt: -1 }` for the supplier-shrinkage report (filtered to `reason: 'purchase-variance'`).

The StockAdjustment write itself does NOT mutate `Product.stock` — that's the caller's responsibility (sale controller, stock-in controller, etc.). StockAdjustment is the audit log, not the source of truth. Stock is the source of truth.

---

## 8. Tests to Write (for qa-tester / chunk #12)

backend-coder writes the unit tests; qa-tester writes the integration tests; senior-tester reviews money math.

### 8.1 Unit tests (Jest, on the helpers and migration)

1. `money.fromNumberOrString` round-trips: 65 → "65.00"; "65" → "65.00"; "65.005" → "65.005" (preserved); Decimal128.fromString("65") → "65.00".
2. `money.fromNumberOrString(NaN)` throws.
3. `money.fromNumberOrString(null)` throws.
4. `money.fromNumberOrString(-12.5)` returns Decimal128("-12.50") — negatives allowed.
5. `money.roundPaise("0.005")` → "0.01" (HALF_UP).
6. `money.roundPaise("-0.005")` → "-0.01" (HALF_UP away from zero).
7. `money.splitTax("0.81", "cgst-sgst")` → `{ cgst: "0.41", sgst: "0.40", igst: "0" }` (residue → CGST). Row #1 of fixture table.
8. `money.splitTax("2.40", "cgst-sgst")` → `{ cgst: "1.20", sgst: "1.20", igst: "0" }`. Row #2.
9. `money.addRoundOff("17.06")` → `{ finalTotal: "17.00", roundOff: "-0.06" }`. Row #9.
10. `money.addRoundOff("284.50")` → `{ finalTotal: "285.00", roundOff: "0.50" }`. Row #10.
11. `weight.amountToQty("500", "125", "kg")` → "4.000" (step 0.005). Row #6.
12. `weight.amountToQty("50", "65", "kg")` → "0.770" (step 0.005, rounded HALF_UP from 0.7692...). Row #7.
13. `weight.amountToQty("100", "0", "kg")` throws.
14. `weight.formatWeight("1.250", "kg", "mixed")` → `"1 kg 250 g"`. Row §B.8.
15. `weight.formatWeight("1.250", "kg", "decimal")` → `"1.250 kg"`.
16. `weight.formatWeight("0.050", "l", "mixed")` → `"50 ml"`.
17. `weight.isWhole(Decimal128("3"))` → true. `weight.isWhole(Decimal128("3.0"))` → true. `weight.isWhole(Decimal128("3.00001"))` → false.

### 8.2 Schema validation tests

18. `Product.create({...minimal, unit: 'KG'})` rejects (case-sensitive enum).
19. `Product.create({...minimal, saleByWeight: true, unit: 'pcs'})` rejects.
20. `Product.create({...minimal, saleByWeight: false, unit: 'kg', stock: '3.5'})` rejects ("decimal qty on integer-unit product" — i.e., trying to disable decimals on a kg unit).
21. `Product.create({...minimal, pricePerUnit: 0})` rejects.
22. `Product.create({...minimal, stock: -5})` succeeds, stockStatus virtual returns `'oversold'`.
23. `Product.create({...minimal, reorderLevel: -1})` rejects.
24. `Product.create({...minimal, tareWeight: 1e10})` rejects (sanity cap).

### 8.3 Migration script tests

25. **Idempotency:** seed 100 v1 products, run migrate twice, assert `count(schemaVersion=2) = 100` and run #2 logs "0 documents to migrate".
26. **Mid-migration crash:** kill the process at ~50% (mock), restart, assert all 100 end up at v2.
27. **Bad data:** seed one doc with `price: undefined`, run migrate, assert it lands at `pricePerUnit: "0.01"` AND a warning was logged AND it's still flagged in the migration report.
28. **Negative stock preserved:** seed `stock: -3`, post-migrate assert `stock: "-3"`.
29. **Legacy default `lowStockThreshold` of 10 preserved:** seed without that field, post-migrate assert `reorderLevel: "10"`.
30. **JSON serialization:** GET /products/:id returns `pricePerUnit: "65.00"` (string), `stock: "24.500"` (3 dp for kg), `price: "65.00"` (legacy virtual present), `lowStockThreshold: 5` (legacy virtual, type Number).
31. **Legacy POST:** `POST /products { name, sku, category, price: 50, stock: 10 }` (no `pricePerUnit`) succeeds; response Headers include `Deprecation` and `Sunset`.
32. **Cutoff date:** with env `LEGACY_PRODUCT_API_UNTIL=2026-01-01` (past), legacy POST returns 410.

### 8.4 Aggregation tests

33. Seed 3 products with Decimal128 prices and stocks, run analytics.totalValue, assert result is a string equal to the manually-computed `Σ price × stock` rounded to 2 dp.
34. Verify `$multiply: ['$pricePerUnit', '$stock']` in a pipeline returns Decimal128 (`result[0].totalValue` has `_bsontype === 'Decimal128'`).

### 8.5 End-to-end (chunk #12 territory)

35. **5-min onboarding speedrun:** see parent §C.7. New product created in step 4 has `unit: 'pcs'` by default; sample-pack-seeded kirana products span pcs and kg.
36. **kg sale flow:** create kg-unit product, decrement stock by 0.250, assert remaining stock is exact (no float drift).
37. **Negative stock soft-warn:** sell more than in stock for a `saleByWeight: true` product, assert sale succeeds and `stockStatus: 'oversold'` is returned.

---

## 9. Open Questions (none — all locked)

The parent setup-flow-and-units.md spec covers every decision this migration depends on. Items the parent left implicit and this spec hardens:

- Whether `pricePerUnit` allows zero — **NO** (§2.2.1).
- Casing of `unit` enum — **lowercase only** (§2.2.6).
- Whether `tareWeight` can exceed `packSize` — **rejected when both set** (§2.2.5).
- Negative-stock index/query behavior — **explicitly defined** (§2.3).
- Legacy `lowStockThreshold` default of 10 — **preserved by the migration**, but new docs default to 0 (§2.1).
- Decimal128 JSON serialization shape — **string, not object, not number** (§5.1).
- Helper-only rule — **lint-enforced** (§5.4).

If qa-tester finds a behavior not covered here, escalate to architect-gst before backend-coder invents a default. Per the user's standing rule: this spec is implemented exactly, deviations are reported back.
