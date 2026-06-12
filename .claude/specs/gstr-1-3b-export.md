# Spec: GSTR-1 and GSTR-3B Export from Sales Data
**Status:** Draft
**Owner:** architect-gst
**Implements:** new task (proposed ID: B7 — GSTN Returns Export)

---

## 1. Problem

SmartStock AI customers currently file GSTR-1 (outward supplies) and GSTR-3B (summary) by hand-typing values into the GST portal or by re-keying invoices into the GSTN Returns Offline Utility. This is error-prone and the most-cited reason small businesses miss filing deadlines. We already ship a Tally XML export (`server/src/services/tally.service.js`); we now need an equivalent for the GSTN Offline Utility's JSON shape, plus per-section CSV fallbacks for accountants who prefer Excel.

The Sales collection already carries every monetary field required by GSTR-1 (taxable value, CGST, SGST, IGST, HSN, customer GSTIN, customer state). The remaining work is: (a) classifier logic that bucketises each Sale into the right return section, (b) faithful JSON shaping that the GSTN offline tool will accept without silent rejection, (c) summary aggregation for 3B, (d) a thin set of new boolean/enum fields on `Sale` to capture cases the current model cannot represent (reverse charge, credit notes, exports, exempt supplies).

This spec is the contract between architect-gst and backend-coder. Field-name casing and section keys here are load-bearing — the GSTN portal silently rejects payloads that deviate.

---

## 2. Section Breakdown — Mapping Sales rows to GSTR-1 sections

The classifier runs over each `Sale` (status `completed` only — `refunded` becomes a credit note, see CDNR below) and routes it to exactly one of the sections in Table 1.

### Table 1 — GSTR-1 sections covered by this export

| Section | Code | Source filter on `Sale` | Threshold / rule | Populatable today? |
|---|---|---|---|---|
| 4A — Taxable B2B | `b2b` | `customer.gstin` non-empty AND valid AND `documentType === 'Invoice'` AND `reverseCharge === false` | Any value | Yes (after GSTIN field added — already exists) |
| 4B — B2B reverse charge | `b2b` (sub-flag `rchrg='Y'`) | `customer.gstin` non-empty AND `reverseCharge === true` | Any value | **No** — needs `reverseCharge` flag |
| 5A — B2C Large (interstate) | `b2cl` | `customer.gstin` empty AND `gst.isInterstate === true` AND `total > 250000` | Inter-state to unregistered, invoice value > ₹2.5 lakh | Yes |
| 6A — Exports | `exp` | `isExport === true` | Bill-to outside India / SEZ | **No** — needs `isExport`, `exportType` |
| 7 — B2C Small | `b2cs` | (`customer.gstin` empty AND `gst.isInterstate === false`) OR (`customer.gstin` empty AND `gst.isInterstate === true` AND `total ≤ 250000`) | Aggregated rate-wise per place-of-supply | Yes (aggregation is server-side) |
| 9B — Credit / Debit notes registered | `cdnr` | `documentType ∈ {'Credit Note','Debit Note'}` AND original buyer was B2B | Linked to original invoice | **No** — needs `documentType`, `originalInvoiceNumber`, `originalInvoiceDate` |
| 9B — Credit / Debit notes unregistered | `cdnur` | `documentType ∈ {'Credit Note','Debit Note'}` AND buyer was B2C-Large or export | — | **No** — same fields |
| 8 — Nil / Exempt / Non-GST | `nil` | `isNilRated === true` OR `isExempt === true` OR `isNonGST === true` | Aggregated rate-bucket | **No** — needs `isExempt`, `isNilRated`, `isNonGST` |
| 12 — HSN Summary | `hsn` | All completed sales in range, grouped by `(hsn, rate, uqc)` | Mandatory full HSN at 6-digit if AATO > ₹5 cr; 4-digit otherwise | Yes (HSN already snapshotted on line items) |
| 13 — Documents Issued | `doc_issue` | All allocated invoice numbers in range, including cancelled/voided gaps | Must report from-to series, total, cancelled count | **No** — needs document-series tracking (see §4) |

### What we cannot populate from current data

- **Reverse charge** — currently no flag. Sales today never have `reverseCharge=true`. Adding the field default-`false` keeps existing rows correct.
- **Credit / debit notes** — `Sale.status='refunded'` is the closest signal but there is no `originalInvoiceNumber` link, no document type, no separate document series. Refunded sales today are not reportable as 9B; we would mis-file.
- **Exports / SEZ supplies** — no flag.
- **Exempt / nil-rated / non-GST** — current model assumes everything is taxable at 18% (default `taxRate=18`). A sale of fresh produce (HSN 0701, exempt) would today be reported as 18% taxable, which is illegal.
- **Document Issued (Table 13)** — needs the highest and lowest invoice number issued in the period, plus the count of cancelled numbers. Today the `Counter` collection holds only the latest sequence; gaps from deleted/failed sales are invisible.

