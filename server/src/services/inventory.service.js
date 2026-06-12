'use strict';

// inventory.service.js — core logic for stock-adjustment creation and listing | spec: C2
// Handles manual stock-in, count corrections, damage writes, etc.
// Product.stock is updated atomically via $inc on each adjustment.

const StockAdjustment = require('../models/StockAdjustment.model');
const Product         = require('../models/Product.model');
const weight          = require('../utils/weight');

/**
 * Create a stock adjustment and apply the delta to Product.stock.
 * @param {object} params
 * @param {string} params.productId    Mongo ObjectId string
 * @param {number|string} params.delta Signed qty: positive = stock-in, negative = stock-out
 * @param {string} params.reason       Must be a value in StockAdjustment REASON_ENUM (incl. 'manual')
 * @param {string} [params.reasonDetail] Required when reason === 'other' (min 3 chars)
 * @param {string} [params.unit]       Product unit snapshot; resolved from product if omitted
 * @param {string} params.userId       Mongo ObjectId of the acting user
 * @param {string|null} [params.supplierId]  Optional supplier for purchase-variance adjustments
 * @param {number|string|null} [params.invoicedQty] For purchase-variance
 * @param {number|string|null} [params.receivedQty] For purchase-variance
 * @returns {Promise<{ adjustment: object, product: object }>}
 */
async function createAdjustment({
  productId, delta, reason, reasonDetail = '', unit, userId,
  supplierId, invoicedQty, receivedQty,
}) {
  const product = await Product.findById(productId);
  if (!product) {
    const err = new Error('Product not found');
    err.statusCode = 404;
    throw err;
  }

  const resolvedUnit = unit || product.unit || 'pcs';

  // Parse delta as Decimal128-safe weight value
  let deltaD128;
  try {
    deltaD128 = weight.fromNumberOrString(delta);
  } catch (e) {
    const err = new Error(`Invalid delta: ${e.message}`);
    err.statusCode = 400;
    throw err;
  }

  const adjData = {
    productId,
    delta:        deltaD128,
    reason,
    reasonDetail: reasonDetail || '',
    unit:         resolvedUnit,
    userId,
  };

  if (invoicedQty != null) adjData.invoicedQty = weight.fromNumberOrString(invoicedQty);
  if (receivedQty != null) adjData.receivedQty = weight.fromNumberOrString(receivedQty);

  // Create adjustment record first (Mongoose pre-validate hook enforces business rules)
  const adjustment = await StockAdjustment.create(adjData);

  // Apply delta to product stock atomically | spec: §7
  await Product.findByIdAndUpdate(productId, { $inc: { stock: deltaD128 } });

  const updatedProduct = await Product.findById(productId);

  return { adjustment, product: updatedProduct };
}

/**
 * List stock adjustments with optional filters.
 * @param {object} params
 * @param {string} [params.productId]  Filter by product
 * @param {string} [params.reason]     Filter by reason
 * @param {string} [params.dateFrom]   ISO date string lower bound
 * @param {string} [params.dateTo]     ISO date string upper bound
 * @param {number} [params.page]       1-indexed page number
 * @param {number} [params.limit]      Items per page
 * @returns {Promise<{ data: Array, meta: object }>}
 */
async function listAdjustments({ productId, reason, dateFrom, dateTo, page = 1, limit = 20 }) {
  const skip = (Number(page) - 1) * Number(limit);
  const query = {};

  if (productId) query.productId = productId;
  if (reason)    query.reason    = reason;
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo)   query.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }

  const [data, total] = await Promise.all([
    StockAdjustment.find(query)
      .populate('productId', 'name sku unit')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    StockAdjustment.countDocuments(query),
  ]);

  return {
    data,
    meta: {
      total,
      page:       Number(page),
      limit:      Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
}

module.exports = { createAdjustment, listAdjustments };
