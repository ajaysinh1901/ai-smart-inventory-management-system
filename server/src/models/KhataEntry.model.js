// Append-only ledger line for a customer. Source of truth for outstanding
// balance — Customer.outstandingBalance is a denormalized cache.
//
// Hard rules:
//   - Never updated except for the controlled isReversed flag flip.
//   - runningBalance is frozen at write time (post-increment authoritative value).
//   - Sign convention: debit = +amount, credit = -amount.
const mongoose = require('mongoose');

const VOUCHER_TYPES   = ['Sale', 'Payment', 'Refund', 'Adjustment', 'OpeningBalance'];
const PAYMENT_MODES   = ['', 'cash', 'upi', 'bank', 'cheque', 'card'];

const referenceSchema = new mongoose.Schema({
  saleId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
  paymentNote:      { type: String, default: '' },
  adjustmentReason: { type: String, default: '' },
}, { _id: false });

const khataEntrySchema = new mongoose.Schema({
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  voucherType:    { type: String, required: true, enum: VOUCHER_TYPES },
  direction:      { type: String, required: true, enum: ['debit', 'credit'] },
  amount:         { type: Number, required: true, min: 0 },
  // Customer.outstandingBalance immediately AFTER this entry was applied.
  // Computed inside the transactional posting helper, never recomputed.
  runningBalance: { type: Number, required: true },
  entryDate:      { type: Date, default: Date.now, required: true },
  mode:           { type: String, default: '', enum: PAYMENT_MODES },
  reference:      { type: referenceSchema, default: () => ({}) },
  chequeNumber:   { type: String, default: '', maxlength: 30 },
  chequeBank:     { type: String, default: '', maxlength: 80 },
  upiTxnId:       { type: String, default: '', maxlength: 50 },
  // Allocated only for Payment / Refund vouchers. Format: RCPT-YYYY-NNNNN.
  receiptNumber:  { type: String },
  notes:          { type: String, default: '', maxlength: 1000 },
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reversalOf:     { type: mongoose.Schema.Types.ObjectId, ref: 'KhataEntry', default: null },
  isReversed:     { type: Boolean, default: false },
}, { timestamps: true });

// Sale vouchers must reference an originating Sale.
// C1 fix: converted from sync function(next) to async — Mongoose 9/Kareem 3 no longer passes next | spec: khata-ledger.md
khataEntrySchema.pre('validate', async function () {
  // NEW-03 fix: tag statusCode so controllers map these to HTTP 400, not 500.
  if (this.voucherType === 'Sale' && !this.reference?.saleId) {
    throw Object.assign(new Error('Sale voucher requires reference.saleId'), { statusCode: 400 });
  }
  if ((this.voucherType === 'Payment' || this.voucherType === 'Refund') && !this.mode) {
    throw Object.assign(new Error(`${this.voucherType} requires a payment mode`), { statusCode: 400 });
  }
  if (this.mode === 'cheque' && !this.chequeNumber) {
    throw Object.assign(new Error('Cheque payments require chequeNumber'), { statusCode: 400 });
  }
});

khataEntrySchema.index({ userId: 1, customerId: 1, entryDate: -1 });
khataEntrySchema.index({ userId: 1, customerId: 1, createdAt: -1 });
khataEntrySchema.index(
  { receiptNumber: 1 },
  { unique: true, partialFilterExpression: { receiptNumber: { $type: 'string' } } }
);
khataEntrySchema.index({ userId: 1, voucherType: 1, entryDate: -1 });

module.exports = mongoose.model('KhataEntry', khataEntrySchema);
module.exports.VOUCHER_TYPES = VOUCHER_TYPES;
module.exports.PAYMENT_MODES = PAYMENT_MODES;
