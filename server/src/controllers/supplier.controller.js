const mongoose  = require('mongoose');
const Supplier  = require('../models/Supplier.model');
const Product   = require('../models/Product.model');
const Transaction = require('../models/Transaction.model');

// Translate common Mongo errors. | bug #011
function translateMongoError(error, res, fallbackStatus = 400) {
  if (error && error.code === 11000) {
    const field = Object.keys(error.keyValue || {})[0] || 'field';
    const value = (error.keyValue && error.keyValue[field]) || '';
    return res.status(409).json({
      success: false,
      message: `A supplier with ${field.toUpperCase()} "${value}" already exists.`,
    });
  }
  if (error && error.name === 'ValidationError') {
    const first = Object.values(error.errors || {})[0];
    return res.status(400).json({ success: false, message: first?.message || 'Validation failed' });
  }
  return res.status(fallbackStatus).json({ success: false, message: error.message });
}

exports.createSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.create(req.body);
    res.status(201).json({ success: true, data: supplier });
  } catch (error) { return translateMongoError(error, res); }
};

exports.getSuppliers = async (req, res) => {
  try {
    const { q } = req.query;
    const query = q ? { $or: [{ name: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } }] } : {};
    const suppliers = await Supplier.find(query).sort({ createdAt: -1 });

    // Attach product count to each supplier
    const withCounts = await Promise.all(suppliers.map(async (s) => {
      const productCount = await Product.countDocuments({ supplierId: s._id });
      return { ...s.toObject(), productCount };
    }));

    res.status(200).json({ success: true, data: withCounts });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getSupplier = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
    res.status(200).json({ success: true, data: supplier });
  } catch (error) { return translateMongoError(error, res, 404); }
};

exports.updateSupplier = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
    res.status(200).json({ success: true, data: supplier });
  } catch (error) { return translateMongoError(error, res); }
};

// Reject delete when products still reference this supplier. | bug #011.6
exports.deleteSupplier = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const productCount = await Product.countDocuments({ supplierId: req.params.id });
    if (productCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete supplier — ${productCount} product(s) still reference it. Reassign or delete those products first.`,
        data: { productCount },
      });
    }
    const removed = await Supplier.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ success: false, message: 'Supplier not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (error) { return translateMongoError(error, res); }
};

// GET /suppliers/:id/products — products linked to supplier | spec: product-uom-schema.md §6
exports.getSupplierProducts = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    // field select updated: price → pricePerUnit, lowStockThreshold → reorderLevel | spec: §6
    const products = await Product.find({ supplierId: req.params.id })
      .select('name sku category pricePerUnit stock reorderLevel unit saleByWeight');
    res.status(200).json({ success: true, data: products, total: products.length });
  } catch (error) { res.status(500).json({ success: false, message: 'Could not load products.' }); }
};

// GET /suppliers/:id/transactions — recent transactions for products from this supplier
exports.getSupplierTransactions = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const products = await Product.find({ supplierId: req.params.id }).select('_id');
    const productIds = products.map(p => p._id);
    const transactions = await Transaction.find({ productId: { $in: productIds } })
      .populate('productId', 'name sku')
      .sort({ createdAt: -1 })
      .limit(20);
    res.status(200).json({ success: true, data: transactions });
  } catch (error) { res.status(500).json({ success: false, message: 'Could not load transactions.' }); }
};

// GET /suppliers/stats — aggregated stats for dashboard cards
exports.getSupplierStats = async (req, res) => {
  try {
    const total   = await Supplier.countDocuments();

    // Top supplier by number of products
    const topAgg  = await Product.aggregate([
      { $match: { supplierId: { $ne: null } } },
      { $group: { _id: '$supplierId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]);
    let topSupplier = null;
    if (topAgg.length) {
      topSupplier = await Supplier.findById(topAgg[0]._id).select('name');
      if (topSupplier) topSupplier = { ...topSupplier.toObject(), productCount: topAgg[0].count };
    }

    res.status(200).json({ success: true, data: { total, active: total, topSupplier } });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
