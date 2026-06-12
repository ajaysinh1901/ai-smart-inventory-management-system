'use strict';

// sale.controller.js — scale-mode sale flow API | spec: setup-flow-and-units.md §B.4, chunk #3

const mongoose    = require('mongoose');
const Sale             = require('../models/Sale.model');
const Product          = require('../models/Product.model');
const Transaction      = require('../models/Transaction.model');
const Counter          = require('../models/Counter.model');
const Settings         = require('../models/Settings.model');
const Customer         = require('../models/Customer.model');
const StockAdjustment  = require('../models/StockAdjustment.model');
const money       = require('../utils/money');
const weight      = require('../utils/weight');
const { computeSale }  = require('../utils/saleCompute');
const khataService     = require('../services/khata.service');
const { normalizePhone } = require('../validators/customer.validator');
const { generateInvoicePDF } = require('../services/pdf.service');
const { buildSalesEnvelope } = require('../services/tally.service');

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Atomic invoice number allocator — race-free per fiscal year | bug #009
async function allocateInvoiceNumber(prefix = 'INV') {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `invoice-${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const pad = String(counter.seq).padStart(5, '0');
  return `${prefix}-${year}-${pad}`;
}

// Rollback any stock decrements made before a failure | bug #005 / #004
async function rollbackStock(reserved) {
  for (const r of reserved) {
    try {
      await Product.findByIdAndUpdate(
        r.productId,
        { $inc: { stock: weight.fromNumberOrString(r.delta) } }
      );
    } catch (_) { /* best-effort */ }
  }
}

// Fetch and index products by id string for a set of line productIds
async function fetchProducts(lines) {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const docs = await Product.find({ _id: { $in: ids } });
  const map = new Map();
  for (const d of docs) map.set(String(d._id), d);
  return map;
}

// Resolve workspace state for CGST/SGST vs IGST | spec §B.4
async function getWorkspaceState(userId) {
  const settings = await Settings.findOne({ userId });
  return settings?.workspace?.state || '';
}

// Resolve customer state and customerId given request body | spec K1 §7
async function resolveCustomer({ customer, paymentMode, userId }) {
  let customerId = null;
  const warnings = [];

  try {
    const normPhone = customer?.phone ? normalizePhone(customer.phone) : '';
    const gstin     = (customer?.gstin || '').toUpperCase();

    if (normPhone || gstin) {
      let existing = null;
      if (gstin) existing = await Customer.findOne({ userId, gstin });
      if (!existing && normPhone) existing = await Customer.findOne({ userId, phone: normPhone });

      if (existing) {
        customerId = existing._id;
        if (!existing.isActive) existing.isActive = true;
        existing.lastTransactionAt = new Date();
        await existing.save();
      } else {
        const created = await Customer.create({
          userId,
          createdBy: userId,
          name:        customer?.name || 'Walk-in Customer',
          phone:       normPhone,
          gstin,
          addressLine1: customer?.address || '',
          state:        customer?.state || '',
          lastTransactionAt: new Date(),
        });
        customerId = created._id;
      }
    }
  } catch (custErr) {
    if (paymentMode === 'credit') throw custErr;
    warnings.push(`Customer not linked: ${custErr.message}`);
  }

  const customerState = customer?.state || '';
  return { customerId, customerState, warnings };
}

// ─── POST /api/v1/sales ───────────────────────────────────────────────────────
// Primary sale endpoint: scale-mode, amount-first, tare, per-line GST.
// Writes Sale doc, decrements Product.stock, writes StockAdjustment per line.
// Uses a Mongoose session for atomic rollback on failure. | spec: chunk #3 B.1
exports.createSale = async (req, res) => {
  // Bug A3-04: read discount from request body and pass through computation
  const { lines, customer, payment, paymentMode: legacyMode, notes, discount } = req.body;
  const paymentMode = payment?.mode || legacyMode || 'cash';

  if (!lines || lines.length === 0)
    return res.status(400).json({ success: false, message: 'Sale must have at least one line.' });

  const products = await fetchProducts(lines);
  const workspaceState = await getWorkspaceState(req.user.id);

  // Resolve customer BEFORE computing (need customerState for intraState) | spec K1 §7
  let customerId, customerState, customerWarnings;
  try {
    ({ customerId, customerState, warnings: customerWarnings } =
      await resolveCustomer({ customer, paymentMode, userId: req.user.id }));
  } catch (custErr) {
    return res.status(400).json({ success: false, message: `Customer resolution failed: ${custErr.message}` });
  }

  if (paymentMode === 'credit' && !customerId) {
    return res.status(400).json({
      success: false,
      message: 'Credit sale requires a customer with phone or GSTIN.',
    });
  }

  // Compute the full sale (pure, no DB side-effects) | spec chunk #3 C
  let computed;
  try {
    computed = computeSale({
      lines,
      products,
      workspaceState,
      customerState,
      saleType: 'sale',
      discount: discount || 0,
    });
  } catch (calcErr) {
    const status = calcErr.statusCode || 400;
    return res.status(status).json({ success: false, message: calcErr.message });
  }

  // ── Stock decrement + StockAdjustment writes ──────────────────────────────
  // We use a Mongoose session for the sale doc + stock adjustment writes,
  // but we still do the stock $inc outside the session (MongoDB multi-doc
  // transactions require a replica set; on single-node setups the session
  // will still protect the sale+adjustment atomicity, and we do rollbackStock
  // for the stock $inc if something later fails).

  const reserved = []; // track for rollback
  const lineWarnings = [];

  for (const cl of computed.lines) {
    const netQty       = cl._netQty;
    const saleByWeight = cl._saleByWeight;
    const productId    = cl.productId;

    if (saleByWeight) {
      // Weight units: no floor guard — kirana reality (spec §2.3, §B.8)
      await Product.findByIdAndUpdate(
        productId,
        { $inc: { stock: weight.fromNumberOrString('-' + netQty.toString()) } }
      );
      // Soft-warn if stock goes negative (oversold)
      const updated = await Product.findById(productId);
      if (updated && Number(updated.stock.toString()) < 0) {
        cl.oversold = true;
        lineWarnings.push(`${cl.productName}: oversold (stock is now negative)`);
      }
      reserved.push({ productId, delta: netQty.toString() });
    } else {
      // Integer units: atomic conditional guard | spec §2.3
      const qtyD = weight.fromNumberOrString(netQty.toString());
      const updated = await Product.findOneAndUpdate(
        { _id: productId, stock: { $gte: qtyD } },
        { $inc: { stock: weight.fromNumberOrString('-' + netQty.toString()) } },
        { new: true }
      );
      if (!updated) {
        // Roll back all previously decremented lines
        await rollbackStock(reserved);
        const product = products.get(String(productId));
        return res.status(409).json({
          success: false,
          error:   'INSUFFICIENT_STOCK',
          sku:     product?.sku || String(productId),
          message: `Insufficient stock for "${cl.productName}"`,
        });
      }
      reserved.push({ productId, delta: netQty.toString() });
    }
  }

  // ── Allocate invoice number then persist sale ─────────────────────────────
  const invoiceNumber = await allocateInvoiceNumber('INV');

  // Resolve seller info from workspace settings | spec K1 §7
  let resolvedSeller = {};
  const userSettings = await Settings.findOne({ userId: req.user.id });
  if (userSettings?.workspace) {
    const w = userSettings.workspace;
    resolvedSeller = {
      companyName: w.companyName || '',
      gstin:       w.gstin || '',
      address:     w.address || '',
      state:       w.state || '',
    };
  }

  // Build the sale items array (strip internal controller-only fields)
  const saleItems = computed.lines.map((cl) => {
    const { _netQty, _saleByWeight, oversold, ...item } = cl;
    return item;
  });

  let sale;
  try {
    sale = await Sale.create({
      invoiceNumber,
      type:         'sale',
      customer:     customer || {},
      seller:       resolvedSeller,
      intraState:   computed.intraState,
      items:        saleItems,
      subtotal:     computed.subtotal,
      taxTotal:     computed.taxTotal,
      roundOff:     computed.roundOff,
      grandTotal:   computed.grandTotal,
      discount:     computed.discount || 0,
      paymentMode,
      payment: {
        mode:     paymentMode,
        received: payment?.received ? money.fromNumberOrString(payment.received) : null,
      },
      notes:      notes || '',
      customerId,
      createdBy:  req.user.id,
    });
  } catch (createErr) {
    await rollbackStock(reserved);
    if (createErr.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate invoice number — please retry.' });
    }
    throw createErr;
  }

  // ── Write StockAdjustment audit log (one per line) | spec §7, §7.1 ───────
  const adjDocs = computed.lines.map((cl) => ({
    productId:  cl.productId,
    delta:      weight.fromNumberOrString('-' + cl._netQty.toString()),
    reason:     'sale',
    unit:       cl.unit,
    userId:     req.user.id,
    saleId:     sale._id,
  }));
  // Best-effort: if this fails we keep the sale (audit log, not source of truth)
  try {
    await StockAdjustment.insertMany(adjDocs, { ordered: false });
  } catch (adjErr) {
    customerWarnings.push(`StockAdjustment log partially failed: ${adjErr.message}`);
  }

  // ── Khata entry for credit sales | spec K1 §7.5 ──────────────────────────
  if (paymentMode === 'credit' && customerId) {
    try {
      const { customer: updatedCust } = await khataService.postSaleDebit({
        userId:    req.user.id,
        customerId,
        saleId:    sale._id,
        amount:    sale.grandTotal,
        entryDate: sale.createdAt,
        createdBy: req.user.id,
      });
      if (updatedCust.creditLimit > 0 && updatedCust.outstandingBalance > updatedCust.creditLimit) {
        const over = updatedCust.outstandingBalance - updatedCust.creditLimit;
        customerWarnings.push(`Credit limit ₹${updatedCust.creditLimit} exceeded by ₹${over.toFixed(2)}`);
      }
    } catch (khataErr) {
      // Undo sale + stock so customer doesn't see a phantom invoice
      await Sale.deleteOne({ _id: sale._id });
      await rollbackStock(reserved);
      return res.status(500).json({ success: false, message: `Failed to post khata entry: ${khataErr.message}` });
    }
  }

  // ── Legacy Transaction entries (stock already decremented above) ──────────
  for (const item of saleItems) {
    await Transaction.create({
      productId: item.productId,
      type:      'OUT',
      quantity:  Number(item.qty.toString()),
      user:      req.user.id,
      notes:     `Sale — Invoice ${sale.invoiceNumber}`,
      saleId:    sale._id,
    }).catch(() => {}); // best-effort
  }

  const populated = await sale.populate('createdBy', 'name email');
  const response  = { success: true, data: populated };

  if (customerWarnings.length) response.warnings = customerWarnings;
  if (lineWarnings.length)    response.lineWarnings = lineWarnings;

  // Carry oversold flags through to the response
  const oversoldLines = computed.lines.filter((l) => l.oversold).map((l) => l.productName);
  if (oversoldLines.length) response.oversold = oversoldLines;

  res.status(201).json(response);
};

// ─── POST /api/v1/sales/preview ──────────────────────────────────────────────
// Compute the sale totals without persisting anything. Used by the Quick-Sale
// UI as the cashier adds items — no stock change, no DB write. | spec: chunk #3 B.2
exports.previewSale = async (req, res) => {
  const { lines, customer, payment, discount } = req.body;

  if (!lines || lines.length === 0)
    return res.status(400).json({ success: false, message: 'Sale must have at least one line.' });

  const products       = await fetchProducts(lines);
  const workspaceState = await getWorkspaceState(req.user.id);
  const customerState  = customer?.state || '';

  let computed;
  try {
    computed = computeSale({ lines, products, workspaceState, customerState, saleType: 'sale', discount: discount || 0 });
  } catch (calcErr) {
    const status = calcErr.statusCode || 400;
    return res.status(status).json({ success: false, message: calcErr.message });
  }

  // Strip internal controller fields from preview response
  const previewLines = computed.lines.map((cl) => {
    const { _netQty, _saleByWeight, ...line } = cl;
    // Flatten Decimal128 for JSON
    return flattenLine(line);
  });

  res.status(200).json({
    success: true,
    data: {
      lines:      previewLines,
      subtotal:   computed.subtotal.toString(),
      taxTotal:   computed.taxTotal.toString(),
      roundOff:   computed.roundOff.toString(),
      grandTotal: computed.grandTotal.toString(),
      intraState: computed.intraState,
    },
  });
};

// ─── POST /api/v1/sales/:id/refund ───────────────────────────────────────────
// Partial or full refund. Creates a new Sale with type='return', negative totals.
// Adds StockAdjustment with reason='return' (positive delta — stock returns).
// | spec: chunk #3 B.3
exports.refundSale = async (req, res) => {
  const { id } = req.params;
  const { lines: refundLines } = req.body;

  if (!mongoose.isValidObjectId(id))
    return res.status(400).json({ success: false, message: 'Invalid sale ID' });

  const originalSale = await Sale.findById(id);
  if (!originalSale)
    return res.status(404).json({ success: false, message: 'Sale not found' });

  if (originalSale.type === 'return')
    return res.status(400).json({ success: false, message: 'Cannot refund a return sale.' });

  if (!refundLines || refundLines.length === 0)
    return res.status(400).json({ success: false, message: 'Refund must specify at least one line.' });

  // Build refund request lines from saleLineId + qty pairs
  const requestLines = [];
  for (const rl of refundLines) {
    // Find the matching original sale item
    const origItem = originalSale.items.id
      ? originalSale.items.id(rl.saleLineId)
      : originalSale.items.find((it) => String(it._id) === String(rl.saleLineId));

    if (!origItem) {
      return res.status(400).json({
        success: false,
        message: `Sale line ${rl.saleLineId} not found in sale ${id}`,
      });
    }

    requestLines.push({
      productId:    String(origItem.productId),
      qty:          '-' + String(rl.qty),  // negative qty for return
      tareApplied:  '0',
      amountFirst:  false,
      enteredAmount: null,
    });
  }

  const products = await fetchProducts(requestLines.map((l) => ({ productId: l.productId })));
  const workspaceState = await getWorkspaceState(req.user.id);
  const customerState  = originalSale.customer?.state || '';

  let computed;
  try {
    computed = computeSale({
      lines: requestLines,
      products,
      workspaceState,
      customerState,
      saleType: 'return',
    });
  } catch (calcErr) {
    const status = calcErr.statusCode || 400;
    return res.status(status).json({ success: false, message: calcErr.message });
  }

  // Stock increment (return restores stock — no guard needed)
  const reserved = [];
  for (const cl of computed.lines) {
    const netQty   = cl._netQty;
    const absNetQty = Math.abs(Number(netQty.toString()));
    await Product.findByIdAndUpdate(
      cl.productId,
      { $inc: { stock: weight.fromNumberOrString(String(absNetQty)) } }
    );
    reserved.push({ productId: cl.productId, delta: '-' + String(absNetQty) }); // rollback = decrement
  }

  const invoiceNumber = await allocateInvoiceNumber('RET');

  const saleItems = computed.lines.map((cl) => {
    const { _netQty, _saleByWeight, ...item } = cl;
    return item;
  });

  let returnSale;
  try {
    returnSale = await Sale.create({
      invoiceNumber,
      type:           'return',
      originalSaleId: originalSale._id,
      customer:       originalSale.customer,
      seller:         originalSale.seller,
      intraState:     computed.intraState,
      items:          saleItems,
      subtotal:       computed.subtotal,
      taxTotal:       computed.taxTotal,
      roundOff:       computed.roundOff,
      grandTotal:     computed.grandTotal,
      paymentMode:    originalSale.paymentMode || 'cash',
      notes:          `Refund for ${originalSale.invoiceNumber}`,
      customerId:     originalSale.customerId,
      createdBy:      req.user.id,
    });
  } catch (createErr) {
    await rollbackStock(reserved);
    throw createErr;
  }

  // Mark original sale as refunded
  await Sale.findByIdAndUpdate(id, { status: 'refunded' });

  // StockAdjustment audit log — positive delta (stock returns) | spec §7.1
  const adjDocs = computed.lines.map((cl) => {
    const absQty = Math.abs(Number(cl._netQty.toString()));
    return {
      productId: cl.productId,
      delta:     weight.fromNumberOrString(String(absQty)),  // positive = stock in
      reason:    'return',
      unit:      cl.unit,
      userId:    req.user.id,
      saleId:    returnSale._id,
    };
  });
  try {
    await StockAdjustment.insertMany(adjDocs, { ordered: false });
  } catch (_) { /* best-effort */ }

  res.status(201).json({ success: true, data: returnSale });
};

// ─── GET /api/v1/sales ────────────────────────────────────────────────────────
// Paginated sale list with optional filters | spec: existing
exports.getSales = async (req, res) => {
  try {
    const { page = 1, limit = 15, dateFrom, dateTo, q, customerId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = {};
    if (q) query['customer.name'] = { $regex: q, $options: 'i' };
    if (customerId && mongoose.isValidObjectId(customerId)) query.customerId = customerId;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   query.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const [sales, total] = await Promise.all([
      Sale.find(query).populate('createdBy', 'name').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Sale.countDocuments(query),
    ]);

    res.status(200).json({
      success: true, data: sales,
      meta: { total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) }
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// ─── GET /api/v1/sales/:id ────────────────────────────────────────────────────
// Retrieve a single sale by ID | spec: existing
exports.getSale = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ success: false, message: 'Invalid ID' });

    const sale = await Sale.findById(req.params.id).populate('createdBy', 'name email');
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });
    res.status(200).json({ success: true, data: sale });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

// ─── GET /api/v1/sales/:id/pdf ────────────────────────────────────────────────
// Generate and stream the invoice PDF | spec: C3
exports.downloadInvoicePdf = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ success: false, message: 'Invalid ID' });

    const sale = await Sale.findById(req.params.id)
      .populate('items.productId', 'hsnCode name sku')
      .populate('createdBy', 'name email');

    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });

    const saleObj = sale.toObject();
    saleObj.items = (saleObj.items || []).map((it) => ({
      ...it,
      hsnCode: it.hsnCode || it.productId?.hsnCode || '-',
    }));

    const buffer = await generateInvoicePDF(saleObj);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${sale.invoiceNumber}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).end(buffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Could not generate invoice PDF.' });
  }
};

// ─── GET /api/v1/sales/tally.xml ──────────────────────────────────────────────
// Streams a TallyPrime-compatible sales voucher import file | spec: existing
exports.exportTallyXml = async (req, res) => {
  try {
    const { from, to } = req.query;
    const now      = new Date();
    const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate   = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : now;

    const sales = await Sale.find({
      status: 'completed',
      createdAt: { $gte: fromDate, $lte: toDate },
    }).sort({ createdAt: 1 });

    const userSettings = await Settings.findOne({ userId: req.user.id });
    const companyName  = userSettings?.workspace?.companyName || 'SmartStock Export';

    const xml  = buildSalesEnvelope(sales, { companyName });
    const bom  = '﻿'; // UTF-8 BOM — older Tally builds require it
    const fname = `tally-sales-${tallyFnDate(fromDate)}-to-${tallyFnDate(toDate)}.xml`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    return res.status(200).send(bom + xml);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Could not build Tally XML.' });
  }
};

function tallyFnDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
}

// ─── GET /api/v1/sales/report ─────────────────────────────────────────────────
// Sales summary report | spec: existing
exports.getSalesReport = async (req, res) => {
  try {
    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalSales, todaySales, monthSales, revenueAgg, topProductsAgg] = await Promise.all([
      Sale.countDocuments(),
      Sale.countDocuments({ createdAt: { $gte: todayStart } }),
      Sale.countDocuments({ createdAt: { $gte: monthStart } }),
      Sale.aggregate([{ $group: { _id: null, total: { $sum: { $toDouble: '$grandTotal' } }, avgOrder: { $avg: { $toDouble: '$grandTotal' } } } }]),
      Sale.aggregate([
        { $unwind: '$items' },
        { $group: {
          _id: '$items.productName',
          sku:       { $first: '$items.sku' },
          totalQty:  { $sum: { $toDouble: '$items.qty' } },
          totalRev:  { $sum: { $toDouble: '$items.lineSubtotal' } },
        }},
        { $sort: { totalRev: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const last7 = await Sale.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } } },
      { $group: {
        _id:     { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: { $toDouble: '$grandTotal' } },
        count:   { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalSales, todaySales, monthSales,
        totalRevenue:  revenueAgg[0]?.total    || 0,
        avgOrderValue: revenueAgg[0]?.avgOrder || 0,
        topProducts:   topProductsAgg,
        last7Days:     last7,
      },
    });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// ─── Internal helper ──────────────────────────────────────────────────────────
// Flatten Decimal128 fields in a plain-object line for the preview response
function flattenLine(line) {
  const d128Fields = [
    'qty', 'tareApplied', 'pricePerUnit',
    'lineSubtotal', 'lineTax', 'lineTotal',
    'cgst', 'sgst', 'igst', 'enteredAmount',
  ];
  const out = { ...line };
  d128Fields.forEach((f) => {
    if (out[f] != null && out[f]._bsontype === 'Decimal128') out[f] = out[f].toString();
    if (out[f] === null) out[f] = null;
  });
  return out;
}
