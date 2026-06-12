const mongoose = require('mongoose');
const Customer    = require('../models/Customer.model');
const KhataEntry  = require('../models/KhataEntry.model');
const Sale        = require('../models/Sale.model');
const khataService = require('../services/khata.service');

function fail(res, error, fallback = 400) {
  if (error?.code === 11000) {
    return res.status(409).json({ success: false, message: 'Duplicate receipt number — please retry.' });
  }
  return res.status(fallback).json({ success: false, message: error.message });
}

// ─── POST /khata/payments ────────────────────────────────────────────────────
exports.recordPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { customerId, amount, mode, entryDate, chequeNumber, chequeBank, upiTxnId, notes } = req.body;

    if (entryDate) {
      const ed = new Date(entryDate);
      if (ed > new Date()) {
        return res.status(400).json({ success: false, message: 'entryDate cannot be in the future' });
      }
    }

    const customer = await Customer.findOne({ _id: customerId, userId });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const { entry, customer: updated } = await khataService.postPayment({
      userId, customerId, amount, mode, entryDate, chequeNumber, chequeBank, upiTxnId, notes, createdBy: userId,
    });

    res.status(201).json({
      success: true,
      data: entry,
      customer: { _id: updated._id, outstandingBalance: updated.outstandingBalance },
    });
  } catch (error) { return fail(res, error); }
};

// ─── POST /khata/adjustments ────────────────────────────────────────────────
exports.recordAdjustment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { customerId, direction, amount, reason, entryDate } = req.body;

    const customer = await Customer.findOne({ _id: customerId, userId });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const { entry, customer: updated } = await khataService.postAdjustment({
      userId, customerId, direction, amount, reason, entryDate, createdBy: userId,
    });

    res.status(201).json({
      success: true,
      data: entry,
      customer: { _id: updated._id, outstandingBalance: updated.outstandingBalance },
    });
  } catch (error) { return fail(res, error); }
};

// ─── POST /khata/entries/:id/reverse ────────────────────────────────────────
exports.reverseEntry = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const { entry, customer } = await khataService.postReversal({
      userId: req.user.id, entryId: req.params.id, reason: req.body.reason, createdBy: req.user.id,
    });
    res.status(201).json({
      success: true,
      data: entry,
      customer: { _id: customer._id, outstandingBalance: customer.outstandingBalance },
    });
  } catch (error) { return fail(res, error); }
};

// ─── GET /khata/customers/:customerId/entries ───────────────────────────────
exports.listEntries = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.customerId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const userId = req.user.id;
    const { page = 1, limit = 20, voucherType } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = { userId, customerId: req.params.customerId };
    if (voucherType) query.voucherType = voucherType;

    const [data, total] = await Promise.all([
      KhataEntry.find(query).sort({ entryDate: -1, createdAt: -1 }).skip(skip).limit(Number(limit)),
      KhataEntry.countDocuments(query),
    ]);

    res.status(200).json({
      success: true, data,
      meta: { total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) { return fail(res, error, 500); }
};

// ─── GET /khata/customers/:customerId/statement ─────────────────────────────
exports.getStatement = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.customerId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const userId = req.user.id;
    const { from, to } = req.query;
    const fromDate = new Date(from);
    const toDate = new Date(new Date(to).setHours(23, 59, 59, 999));

    const customer = await Customer.findOne({ _id: req.params.customerId, userId });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    // Opening balance = signed sum of all entries strictly before `from`.
    const priorAgg = await KhataEntry.aggregate([
      { $match: {
          userId: new mongoose.Types.ObjectId(userId),
          customerId: customer._id,
          isReversed: { $ne: true },
          entryDate: { $lt: fromDate },
      } },
      { $group: { _id: null,
          net: { $sum: { $cond: [{ $eq: ['$direction', 'debit'] }, '$amount', { $multiply: ['$amount', -1] }] } },
      } },
    ]);
    const openingBalance = priorAgg[0]?.net || 0;

    const entries = await KhataEntry.find({
      userId, customerId: customer._id,
      entryDate: { $gte: fromDate, $lte: toDate },
    }).sort({ entryDate: 1, createdAt: 1 });

    // Join Sale invoice numbers for any Sale/Refund references.
    const saleIds = entries
      .map((e) => e.reference?.saleId)
      .filter(Boolean);
    const sales = saleIds.length
      ? await Sale.find({ _id: { $in: saleIds } }).select('_id invoiceNumber')
      : [];
    const invMap = new Map(sales.map((s) => [String(s._id), s.invoiceNumber]));

    const totalDebit  = entries.filter((e) => e.direction === 'debit').reduce((s, e) => s + e.amount, 0);
    const totalCredit = entries.filter((e) => e.direction === 'credit').reduce((s, e) => s + e.amount, 0);
    const closingBalance = openingBalance + totalDebit - totalCredit;

    const enriched = entries.map((e) => {
      const j = e.toObject();
      j.invoiceNumber = e.reference?.saleId ? invMap.get(String(e.reference.saleId)) : null;
      j.debit  = e.direction === 'debit'  ? e.amount : 0;
      j.credit = e.direction === 'credit' ? e.amount : 0;
      return j;
    });

    res.status(200).json({
      success: true,
      data: {
        customer,
        openingBalance,
        entries: enriched,
        closingBalance,
        totals: { totalDebit, totalCredit },
      },
    });
  } catch (error) { return fail(res, error, 500); }
};

// ─── GET /khata/summary ─────────────────────────────────────────────────────
exports.getSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const asOf = req.query.asOf ? new Date(req.query.asOf) : new Date();
    asOf.setHours(23, 59, 59, 999);

    const agg = await Customer.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: {
          _id: null,
          totalReceivable: { $sum: { $cond: [{ $gt: ['$outstandingBalance', 0] }, '$outstandingBalance', 0] } },
          totalPayable:    { $sum: { $cond: [{ $lt: ['$outstandingBalance', 0] }, '$outstandingBalance', 0] } },
          customerCount:   { $sum: 1 },
      } },
    ]);

    const buckets = await KhataEntry.aggregate([
      { $match: {
          userId: new mongoose.Types.ObjectId(userId),
          voucherType: 'Sale',
          isReversed: { $ne: true },
      } },
      { $group: {
          _id: '$customerId',
          oldestUnpaid: { $min: '$entryDate' },
      } },
      { $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customer',
      } },
      { $unwind: '$customer' },
      { $match: { 'customer.outstandingBalance': { $gt: 0 } } },
    ]);

    const today = new Date();
    const aging = { '0-30': 0, '30-60': 0, '60-90': 0, '90+': 0 };
    for (const row of buckets) {
      const days = Math.floor((today - row.oldestUnpaid) / (1000 * 60 * 60 * 24));
      const bal = row.customer.outstandingBalance;
      if (days <= 30) aging['0-30'] += bal;
      else if (days <= 60) aging['30-60'] += bal;
      else if (days <= 90) aging['60-90'] += bal;
      else aging['90+'] += bal;
    }

    res.status(200).json({
      success: true,
      data: {
        totalReceivable: agg[0]?.totalReceivable || 0,
        totalPayable:    Math.abs(agg[0]?.totalPayable || 0),
        customerCount:   agg[0]?.customerCount || 0,
        agingBuckets:    aging,
      },
    });
  } catch (error) { return fail(res, error, 500); }
};
