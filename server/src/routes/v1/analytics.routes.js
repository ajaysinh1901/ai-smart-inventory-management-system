const express = require('express');
const { getDashboardStats, getSalesReport, getInventoryReport, getProfitAnalysis } = require('../../controllers/analytics.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();
router.use(protect);

router.get('/dashboard', getDashboardStats);
router.get('/sales', getSalesReport);
router.get('/inventory', getInventoryReport);
router.get('/profit', getProfitAnalysis);

module.exports = router;
