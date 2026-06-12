'use strict';

// inventory.routes.js — stock-adjustment routes | spec: C2 (bug fix)
// Mounted at /api/v1/stock-adjustments in routes/v1/index.js

const express  = require('express');
const { createStockAdjustment, listStockAdjustments } = require('../../controllers/inventory.controller');
const { protect, authorize }  = require('../../middlewares/auth.middleware');
const { writeLimiter } = require('../../middlewares/rateLimiter.middleware'); // SEC-008

const router = express.Router();
router.use(protect); // all routes require authentication

// GET /stock-adjustments — list adjustments (all authenticated roles)
router.get('/', listStockAdjustments);

// POST /stock-adjustments — create adjustment (admin + manager only) | bug A2-02 pattern
router.post('/', authorize('admin', 'manager'), writeLimiter, createStockAdjustment);

module.exports = router;
