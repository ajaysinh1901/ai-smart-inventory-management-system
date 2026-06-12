const express = require('express');
const {
  createCustomer, listCustomers, topDebtors, getCustomer,
  updateCustomer, deleteCustomer, recomputeBalance,
} = require('../../controllers/customer.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { createCustomerSchema, updateCustomerSchema } = require('../../validators/customer.validator');

const router = express.Router();
router.use(protect);

router.get('/top-debtors', topDebtors);
router.route('/')
  .post(validate(createCustomerSchema), createCustomer)
  .get(listCustomers);
router.route('/:id')
  .get(getCustomer)
  .patch(validate(updateCustomerSchema), updateCustomer)
  .delete(deleteCustomer);
router.post('/:id/recompute-balance', recomputeBalance);

module.exports = router;
