const express = require('express');
const {
  createTransaction, getTransactions, getTransaction,
  getProductTransactions, deleteTransaction,
  getRecentActivity, getTransactionStats,
  stockIn, openingStock,
} = require('../../controllers/transaction.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { writeLimiter } = require('../../middlewares/rateLimiter.middleware'); // SEC-008
const { createTransactionSchema } = require('../../validators/transaction.validator');

const router = express.Router();
router.use(protect);

// chunk #10: stock-in with variance capture and opening stock | SEC-008: writeLimiter
router.post('/stock-in',       writeLimiter, stockIn);
router.post('/opening-stock',  writeLimiter, openingStock);

router.get('/stats',        getTransactionStats);
router.get('/recent',       getRecentActivity);
router.get('/product/:id',  getProductTransactions);
router.route('/')
  .post(writeLimiter, validate(createTransactionSchema), createTransaction) // SEC-008
  .get(getTransactions);
router.route('/:id').get(getTransaction).delete(deleteTransaction);

module.exports = router;
