// Customer master + denormalized outstanding balance.
// Source of truth for udhaar/khata is the KhataEntry collection; the
// `outstandingBalance` field is a cache updated atomically via $inc on every
// KhataEntry write. Refreshable via /customers/:id/recompute-balance.
const mongoose = require('mongoose');
const { INDIAN_STATES } = require('../constants/indianStates');

const phoneRegex = /^\+91[6-9]\d{9}$/;
const gstinRegex = /^[0-9A-Z]{15}$/;
const pinRegex   = /^\d{6}$/;

const gstinHistorySchema = new mongoose.Schema({
  gstin:     { type: String, required: true, match: gstinRegex },
  changedAt: { type: Date, default: Date.now },
}, { _id: false });

const customerSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:          { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  phone:         {
    type: String, default: '', trim: true,
    validate: {
      validator: (v) => v === '' || phoneRegex.test(v),
      message:   'Phone must be +91 followed by a 10-digit Indian mobile (leading 6/7/8/9).',
    },
  },
  email:         { type: String, default: '', trim: true, lowercase: true },
  gstin:         {
    type: String, default: '', trim: true, uppercase: true,
    validate: {
      validator: (v) => v === '' || gstinRegex.test(v),
      message:   'GSTIN must be 15 chars, A-Z and 0-9.',
    },
  },
  gstinHistory:  { type: [gstinHistorySchema], default: [] },
  addressLine1:  { type: String, default: '', trim: true, maxlength: 200 },
  addressLine2:  { type: String, default: '', trim: true, maxlength: 200 },
  city:          { type: String, default: '', trim: true, maxlength: 80 },
  state:         {
    type: String, default: '', trim: true,
    validate: {
      validator: (v) => v === '' || INDIAN_STATES.includes(v),
      message:   'State must be one of the 36 Indian states/UTs.',
    },
  },
  pinCode:       {
    type: String, default: '', trim: true,
    validate: {
      validator: (v) => v === '' || pinRegex.test(v),
      message:   'PIN code must be exactly 6 digits.',
    },
  },
  country:       { type: String, default: 'India' },
  // openingBalance is read-once at creation; an OpeningBalance KhataEntry is
  // posted in the same transaction so the ledger reconciles.
  openingBalance:     { type: Number, default: 0 },
  // 0 means "no limit enforced". Soft warning only, not a hard block.
  creditLimit:        { type: Number, default: 0, min: 0 },
  // Denormalized aggregate of KhataEntry signs. + means customer owes the shop.
  outstandingBalance: { type: Number, default: 0 },
  notes:              { type: String, default: '', maxlength: 2000 },
  tags:               [{ type: String, maxlength: 30 }],
  isActive:           { type: Boolean, default: true },
  lastTransactionAt:  { type: Date, default: null },
  createdBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// Indexes — partial uniqueness so empty phone/gstin don't collide on '' across
// every walk-in record. Tenancy is enforced by the userId prefix.
customerSchema.index(
  { userId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string', $ne: '' } } }
);
customerSchema.index(
  { userId: 1, gstin: 1 },
  { unique: true, partialFilterExpression: { gstin: { $type: 'string', $ne: '' } } }
);
customerSchema.index({ userId: 1, name: 'text' });
customerSchema.index({ userId: 1, outstandingBalance: -1 });
customerSchema.index({ userId: 1, isActive: 1, lastTransactionAt: -1 });

module.exports = mongoose.model('Customer', customerSchema);