These gaps drive the schema additions in §4.

### B2B vs B2C-Large threshold (the ₹2.5 lakh trap)

Per CGST Rule 46 / Notification 78/2020, an inter-state supply to an **unregistered** buyer must be reported in 5A (B2CL) only if `invoiceValue > ₹2,50,000`. At or below ₹2.5 lakh it goes to 7 (B2CS). The threshold is on **invoice value (total inclusive of tax)**, not taxable value — common implementation bug. Use `Sale.total > 250000` strictly greater-than.

Intra-state supplies to unregistered buyers always go to 7 (B2CS) regardless of value.

### B2CS aggregation rule

Section 7 is **not** invoice-level. It is aggregated rows of `(POS state code, rate, supply type intra/inter)` with summed taxable value and tax. The export must:

1. Group all Sale rows that classify as B2CS by `(customer.state → POS code, gst.cgstRate+gst.sgstRate or gst.igstRate, isInterstate)`.
2. Emit one record per group.
3. Output the **state code**, not state name (Karnataka → `"29"`). State-name → state-code mapping table is required (29 entries).

---

## 3. GSTR-3B Summary Calculation

GSTR-3B is purely summary. Out of scope: Table 4 (ITC) — that comes from purchases, which SmartStock AI does not currently model. We mark it **TODO** in the JSON output with all-zero values and a comment.

### Mongo aggregation pseudocode (per month)

```js
const start = new Date(YYYY, MM-1, 1);
const end   = new Date(YYYY, MM, 1);

// Section 3.1(a) Outward taxable supplies (other than zero-rated, nil, exempt)
db.sales.aggregate([
  { $match: { status:'completed', createdAt:{ $gte:start, $lt:end },
              isExempt:{$ne:true}, isNilRated:{$ne:true}, isExport:{$ne:true},
              reverseCharge:{$ne:true} } },
  { $group: { _id:null,
      taxable:  { $sum: { $subtract: ['$subtotal','$discount'] } },
      igst:     { $sum: '$gst.igstAmount' },
      cgst:     { $sum: '$gst.cgstAmount' },
      sgst:     { $sum: '$gst.sgstAmount' },
      cess:     { $sum: 0 } } }
]);
// → 3.1.a { txval, iamt, camt, samt, csamt }

// Section 3.1(b) Outward taxable supplies (zero-rated)  — match isExport:true
// Section 3.1(c) Other outward supplies (Nil-rated, Exempt) — isNilRated|isExempt
// Section 3.1(d) Inward supplies (liable to RCM) — purchases scope, emit zeros
// Section 3.1(e) Non-GST outward supplies — match isNonGST:true

// Section 3.2 — Of supplies in 3.1(a) made to:
//   (i) Unregistered persons → b2cl + b2cs slice, group by POS state code
//   (ii) Composition taxable persons → cannot detect today; emit empty array, log warning
//   (iii) UIN holders → detect via GSTIN 4th char === 'U'

// Section 4 — ITC. TODO. Emit zeros structure.
// Section 5 — TODO (purchases). Zeros.
// Section 6.1 — Tax payable = sum from 3.1(a) + 3.1(d). Cash/credit split is portal-side.
```

### Section-3.2 rounding rule

GSTN portal rejects 3.2 if the sum of (i)+(ii)+(iii) exceeds 3.1(a). Because B2CS is rounded per group and rate, sub-rupee drift can push the sum over by ₹1–2. Rule: round each cell to 2 decimals using banker's rounding **after** summation, never per-row.

### Place-of-supply codes for 3.2

Use the same state-code map as GSTR-1. The JSON expects `pos` as the 2-char zero-padded state code string.

---

## 4. JSON Schema Fidelity (GSTN Offline Utility v3.x)

The GSTN offline tool reads JSON with strict casing. Below are the section shapes we must emit. Wrong casing → silent reject ("processed with errors", no row-level message).

### 4.1 GSTR-1 envelope

```json
{
  "gstin":  "29ABCDE1234F1Z5",
  "fp":     "042026",
  "gt":     0,
  "cur_gt": 0,
  "b2b":     [],
  "b2cl":    [],
  "b2cs":    [],
  "cdnr":    [],
  "cdnur":   [],
  "exp":     [],
  "nil":     { "inv": [] },
  "hsn":     { "data": [] },
  "doc_issue": { "doc_det": [] }
}
```

