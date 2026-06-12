'use strict';

// analytics.controller.js — UoM migration (v2) | spec: product-uom-schema.md §6
// $price → $pricePerUnit (5 occurrences); $lowStockThreshold → $reorderLevel (2 occurrences)
// Decimal128 $multiply returns Decimal128 natively — no cast needed | spec: §5.3
const Product     = require('../models/Product.model');
const Transaction = require('../models/Transaction.model');
const Sale        = require('../models/Sale.model');

// Helper: safely convert a Decimal128 BSON object or plain number to JS Number | bug A4-04/A4-06
function toNum(v) {
  if (v == null) return 0;
  if (v._bsontype === 'Decimal128' || (typeof v === 'object' && v.$numberDecimal !== undefined)) {
    return Number(v.$numberDecimal !== undefined ? v.$numberDecimal : v.toString());
  }
  return Number(v) || 0;
}

// ─── GET /analytics/dashboard ────────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();

    // Low stock: uses reorderLevel (renamed from lowStockThreshold) | spec: §6
    const lowStockItems = await Product.find({ $expr: { $lte: ['$stock', '$reorderLevel'] } })
      .select('name sku stock reorderLevel pricePerUnit unit')
      .limit(5);
    const lowStock = lowStockItems.length;

    // Total inventory value — $pricePerUnit * $stock (field renamed) | spec: §6, §5.3
    // Both fields are Decimal128 → $multiply returns Decimal128 natively
    const valueAgg = await Product.aggregate([
      { $group: { _id: null, totalValue: { $sum: { $multiply: ['$pricePerUnit', '$stock'] } } } },
    ]);
    // Decimal128 result: serialize to string for display | spec: §5.1
    const totalInventoryValue = valueAgg[0]?.totalValue?.toString() || '0';

    // Category breakdown
    const categoryBreakdown = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 }, totalStock: { $sum: '$stock' } } },
      { $sort: { totalStock: -1 } },
    ]);

    const totalTransactions = await Transaction.countDocuments();
    const inTransactions  = await Transaction.countDocuments({ type: 'IN' });
    const outTransactions = await Transaction.countDocuments({ type: 'OUT' });

    const recentTransactions = await Transaction.find()
      .sort({ createdAt: -1 }).limit(6)
      .populate('productId', 'name sku category pricePerUnit')
      .populate('user', 'name');

    // Top 5 products by pricePerUnit (was: sort by price) | spec: §6
    const topProducts = await Product.find()
      .sort({ pricePerUnit: -1 }).limit(5)
      .select('name sku stock pricePerUnit category reorderLevel unit');

    // GST collected this calendar month — sum taxTotal for non-cancelled sales | bug A4-11
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const gstAgg = await Sale.aggregate([
      { $match: { createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: { $toDouble: { $ifNull: ['$taxTotal', '$taxAmount'] } } } } },
    ]);
    const gstThisMonth = toNum(gstAgg[0]?.total ?? 0);

    res.status(200).json({
      success: true,
      data: {
        totalProducts,
        lowStock,
        lowStockItems,
        totalInventoryValue,
        totalTransactions,
        inTransactions,
        outTransactions,
        categoryBreakdown,
        recentTransactions,
        topProducts,
        gstThisMonth,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /analytics/sales ────────────────────────────────────────────────────
exports.getSalesReport = async (req, res) => {
  try {
    const now = new Date();

    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const salesByMonth = await Sale.aggregate([
      { $match: { createdAt: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          totalRevenue: { $sum: { $toDouble: { $ifNull: ['$grandTotal', '$total'] } } },
          totalOrders: { $sum: 1 },
          avgOrderValue: { $avg: { $ifNull: [{ $toDouble: { $ifNull: ['$grandTotal', '$total'] } }, 0] } },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const salesByCategory = await Sale.aggregate([
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$product.category',
          revenue: { $sum: { $toDouble: { $ifNull: ['$items.lineSubtotal', '$items.subtotal'] } } },
          quantity: { $sum: { $toDouble: { $ifNull: ['$items.qty', '$items.quantity'] } } },
          orders: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    const dailyPattern = await Sale.aggregate([
      {
        $group: {
          _id: { $dayOfWeek: '$createdAt' },
          avgRevenue: { $avg: { $ifNull: [{ $toDouble: { $ifNull: ['$grandTotal', '$total'] } }, 0] } },
          totalRevenue: { $sum: { $toDouble: { $ifNull: ['$grandTotal', '$total'] } } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dayNames = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dailySalesPattern = dailyPattern.map((d) => ({
      day: dayNames[d._id],
      dayOfWeek: d._id,
      avgRevenue: parseFloat(d.avgRevenue.toFixed(2)),
      totalRevenue: parseFloat(d.totalRevenue.toFixed(2)),
      count: d.count,
    }));

    const totalMetrics = await Sale.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $toDouble: { $ifNull: ['$grandTotal', '$total'] } } },
          totalOrders: { $sum: 1 },
          avgOrderValue: { $avg: { $ifNull: [{ $toDouble: { $ifNull: ['$grandTotal', '$total'] } }, 0] } },
          totalDiscount: { $sum: '$discount' },
          totalTax: { $sum: { $toDouble: { $ifNull: ['$taxTotal', '$taxAmount'] } } },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        salesByMonth,
        salesByCategory,
        dailySalesPattern,
        totalRevenue: totalMetrics[0]?.totalRevenue || 0,
        totalOrders: totalMetrics[0]?.totalOrders || 0,
        avgOrderValue: parseFloat((totalMetrics[0]?.avgOrderValue || 0).toFixed(2)),
        totalDiscount: totalMetrics[0]?.totalDiscount || 0,
        totalTax: totalMetrics[0]?.totalTax || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /analytics/inventory ────────────────────────────────────────────────
exports.getInventoryReport = async (req, res) => {
  try {
    // Stock value by category — $pricePerUnit replaces $price | spec: §6
    const stockByCategory = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          totalStock: { $sum: '$stock' },
          totalValue: { $sum: { $multiply: ['$pricePerUnit', '$stock'] } },
          productCount: { $sum: 1 },
          avgPrice: { $avg: '$pricePerUnit' },
        },
      },
      { $sort: { totalValue: -1 } },
    ]);

    // Stock health — uses reorderLevel (renamed) | spec: §6
    // Mutually exclusive buckets to prevent double-counting (bug A4-05):
    //   outOfStock: stock <= 0  (checked first — highest priority)
    //   low:        stock > 0 AND reorderLevel is not null AND stock <= reorderLevel
    //   healthy:    stock > 0 AND (reorderLevel is null OR stock > reorderLevel)
    const [healthyCount, lowCount, outCount] = await Promise.all([
      Product.countDocuments({
        $expr: {
          $and: [
            { $gt: ['$stock', { $toDecimal: '0' }] },
            {
              $or: [
                { $eq: ['$reorderLevel', null] },
                { $gt: ['$stock', '$reorderLevel'] },
              ],
            },
          ],
        },
      }),
      Product.countDocuments({
        $expr: {
          $and: [
            { $gt: ['$stock', { $toDecimal: '0' }] },
            { $ne: ['$reorderLevel', null] },
            { $lte: ['$stock', '$reorderLevel'] },
          ],
        },
      }),
      Product.countDocuments({ $expr: { $lte: ['$stock', { $toDecimal: '0' }] } }),
    ]);

    // Top 10 by stock value — $pricePerUnit replaces $price | spec: §6
    const topByStockValueRaw = await Product.aggregate([
      { $addFields: { stockValue: { $multiply: ['$pricePerUnit', '$stock'] } } },
      { $sort: { stockValue: -1 } },
      { $limit: 10 },
      { $project: { name: 1, sku: 1, stock: 1, pricePerUnit: 1, category: 1, stockValue: 1, unit: 1 } },
    ]);

    // Convert Decimal128 objects to plain numbers so charts render correctly | bug A4-04
    const topByStockValue = topByStockValueRaw.map((item) => ({
      ...item,
      pricePerUnit: toNum(item.pricePerUnit),
      stockValue:   toNum(item.stockValue),
      stock:        toNum(item.stock),
    }));

    // Convert Decimal128 totalValue in stockByCategory | bug A4-04
    const stockByCategoryNormalized = stockByCategory.map((cat) => ({
      ...cat,
      totalValue: toNum(cat.totalValue),
      avgPrice:   toNum(cat.avgPrice),
    }));

    // Total inventory value | spec: §6
    const totalValueAgg = await Product.aggregate([
      { $group: { _id: null, total: { $sum: { $multiply: ['$pricePerUnit', '$stock'] } } } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        stockByCategory: stockByCategoryNormalized,
        stockHealth: {
          healthy: healthyCount,
          low: lowCount,
          outOfStock: outCount,
          total: healthyCount + lowCount + outCount,
        },
        topByStockValue,
        totalInventoryValue: totalValueAgg[0]?.total?.toString() || '0',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /analytics/profit ───────────────────────────────────────────────────
exports.getProfitAnalysis = async (req, res) => {
  try {
    const revenueAgg = await Sale.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $toDouble: { $ifNull: ['$grandTotal', '$total'] } } },
          totalSubtotal: { $sum: { $toDouble: '$subtotal' } },
          totalTax: { $sum: { $toDouble: { $ifNull: ['$taxTotal', '$taxAmount'] } } },
          totalDiscount: { $sum: '$discount' },
          orderCount: { $sum: 1 },
        },
      },
    ]);

    const totalRevenue  = revenueAgg[0]?.totalRevenue  || 0;
    const totalSubtotal = revenueAgg[0]?.totalSubtotal || 0;
    const totalTax      = revenueAgg[0]?.totalTax      || 0;
    const totalDiscount = revenueAgg[0]?.totalDiscount || 0;
    const orderCount    = revenueAgg[0]?.orderCount    || 0;

    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const revenueTrend = await Sale.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          revenue: { $sum: { $toDouble: { $ifNull: ['$grandTotal', '$total'] } } },
          orders: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueTrendFormatted = revenueTrend.map((r) => ({
      month: `${monthNames[r._id.month]} ${r._id.year}`,
      revenue: parseFloat(r.revenue.toFixed(2)),
      orders: r.orders,
    }));

    const topProductsByRevenue = await Sale.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.productName' },
          sku: { $first: '$items.sku' },
          totalRevenue: { $sum: { $toDouble: { $ifNull: ['$items.lineSubtotal', '$items.subtotal'] } } },
          totalQuantity: { $sum: { $toDouble: { $ifNull: ['$items.qty', '$items.quantity'] } } },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalRevenue,
        totalSubtotal,
        totalTax,
        totalDiscount,
        orderCount,
        revenueTrend: revenueTrendFormatted,
        topProductsByRevenue,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
