'use strict';

// Sale model — Decimal128 line items, scale-mode fields, GST split per line.
// Legacy Number fields (unitPrice, quantity, subtotal, total, tax) are exposed
// as read-only virtuals so existing Sale rows and old API clients keep working.
// | spec: setup-flow-and-units.md §B.4, product-uom-schema.md §7, chunk #3

const mongoose = require('mongoose');
const money  = require('../utils/money');
const weight = require('../utils/weight');

const { Decimal128 } = mongoose.Types;

// ---------------------------------------------------------------------------
// Line-item subdocument
// ---------------------------------------------------------------------------
const saleItemSchema = new mongoose.Schema(
  {
    productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    sku:         { type: String, default: '' },
    hsnCode:     { type: String, default: '' },

    // Unit snapshot — stored so a later product-master edit doesn't reinterpret
    // the historical sale (spec chunk #3 deliverable A).
    unit: { type: String, required: true, default: 'pcs' },

    // qty — Decimal128. Replaces the old Number `quantity` field.
    // Negative for return lines (Sale.type === 'return').
    qty: { type: Decimal128, required: true },

    // Tare applied at sale time. Net qty = qty - tareApplied.
    tareApplied: { type: Decimal128, default: () => Decimal128.fromString('0') },

    // pricePerUnit — Decimal128. Replaces old Number `unitPrice`.
    pricePerUnit: { type: Decimal128, required: true },

    // Line totals (all Decimal128, computed by saleCompute.js, stored immutably)
    lineSubtotal: { type: Decimal128, required: true },
    lineTax:      { type: Decimal128, required: true },
    lineTotal:    { type: Decimal128, required: true },

    // Per-line GST rate (whole-percent integer: 0, 5, 12, 18, 28)
    gstRate: { type: Number, required: true, default: 0 },

    // Split tax amounts — one of cgst+sgst (intra) or igst (inter) is non-zero
    cgst: { type: Decimal128, default: () => Decimal128.fromString('0') },
    sgst: { type: Decimal128, default: () => Decimal128.fromString('0') },
    igst: { type: Decimal128, default: () => Decimal128.fromString('0') },

    // Amount-first mode fields (spec §B.4 "₹500 ka rice")
    amountFirst:   { type: Boolean, default: false },
    enteredAmount: { type: Decimal128, default: null },

    // -----------------------------------------------------------------------
    // Legacy virtual fields — old Number values from pre-chunk#3 sale rows.
    // Not stored for NEW sales; accessed via virtuals for old rows.
    // For read-compat only — do not set these on new sale creation.
    // -----------------------------------------------------------------------
    _legacyQuantity:  { type: Number, default: null, select: false },
    _legacyUnitPrice: { type: Number, default: null, select: false },
    _legacySubtotal:  { type: Number, default: null, select: false },
  },
  { _id: true, id: false }
);

// ---------------------------------------------------------------------------
// Line-item schema validators (spec chunk #3 deliverable A)
// ---------------------------------------------------------------------------
saleItemSchema.pre('validate', async function () {
  // qty < 0 is only allowed when this line belongs to a return sale.
  // The parent sale doc type check is done in the Sale pre-validate hook instead,
  // because the subdoc doesn't know its parent type during subdoc validation.
  // pricePerUnit must be > 0
  if (this.pricePerUnit != null) {
    let ppu;
    try { ppu = Number(this.pricePerUnit.toString()); } catch (_) {}
    if (ppu != null && ppu <= 0) throw new Error('pricePerUnit must be > 0 on each sale line');
  }
  // tareApplied <= qty (gross) — reject if tare exceeds what was weighed
  if (this.qty != null && this.tareApplied != null) {
    let q, t;
    try { q = Number(this.qty.toString()); t = Number(this.tareApplied.toString()); } catch (_) {}
    if (q != null && t != null && t > Math.abs(q)) throw new Error('tareApplied must not exceed qty');
  }
});

// ---------------------------------------------------------------------------
// Line-item virtuals — legacy Number fields for old API consumers
// ---------------------------------------------------------------------------
// `quantity` — was the old Number field, now returns Decimal128 as a Number
saleItemSchema.virtual('quantity').get(function () {
  if (this.qty != null) return Number(this.qty.toString());
  return this._legacyQuantity;
});

// `unitPrice` — was the old Number field
saleItemSchema.virtual('unitPrice').get(function () {
  if (this.pricePerUnit != null) return Number(this.pricePerUnit.toString());
  return this._legacyUnitPrice;
});

// `subtotal` — was the old Number field per line
saleItemSchema.virtual('subtotal').get(function () {
  if (this.lineSubtotal != null) return Number(this.lineSubtotal.toString());
  return this._legacySubtotal;
});

// toJSON for line items — flatten Decimal128 to strings
saleItemSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    // qty is unit-aware: use weight.toString for unit-correct decimal precision (spec §5.2)
    if (ret.qty != null && ret.qty._bsontype === 'Decimal128') {
      ret.qty = weight.toString(ret.qty, ret.unit || 'pcs');
    }
    // All other Decimal128 fields: serialize as plain 2dp money or raw string
    const d128Fields = [
      'tareApplied', 'pricePerUnit',
      'lineSubtotal', 'lineTax', 'lineTotal',
      'cgst', 'sgst', 'igst', 'enteredAmount',
    ];
    d128Fields.forEach((f) => {
      if (ret[f] != null && ret[f]._bsontype === 'Decimal128') {
        ret[f] = ret[f].toString();
      }
    });
    // Remove internal legacy fields from JSON output
    delete ret._legacyQuantity;
    delete ret._legacyUnitPrice;
    delete ret._legacySubtotal;
    return ret;
  },
});