- `fp` — filing period in `MMYYYY` (April 2026 → `"042026"`). Note: month is **first**, no separator, zero-padded.
- `gt` — gross turnover of previous FY (read from `Settings.workspace.previousFyTurnover`, default 0).
- `cur_gt` — gross turnover from April-1 of current FY up to the start of `fp` month. Computed at export time.
- Empty arrays must still be present — omitting a key has been observed to cause the offline tool to crash on Java 8.

### 4.2 b2b shape (Section 4A / 4B)

```json
{
  "ctin": "27AAAAA0000A1Z5",
  "inv": [
    {
      "inum":    "INV-2026-00042",
      "idt":     "28-04-2026",
      "val":     11800.00,
      "pos":     "27",
      "rchrg":   "N",
      "inv_typ": "R",
      "itms": [
        {
          "num": 1,
          "itm_det": {
            "txval": 10000.00,
            "rt":    18.00,
            "iamt":  1800.00,
            "camt":  0,
            "samt":  0,
            "csamt": 0
          }
        }
      ]
    }
  ]
}
```

- `idt` — `DD-MM-YYYY` with hyphens. NOT ISO. NOT `/`.
- `inv_typ` — `"R"` regular, `"SEWP"` SEZ with payment, `"SEWOP"` SEZ without payment, `"DE"` deemed export. Default `"R"`.
- `rchrg` — `"Y"` or `"N"` literal.
- One `b2b` entry per `ctin` (counterparty GSTIN), aggregating multiple invoices for the same buyer.
- `itms` is grouped by tax rate. A single invoice with two HSNs at 18% and one at 12% emits two `itms` entries.
- For intra-state, `iamt=0` and `camt`/`samt` carry the split. For inter-state, `iamt` carries the value and `camt`/`samt` are 0.

### 4.3 b2cl shape (Section 5A)

```json
{
  "pos":  "27",
  "inv": [
    {
      "inum": "INV-2026-00043",
      "idt":  "28-04-2026",
      "val":  295000.00,
      "itms": [
        { "num": 1, "itm_det": { "txval": 250000.00, "rt": 18.00, "iamt": 45000.00, "csamt": 0 } }
      ]
    }
  ]
}
```

Always inter-state — `iamt` only, no cgst/sgst.

### 4.4 b2cs shape (Section 7)

```json
[
  { "sply_ty": "INTRA", "rt": 18.00, "typ": "OE", "pos": "29",
    "txval": 50000.00, "camt": 4500.00, "samt": 4500.00, "iamt": 0, "csamt": 0 },
  { "sply_ty": "INTER", "rt": 18.00, "typ": "OE", "pos": "27",
    "txval": 150000.00, "iamt": 27000.00, "camt": 0, "samt": 0, "csamt": 0 }
]
```

- `typ`: `"OE"` Other than e-commerce. `"E"` e-commerce — out of scope, always emit `"OE"`.
- Aggregated; **no invoice numbers** in B2CS.

### 4.5 cdnr / cdnur shape (Section 9B)

```json
{
  "ctin": "27AAAAA0000A1Z5",
  "nt": [
    {
      "ntty": "C",
      "nt_num": "CN-2026-00007",
      "nt_dt":  "28-04-2026",
      "val":    11800.00,
      "p_gst":  "N",
      "rsn":    "01",
      "itms": []
    }
  ]
}
```

- `ntty` — `"C"` credit, `"D"` debit.
- `rsn` — reason code: `"01"` Sales Return, `"02"` Post Sale Discount, `"03"` Deficiency in service, `"04"` Correction in invoice, `"05"` Change in POS, `"06"` Finalisation of provisional assessment, `"07"` Others. Default `"01"` for refunds.
- `p_gst` — pre-GST flag, always `"N"` for us.
- `cdnur` is identical except top-level has `"typ": "B2CL"` or `"EXPWP"/"EXPWOP"` instead of `ctin`.

### 4.6 hsn shape (Section 12)

```json
{
  "data": [
    {
      "num":   1,
      "hsn_sc": "8471",
      "desc":  "Computers",
      "uqc":   "NOS",
      "qty":   10,
      "txval": 100000.00,
      "iamt":  9000.00,
      "camt":  4500.00,
      "samt":  4500.00,
      "csamt": 0,
      "rt":    18.00
    }
  ]
}
```

