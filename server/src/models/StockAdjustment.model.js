'use strict';

// StockAdjustment model — audit log for stock changes | spec: product-uom-schema.md §7
const mongoose = require('mongoose');

const { Decimal128 } = mongoose.Types;

// Reason enum — locked per spec §7.1 (adding requires a schema migration)
// A2-05 fix: added 'manual' to support manual stock adjustments from the UI | spec: product-uom-schema.md §7
const REASON_ENUM = [
  'opening',
  'purchase-variance',
  'sale',
  'return',
  'damage',
  'count-correction',
  'manual',
  'other',
];

const stockAdjustmentSchema = new mongoose.Schema(
  {
    // Product this adjustment applies to
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'productId is required'],
      index: true,
    },
    // Signed delta: +0.300 = stock-in, -0.300 = shrinkage/sale
    delta: {
      type: Decimal128,
      required: [true, 'delta is required'],
    },
    reason: {
      type: String,
      required: [true, 'reason is required'],
      enum: {
        values: REASON_ENUM,
        message: `reason must be one of: ${REASON_ENUM.join(', ')}`,
      },
    },
    // Free-form note — required when reason === 'other' (min 3 chars)
    reasonDetail: {
      type: String,
      maxlength: [200, 'reasonDetail must be 200 characters or fewer'],
      default: '',
    },
    // Purchase-variance fields (populated only for reason='purchase-variance')
    invoicedQty: {
      type: Decimal128,
      default: null,
    },
    receivedQty: {
      type: Decimal128,
      default: null,
    },
    // Snapshot of product.unit at adjustment time (avoids schema coupling for reports)
    unit: {
      type: String,
      required: [true, 'unit is required'],
      enum: ['pcs', 'kg', 'g', 'l', 'ml', 'dozen', 'box', 'packet'],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    // Optional: present when reason === 'sale' or 'return'
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      default: null,
    },
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// Compound indexes per spec §7
// ---------------------------------------------------------------------------
stockAdjustmentSchema.index({ productId: 1, createdAt: -1 });
stockAdjustmentSchema.index({ userId: 1, reason: 1, createdAt: -1 });

// ---------------------------------------------------------------------------
// Validator: reason='other' requires reasonDetail (min 3 chars)
// C1 fix: converted from sync function(next) to async — Mongoose 9/Kareem 3 no longer passes next | spec: product-uom-schema.md §7
// ---------------------------------------------------------------------------
stockAdjustmentSchema.pre('validate', async function () {
  if (this.reason === 'other') {
    const detail = (this.reasonDetail || '').trim();
    if (detail.length < 3) {
      // NEW-03 fix: tag statusCode so the controller maps this to HTTP 400, not 500.
      throw Object.assign(
        new Error("reasonDetail is required (min 3 chars) when reason is 'other'"),
        { statusCode: 400 },
      );
    }
  }
});

module.exports = mongoose.model('StockAdjustment', stockAdjustmentSchema);
