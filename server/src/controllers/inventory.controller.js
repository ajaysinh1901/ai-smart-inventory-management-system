'use strict';

// inventory.controller.js — stock-adjustment endpoints | spec: C2 (bug fix)
// Implements POST /stock-adjustments and GET /stock-adjustments so the
// InventoryPage StockInVarianceModal and Adjust Stock modal work correctly.

const mongoose = require('mongoose');
const { createAdjustment, listAdjustments } = require('../services/inventory.service');

// POST /stock-adjustments — create a manual stock adjustment | spec: C2
// Body: { productId, delta, reason, reasonDetail?, unit?, supplierId?,
//         invoicedQty?, receivedQty? }
exports.createStockAdjustment = async (req, res) => {
  try {
    const {
      productId, reason, reasonDetail,
      unit, supplierId, invoicedQty, receivedQty,
    } = req.body;
    // Accept both `delta` and the frontend's `qtyChange` field name.
    const delta = req.body.delta ?? req.body.qtyChange;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required' });
    }
    if (delta === undefined || delta === null) {
      return res.status(400).json({ success: false, message: 'delta (qtyChange) is required' });
    }
    if (!reason) {
      return res.status(400).json({ success: false, message: 'reason is required' });
    }

    const { adjustment, product } = await createAdjustment({
      productId,
      delta,
      reason,
      reasonDetail,
      unit,
      userId:      req.user.id,
      supplierId,
      invoicedQty,
      receivedQty,
    });

    res.status(201).json({ success: true, data: { adjustment, product } });
  } catch (err) {
    const status = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);
    const message = err.name === 'ValidationError'
      ? Object.values(err.errors || {})[0]?.message || err.message
      : err.message;
    res.status(status).json({ success: false, message });
  }
};

// GET /stock-adjustments — paginated list with optional filters | spec: C2
// Query params: productId, reason, dateFrom, dateTo, page, limit
exports.listStockAdjustments = async (req, res) => {
  try {
    const { productId, reason, dateFrom, dateTo, page = 1, limit = 20 } = req.query;

    // Validate productId if provided
    if (productId && !mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid productId' });
    }

    const result = await listAdjustments({ productId, reason, dateFrom, dateTo, page, limit });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
