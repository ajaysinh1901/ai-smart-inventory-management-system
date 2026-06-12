'use strict';

// reports.routes.js — aggregated report endpoints | spec: chunk #10
const express = require('express');
const { getSupplierShrinkage } = require('../../controllers/reports.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();
router.use(protect);

// GET /reports/supplier-shrinkage?from=YYYY-MM-DD&to=YYYY-MM-DD&supplierId?
router.get('/supplier-shrinkage', getSupplierShrinkage);

module.exports = router;
