const express = require('express');
const {
  createSupplier, getSuppliers, getSupplier,
  updateSupplier, deleteSupplier,
  getSupplierProducts, getSupplierTransactions, getSupplierStats,
} = require('../../controllers/supplier.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const {
  createSupplierSchema,
  updateSupplierSchema,
} = require('../../validators/supplier.validator');

const router = express.Router();
router.use(protect);
router.use(authorize('admin', 'manager'));

router.get('/stats', getSupplierStats);
router.route('/')
  .post(validate(createSupplierSchema), createSupplier)
  .get(getSuppliers);
router.route('/:id')
  .get(getSupplier)
  .put(validate(updateSupplierSchema), updateSupplier)
  .delete(deleteSupplier);
router.get('/:id/products',      getSupplierProducts);
router.get('/:id/transactions',  getSupplierTransactions);

module.exports = router;
