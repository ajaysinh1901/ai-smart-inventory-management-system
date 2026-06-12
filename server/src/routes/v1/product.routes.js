const express = require('express');
const {
  createProduct, getProducts, getProduct, updateProduct, deleteProduct,
  updateStock, getLowStock, getProductByBarcode, getReorderReport,
} = require('../../controllers/product.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const {
  createProductSchema,
  updateProductSchema,
  stockAdjustSchema,
} = require('../../validators/product.validator');

const router = express.Router();
router.use(protect); // Secure entire module

// Read routes — all authenticated roles
router.get('/low-stock', getLowStock);
router.get('/reorder-report', getReorderReport); // chunk #9: unit-aware reorder report
router.get('/by-barcode/:code', getProductByBarcode); // scan-to-sell lookup
router.get('/search', getProducts); // query mapping done inside getProducts
router.get('/', getProducts);
router.get('/:id', getProduct);

// Write routes — admin and manager only | bug A2-02
router.post('/', authorize('admin', 'manager'), validate(createProductSchema), createProduct);
router.put('/:id', authorize('admin', 'manager'), validate(updateProductSchema), updateProduct);
router.delete('/:id', authorize('admin', 'manager'), deleteProduct);
router.patch('/:id/stock', authorize('admin', 'manager'), validate(stockAdjustSchema), updateStock);

module.exports = router;
