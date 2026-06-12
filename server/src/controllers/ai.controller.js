'use strict';

// ai.controller.js — UoM migration (v2) | spec: product-uom-schema.md §6
// .price → .pricePerUnit; .lowStockThreshold → .reorderLevel
// AI heuristics: unwrap Decimal128 via Number(x.toString()) for float math — acceptable for display
const mongoose    = require('mongoose');
const Product     = require('../models/Product.model');
const Transaction = require('../models/Transaction.model');
const Sale        = require('../models/Sale.model');
const Supplier    = require('../models/Supplier.model');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Helper: unwrap Decimal128 or Number to JS float for AI heuristics | spec: §6
const d2n = (v) => {
  if (v == null) return 0;
  if (v._bsontype === 'Decimal128' || typeof v.toString === 'function') {
    return Number(v.toString());
  }
  return Number(v) || 0;
};

const daysSince = (date) => Math.floor((Date.now() - new Date(date)) / 86400000);

// GET /ai/insights — combined smart intelligence report | spec: §6
exports.getInsights = async (req, res) => {
  try {
    // select uses renamed fields | spec: §6
    const [products, allSales] = await Promise.all([
      Product.find().select('name sku stock reorderLevel pricePerUnit category createdAt'),
      Sale.find().select('items createdAt total'),
    ]);

    const insights = [];

    // 1. Low stock alerts — uses reorderLevel | spec: §6
    const lowStock  = products.filter((p) => d2n(p.stock) <= d2n(p.reorderLevel) && d2n(p.stock) > 0);
    const outOfStock = products.filter((p) => d2n(p.stock) === 0);

    if (outOfStock.length)
      insights.push({ type: 'critical', icon: 'remove_shopping_cart', title: 'Out of Stock', body: `${outOfStock.map((p) => p.name).join(', ')} ${outOfStock.length === 1 ? 'is' : 'are'} completely out of stock.`, products: outOfStock.map((p) => p._id) });

    if (lowStock.length)
      insights.push({ type: 'warning', icon: 'warning_amber', title: 'Low Stock Alert', body: `${lowStock.length} product(s) are below reorder threshold.`, products: lowStock.map((p) => p._id) });

    // 2. Sales velocity
    const productSoldMap = {};
    allSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const pid = item.productId.toString();
        if (!productSoldMap[pid]) productSoldMap[pid] = { qty: 0, name: item.productName, revenue: 0 };
        productSoldMap[pid].qty += item.quantity;
        productSoldMap[pid].revenue += item.subtotal;
      });
    });

    // 3. Dead stock
    const lastSaleDateMap = {};
    allSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const pid = item.productId.toString();
        const saleDate = new Date(sale.createdAt);
        if (!lastSaleDateMap[pid] || saleDate > lastSaleDateMap[pid]) {
          lastSaleDateMap[pid] = saleDate;
        }
      });
    });

    const cutoff = new Date(Date.now() - 30 * 86400000);
    const deadStock = products.filter((p) => {
      if (d2n(p.stock) <= 0) return false;
      const lastSale = lastSaleDateMap[p._id.toString()];
      if (!lastSale) return daysSince(p.createdAt) > 30;
      return lastSale < cutoff;
    });

    if (deadStock.length)
      insights.push({ type: 'info', icon: 'hourglass_disabled', title: 'Dead Stock Detected', body: `${deadStock.length} product(s) haven't sold in 30+ days: ${deadStock.slice(0, 3).map((p) => p.name).join(', ')}.`, products: deadStock.map((p) => p._id) });

    // 4. Top performers
    const sorted = Object.entries(productSoldMap).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 3);
    if (sorted.length)
      insights.push({ type: 'success', icon: 'trending_up', title: 'Top Performers', body: `Best sellers: ${sorted.map(([, v]) => `${v.name} ($${v.revenue.toFixed(0)})`).join(', ')}.` });

    res.status(200).json({ success: true, data: insights });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// GET /ai/predict → demand prediction | spec: §6
