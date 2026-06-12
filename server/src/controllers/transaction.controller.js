'use strict';

// transaction.controller.js — UoM migration (v2) | spec: product-uom-schema.md §6
// chunk #10: stockIn, openingStock endpoints; purchase-variance StockAdjustment
// stock field is now Decimal128; $inc requires Decimal128; Math.max(0,...) clamp removed.
const Transaction       = require('../models/Transaction.model');
const Product           = require('../models/Product.model');
const StockAdjustment   = require('../models/StockAdjustment.model');
const weight            = require('../utils/weight');
const money             = require('../utils/money');

// POST /transactions — create & auto-update product stock | spec: §6
exports.createTransaction = async (req, res) => {
  try {
    const { productId, type, quantity, notes } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // For non-weight products: guard against negative stock on OUT | spec: §2.3
    if (type === 'OUT' && !product.saleByWeight) {
      const currentStock = Number(product.stock.toString());
      if (currentStock < quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock. Available: ${weight.toString(product.stock, product.unit)}`,
        });
      }
    }

    const transaction = await Transaction.create({
      productId, type, quantity: Number(quantity), notes, user: req.user.id,
    });

    // Auto-update stock using atomic $inc with Decimal128 | spec: §6
    const delta = type === 'IN'
      ? weight.fromNumberOrString(quantity)
      : weight.fromNumberOrString(-quantity);

    await Product.findByIdAndUpdate(productId, { $inc: { stock: delta } });

    const populated = await transaction.populate([
      { path: 'productId', select: 'name sku category supplierId', populate: { path: 'supplierId', select: 'name' } },
      { path: 'user', select: 'name email' },
    ]);

    res.status(201).json({ success: true, data: populated });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

// GET /transactions — paginated, searchable, filterable | spec: §6
exports.getTransactions = async (req, res) => {
  try {
    const { q, type, dateFrom, dateTo, page = 1, limit = 15 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    let productFilter = {};
    if (q) {
      const products = await Product.find({ name: { $regex: q, $options: 'i' } }).select('_id');
      productFilter = { productId: { $in: products.map((p) => p._id) } };
    }

    let query = { ...productFilter };
    if (type && ['IN', 'OUT'].includes(type)) query.type = type;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate([
          { path: 'productId', select: 'name sku category supplierId', populate: { path: 'supplierId', select: 'name' } },
          { path: 'user', select: 'name email' },
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Transaction.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: transactions,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// GET /transactions/stats — summary dashboard cards | spec: §6
exports.getTransactionStats = async (req, res) => {
  try {
    const now       = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [total, totalIN, totalOUT, todayCount, inQty, outQty] = await Promise.all([
      Transaction.countDocuments(),
      Transaction.countDocuments({ type: 'IN' }),
      Transaction.countDocuments({ type: 'OUT' }),
      Transaction.countDocuments({ createdAt: { $gte: todayStart } }),
      Transaction.aggregate([{ $match: { type: 'IN' } },  { $group: { _id: null, total: { $sum: '$quantity' } } }]),
      Transaction.aggregate([{ $match: { type: 'OUT' } }, { $group: { _id: null, total: { $sum: '$quantity' } } }]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        total, totalIN, totalOUT, todayCount,
        totalINQty:  inQty[0]?.total  || 0,
        totalOUTQty: outQty[0]?.total || 0,
      },
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// GET /transactions/recent | spec: §6
exports.getRecentActivity = async (req, res) => {
  try {
    const recents = await Transaction.find()
      .sort({ createdAt: -1 }).limit(10)
      .populate('productId', 'name sku')
      .populate('user', 'name');
    res.status(200).json({ success: true, data: recents });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getTransaction = async (req, res) => {
  try {
    const t = await Transaction.findById(req.params.id).populate('productId user');
    if (!t) return res.status(404).json({ success: false, message: 'Not found' });
    res.status(200).json({ success: true, data: t });
  } catch (error) { res.status(404).json({ success: false, message: error.message }); }
};

exports.getProductTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ productId: req.params.id })
      .populate('user', 'name').sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: transactions });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// DELETE /transactions/:id — reverse stock impact | spec: §6
// Removed Math.max(0,...) clamp — negative stock is allowed (spec §2.3)
exports.deleteTransaction = async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ success: false, message: 'Not found' });

    // Reverse stock impact using Decimal128-safe $inc | spec: §6
    const product = await Product.findById(tx.productId);
    if (product) {
      // IN reversal = subtract quantity; OUT reversal = add quantity
      const delta = tx.type === 'IN'
        ? weight.fromNumberOrString(-tx.quantity)
        : weight.fromNumberOrString(tx.quantity);

      // No Math.max(0,...) clamp — negative stock is allowed | spec: §2.3
      await Product.findByIdAndUpdate(tx.productId, { $inc: { stock: delta } });
    }

    await Transaction.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, data: {} });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

// POST /transactions/stock-in — stock receipt with optional variance capture | spec: chunk #10, §B.5
// Body: { productId, supplierId?, invoicedQty, receivedQty?, costPrice?, invoiceNumber?, notes? }
// If receivedQty is omitted → defaults to invoicedQty (no variance).
// For non-weight products (saleByWeight=false): receivedQty must equal invoicedQty.
// Writes a StockAdjustment with reason='purchase-variance' when variance != 0.
exports.stockIn = async (req, res) => {
  try {
    const {
      productId, supplierId, invoicedQty, receivedQty,
      costPrice, invoiceNumber, notes,
    } = req.body;

    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });
    if (invoicedQty === undefined || invoicedQty === null) {
      return res.status(400).json({ success: false, message: 'invoicedQty is required' });
    }

    // Parse invoicedQty — must be > 0
    let invoicedD128;
    try { invoicedD128 = weight.fromNumberOrString(invoicedQty); } catch (e) {
      return res.status(400).json({ success: false, message: `invoicedQty invalid: ${e.message}` });
    }
    if (Number(invoicedD128.toString()) <= 0) {
      return res.status(400).json({ success: false, message: 'invoicedQty must be > 0' });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // Parse receivedQty — defaults to invoicedQty when omitted
    let receivedD128;
    if (receivedQty === undefined || receivedQty === null) {
      receivedD128 = invoicedD128;
    } else {
      try { receivedD128 = weight.fromNumberOrString(receivedQty); } catch (e) {
        return res.status(400).json({ success: false, message: `receivedQty invalid: ${e.message}` });
      }
      if (Number(receivedD128.toString()) < 0) {
        return res.status(400).json({ success: false, message: 'receivedQty must be >= 0' });
      }
    }

    // Variance check: non-weight products must not have receivedQty != invoicedQty | spec: chunk #10
    const invoicedNum  = Number(invoicedD128.toString());
    const receivedNum  = Number(receivedD128.toString());
    const varianceNum  = parseFloat((receivedNum - invoicedNum).toFixed(10)); // avoid floating-point noise

    if (!product.saleByWeight && Math.abs(varianceNum) > 1e-9) {
      return res.status(400).json({
        success: false,
        message: 'Variance only applies to weighted products (saleByWeight=true). Pcs/dozen/box/packet receivedQty must match invoicedQty.',
      });
    }

    // Compute variance as Decimal128 | spec: §B.5
    const varianceD128 = weight.fromNumberOrString(varianceNum);
    const unit         = product.unit || 'pcs';

    // Atomic: increment product.stock by receivedQty (actual amount received) | spec: §B.5
    await Product.findByIdAndUpdate(productId, { $inc: { stock: receivedD128 } });

    // Write Transaction record (type: IN, quantity: receivedNum) | spec: chunk #10
    const txData = {
      productId,
      type: 'IN',
      quantity: receivedNum,
      user: req.user.id,
      notes: notes || '',
      invoiceNumber: invoiceNumber || '',
      costPrice: costPrice != null ? Number(costPrice) : null,
    };
    if (supplierId) txData.supplierId = supplierId;

    const transaction = await Transaction.create(txData);

    // Write StockAdjustment if variance != 0 | spec: §B.5, product-uom-schema.md §7.1
    let stockAdjustment = null;
    if (Math.abs(varianceNum) > 1e-9) {
      stockAdjustment = await StockAdjustment.create({
        productId,
        delta:       varianceD128,
        reason:      'purchase-variance',
        reasonDetail: `Supplier invoice: ${invoicedNum} ${unit}, received: ${receivedNum} ${unit}`,
        invoicedQty: invoicedD128,
        receivedQty: receivedD128,
        unit,
        userId: req.user.id,
      });
    }

    // Format variance for response | spec: chunk #10
    let varianceFormatted;
    try {
      const sign = varianceNum < 0 ? '-' : varianceNum > 0 ? '+' : '';
      varianceFormatted = `${sign}${weight.toString(weight.fromNumberOrString(Math.abs(varianceNum)), unit)} ${unit}`;
    } catch (_) {
      varianceFormatted = `${varianceNum} ${unit}`;
    }

    const populated = await Transaction.findById(transaction._id).populate([
      { path: 'productId', select: 'name sku unit saleByWeight stock' },
      { path: 'supplierId', select: 'name email phone' },
      { path: 'user', select: 'name email' },
    ]);

    res.status(201).json({
      success: true,
      data: {
        transaction:   populated,
        variance:      varianceD128.toString(),
        varianceFormatted,
        stockAdjustment: stockAdjustment || null,
      },
    });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

// POST /transactions/opening-stock — onboarding step 5: set initial stock per product | spec: chunk #10, §C.2
// Body: { entries: [{ productId, qty }] }
// For each entry: writes StockAdjustment reason='opening', sets product.stock = qty (overwrite).
// Idempotent: subsequent calls REPLACE product.stock but keep all StockAdjustment audit records.
exports.openingStock = async (req, res) => {
  try {
    const { entries } = req.body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, message: 'entries must be a non-empty array' });
    }

    const adjustments = [];
    let updatedCount  = 0;

    for (const entry of entries) {
      const { productId, qty } = entry;
      if (!productId) {
        return res.status(400).json({ success: false, message: 'Each entry must have a productId' });
      }
      if (qty === undefined || qty === null) {
        return res.status(400).json({ success: false, message: `qty is required for productId ${productId}` });
      }

      let qtyD128;
      try { qtyD128 = weight.fromNumberOrString(qty); } catch (e) {
        return res.status(400).json({ success: false, message: `Invalid qty for productId ${productId}: ${e.message}` });
      }

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ success: false, message: `Product not found: ${productId}` });
      }

      const unit = product.unit || 'pcs';

      // Overwrite product.stock with the opening qty (not $inc — this is the initial state) | spec: §C.2
      await Product.findByIdAndUpdate(productId, { $set: { stock: qtyD128 } });

      // Write StockAdjustment audit record (keeps all records, no upsert) | spec: chunk #10
      const adj = await StockAdjustment.create({
        productId,
        delta:  qtyD128,
        reason: 'opening',
        unit,
        userId: req.user.id,
      });
      adjustments.push(adj);
      updatedCount++;
    }

    res.status(201).json({
      success: true,
      data: { updated: updatedCount, adjustments },
    });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