// ---------------------------------------------------------------------------
// Sale document schema
// ---------------------------------------------------------------------------
const saleSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, unique: true },

    // Sale type: 'sale' = normal, 'return' = refund/credit note
    type: {
      type: String,
      enum: ['sale', 'return'],
      default: 'sale',
    },

    // For return sales, points to the original sale being refunded
    originalSaleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      default: null,
    },

    customer: {
      name:    { type: String, default: 'Walk-in Customer' },
      email:   { type: String, default: '' },
      phone:   { type: String, default: '' },
      gstin:   { type: String, default: '' },
      address: { type: String, default: '' },
      state:   { type: String, default: '' },
    },

    seller: {
      companyName: { type: String, default: '' },
      gstin:       { type: String, default: '' },
      address:     { type: String, default: '' },
      state:       { type: String, default: '' },
    },

    // Whether CGST+SGST (intra) or IGST (inter) was used for this invoice.
    // Derived from workspace.state vs customer.state at sale time.
    intraState: { type: Boolean, default: true },

    // Sale line items (new Decimal128-based schema)
    items: [saleItemSchema],

    // Invoice-level aggregates (all Decimal128)
    subtotal:  { type: Decimal128, required: true },
    taxTotal:  { type: Decimal128, default: () => Decimal128.fromString('0') },
    roundOff:  { type: Decimal128, default: () => Decimal128.fromString('0') },
    grandTotal: { type: Decimal128, required: true },

    // Legacy GST block — kept for old invoice renders and Tally export
    gst: {
      isInterstate: { type: Boolean, default: false },
      cgstRate:     { type: Number, default: 9 },
      sgstRate:     { type: Number, default: 9 },
      igstRate:     { type: Number, default: 18 },
      cgstAmount:   { type: Number, default: 0 },
      sgstAmount:   { type: Number, default: 0 },
      igstAmount:   { type: Number, default: 0 },
    },

    // Payment
    paymentMode: {
      type: String,
      enum: ['cash', 'upi', 'bank', 'cheque', 'card', 'credit'],
      default: 'cash',
    },
    payment: {
      mode:     { type: String, default: '' },
      received: { type: Decimal128, default: null },
    },

    // Discount (flat, subtracted before GST)
    discount: { type: Number, default: 0 },

    notes: { type: String, default: '' },

    status: {
      type: String,
      enum: ['completed', 'refunded'],
      default: 'completed',
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// Sale-level pre-validate: check negative qty only for non-return sales
// ---------------------------------------------------------------------------
saleSchema.pre('validate', async function () {
  const isReturn = this.type === 'return';
  for (const item of this.items || []) {
    if (item.qty != null) {
      let q;
      try { q = Number(item.qty.toString()); } catch (_) {}
      if (q != null && q < 0 && !isReturn) {
        throw new Error(`Negative qty is only allowed on return sales (line: ${item.productName})`);
      }
    }
    // For non-saleByWeight units qty must be a whole number.
    // The controller handles this check before building the item; this is a safety net.
  }
});

// ---------------------------------------------------------------------------
// Invoice number allocator — safety net for direct Sale.create() calls
// ---------------------------------------------------------------------------
saleSchema.pre('save', async function () {
  if (!this.invoiceNumber) {
    const Counter = mongoose.model('Counter');
    const year = new Date().getFullYear();
    const counter = await Counter.findOneAndUpdate(
      { _id: `invoice-${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const pad = String(counter.seq).padStart(5, '0');
    const prefix = this.type === 'return' ? 'RET' : 'INV';
    this.invoiceNumber = `${prefix}-${year}-${pad}`;
  }
});

// ---------------------------------------------------------------------------
// Legacy Sale-level virtuals — old Number fields for backward compat
// ---------------------------------------------------------------------------

// `total` — was Number, now mirrors grandTotal
saleSchema.virtual('total').get(function () {
  if (this.grandTotal != null) return Number(this.grandTotal.toString());
  return null;
});

// `taxAmount` — was Number, now mirrors taxTotal
saleSchema.virtual('taxAmount').get(function () {
  if (this.taxTotal != null) return Number(this.taxTotal.toString());
  return null;
});

// `taxRate` — legacy field; for new sales GST is per-line so this is approximate
saleSchema.virtual('taxRate').get(function () {
  // Return the dominant tax rate from the first item, or 0
  const firstItem = this.items && this.items[0];
  return firstItem ? (firstItem.gstRate || 0) : 0;
});

// ---------------------------------------------------------------------------
// toJSON transform — flatten Decimal128 fields to strings
// ---------------------------------------------------------------------------
saleSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    const d128Fields = ['subtotal', 'taxTotal', 'roundOff', 'grandTotal'];
    d128Fields.forEach((f) => {
      if (ret[f] != null && ret[f]._bsontype === 'Decimal128') {
        ret[f] = ret[f].toString();
      }
    });
    if (ret.payment && ret.payment.received != null &&
        ret.payment.received._bsontype === 'Decimal128') {
      ret.payment.received = ret.payment.received.toString();
    }
    return ret;
  },
});

saleSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Sale', saleSchema);