- HSN must be 6-digit if AATO (aggregate annual turnover) > ₹5 cr, else 4-digit. Read AATO from `Settings.workspace.aato` (default 0 → 4-digit). If AATO > 5 cr and any line has < 6-digit HSN, fail validation pre-export (see §7).
- `uqc` — Unit Quantity Code per GSTN list: `NOS, KGS, MTR, LTR, PCS, BOX, SET, BAG, PAC, ...`. Map from `Product.unit` (string) via a fixed lookup; default `"NOS"`.
- One row per `(hsn, rate, uqc)`; intra-state and inter-state are summed into the same row (CGST+SGST+IGST all populated as needed).
- `num` is 1-indexed sequential.
- Per the May 2025 GSTN advisory, Table 12 must be bifurcated B2B vs B2C from Feb 2025 returns. Emit two arrays in the wrapper if `fp` is Feb 2025 or later: `{ "data_b2b": [...], "data_b2c": [...] }`. Until backend-coder confirms the offline-tool version we target, emit both keys plus the legacy `data` for safety.

### 4.7 doc_issue shape (Section 13)

```json
{
  "doc_det": [
    {
      "doc_num": 1,
      "docs": [
        {
          "num":    1,
          "from":   "INV-2026-00001",
          "to":     "INV-2026-00050",
          "totnum": 50,
          "cancel": 2,
          "net_issue": 48
        }
      ]
    }
  ]
}
```

`doc_num` — document type code: `1` Invoices for outward supply, `2` Invoices for inward supply from unregistered person, `3` Revised invoice, `4` Debit note, `5` Credit note, `6` Receipt voucher, `7` Payment voucher, `8` Refund voucher, `9` Delivery challan job-work, `10` Delivery challan supply on approval, `11` Delivery challan other.

We populate `1`, `4`, `5` only. Series tracking: see §5 schema additions.

### 4.8 GSTR-3B envelope

```json
{
  "gstin": "29ABCDE1234F1Z5",
  "ret_period": "042026",
  "sup_details": {
    "osup_det":   { "txval": 0, "iamt": 0, "camt": 0, "samt": 0, "csamt": 0 },
    "osup_zero":  { "txval": 0, "iamt": 0, "csamt": 0 },
    "osup_nil_exmp": { "txval": 0 },
    "isup_rev":   { "txval": 0, "iamt": 0, "camt": 0, "samt": 0, "csamt": 0 },
    "osup_nongst":{ "txval": 0 }
  },
  "inter_sup": {
    "unreg_details": [ { "pos":"27", "txval":0, "iamt":0 } ],
    "comp_details":  [],
    "uin_details":   []
  },
  "itc_elg": {  /* TODO — all zeros */ },
  "inward_sup": { /* TODO — all zeros */ },
  "intr_ltfee": {},
  "tx_pmt": {}
}
```

---

## 5. Schema Additions to `Sale` Model

**Do not change existing fields.** Only add the following. All have safe defaults so existing documents remain valid.

### Field Table — additions to `saleSchema`

| Field | Type | Required | Default | Validator | Index | Notes |
|---|---|---|---|---|---|---|
| `documentType` | String enum | yes | `'Invoice'` | `['Invoice','Credit Note','Debit Note']` | — | Drives CDNR routing |
| `originalInvoiceNumber` | String | no | `''` | required if documentType ≠ 'Invoice' | — | Links credit/debit note to source |
| `originalInvoiceDate` | Date | no | `null` | required if documentType ≠ 'Invoice' | — | Needed for 9B `p_gst` calc |
| `noteReason` | String enum | no | `'01'` | `['01','02','03','04','05','06','07']` | — | GSTR-1 9B reason code |
| `reverseCharge` | Boolean | yes | `false` | — | — | Section 4B trigger |
| `isExport` | Boolean | yes | `false` | — | — | Section 6A trigger |
| `exportType` | String enum | no | `null` | `['WPAY','WOPAY','SEWP','SEWOP','DE',null]` | — | With/without payment of IGST, SEZ, deemed |
| `isExempt` | Boolean | yes | `false` | — | — | Section 8 |
| `isNilRated` | Boolean | yes | `false` | — | — | Section 8 |
| `isNonGST` | Boolean | yes | `false` | — | — | Section 8 / 3B-3.1(e) |
| `placeOfSupply` | String | no | derived from `customer.state` | 2-char numeric state code | `1` | Source of truth for POS once denormalised |
| `invoiceSeries` | String | no | `'INV'` | regex `/^[A-Z0-9-]{1,16}$/` | — | Doc-Issued Section 13 grouping |

### Counter / DocSeries — Section 13 sourcing

The current `Counter` model tracks only `seq`. To produce Section 13 we need to know **which numbers were cancelled** (allocated but no Sale created — happens on retries, validation failures, server crashes). Two options:

