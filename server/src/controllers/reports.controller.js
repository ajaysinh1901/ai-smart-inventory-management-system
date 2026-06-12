'use strict';

// reports.controller.js — aggregated reports | spec: chunk #10, §B.5
// Supplier shrinkage report: aggregates StockAdjustment with reason='purchase-variance'
// grouped by supplier and unit, computing totalVariance and variancePct.

const StockAdjustment = require('../models/StockAdjustment.model');
const Transaction     = require('../models/Transaction.model');
const Supplier        = require('../models/Supplier.model');
const weight          = require('../utils/weight');

// GET /reports/supplier-shrinkage?from=YYYY-MM-DD&to=YYYY-MM-DD&supplierId?
// Aggregates purchase-variance adjustments grouped by supplier + unit | spec: chunk #10 §B.5
// Response: [{ supplierId, supplierName, deliveriesCount, totalInvoiced, totalReceived, totalVariance, variancePct, unit }]
// Note: variance can mix units across deliveries; grouping by unit keeps numbers meaningful.
exports.getSupplierShrinkage = async (req, res) => {
  try {
    const { from, to, supplierId } = req.query;

    // Validate date params before using them — prevent CastError leak | bug A4-10
    const dateFilter = {};
    if (from) {
      const fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });
      }
      dateFilter.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });
      }
      toDate.setHours(23, 59, 59, 999);
      dateFilter.$lte = toDate;
    }

    // Find all purchase-variance adjustments within the date range
    const adjQuery = { reason: 'purchase-variance' };
    if (Object.keys(dateFilter).length > 0) adjQuery.createdAt = dateFilter;

    const adjustments = await StockAdjustment.find(adjQuery).lean();

    if (adjustments.length === 0) {
      return res.status(200).json({ success: true, data: [], meta: { totalAdjustments: 0 } });
    }

    // Fetch the corresponding Transaction records to get supplierId
    // Match by productId + createdAt proximity (same day, same product)
    // Strategy: get all IN transactions in the date range, index by productId+date
    const txQuery = { type: 'IN' };
    if (Object.keys(dateFilter).length > 0) txQuery.createdAt = dateFilter;
    if (supplierId) txQuery.supplierId = supplierId;

    const transactions = await Transaction.find(txQuery)
      .select('productId supplierId invoiceNumber createdAt')
      .populate('supplierId', 'name phone email')
      .lean();

    // Build a lookup: productId_dateDay → supplierId (best-effort match)
    // Since we write StockAdjustment and Transaction atomically in stockIn,
    // they share the same createdAt second; match on productId + date bucket.
    function dateBucket(d) {
      const dt = new Date(d);
      return `${dt.getUTCFullYear()}-${dt.getUTCMonth()}-${dt.getUTCDate()}`;
    }
    const txLookup = {};
    transactions.forEach((tx) => {
      const key = `${String(tx.productId)}_${dateBucket(tx.createdAt)}`;
      if (!txLookup[key]) txLookup[key] = tx;
    });

    // Group adjustments: key = supplierId_unit
    // For adjustments with no matched supplier (e.g. old data), group under 'unknown'
    const groups = {};

    for (const adj of adjustments) {
      const key = `${String(adj.productId)}_${dateBucket(adj.createdAt)}`;
      const tx  = txLookup[key];

      // Skip if supplierId filter is set and this tx doesn't match
      if (supplierId && (!tx || String(tx.supplierId?._id || tx.supplierId) !== String(supplierId))) {
        continue;
      }

      const supplierDoc  = tx && tx.supplierId ? tx.supplierId : null;
      const supplierIdStr = supplierDoc ? String(supplierDoc._id || supplierDoc) : 'unknown';
      const supplierName  = (supplierDoc && typeof supplierDoc === 'object' && supplierDoc.name)
        ? supplierDoc.name : 'Unknown Supplier';
      const unit          = adj.unit || 'pcs';
      const groupKey      = `${supplierIdStr}_${unit}`;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          supplierId:     supplierIdStr,
          supplierName,
          unit,
          deliveriesCount: 0,
          totalInvoiced:   0,
          totalReceived:   0,
          totalVariance:   0,
        };
      }

      const g = groups[groupKey];
      g.deliveriesCount++;

      // invoicedQty, receivedQty, delta are Decimal128 — convert to Number for aggregation
      const invoiced = adj.invoicedQty != null
        ? Number((adj.invoicedQty._bsontype === 'Decimal128' ? adj.invoicedQty.toString() : String(adj.invoicedQty)))
        : 0;
      const received = adj.receivedQty != null
        ? Number((adj.receivedQty._bsontype === 'Decimal128' ? adj.receivedQty.toString() : String(adj.receivedQty)))
        : 0;
      const delta = adj.delta != null
        ? Number((adj.delta._bsontype === 'Decimal128' ? adj.delta.toString() : String(adj.delta)))
        : (received - invoiced);

      g.totalInvoiced += invoiced;
      g.totalReceived += received;
      g.totalVariance += delta;
    }

    // Compute variancePct and format output
    const dp = (n, places) => parseFloat(n.toFixed(places));

    const result = Object.values(groups).map((g) => {
      const variancePct = g.totalInvoiced > 0
        ? dp((g.totalVariance / g.totalInvoiced) * 100, 4)
        : 0;
      const decPlaces = (g.unit === 'kg' || g.unit === 'l') ? 3 : 0;
      return {
        supplierId:       g.supplierId,
        supplierName:     g.supplierName,
        unit:             g.unit,
        deliveriesCount:  g.deliveriesCount,
        totalInvoiced:    dp(g.totalInvoiced, decPlaces),
        totalReceived:    dp(g.totalReceived, decPlaces),
        totalVariance:    dp(g.totalVariance, decPlaces),
        variancePct,
      };
    });

    // Sort by variancePct ascending (most negative = worst shrinkage first)
    result.sort((a, b) => a.variancePct - b.variancePct);

    res.status(200).json({
      success: true,
      data: result,
      meta: { totalAdjustments: adjustments.length, groups: result.length },
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
