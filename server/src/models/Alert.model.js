// Alert model — stores low-stock / dead-stock / reorder notifications | spec: C2
const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['LOW_STOCK', 'OUT_OF_STOCK', 'DEAD_STOCK', 'REORDER_DUE', 'OVERSOLD'],
    required: true,
  },
  severity: {
    type: String,
    enum: ['critical', 'warning', 'info'],
    default: 'warning',
  },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  message: { type: String, required: true },
  status: {
    type: String,
    enum: ['active', 'dismissed', 'resolved'],
    default: 'active',
  },
  metadata: { type: Object, default: {} },
  dismissedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dismissedAt: { type: Date },
}, { timestamps: true });

alertSchema.index({ status: 1, createdAt: -1 });
alertSchema.index({ type: 1, productId: 1 });

module.exports = mongoose.model('Alert', alertSchema);
