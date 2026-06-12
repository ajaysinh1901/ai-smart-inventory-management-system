'use strict';

// Product controller — UoM migration (v2) | spec: product-uom-schema.md §6
// chunk #9: getReorderReport added
const mongoose = require('mongoose');
const Product  = require('../models/Product.model');
const Supplier = require('../models/Supplier.model');
const Sale     = require('../models/Sale.model');
const money    = require('../utils/money');
const weight   = require('../utils/weight');

// Deprecation sunset per spec §4.6 — RFC 8594
const SUNSET_DATE = 'Sun, 27 Jul 2026 00:00:00 GMT';
const LEGACY_UNTIL = process.env.LEGACY_PRODUCT_API_UNTIL || '2026-07-27';

// Set Deprecation + Sunset headers on every product response | spec: §4.6
function setDeprecationHeaders(res) {
  res.setHeader('Deprecation', SUNSET_DATE);
  res.setHeader('Sunset', SUNSET_DATE);
}

// True when the legacy cutoff has passed (returns 410 for legacy field use)
function isLegacyCutoffPassed() {
  return new Date() > new Date(LEGACY_UNTIL);
}

// Map legacy request body fields to new names | spec: §4.6
function mapLegacyRequestBody(body) {
  const out = { ...body };
  if (out.pricePerUnit === undefined && out.price !== undefined) {
    out.pricePerUnit = out.price;
  }
  delete out.price;
  if (out.reorderLevel === undefined && out.lowStockThreshold !== undefined) {
    out.reorderLevel = out.lowStockThreshold;
  }
  delete out.lowStockThreshold;
  return out;
}

// Convert numeric request fields to Decimal128 before Mongoose write | spec: §5
function coerceToDecimal128(body) {
  const out = { ...body };
  const moneyFields = ['pricePerUnit', 'costPrice'];
  const weightFields = ['stock', 'reorderLevel', 'tareWeight', 'packSize'];

  moneyFields.forEach((f) => {
    if (out[f] !== undefined && out[f] !== null) {
      out[f] = money.fromNumberOrString(out[f]);
    }
  });
  weightFields.forEach((f) => {
    if (f === 'packSize' && (out[f] === null || out[f] === undefined)) return;
    if (out[f] !== undefined && out[f] !== null) {
      out[f] = weight.fromNumberOrString(out[f]);
    }
  });
  return out;
}

// Translate common Mongo errors to friendly messages | bug #011.1
function translateMongoError(error, res, fallbackStatus = 400) {
  if (error && error.code === 11000) {
    const field = Object.keys(error.keyValue || {})[0] || 'field';
    const value = (error.keyValue && error.keyValue[field]) || '';
    const label = field.toUpperCase();
    return res.status(409).json({
      success: false,
      message: `A record with ${label} "${value}" already exists.`,
    });
  }
  if (error && error.name === 'ValidationError') {
    const first = Object.values(error.errors || {})[0];
    return res.status(400).json({ success: false, message: first?.message || 'Validation failed' });
  }
  return res.status(fallbackStatus).json({ success: false, message: error.message });
}

// Check if request is using legacy fields and whether cutoff has passed | spec: §4.6
function checkLegacyRequest(req, res) {
  const hasLegacyField = req.body && (req.body.price !== undefined || req.body.lowStockThreshold !== undefined);
  if (!hasLegacyField) return false; // not a legacy request, continue normally

  if (isLegacyCutoffPassed()) {
    res.status(410).json({
      success: false,
      message: 'Use pricePerUnit. See /docs/migration-2026-04.',
    });
    return true; // handled
  }
  return false; // legacy but still in grace period, continue with mapping
}

