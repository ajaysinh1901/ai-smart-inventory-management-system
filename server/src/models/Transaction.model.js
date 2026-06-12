const mongoose = require('mongoose');

// Transaction model | spec: chunk #10 — stock-in variance fields added
const transactionSchema = new mongoose.Schema({
  productId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  type:          { type: String, enum: ['IN', 'OUT'], required: true },
  quantity:      { type: Number, required: true },
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes:         String,
  saleId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
  // chunk #10: supplier reference for stock-in variance report
  supplierId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
  // chunk #10: supplier invoice number for purchase-variance audit trail
  invoiceNumber: { type: String, default: '' },
  // chunk #10: cost price at time of stock-in
  costPrice:     { type: Number, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
