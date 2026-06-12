'use strict';

// Smart alerts cron — daily inventory scan creating Alert documents | spec: C2
// chunk #9: unit-aware alert messages, formatted stock/reorderLevel, severity thresholds
// UoM migration: lowStockThreshold → reorderLevel; Decimal128-safe comparisons | spec: product-uom-schema.md §6
const Product  = require('../models/Product.model');
const Sale     = require('../models/Sale.model');
const Alert    = require('../models/Alert.model');
const Settings = require('../models/Settings.model');
const weight   = require('../utils/weight');

// Helper: upsert an active alert without duplicating | spec: C2
async function upsertAlert({ type, severity, productId, message, metadata }) {
  const existing = await Alert.findOne({ type, productId, status: 'active' });
  if (existing) {
    existing.message  = message;
    existing.severity = severity;
    existing.metadata = { ...(existing.metadata || {}), ...metadata };
    await existing.save();
    return { created: false, alert: existing };
  }
  const alert = await Alert.create({ type, severity, productId, message, metadata });
  return { created: true, alert };
}

// Unwrap Decimal128 to JS float for comparison | spec: §6
function d2n(v) {
  if (v == null) return 0;
  if (typeof v.toString === 'function' && v._bsontype === 'Decimal128') return Number(v.toString());
  if (typeof v.toString === 'function') return Number(v.toString());
  return Number(v) || 0;
}

// Classify severity from stock vs reorderLevel — chunk #9 spec §B.6
// Uses Alert model enum values: ['critical','warning','info'] | bug A4-09
function classifySeverity(stock, reorderLevel) {
  if (stock < 0) return 'critical';  // oversold
  if (stock === 0) return 'critical'; // out of stock → critical (was 'high', not in enum)
  if (reorderLevel > 0 && stock <= reorderLevel) return 'warning'; // low stock (was 'medium', not in enum)
  return null; // healthy — no alert
}

// Format stock quantity using weight.formatQty with the workspace's weightDisplay mode | spec: §B.8
// Falls back to 'mixed' when workspace settings are unavailable.
function formatStock(stockDecimal128, unit, mode) {
  try {
    return weight.formatQty(stockDecimal128, unit, { mode: mode || 'mixed' });
  } catch (_) {
    return `${d2n(stockDecimal128)} ${unit}`;
  }
}

// Scan inventory + recent sales and create/refresh alerts | spec: C2, chunk #9
async function runSmartAlerts() {
  const summary = { scanned: 0, created: 0, updated: 0, lowStock: 0, outOfStock: 0, deadStock: 0 };

  const products = await Product.find({});
  summary.scanned = products.length;

  // Load all settings docs once so we can look up weightDisplay per product owner.
  // In a single-tenant MVP all products share the same workspace; in multi-tenant
  // we'd key by userId. For now load the first settings doc as workspace config.
  // chunk #9 spec: "read workspace.weightDisplay per user"
  let defaultWeightMode = 'mixed';
  try {
    const settings = await Settings.findOne({}).select('workspace').lean();
    if (settings && settings.workspace && settings.workspace.weightDisplay) {
      defaultWeightMode = settings.workspace.weightDisplay;
    }
  } catch (_) { /* non-fatal */ }

  for (const p of products) {
    // reorderLevel (renamed from lowStockThreshold) | spec: §6
    const threshold = d2n(p.reorderLevel) || 0;
    const stock     = d2n(p.stock);
    const unit      = p.unit || 'pcs';

    // chunk #9: build formatted strings for metadata
    const stockFormatted        = formatStock(p.stock, unit, defaultWeightMode);
    const reorderLevelFormatted = threshold > 0
      ? formatStock(p.reorderLevel, unit, defaultWeightMode)
      : `0 ${unit}`;

    // chunk #9: severity thresholds per spec §B.6 + §2.3
    // oversold (stock < 0) → critical; out (stock = 0) → high; low → medium
    const severity = classifySeverity(stock, threshold);

    if (stock < 0) {
      // Oversold — chunk #9: unit-aware message | spec: §2.3
      const result = await upsertAlert({
        type: 'OVERSOLD', severity: 'critical', productId: p._id,
        message: `${p.name} stock is oversold (${stockFormatted}, reorder at ${reorderLevelFormatted})`,
        metadata: {
          currentStock: stock, threshold, sku: p.sku,
          unit, stockFormatted, reorderLevelFormatted,
        },
      });
      if (result.created) { summary.created++; summary.outOfStock++; }
      else { summary.updated++; }
    } else if (stock === 0) {
      // Out of stock — chunk #9: unit-aware message, severity 'critical' (Alert enum) | bug A4-09
      const result = await upsertAlert({
        type: 'OUT_OF_STOCK', severity: 'critical', productId: p._id,
        message: `${p.name} is out of stock (reorder at ${reorderLevelFormatted})`,
        metadata: {
          currentStock: stock, threshold, sku: p.sku,
          unit, stockFormatted, reorderLevelFormatted,
        },
      });
      if (result.created) { summary.created++; summary.outOfStock++; }
      else { summary.updated++; }
    } else if (threshold > 0 && stock <= threshold) {
      // Low stock: only trigger when reorderLevel > 0 (0 means "never alert") | spec: §2.1
      // chunk #9: unit-aware message with formatted qty | spec: §B.6
      // severity 'warning' (Alert enum — was 'medium', not in enum) | bug A4-09
      const result = await upsertAlert({
        type: 'LOW_STOCK', severity: 'warning', productId: p._id,
        message: `${p.name} stock is low (${stockFormatted}, reorder at ${reorderLevelFormatted})`,
        metadata: {
          currentStock: stock, threshold, sku: p.sku,
          unit, stockFormatted, reorderLevelFormatted,
        },
      });
      if (result.created) { summary.created++; summary.lowStock++; }
      else { summary.updated++; }
    }
  }

  // 2) Dead-stock alerts (no sales in 30 days, stock > 0) | spec: C2
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentSoldAgg = await Sale.aggregate([
    { $match: { createdAt: { $gte: cutoff } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.productId' } },
  ]);
  const soldRecentlyIds = new Set(recentSoldAgg.map((r) => String(r._id)));

  for (const p of products) {
    if (d2n(p.stock) <= 0) continue;
    if (soldRecentlyIds.has(String(p._id))) continue;

    const result = await upsertAlert({
      type: 'DEAD_STOCK', severity: 'info', productId: p._id,
      message: `Dead stock: ${p.name} unsold for 30+ days`,
      metadata: { currentStock: d2n(p.stock), daysUnsold: 30, sku: p.sku },
    });
    if (result.created) { summary.created++; summary.deadStock++; }
    else { summary.updated++; }
  }

  return summary;
}

// Register the cron job — wraps node-cron lazily | spec: C2
function scheduleSmartAlerts(cronExpression = '0 9 * * *') {
  let cron;
  try {
    cron = require('node-cron');
  } catch (err) {
    console.warn('[smartAlerts] node-cron not installed — cron will not run. Reason:', err.message);
    return null;
  }

  if (!cron.validate(cronExpression)) {
    console.warn(`[smartAlerts] Invalid cron expression "${cronExpression}". Skipping.`);
    return null;
  }

  const task = cron.schedule(cronExpression, async () => {
    try {
      const summary = await runSmartAlerts();
      console.log('[smartAlerts] daily scan complete:', summary);
    } catch (err) {
      console.error('[smartAlerts] scan failed:', err.message);
    }
  }, { scheduled: true });

  console.log(`[smartAlerts] cron registered (${cronExpression})`);
  return task;
}

module.exports = { runSmartAlerts, scheduleSmartAlerts };