// POST /products — create a new product | spec: product-uom-schema.md §6
exports.createProduct = async (req, res) => {
  try {
    if (checkLegacyRequest(req, res)) return;
    setDeprecationHeaders(res);

    const mapped = mapLegacyRequestBody(req.body);
    const coerced = coerceToDecimal128(mapped);

    const product = await Product.create(coerced);
    const populated = await product.populate('supplierId', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (error) { return translateMongoError(error, res); }
};

// GET /products — paginated list with optional stock_status filter | spec: §6
// Bug A2-03: stock_status filter moved into the Mongo query so pagination and
// meta.total are both based on the filtered set, not the full collection.
exports.getProducts = async (req, res) => {
  try {
    setDeprecationHeaders(res);
    const { category, stock_status, q, page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    let query = {};
    if (category) query.category = category;
    if (q) query.$or = [
      { name: { $regex: q, $options: 'i' } },
      { sku:  { $regex: q, $options: 'i' } },
    ];

    // Build stock_status as a Mongo expression using $expr for Decimal128 comparisons
    // reorderLevel > 0 guard prevents false alerts for products with no threshold configured
    if (stock_status === 'low') {
      query.$expr = {
        $and: [
          { $gt: ['$stock', weight.fromNumberOrString(0)] },
          { $gt: ['$reorderLevel', weight.fromNumberOrString(0)] },
          { $lte: ['$stock', '$reorderLevel'] },
        ],
      };
    } else if (stock_status === 'out') {
      query.$expr = { $lte: ['$stock', weight.fromNumberOrString(0)] };
    } else if (stock_status === 'healthy') {
      query.$expr = { $gt: ['$stock', '$reorderLevel'] };
    } else if (stock_status === 'oversold') {
      query.$expr = { $lt: ['$stock', weight.fromNumberOrString(0)] };
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('supplierId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Product.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / Number(limit));

    res.status(200).json({
      success: true,
      data: products,
      meta: { total, page: Number(page), limit: Number(limit), totalPages },
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// GET /products/:id — single product by ID | spec: §6
exports.getProduct = async (req, res) => {
  try {
    setDeprecationHeaders(res);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const product = await Product.findById(req.params.id).populate('supplierId');
    if (!product) return res.status(404).json({ success: false, message: 'Not found' });
    res.status(200).json({ success: true, data: product });
  } catch (error) { return translateMongoError(error, res); }
};

// PUT /products/:id — update product | spec: §6
exports.updateProduct = async (req, res) => {
  try {
    if (checkLegacyRequest(req, res)) return;
    setDeprecationHeaders(res);

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }

    const mapped = mapLegacyRequestBody(req.body);
    const coerced = coerceToDecimal128(mapped);

    const product = await Product.findByIdAndUpdate(req.params.id, coerced, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ success: false, message: 'Not found' });
    res.status(200).json({ success: true, data: product });
  } catch (error) { return translateMongoError(error, res); }
};

// DELETE /products/:id | spec: §6
exports.deleteProduct = async (req, res) => {
  try {
    setDeprecationHeaders(res);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const removed = await Product.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ success: false, message: 'Not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (error) { return translateMongoError(error, res); }
};

// PATCH /products/:id/stock — atomic, bounded stock adjustment | spec: §6, bug #005
exports.updateStock = async (req, res) => {
  try {
    setDeprecationHeaders(res);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const { quantity, type } = req.body;

    // Wrap quantity in Decimal128 for $inc | spec: §6 — condition requires Decimal128
    const qtyDecimal = weight.fromNumberOrString(quantity);

    if (type === 'increase') {
      const product = await Product.findByIdAndUpdate(
        req.params.id,
        { $inc: { stock: qtyDecimal } },
        { new: true }
      );
      if (!product) return res.status(404).json({ success: false, message: 'Not found' });
      return res.status(200).json({ success: true, data: product });
    }

    if (type === 'decrease') {
      // For saleByWeight products: no stock floor guard (spec §2.3)
      // For pcs products: atomic conditional decrement (spec §2.3)
      const current = await Product.findById(req.params.id).select('stock saleByWeight unit');
      if (!current) return res.status(404).json({ success: false, message: 'Not found' });

      if (current.saleByWeight) {
        // Weight products: allow negative stock (kirana reality)
        const product = await Product.findByIdAndUpdate(
          req.params.id,
          { $inc: { stock: money.fromNumberOrString(-quantity) } },
          { new: true }
        );
        return res.status(200).json({ success: true, data: product });
      }

      // Integer-unit products: atomic conditional decrement
      const product = await Product.findOneAndUpdate(
        { _id: req.params.id, stock: { $gte: qtyDecimal } },
        { $inc: { stock: money.fromNumberOrString(-quantity) } },
        { new: true }
      );
      if (!product) {
        const formatted = weight.toString(current.stock, current.unit);
        return res.status(400).json({
          success: false,
          message: `Insufficient stock. Available: ${formatted}`,
        });
      }
      return res.status(200).json({ success: true, data: product });
    }

    return res.status(400).json({ success: false, message: 'Invalid type. Use "increase" or "decrease".' });
  } catch (error) { return translateMongoError(error, res); }
};

// GET /products/low-stock — products at or below reorderLevel | spec: §6, §2.4
// Bug A2-06: added reorderLevel > 0 guard so products with no threshold (reorderLevel=0)
// do not generate false alerts when stock is also 0.
exports.getLowStock = async (req, res) => {
  try {
    setDeprecationHeaders(res);
    const products = await Product.find({
      $expr: {
        $and: [
          { $gt: ['$reorderLevel', weight.fromNumberOrString(0)] },
          { $lte: ['$stock', '$reorderLevel'] },
        ],
      },
    });
    res.status(200).json({ success: true, data: products });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// GET /products/by-barcode/:code — exact-match scanner lookup | spec: §6
exports.getProductByBarcode = async (req, res) => {
  try {
    setDeprecationHeaders(res);
    const code = String(req.params.code || '').trim();
    if (!code) return res.status(400).json({ success: false, message: 'Barcode required' });
    const product = await Product.findOne({ barcode: code }).populate('supplierId', 'name');
    if (!product) return res.status(404).json({ success: false, message: `No product with barcode ${code}` });
    res.status(200).json({ success: true, data: product });
  } catch (error) { return translateMongoError(error, res); }
};

// GET /products/reorder-report — products grouped by category that need reordering | spec: chunk #9, §B.6
// Query param: ?status=low|out|oversold  (defaults to all non-healthy)
exports.getReorderReport = async (req, res) => {
  try {
    setDeprecationHeaders(res);

    const { status } = req.query;
    const validStatuses = ['low', 'out', 'oversold'];

    // Build the MongoDB query based on status filter
    let stockQuery;
    if (status === 'oversold') {
      stockQuery = { stock: { $lt: weight.fromNumberOrString(0) } };
    } else if (status === 'out') {
      stockQuery = { stock: weight.fromNumberOrString(0) };
    } else if (status === 'low') {
      // stock > 0 AND stock <= reorderLevel (and reorderLevel > 0)
      stockQuery = {
        $expr: {
          $and: [
            { $gt: ['$stock', weight.fromNumberOrString(0)] },
            { $lte: ['$stock', '$reorderLevel'] },
            { $gt: ['$reorderLevel', weight.fromNumberOrString(0)] },
          ],
        },
      };
    } else {
      // No filter or unrecognised value: return all non-healthy (oversold + out + low)
      stockQuery = {
        $or: [
          { stock: { $lte: weight.fromNumberOrString(0) } },
          {
            $expr: {
              $and: [
                { $gt: ['$stock', weight.fromNumberOrString(0)] },
                { $lte: ['$stock', '$reorderLevel'] },
                { $gt: ['$reorderLevel', weight.fromNumberOrString(0)] },
              ],
            },
          },
        ],
      };
    }

    const products = await Product.find(stockQuery)
      .populate('supplierId', 'name phone email')
      .sort({ category: 1, name: 1 })
      .lean({ virtuals: true });

    // Fetch last sale dates for all returned products in one aggregation
    const productIds = products.map((p) => p._id);
    const lastSaleAgg = await Sale.aggregate([
      { $match: { 'items.productId': { $in: productIds } } },
      { $unwind: '$items' },
      { $match: { 'items.productId': { $in: productIds } } },
      {
        $group: {
          _id: '$items.productId',
          lastSaleDate: { $max: '$createdAt' },
        },
      },
    ]);
    const lastSaleDateMap = {};
    lastSaleAgg.forEach((r) => { lastSaleDateMap[String(r._id)] = r.lastSaleDate; });

    // Group products by category, add formatted fields per chunk #9
    const categoryMap = {};
    for (const p of products) {
      const unit     = p.unit || 'pcs';
      const stockNum = p.stock != null
        ? Number((typeof p.stock === 'object' && p.stock._bsontype === 'Decimal128')
            ? p.stock.toString() : String(p.stock))
        : 0;
      const reorderNum = p.reorderLevel != null
        ? Number((typeof p.reorderLevel === 'object' && p.reorderLevel._bsontype === 'Decimal128')
            ? p.reorderLevel.toString() : String(p.reorderLevel))
        : 0;

      // Formatted display values using weight helper
      let stockFormatted;
      let reorderLevelFormatted;
      try {
        const stockD128 = weight.fromNumberOrString(stockNum);
        const reorderD128 = weight.fromNumberOrString(reorderNum);
        stockFormatted       = weight.toString(stockD128, unit);
        reorderLevelFormatted = weight.toString(reorderD128, unit);
      } catch (_) {
        stockFormatted        = `${stockNum} ${unit}`;
        reorderLevelFormatted = `${reorderNum} ${unit}`;
      }

      // Suggested order: max(reorderLevel - stock, reorderLevel * 3) per chunk #9
      const gap              = Math.max(0, reorderNum - stockNum);
      const suggestedOrderQty = parseFloat(
        Math.max(gap, reorderNum * 3).toFixed(unit === 'kg' || unit === 'l' ? 3 : 0)
      );

      const row = {
        _id:                  p._id,
        name:                 p.name,
        sku:                  p.sku,
        unit,
        stockStatus:          p.stockStatus || 'healthy',
        stockFormatted,
        reorderLevelFormatted,
        currentStock:         stockNum,
        reorderLevel:         reorderNum,
        suggestedOrderQty,
        suggestedOrderText:   `Order ${suggestedOrderQty} ${unit} of ${p.name}`,
        lastSaleDate:         lastSaleDateMap[String(p._id)] || null,
        supplierName:         p.supplierId ? p.supplierId.name : null,
        supplierId:           p.supplierId ? p.supplierId._id : null,
        category:             p.category,
      };

      if (!categoryMap[p.category]) categoryMap[p.category] = [];
      categoryMap[p.category].push(row);
    }

    // Convert map to array sorted by category
    const grouped = Object.entries(categoryMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, items]) => ({ category, count: items.length, items }));

    res.status(200).json({
      success: true,
      data: grouped,
      meta: {
        totalProducts: products.length,
        statusFilter:  status || 'all',
      },
    });
  } catch (error) { return translateMongoError(error, res, 500); }
};