exports.predictDemand = async (req, res) => {
  try {
    const { productId } = req.body;
    // Validate ObjectId before DB call to avoid leaking CastError | bug A4-08
    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });
    if (!mongoose.isValidObjectId(productId)) return res.status(400).json({ success: false, message: 'Invalid product ID format' });
    // select uses renamed fields | spec: §6
    const product = await Product.findById(productId).select('name sku stock reorderLevel pricePerUnit');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const since60 = new Date(Date.now() - 60 * 86400000);
    const sales   = await Sale.find({ createdAt: { $gte: since60 }, 'items.productId': productId });

    let totalQty = 0;
    sales.forEach((s) => s.items.forEach((i) => { if (i.productId.toString() === productId) totalQty += i.quantity; }));

    const avgDailySales     = totalQty / 60;
    const stockNum          = d2n(product.stock); // unwrap Decimal128 | spec: §6
    const daysUntilStockout = avgDailySales > 0 ? Math.floor(stockNum / avgDailySales) : null;
    const forecast30d       = Math.round(avgDailySales * 30);
    const reorderQty        = Math.round(forecast30d * 1.2);
    const confidence        = totalQty > 0 ? Math.min(98, 60 + sales.length * 5) : 30;

    res.status(200).json({
      success: true,
      data: {
        product: { id: product._id, name: product.name, sku: product.sku, currentStock: stockNum },
        avgDailySales: parseFloat(avgDailySales.toFixed(2)),
        forecast30d,
        reorderQty,
        daysUntilStockout,
        confidence: `${confidence}%`,
        recommendation: daysUntilStockout !== null && daysUntilStockout < 14
          ? `URGENT: Reorder ${reorderQty} units within ${daysUntilStockout} days`
          : `Reorder ${reorderQty} units before stock drops below threshold`,
      },
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// GET /ai/reorder/:productId — unit-aware restock suggestion | spec: §6, chunk #9
exports.getReorderSuggestion = async (req, res) => {
  try {
    // Validate ObjectId before DB call to avoid leaking CastError | bug A4-08
    const { productId } = req.params;
    if (!mongoose.isValidObjectId(productId)) return res.status(400).json({ success: false, message: 'Invalid product ID format' });
    // select uses renamed fields | spec: §6
    const product = await Product.findById(productId)
      .select('name sku stock reorderLevel pricePerUnit supplierId unit saleByWeight')
      .populate('supplierId', 'name email phone');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const sales30d = await Sale.find({
      'items.productId': product._id,
      createdAt: { $gte: new Date(Date.now() - 30 * 86400000) },
    });

    // chunk #9: sum qty using item.qty (Decimal128) or legacy item.quantity (Number)
    let qty30d = 0;
    sales30d.forEach((s) => s.items.forEach((i) => {
      if (i.productId.toString() === product._id.toString()) {
        // prefer qty (Decimal128, chunk #3 field) then fall back to legacy quantity
        const q = i.qty != null ? d2n(i.qty) : (i.quantity || 0);
        qty30d += q;
      }
    }));

    const reorderLevelNum = d2n(product.reorderLevel); // unwrap | spec: §6
    const stockNum        = d2n(product.stock);
    const priceNum        = d2n(product.pricePerUnit); // pricePerUnit | spec: §6
    const unit            = product.unit || 'pcs';

    // chunk #9: velocity-based order qty per spec §B.6
    // suggestedOrderQty = max(reorderLevel - stock, weeksOfCover * weeklyVelocity)
    const avgDaily      = qty30d / 30;
    const weeklyVelocity = avgDaily * 7;
    const weeksOfCover   = 6; // 6-week cover target
    const gapToReorder   = Math.max(0, reorderLevelNum - stockNum);
    const velocityBased  = weeklyVelocity * weeksOfCover;
    const reorderQty     = Math.max(gapToReorder, velocityBased, reorderLevelNum * 3);
    const reorderQtyRounded = parseFloat(reorderQty.toFixed(
      unit === 'kg' || unit === 'l' ? 3 : 0
    ));

    const urgency = stockNum < 0 ? 'critical' : stockNum === 0 ? 'critical' : stockNum <= reorderLevelNum ? 'high' : 'normal';

    // chunk #9: suggestion text includes unit label per spec §B.6
    // "Order 25 kg of atta" format
    const suggestionText = `Order ${reorderQtyRounded} ${unit} of ${product.name}`;

    res.status(200).json({
      success: true,
      data: {
        product: {
          id: product._id, name: product.name, sku: product.sku, unit,
          currentStock: stockNum, currentStockFormatted: `${stockNum} ${unit}`,
          threshold: reorderLevelNum, thresholdFormatted: `${reorderLevelNum} ${unit}`,
        },
        supplier: product.supplierId || null,
        suggestion: {
          reorderQty: reorderQtyRounded,
          reorderQtyFormatted: `${reorderQtyRounded} ${unit}`,
          suggestionText,         // chunk #9: "Order 25 kg of Atta Loose"
          weeklyVelocity: parseFloat(weeklyVelocity.toFixed(3)),
          avgDailySales: parseFloat(avgDaily.toFixed(3)),
          urgency,
          estimatedCost: parseFloat((reorderQtyRounded * priceNum).toFixed(2)),
        },
      },
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// GET /ai/dead-stock | spec: §6
exports.getDeadStock = async (req, res) => {
  try {
    const products = await Product.find({ stock: { $gt: 0 } })
      .select('name sku stock pricePerUnit category createdAt reorderLevel'); // renamed | spec: §6
    const cutoff30 = new Date(Date.now() - 30 * 86400000);

    const allSales = await Sale.find().select('items createdAt');
    const lastSaleDateMap = {};
    allSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const pid = item.productId.toString();
        const saleDate = new Date(sale.createdAt);
        if (!lastSaleDateMap[pid] || saleDate > lastSaleDateMap[pid]) {
          lastSaleDateMap[pid] = saleDate;
        }
      });
    });

    const dead = products
      .filter((p) => {
        const lastSale = lastSaleDateMap[p._id.toString()];
        if (!lastSale) return daysSince(p.createdAt) > 30;
        return lastSale < cutoff30;
      })
      .map((p) => {
        const lastSale   = lastSaleDateMap[p._id.toString()];
        const unsoldDays = lastSale ? daysSince(lastSale) : daysSince(p.createdAt);
        const stockNum   = d2n(p.stock);
        const priceNum   = d2n(p.pricePerUnit); // pricePerUnit | spec: §6
        return {
          _id: p._id, name: p.name, sku: p.sku, stock: stockNum,
          pricePerUnit: priceNum, category: p.category,
          daysUnsold: unsoldDays,
          lastSaleDate: lastSale || null,
          stockValue: parseFloat((stockNum * priceNum).toFixed(2)),
          severity: unsoldDays > 60 ? 'high' : 'medium',
        };
      })
      .sort((a, b) => b.daysUnsold - a.daysUnsold);

    res.status(200).json({
      success: true, data: dead, total: dead.length,
      totalLockedValue: dead.reduce((s, p) => s + p.stockValue, 0),
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// GET /ai/trends | spec: §6
exports.getTrends = async (req, res) => {
  try {
    // Use $grandTotal (stored Decimal128 field) not $total (Mongoose virtual, invisible in aggregation) | bug A4-07
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const start = new Date(Date.now() - (i + 1) * 7 * 86400000);
      const end   = new Date(Date.now() - i * 7 * 86400000);
      const agg   = await Sale.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: null, revenue: { $sum: { $toDouble: { $ifNull: ['$grandTotal', '$total'] } } }, count: { $sum: 1 } } },
      ]);
      // Convert Decimal128 result to plain number | bug A4-07
      const rawRevenue = agg[0]?.revenue ?? 0;
      const revenue = (rawRevenue != null && typeof rawRevenue === 'object' && rawRevenue.$numberDecimal !== undefined)
        ? Number(rawRevenue.$numberDecimal)
        : Number(rawRevenue) || 0;
      weeks.push({ week: `W${8 - i}`, revenue, count: agg[0]?.count || 0 });
    }

    const latest = weeks[weeks.length - 1].revenue;
    const prev   = weeks[weeks.length - 2].revenue || 1;
    const growth = parseFloat((((latest - prev) / prev) * 100).toFixed(1));

    const catBreakdown = await Sale.aggregate([
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'prod' } },
      { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$prod.category', revenue: { $sum: '$items.subtotal' }, qty: { $sum: '$items.quantity' } } },
      { $sort: { revenue: -1 } },
    ]);

    res.status(200).json({
      success: true,
      data: { weeklyRevenue: weeks, growth: `${growth > 0 ? '+' : ''}${growth}%`, trend: growth >= 0 ? 'upward' : 'downward', categoryBreakdown: catBreakdown },
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// Format INR for chat replies
const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

// Local rule-based responder — used when Gemini unavailable | spec: §6
async function localChatResponder(message) {
  const q = String(message || '').toLowerCase();

  const [products, recentSales, allSalesAgg] = await Promise.all([
    // select uses renamed fields | spec: §6
    Product.find().select('name sku stock pricePerUnit reorderLevel category').lean(),
    Sale.find().sort({ createdAt: -1 }).limit(50).select('invoiceNumber total items createdAt customer').lean(),
    Sale.aggregate([
      // Use stored fields ($grandTotal, $taxTotal) not virtuals ($total, $taxAmount) | bug A4-07
      { $group: { _id: null, total: { $sum: { $toDouble: { $ifNull: ['$grandTotal', 0] } } }, orders: { $sum: 1 }, tax: { $sum: { $toDouble: { $ifNull: ['$taxTotal', 0] } } } } },
    ]),
  ]);

  const totals = allSalesAgg[0] || { total: 0, orders: 0, tax: 0 };
  const outOfStock = products.filter((p) => d2n(p.stock) <= 0);
  const lowStock   = products.filter((p) => d2n(p.stock) > 0 && d2n(p.stock) <= (d2n(p.reorderLevel) || 10)); // reorderLevel | spec: §6

  const has = (...kw) => kw.some((k) => q.includes(k));

  if (has('low stock', 'restock', 'reorder', 'running low', 'about to run', 'need to restock', 'replenish')) {
    if (lowStock.length === 0 && outOfStock.length === 0)
      return 'Good news — every product is currently above its reorder threshold.';
    const oosLine = outOfStock.length
      ? `**Out of stock (${outOfStock.length}):** ${outOfStock.slice(0, 6).map((p) => p.name).join(', ')}${outOfStock.length > 6 ? '...' : ''}.`
      : '';
    const lowLine = lowStock.length
      ? `**Low stock (${lowStock.length}):** ` + lowStock.slice(0, 8).map((p) => `${p.name} (${d2n(p.stock)} left)`).join('; ') + '.'
      : '';
    return [oosLine, lowLine, 'Recommend raising a purchase order with your primary supplier this week.'].filter(Boolean).join('\n\n');
  }

  if (has('best selling category', 'top category', 'best category', 'leading category')) {
    const byCat = {};
    recentSales.forEach((s) => (s.items || []).forEach((it) => {
      const prod = products.find((p) => String(p._id) === String(it.productId));
      const cat = prod?.category || 'Uncategorised';
      byCat[cat] = (byCat[cat] || 0) + (it.subtotal || 0);
    }));
    const ranked = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!ranked.length) return 'No recent sales recorded — nothing to rank yet.';
    const top = ranked[0];
    return `**Top category:** ${top[0]} with ${inr(top[1])} in recent revenue.\n` +
      ranked.slice(1).map((r, i) => `${i + 2}. ${r[0]} — ${inr(r[1])}`).join('\n');
  }

  if (has('best selling', 'top product', 'top sell', 'best seller', 'most sold')) {
    const tally = {};
    recentSales.forEach((s) => (s.items || []).forEach((it) => {
      const k = it.productName || it.sku || 'Unknown';
      tally[k] = tally[k] || { revenue: 0, qty: 0 };
      tally[k].revenue += it.subtotal || 0;
      tally[k].qty += it.quantity || 0;
    }));
    const ranked = Object.entries(tally).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
    if (!ranked.length) return 'No sales recorded yet.';
    return '**Top selling products by revenue:**\n' +
      ranked.map(([n, v], i) => `${i + 1}. ${n} — ${inr(v.revenue)} (${v.qty} units)`).join('\n');
  }

  if (has('dead stock', 'not selling', 'slow moving', 'no sales')) {
    const soldIds = new Set();
    recentSales.forEach((s) => (s.items || []).forEach((it) => soldIds.add(String(it.productId))));
    const dead = products.filter((p) => d2n(p.stock) > 0 && !soldIds.has(String(p._id))).slice(0, 8);
    if (!dead.length) return 'Every in-stock product has moved recently — no dead stock detected.';
    return `**Dead stock candidates (${dead.length}):**\n` +
      dead.map((p) => `• ${p.name} — ${d2n(p.stock)} units sitting (${inr(d2n(p.pricePerUnit))} each)`).join('\n') + // pricePerUnit | spec: §6
      '\n\nConsider running a clearance promo or returning to supplier.';
  }

  if (has('revenue', 'how much', 'total sales', 'turnover', 'trending', 'how is revenue', 'how is sales')) {
    const last30 = recentSales.filter((s) => (Date.now() - new Date(s.createdAt)) <= 30 * 86400000);
    const last30Total = last30.reduce((sum, s) => sum + (s.total || 0), 0);
    const avg = totals.orders ? totals.total / totals.orders : 0;
    return `**Lifetime revenue:** ${inr(totals.total)} across ${totals.orders} orders.\n` +
      `**Last 30 days:** ${inr(last30Total)} (${last30.length} orders).\n` +
      `**Avg order value:** ${inr(avg)}.\n` +
      `**GST collected:** ${inr(totals.tax)}.`;
  }

  if (has('inventory value', 'stock value', 'how much stock', 'how much inventory', 'inventory worth')) {
    const totalVal = products.reduce((s, p) => s + (d2n(p.pricePerUnit) * d2n(p.stock)), 0); // pricePerUnit | spec: §6
    const totalUnits = products.reduce((s, p) => s + d2n(p.stock), 0);
    return `**Inventory:** ${products.length} SKUs, ${totalUnits} units on hand, total value ${inr(totalVal)}.\n` +
      `${outOfStock.length} out of stock, ${lowStock.length} below reorder threshold.`;
  }

  if (has('latest sale', 'recent sale', 'last invoice', 'recent invoice', 'last sale')) {
    if (!recentSales.length) return 'No sales on record yet.';
    const r = recentSales.slice(0, 5);
    return '**Recent invoices:**\n' +
      r.map((s) => `• ${s.invoiceNumber} — ${s.customer?.name || 'Walk-in'} — ${inr(s.total)} (${new Date(s.createdAt).toLocaleDateString('en-IN')})`).join('\n');
  }

  if (has('summary', 'overview', 'dashboard', 'snapshot', 'how is the store', 'how is business')) {
    return `**Store snapshot:**\n` +
      `• Catalogue: ${products.length} SKUs, ${inr(products.reduce((s, p) => s + d2n(p.pricePerUnit) * d2n(p.stock), 0))} on hand.\n` + // pricePerUnit | spec: §6
      `• Lifetime sales: ${inr(totals.total)} across ${totals.orders} orders.\n` +
      `• Stock health: ${outOfStock.length} out, ${lowStock.length} low, ${products.length - outOfStock.length - lowStock.length} healthy.\n` +
      `• GST collected so far: ${inr(totals.tax)}.`;
  }

  if (has('improve', 'increase sales', 'grow', 'boost', 'recommend', 'advice', 'suggest', 'how to', 'how do', 'help me')) {
    const tally = {};
    recentSales.forEach((s) => (s.items || []).forEach((it) => {
      const k = it.productName || it.sku || 'Unknown';
      tally[k] = tally[k] || { revenue: 0, qty: 0 };
      tally[k].revenue += it.subtotal || 0;
      tally[k].qty += it.quantity || 0;
    }));
    const topSellers = Object.entries(tally).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 3);
    const soldIds = new Set();
    recentSales.forEach((s) => (s.items || []).forEach((it) => soldIds.add(String(it.productId))));
    const dead = products.filter((p) => d2n(p.stock) > 0 && !soldIds.has(String(p._id))).slice(0, 3);
    const last30 = recentSales.filter((s) => (Date.now() - new Date(s.createdAt)) <= 30 * 86400000);
    const last30Total = last30.reduce((sum, s) => sum + (s.total || 0), 0);

    const lines = ['**Recommendations to improve sales:**', ''];
    if (outOfStock.length) lines.push(`1. **Stop losing revenue** — ${outOfStock.length} products are out of stock right now (${outOfStock.slice(0, 3).map((p) => p.name).join(', ')}${outOfStock.length > 3 ? '...' : ''}). Restock immediately.`);
    if (topSellers.length) lines.push(`2. **Double down on winners** — ${topSellers[0][0]} alone earned ${inr(topSellers[0][1].revenue)} recently.`);
    if (dead.length) lines.push(`3. **Clear dead stock** — ${dead.length}+ products haven't sold (${dead.map((p) => p.name).join(', ')}). Run a clearance promo.`);
    if (lowStock.length) lines.push(`4. **Reorder before stockouts hit** — ${lowStock.length} products are below threshold.`);
    lines.push(`5. **Push high-margin categories** — Cross-sell at checkout.`);
    lines.push('');
    lines.push(`Last 30 days you did ${inr(last30Total)} across ${last30.length} orders. Acting on items 1–2 above could lift that meaningfully next month.`);
    return lines.join('\n');
  }

  const totalVal = products.reduce((s, p) => s + (d2n(p.pricePerUnit) * d2n(p.stock)), 0); // pricePerUnit | spec: §6
  const tally = {};
  recentSales.forEach((s) => (s.items || []).forEach((it) => {
    const k = it.productName || it.sku || 'Unknown';
    tally[k] = (tally[k] || 0) + (it.subtotal || 0);
  }));
  const topSeller = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];

  const bits = [
    `**Quick store snapshot** (Gemini is busy — answering from live data):`,
    ``,
    `• **Sales:** ${inr(totals.total)} across ${totals.orders} orders. Avg order ${inr(totals.orders ? totals.total / totals.orders : 0)}.`,
    `• **Inventory:** ${products.length} SKUs, ${inr(totalVal)} on hand.`,
    `• **Stock health:** ${outOfStock.length} out, ${lowStock.length} low, ${products.length - outOfStock.length - lowStock.length} healthy.`,
  ];
  if (topSeller) bits.push(`• **Top seller:** ${topSeller[0]} (${inr(topSeller[1])}).`);
  if (outOfStock.length) bits.push(`• **Action needed:** ${outOfStock.length} products out of stock — restock soon.`);
  bits.push('', `Try asking specifically: *"which products need restocking"*, *"how to improve my sales"*, *"show me dead stock"*, or *"how is revenue trending"*.`);
  return bits.join('\n');
}

// POST /ai/chat — Gemini-powered chat | spec: §6
exports.chatAssistant = async (req, res) => {
  const { message } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const reply = await localChatResponder(message);
    return res.status(200).json({ success: true, data: { reply, source: 'local' } });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    const [inventory, recentSales, transactionStats, suppliers] = await Promise.all([
      Product.find().select('name sku stock pricePerUnit reorderLevel category').limit(50), // renamed | spec: §6
      Sale.find().sort({ createdAt: -1 }).limit(20).select('invoiceNumber total items createdAt customer'),
      Transaction.aggregate([
        { $group: { _id: '$type', totalQty: { $sum: '$quantity' }, count: { $sum: 1 } } },
      ]),
      Supplier.find().select('name contactPerson email phone').limit(20),
    ]);

    const txSummary = {};
    transactionStats.forEach((t) => { txSummary[t._id] = { count: t.count, totalQty: t.totalQty }; });

    const systemPrompt = `You are "SmartStock AI", an expert supply-chain and inventory intelligence assistant.

LIVE INVENTORY (${inventory.length} products):
${JSON.stringify(inventory)}

RECENT SALES (last 20):
${JSON.stringify(recentSales)}

TRANSACTION SUMMARY:
${JSON.stringify(txSummary)}

SUPPLIERS (${suppliers.length}):
${JSON.stringify(suppliers)}

USER QUERY: "${message}"

Instructions:
- Be concise, data-driven, and professional.
- Reference actual product names, stock levels, and sales figures from the data above.
- Use transaction and supplier data when relevant to the query.
- Provide actionable recommendations.
- Keep response to 3-5 sentences or bullet points.`;

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const model  = genAI.getGenerativeModel({ model: modelName });

    let result;
    const isTransient = (e) => e?.status === 503 || /high demand|overload|503/i.test(e?.message || '');
    const delays = [0, 600, 1500];
    let lastErr;
    for (const wait of delays) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        result = await model.generateContent(systemPrompt);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (!isTransient(e)) break;
      }
    }
    if (lastErr) throw lastErr;

    return res.status(200).json({ success: true, data: { reply: result.response.text(), source: 'gemini' } });
  } catch (error) {
    console.error('[ai/chat] Gemini error → local fallback:', error?.message || error);
    try {
      const reply = await localChatResponder(message);
      return res.status(200).json({ success: true, data: { reply, source: 'local' } });
    } catch (fallbackErr) {
      console.error('[ai/chat] Local fallback failed:', fallbackErr?.message || fallbackErr);
      return res.status(503).json({
        success: false,
        data: { reply: 'AI temporarily unavailable. Please try again shortly.' },
        message: 'AI temporarily unavailable. Please try again shortly.',
      });
    }
  }
};