- **Option A — derive from gaps:** at export time, take min/max `invoiceNumber` for the FY, compute expected count, subtract actual `Sale.countDocuments({ status:'completed' })`, treat the diff as `cancel`. Cheap. **Risk:** under-counts when a deleted Sale leaves no trace.
- **Option B — write a `CancelledInvoice` audit log:** every time `allocateInvoiceNumber()` returns a number that fails to commit to a Sale, write `{ invoiceNumber, reason, at }` to a new `cancelled_invoices` collection. Section 13 sums these.

**Recommendation:** Option A for v1 (no migration risk). Add Option B as a follow-up.

---

## 6. Endpoint Design

Mirrors `GET /sales/tally.xml` exactly. Routes go in `server/src/routes/v1/sale.routes.js`, controllers in `server/src/controllers/sale.controller.js`, business logic in a new `server/src/services/gstn.service.js`. All routes require `protect` (already at router-level).

### Table 2 — New endpoints

| Method | Path | Query params | Response Content-Type | Content-Disposition filename |
|---|---|---|---|---|
| GET | `/api/v1/sales/gstr1.json` | `from=YYYY-MM-DD&to=YYYY-MM-DD` (or `month=YYYY-MM`) | `application/json; charset=utf-8` | `gstr1-{gstin}-{fp}.json` |
| GET | `/api/v1/sales/gstr1.csv` | `from`, `to`, `section=b2b\|b2cl\|b2cs\|cdnr\|hsn\|docs` | `text/csv; charset=utf-8` | `gstr1-{section}-{fp}.csv` |
| GET | `/api/v1/sales/gstr3b.json` | `month=YYYY-MM` (required, single month) | `application/json; charset=utf-8` | `gstr3b-{gstin}-{fp}.json` |
| GET | `/api/v1/sales/gstr3b.xlsx` | `month=YYYY-MM` | xlsx mime | `gstr3b-{fp}.xlsx` |

### Controller pattern (mirrors `exportTallyXml`)

```js
exports.exportGstr1Json = async (req, res) => {
  try {
    const { from, to, month } = req.query;
    const range = resolveRange({ from, to, month });
    const sales = await Sale.find({
      createdBy: req.user.id,
      status: { $in: ['completed','refunded'] },
      createdAt: { $gte: range.from, $lte: range.to },
    }).sort({ createdAt: 1 });

    const settings = await Settings.findOne({ userId: req.user.id });
    const validation = preExportValidate(sales, settings);
    if (validation.blocking.length && req.query.force !== 'true') {
      return res.status(422).json({ success:false, validation });
    }

    const payload = buildGstr1(sales, { settings, fp: range.fp });
    const fname = `gstr1-${settings.workspace.gstin}-${range.fp}.json`;

    await AuditLog.create({ /* §8 */ });

    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="${fname}"`);
    return res.status(200).send(JSON.stringify(payload));
  } catch (e) {
    return res.status(500).json({ success:false, message:'Could not build GSTR-1 JSON.' });
  }
};
```

### CSV variant — column orders

Each section CSV has the GSTN-utility's exact column order. Header row is mandatory. Example for `b2b`:

```
GSTIN/UIN of Recipient,Receiver Name,Invoice Number,Invoice date,Invoice Value,Place Of Supply,Reverse Charge,Applicable % of Tax Rate,Invoice Type,E-Commerce GSTIN,Rate,Taxable Value,Cess Amount
```

CSV emits one row per `(invoice, rate)` pair. Numbers use `.` decimal, no thousands separator, no currency symbol. Line endings CRLF per RFC 4180.

### Range resolution

- `month=YYYY-MM` → `from = first ms of month`, `to = last ms of month`, `fp = MMYYYY`.
- `from`+`to` → use as-is, `fp` = month of `from`. Reject if range spans more than one month for `gstr3b.json`.
- Neither → default to **previous** calendar month (most users export the just-closed period). Different from Tally export which defaults to current month — flag in code comment.

---

## 7. Pre-Export Validation Checklist

The controller runs these checks before serialising. Blocking errors return `422` with the validation report; warnings flow through with a `warnings` array embedded in the JSON response.

### Numbered checklist for backend-coder

1. **Workspace GSTIN present and valid** — matches GSTIN regex AND passes check-digit. **Blocking.**
2. **Workspace state matches GSTIN first 2 chars** — else POS classification will be wrong. **Blocking.**
3. **Every B2B sale has a customer GSTIN that is non-empty AND passes regex AND check-digit.** Sales failing this fall through to B2CS — warn the user how many sales were re-bucketed. **Warning.**
4. **B2CL sales' customer.state is non-empty** — else POS code cannot be derived. List offending invoice numbers. **Blocking.**
5. **HSN code present on every line item.** If `AATO > 5 cr`, additionally require ≥ 6 digits. **Blocking.**
6. **Place-of-supply consistency** — for `gst.isInterstate=false`, customer state code must equal seller state code; for `isInterstate=true`, they must differ. **Blocking.**
7. **Invoice value ≤ ₹2.5 lakh sanity for B2CS** — flag any B2CS row whose invoice value > ₹2.5 lakh AND `isInterstate=true` (should have been B2CL). **Blocking.**
8. **Tax rate matches CGST+SGST or IGST split** — assert `taxableAmount * rate/100 ≈ cgst+sgst` (or `iamt`) within ₹1 tolerance. **Warning.**
9. **Document Issued series continuity** — if `min(invoiceNumber)` does not equal expected series start (`INV-{FY}-00001`), warn that prior-period invoices are excluded. **Info.**
10. **Reverse-charge GSTIN present** — if `reverseCharge=true` AND `customer.gstin` empty, block. **Blocking.**

### GSTIN check-digit algorithm

```
chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
sum = 0
for i in 0..13:
    val = chars.indexOf(gstin[i])
    factor = (i % 2 === 0) ? 1 : 2
    digit = val * factor
    sum += Math.floor(digit / 36) + (digit % 36)
