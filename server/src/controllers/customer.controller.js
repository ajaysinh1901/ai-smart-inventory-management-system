const mongoose = require('mongoose');
const Customer    = require('../models/Customer.model');
const KhataEntry  = require('../models/KhataEntry.model');
const khataService = require('../services/khata.service');
const { normalizePhone } = require('../validators/customer.validator');

function translateMongoError(error, res, fallbackStatus = 400) {
  if (error && error.code === 11000) {
    const field = Object.keys(error.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `A customer with this ${field} already exists in your workspace.`,
    });
  }
  if (error && error.name === 'ValidationError') {
    const first = Object.values(error.errors || {})[0];
    return res.status(400).json({ success: false, message: first?.message || 'Validation failed' });
  }
  return res.status(fallbackStatus).json({ success: false, message: error.message });
}

// ─── POST /customers ─────────────────────────────────────────────────────────
exports.createCustomer = async (req, res) => {
  try {
    const userId = req.user.id;
    const body = { ...req.body };

    let phone = '';
    try {
      phone = normalizePhone(body.phone || '');
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message });
    }

    const opening = Number(body.openingBalance || 0);
    delete body.openingBalance;

    const customer = await Customer.create({
      ...body,
      phone,
      gstin: (body.gstin || '').toUpperCase(),
      userId,
      createdBy: userId,
      outstandingBalance: 0,
    });

    if (opening !== 0) {
      try {
        await khataService.postOpeningBalance({
          userId, customerId: customer._id, amount: opening, createdBy: userId,
        });
      } catch (err) {
        await Customer.deleteOne({ _id: customer._id });
        return res.status(400).json({ success: false, message: `Opening balance failed: ${err.message}` });
      }
      const refreshed = await Customer.findById(customer._id);
      return res.status(201).json({ success: true, data: refreshed });
    }

    res.status(201).json({ success: true, data: customer });
  } catch (error) { return translateMongoError(error, res); }
};

// ─── GET /customers ──────────────────────────────────────────────────────────
exports.listCustomers = async (req, res) => {
  try {
    const userId = req.user.id;
    const { q = '', isActive, hasOutstanding, page = 1, limit = 15, sort = '-outstandingBalance' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = { userId };
    if (q) {
      query.$or = [
        { name:  { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { gstin: { $regex: q.toUpperCase(), $options: 'i' } },
      ];
    }
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (hasOutstanding === 'true') query.outstandingBalance = { $gt: 0 };

    const [data, total] = await Promise.all([
      Customer.find(query).sort(sort).skip(skip).limit(Number(limit)),
      Customer.countDocuments(query),
    ]);

    res.status(200).json({
      success: true, data,
      meta: { total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) { return translateMongoError(error, res, 500); }
};

// ─── GET /customers/top-debtors ──────────────────────────────────────────────
exports.topDebtors = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(Number(req.query.limit || 10), 50);
    const data = await Customer
      .find({ userId, isActive: true, outstandingBalance: { $gt: 0 } })
      .sort({ outstandingBalance: -1 })
      .limit(limit)
      .select('_id name phone outstandingBalance lastTransactionAt');
    res.status(200).json({ success: true, data });
  } catch (error) { return translateMongoError(error, res, 500); }
};

// ─── GET /customers/:id ──────────────────────────────────────────────────────
exports.getCustomer = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user.id });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.status(200).json({ success: true, data: customer });
  } catch (error) { return translateMongoError(error, res); }
};

// ─── PATCH /customers/:id ────────────────────────────────────────────────────
exports.updateCustomer = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const userId = req.user.id;
    const customer = await Customer.findOne({ _id: req.params.id, userId });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const updates = { ...req.body };

    if (updates.phone !== undefined) {
      try { updates.phone = normalizePhone(updates.phone); }
      catch (e) { return res.status(400).json({ success: false, message: e.message }); }
    }

    // GSTIN history audit (E5).
    if (updates.gstin !== undefined && updates.gstin !== customer.gstin && customer.gstin) {
      customer.gstinHistory.push({ gstin: customer.gstin, changedAt: new Date() });
    }
    if (updates.gstin !== undefined) {
      updates.gstin = (updates.gstin || '').toUpperCase();
    }

    Object.assign(customer, updates);
    await customer.save();
    res.status(200).json({ success: true, data: customer });
  } catch (error) { return translateMongoError(error, res); }
};

// ─── DELETE /customers/:id ───────────────────────────────────────────────────
exports.deleteCustomer = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const userId = req.user.id;
    const customer = await Customer.findOne({ _id: req.params.id, userId });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    // Block hard delete if any ledger history exists or balance is non-zero.
    const entryCount = await KhataEntry.countDocuments({ userId, customerId: customer._id });
    if (entryCount > 0 || customer.outstandingBalance !== 0) {
      // Soft-delete instead.
      customer.isActive = false;
      await customer.save();
      return res.status(200).json({
        success: true,
        data: { _id: customer._id, isActive: false },
        message: 'Customer has ledger history — deactivated instead of deleted.',
      });
    }

    await Customer.deleteOne({ _id: customer._id });
    res.status(200).json({ success: true, data: { _id: customer._id, deleted: true } });
  } catch (error) { return translateMongoError(error, res); }
};

// ─── POST /customers/:id/recompute-balance ───────────────────────────────────
exports.recomputeBalance = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const out = await khataService.recomputeBalance({ userId: req.user.id, customerId: req.params.id });
    res.status(200).json({ success: true, data: out });
  } catch (error) { return translateMongoError(error, res); }
};
