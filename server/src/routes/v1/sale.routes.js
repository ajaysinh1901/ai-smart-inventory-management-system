'use strict';

// Sale routes — scale-mode endpoints added in chunk #3
// spec: setup-flow-and-units.md §B.4, chunk #3

const express = require('express');
const {
  createSale,
  previewSale,
  refundSale,
  getSales,
  getSale,
  getSalesReport,
  downloadInvoicePdf,
  exportTallyXml,
} = require('../../controllers/sale.controller');
const { protect }   = require('../../middlewares/auth.middleware');
const { validate }  = require('../../middlewares/validate.middleware');
const { writeLimiter } = require('../../middlewares/rateLimiter.middleware'); // SEC-008
const {
  createSaleSchema,
  previewSaleSchema,
  refundSaleSchema,
} = require('../../validators/sale.validator');

const router = express.Router();
router.use(protect);

// Report + export routes must come before /:id so they don't match as ObjectIds
router.get('/report',     getSalesReport);
router.get('/tally.xml',  exportTallyXml);

// Preview — compute totals without persisting | spec: chunk #3 B.2
router.post('/preview', validate(previewSaleSchema), previewSale);

// Primary sale create | spec: chunk #3 B.1 | SEC-008: writeLimiter on POST
router.route('/')
  .post(writeLimiter, validate(createSaleSchema), createSale)
  .get(getSales);

// Refund/return | spec: chunk #3 B.3 | SEC-008: writeLimiter on POST
router.post('/:id/refund', writeLimiter, validate(refundSaleSchema), refundSale);

router.route('/:id').get(getSale);
router.get('/:id/pdf', downloadInvoicePdf);

module.exports = router;
