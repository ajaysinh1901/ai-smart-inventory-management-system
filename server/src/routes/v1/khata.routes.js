const express = require('express');
const {
  recordPayment, recordAdjustment, reverseEntry, listEntries, getStatement, getSummary,
} = require('../../controllers/khata.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const {
  recordPaymentSchema, adjustmentSchema, reverseSchema,
} = require('../../validators/khata.validator');

const router = express.Router();
router.use(protect);

router.get('/summary', getSummary);
router.post('/payments',    validate(recordPaymentSchema), recordPayment);
router.post('/adjustments', validate(adjustmentSchema),    recordAdjustment);
router.post('/entries/:id/reverse', validate(reverseSchema), reverseEntry);
router.get('/customers/:customerId/entries',   listEntries);
router.get('/customers/:customerId/statement', getStatement);

module.exports = router;
