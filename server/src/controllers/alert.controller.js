const Alert = require('../models/Alert.model');
const { runSmartAlerts } = require('../crons/smartAlerts.cron');

// Map severity → numeric so sorting goes critical → warning → info | spec: C2
const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

// GET /alerts — list alerts with optional status/type filter | spec: C2
exports.listAlerts = async (req, res) => {
  const { status, type } = req.query;
  const query = {};
  if (status) query.status = status;
  else query.status = 'active';
  if (type) query.type = type;

  // populate select updated: lowStockThreshold → reorderLevel | spec: product-uom-schema.md §6
  const alerts = await Alert.find(query)
    .populate('productId', 'name sku stock reorderLevel unit')
    .populate('dismissedBy', 'name email')
    .lean();

  alerts.sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity] ?? 99;
    const sb = SEVERITY_RANK[b.severity] ?? 99;
    if (sa !== sb) return sa - sb;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  res.status(200).json({ success: true, data: alerts, meta: { total: alerts.length } });
};

// GET /alerts/count — quick counts for nav bell badge | spec: C2
exports.getAlertCount = async (req, res) => {
  const [active, critical] = await Promise.all([
    Alert.countDocuments({ status: 'active' }),
    Alert.countDocuments({ status: 'active', severity: 'critical' }),
  ]);
  res.status(200).json({ success: true, data: { active, critical } });
};

// PATCH /alerts/:id/dismiss — mark single alert dismissed | spec: C2
exports.dismissAlert = async (req, res) => {
  const alert = await Alert.findById(req.params.id);
  if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });

  alert.status = 'dismissed';
  alert.dismissedBy = req.user?.id;
  alert.dismissedAt = new Date();
  await alert.save();

  res.status(200).json({ success: true, data: alert });
};

// POST /alerts/run-now — admin-only manual trigger of cron scan | spec: C2
exports.triggerAlertsRun = async (req, res) => {
  const summary = await runSmartAlerts();
  res.status(200).json({ success: true, data: summary });
};
