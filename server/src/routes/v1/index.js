const express = require('express');
const healthRoutes      = require('./health.routes');
const authRoutes        = require('./auth.routes');
const userRoutes        = require('./user.routes');
const productRoutes     = require('./product.routes');
const supplierRoutes    = require('./supplier.routes');
const transactionRoutes = require('./transaction.routes');
const aiRoutes          = require('./ai.routes');
const ocrRoutes         = require('./ocr.routes');
const analyticsRoutes   = require('./analytics.routes');
const saleRoutes        = require('./sale.routes');
const settingsRoutes    = require('./settings.routes');
const alertRoutes       = require('./alert.routes');
const customerRoutes    = require('./customer.routes');
const khataRoutes       = require('./khata.routes');
const workspaceRoutes   = require('./workspace.routes');
const reportsRoutes     = require('./reports.routes'); // chunk #10
const samplePackRoutes  = require('./samplePack.routes'); // chunk #5
const inventoryRoutes   = require('./inventory.routes'); // C2: stock-adjustments

const router = express.Router();

// Public — must be mounted BEFORE any global protection.
router.use('/health', healthRoutes);

// Mount all modular routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/transactions', transactionRoutes);
router.use('/ai', aiRoutes);
router.use('/ocr', ocrRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/sales',     saleRoutes);
router.use('/settings',  settingsRoutes);
router.use('/alerts',    alertRoutes);
router.use('/customers', customerRoutes);
router.use('/khata',     khataRoutes);
router.use('/workspace',    workspaceRoutes);
router.use('/reports',           reportsRoutes);     // chunk #10
router.use('/sample-packs',      samplePackRoutes);  // chunk #5: supplier-shrinkage + future reports
router.use('/stock-adjustments', inventoryRoutes);   // C2: stock-adjustment (inventory) module

module.exports = router;