checkDigit = chars[(36 - (sum % 36)) % 36]
return checkDigit === gstin[14]
```

---

## 8. Audit Log

CAs and tax officers may dispute filings up to 6 years later. We must be able to reproduce exactly what the user downloaded.

### New collection: `gstn_export_audits`

```js
const gstnExportAuditSchema = new mongoose.Schema({
  userId:        { type: ObjectId, ref:'User', required:true, index:true },
  workspaceGstin:{ type: String, required:true },
  exportType:    { type: String, enum:['gstr1.json','gstr1.csv','gstr3b.json','gstr3b.xlsx'], required:true },
  section:       { type: String, default:null },
  rangeFrom:     { type: Date, required:true },
  rangeTo:       { type: Date, required:true },
  fp:            { type: String, required:true },
  saleIds:       [{ type: ObjectId, ref:'Sale' }],
  generatedCount:{ type: Number, required:true },
  fileSizeBytes: { type: Number, required:true },
  fileSha256:    { type: String, required:true, index:true },
  validationWarnings: [{ code:String, message:String, count:Number }],
  ip:            { type: String, default:'' },
  userAgent:     { type: String, default:'' },
}, { timestamps: true });
```

- Hash computed over the **exact bytes sent** to the client. `crypto.createHash('sha256').update(buffer).digest('hex')`.
- We do not store the file itself — hash + saleIds is enough for forensic reconstruction.
- Audit row committed **before** the response is sent.
- TTL: none. These records live forever.

---

## 9. Frontend UX

### Sales page modal — `GstnExportModal`

Triggered from a new button next to the existing **Tally Export** button on `client/src/pages/SalesPage.jsx`. Same visual style.

Layout:

- **Header:** "Export GST Returns"
- **Tab switcher:** `[ GSTR-1 ]  [ GSTR-3B ]`
- **Period picker:**
  - GSTR-1: month picker OR custom-range. Default = previous month.
  - GSTR-3B: month picker only.
- **Format selector:**
  - GSTR-1: radio `[ JSON ] [ CSV per section ]`. CSV → section dropdown.
  - GSTR-3B: radio `[ JSON ] [ Excel ]`.
- **Validation preview pane** — call `?dry_run=true` on tab/period change. Render:
  - Blocking errors in red, download disabled.
  - Warnings in amber, download enabled, "Download anyway".
  - Green check + summary line when clean.
- **Footer:** Cancel / Download (with spinner). Note: "Filed via gst.gov.in. SmartStock AI does not transmit to GSTN; you upload the file yourself."

Service additions to `client/src/services/salesService.js`:
- `exportGstr1Json({ from, to, month, dryRun })`
- `exportGstr1Csv({ from, to, section })`
- `exportGstr3bJson({ month, dryRun })`
- `exportGstr3bXlsx({ month })`
- `previewGstnExport({ returnType, from, to, month })`

---

## 10. Example Payloads

### 10.1 Minimal valid GSTR-1 JSON (one B2B invoice)

```json
{
  "gstin": "29ABCDE1234F1Z5",
  "fp": "042026",
  "gt": 5000000,
  "cur_gt": 240000,
  "b2b": [
    {
      "ctin": "27AAAAA0000A1Z5",
      "inv": [
        {
          "inum": "INV-2026-00042",
          "idt": "15-04-2026",
          "val": 11800.00,
          "pos": "27",
          "rchrg": "N",
          "inv_typ": "R",
          "itms": [
            { "num": 1, "itm_det": { "txval": 10000.00, "rt": 18.00, "iamt": 1800.00, "camt": 0, "samt": 0, "csamt": 0 } }
          ]
        }
      ]
    }
  ],
  "b2cl": [],
  "b2cs": [],
  "cdnr": [],
  "cdnur": [],
  "exp": [],
  "nil": { "inv": [] },
  "hsn": {
    "data": [
      { "num": 1, "hsn_sc": "8471", "desc": "Computers", "uqc": "NOS", "qty": 1, "txval": 10000.00, "iamt": 1800.00, "camt": 0, "samt": 0, "csamt": 0, "rt": 18.00 }
    ]
  },
  "doc_issue": {
    "doc_det": [
      { "doc_num": 1, "docs": [ { "num": 1, "from": "INV-2026-00042", "to": "INV-2026-00042", "totnum": 1, "cancel": 0, "net_issue": 1 } ] }
    ]
  }
}
```

### 10.2 Minimal GSTR-3B JSON (one outward supply, no ITC)

```json
{
  "gstin": "29ABCDE1234F1Z5",
  "ret_period": "042026",
  "sup_details": {
    "osup_det":     { "txval": 10000.00, "iamt": 1800.00, "camt": 0, "samt": 0, "csamt": 0 },
    "osup_zero":    { "txval": 0, "iamt": 0, "csamt": 0 },
    "osup_nil_exmp":{ "txval": 0 },
    "isup_rev":     { "txval": 0, "iamt": 0, "camt": 0, "samt": 0, "csamt": 0 },
    "osup_nongst":  { "txval": 0 }
  },
  "inter_sup": { "unreg_details": [], "comp_details":  [], "uin_details":   [] },
  "itc_elg": {
    "itc_avl":  [
      { "ty":"IMPG", "iamt":0, "camt":0, "samt":0, "csamt":0 },
      { "ty":"IMPS", "iamt":0, "camt":0, "samt":0, "csamt":0 },
      { "ty":"ISRC", "iamt":0, "camt":0, "samt":0, "csamt":0 },
      { "ty":"ISD",  "iamt":0, "camt":0, "samt":0, "csamt":0 },
      { "ty":"OTH",  "iamt":0, "camt":0, "samt":0, "csamt":0 }
    ],
    "itc_rev":  [],
    "itc_net":  { "iamt":0, "camt":0, "samt":0, "csamt":0 },
    "itc_inelg":[]
  },
  "inward_sup": { "isup_details": [
    { "ty":"GST",     "intra":0, "inter":0 },
    { "ty":"NONGST",  "intra":0, "inter":0 }
  ]}
}
```

---

## 11. Edge Cases

- **Mid-period customer GSTIN correction.** Sale created without GSTIN, customer later supplies one. Export uses snapshot — no re-classification. Amend-customer flow must update the Sale doc directly.
- **Refund spans periods.** Sale invoiced March, refunded April. Original invoice → March GSTR-1; credit note (separate doc) → April GSTR-1 9B. Today's `Sale.status='refunded'` mutation does NOT produce the right output; backend-coder must add a `createCreditNote` controller in a follow-up task.
- **Same invoice, mixed exempt + taxable lines.** Per CGST §8 composite supply rule. v1: classify per-line — taxable portion to b2b/b2cs and exempt portion to `nil.inv`. Flag as warning since the rule is interpretive.
- **Round-tripping.** Always round at the **section** level, never compose strings from existing floats. Use `Math.round(x * 100) / 100` not `toFixed`.
- **Inter-state to a buyer with a GSTIN whose first 2 chars equal the seller state.** Trust the GSTIN's first 2 chars over `customer.state`. POS = `gstin.substr(0,2)`.
- **Filing period boundary at midnight.** Date filters use IST (`Asia/Kolkata`), not UTC.
- **Empty period.** Still emit a valid envelope with all empty arrays — users still need to file a "nil return."
- **Counter rolls over FY.** Invoice numbers reset each fiscal year. If the export range spans April 1, emit two `docs` rows.

---

## 12. Tests to Write (for qa-tester)

1. **Single intra-state B2B invoice classifies as `b2b` with `rchrg='N'`.** `subtotal=10000, isInterstate=false, cgstRate=9, sgstRate=9, customer.gstin='27AAAAA0000A1Z5'`. Expected `b2b[0].inv[0].itms[0].itm_det = { txval:10000, rt:18, iamt:0, camt:900, samt:900, csamt:0 }`.
2. **Inter-state unregistered ₹2.6 lakh → `b2cl`.** `total=260000, isInterstate=true, customer.gstin=''`.
3. **Inter-state unregistered exactly ₹2.5 lakh → `b2cs`.** Strict greater-than check.
4. **Two B2CS sales same state same rate aggregate to one row.** Two of `taxable=5000, igstRate=18, isInterstate=true, pos=27`. Expected: `b2cs.length === 1`, `b2cs[0].txval === 10000`, `b2cs[0].iamt === 1800`.
5. **HSN summary aggregates across multiple invoices.** Three invoices, HSN 8471 at 18%, taxable 1000/2000/3000. Expected: `hsn.data[0].txval === 6000`.
6. **Reverse charge sale emits `rchrg='Y'` and excludes from 3B-3.1(a).** Expected: `b2b[0].inv[0].rchrg === 'Y'` AND in 3B `osup_det.txval` does NOT include this sale.
7. **GSTIN check-digit invalid blocks export.** Workspace gstin `'29ABCDE1234F1Z9'`. Expected 422 with `WORKSPACE_GSTIN_INVALID`.
8. **Empty range emits valid envelope.** No sales for fp `'012026'`. 200 OK, all section arrays empty, `gt`/`cur_gt` populated.
9. **Date format is DD-MM-YYYY in `idt`.** Sale on 2026-04-15. Expected: `b2b[0].inv[0].idt === '15-04-2026'`.
10. **Audit log written before response.** Hit `/sales/gstr1.json`. Expected `gstn_export_audits.countDocuments() === 1`, `fileSha256` equal to `sha256(responseBody)`.
11. **Tampered tax amounts emit warning.** `cgstAmount=0` despite `cgstRate=9, taxable=10000`. Dry-run returns `TAX_AMOUNT_MISMATCH`.
12. **CSV output has CRLF line endings.** Per RFC 4180. Body contains `\r\n`.
13. **B2CS does not emit invoice numbers.** Inspect any `b2cs` row. `inum` key absent.
14. **Missing HSN with AATO > 5 cr blocks.** Empty `hsnCode`, `aato=60000000`. Expected 422 with `HSN_REQUIRED_6DIGIT`.
15. **3B section 3.2 unreg total ≤ 3.1(a).** Property test. Always `sum(unreg_details[].txval) <= sup_details.osup_det.txval`.

---

## 13. Out of Scope (explicitly)

- GSTR-2A / 2B reconciliation (purchases).
- GSTR-9 / 9C annual return.
- Direct GSTN API filing (requires GSP — see `gsp-partner-shortlist.md`).
- e-Invoicing IRN / QR code generation.
- e-Way bill JSON.
- Composition scheme returns (CMP-08).
- TCS / TDS sections (10, 11).
- Cess on luxury / sin goods (`csamt` always 0).

---

## 14. Recommendation Summary for Orchestrator

This work splits cleanly into 4 backend tasks:

| Task ID | Scope | Est complexity |
|---|---|---|
| B7.1 | Schema additions to `Sale` (§5) + migration script defaulting old rows | Low |
| B7.2 | `gstn.service.js` — classifier + JSON builder for GSTR-1 | High |
| B7.3 | `gstn.service.js` — GSTR-3B aggregator + JSON + CSV/Excel emitters | Medium |
| B7.4 | Controller endpoints + audit log + pre-export validator + frontend modal | Medium |

Recommend B7.1 ship first as a standalone PR (no behavior change) so we de-risk the migration before any export logic lands.

---

## File paths referenced

Read-only audit:
- `server/src/models/Sale.model.js` — schema additions land here (§5)
- `server/src/services/tally.service.js` — pattern to mirror
- `server/src/controllers/sale.controller.js` — `exportTallyXml` is the controller template (§6)
- `server/src/routes/v1/sale.routes.js` — register the four new routes after the Tally line
- `client/src/pages/SalesPage.jsx` — the `TallyExportModal` is the template for `GstnExportModal` (§9)
- `client/src/services/salesService.js` — add the four new client functions

To be created by backend-coder:
- `server/src/services/gstn.service.js`
- `server/src/models/GstnExportAudit.model.js`
- `client/src/components/GstnExportModal.jsx`

---

**Sources:**
- GSTN Returns Offline Tool FAQs and User Manual (gst.gov.in)
- ClearTax — Guide to GSTR-1 Filing
- TaxO — GSTN Advisory on Tables 12 and 13 of GSTR-1 (May 2025)
- TaxPower GST — GSTR-1 Table 12 and 13 Compliance Guide 2025
- IndiaFilings — Mandatory HSN Code Reporting in GSTR-1/1A from January 2025
- Suvit — GSTR-1 Filing Essentials for CAs 2025
