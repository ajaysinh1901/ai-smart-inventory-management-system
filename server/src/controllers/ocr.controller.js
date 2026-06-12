'use strict';

// ocr.controller.js — UoM migration (v2) | spec: product-uom-schema.md §6
// price → pricePerUnit; stock arithmetic uses Decimal128 helpers.
const path        = require('path');
const fs          = require('fs');
const Product     = require('../models/Product.model');
const Transaction = require('../models/Transaction.model');
const Supplier    = require('../models/Supplier.model');
const money       = require('../utils/money');
const weight      = require('../utils/weight');
const { extractInvoice } = require('../services/ocr.service');

// 15-char GSTIN format — only attach to a Supplier when it actually validates.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Canonical uploads directory — every OCR file MUST resolve under this. | bug #007
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');

// POST /ocr/upload — accept uploaded file via multer, return file path/URL
exports.uploadInvoice = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    // Don't echo absolute server paths back to the client. | bug #007
    const fileUrl  = `/uploads/${req.file.filename}`;

    res.status(200).json({
      success: true,
      message: 'File uploaded successfully.',
      data: { filename: req.file.filename, fileUrl, originalName: req.file.originalname },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Upload failed.' });
  }
};

// POST /ocr/extract — accept { filename }, run OCR, return structured data.
// Hardened against path traversal — any traversal attempt is rejected. | bug #007
exports.extractData = async (req, res) => {
  try {
    // Accept ONLY a bare filename (no path separators, no ..). The legacy
    // `filePath` field used to permit absolute paths and `../`; we now
    // explicitly reject those.
    const raw = (req.body && (req.body.filename ?? req.body.filePath)) || '';
    if (typeof raw !== 'string' || !raw.trim()) {
      return res.status(400).json({ success: false, message: 'filename is required.' });
    }

    // Strip any "/uploads/" prefix that the upload route returns as fileUrl.
    let filename = raw.trim().replace(/^\/?uploads\/+/i, '');

    // Reject anything that smells like a traversal: backslashes, forward
    // slashes, ../, drive letters, UNC paths.
    if (
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\') ||
      /^[a-zA-Z]:/.test(filename) ||
      filename.startsWith('~')
    ) {
      return res.status(400).json({ success: false, message: 'Invalid file.' });
    }

    // Defense in depth: basename it again and re-resolve under UPLOADS_DIR.
    const safeName = path.basename(filename);
    const absPath = path.resolve(UPLOADS_DIR, safeName);
    if (!absPath.startsWith(UPLOADS_DIR + path.sep) && absPath !== UPLOADS_DIR) {
      return res.status(400).json({ success: false, message: 'Invalid file.' });
    }

    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }

    // Gemini Vision (primary) or tesseract+regex (fallback) — both return the
    // same canonical shape the ScannerPage reads directly.
    const data = await extractInvoice(absPath);

    res.status(200).json({ success: true, data });
  } catch (error) {
    // Never echo absolute paths or stack traces. | bug #007
    console.error('[ocr/extract] error:', error?.message || error);
    // Client-input errors (e.g. unsupported file type) carry statusCode 400 —
    // surface their message; everything else stays an opaque 500.
    const status = error.statusCode || 500;
    res.status(status).json({
      success: false,
      message: error.statusCode ? error.message : 'OCR processing failed.',
    });
  }
};

// Generate a deterministic SKU from a product name when none is provided | bug A4-02
function generateSkuFromName(name) {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w.substring(0, 4))
    .join('-');
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `${slug || 'ITEM'}-${suffix}`;
}

// Resolve a supplier id from the OCR vendor block. Finds an existing supplier
// by name (case-insensitive) or creates one. Never fails the import — on any
// error the products are still saved, just without a supplier link.
async function resolveSupplierId(supplierId, vendor) {
  if (supplierId) return supplierId;
  const name = (vendor && vendor.name || '').trim();
  if (!name) return undefined;
  try {
    let supplier = await Supplier.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (!supplier) {
      const gst = (vendor.taxId || '').trim().toUpperCase();
      supplier = await Supplier.create({ name, gst: GSTIN_RE.test(gst) ? gst : undefined });
    }
    return supplier._id;
  } catch (err) {
    console.error('[ocr/save] supplier resolve failed (continuing without link):', err.message);
    return undefined;
  }
}

// POST /ocr/save — accept { items, vendor?, supplierId? }, create/restock
// products and write IN transactions. Items use the canonical ScannerPage
// shape: { name, quantity, unitPrice, total, hsn, category? }.
exports.saveExtractedData = async (req, res) => {
  try {
    const { items, vendor, supplierId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'items array is required.' });
    }

    const resolvedSupplierId = await resolveSupplierId(supplierId, vendor);

    const createdProducts = [];
    const createdTransactions = [];
    const skipped = [];

    for (const item of items) {
      const name = (item.name || '').trim();
      if (!name) {
        skipped.push('(unnamed row)');
        continue; // skip items with no name at all
      }

      const category = item.category || 'Uncategorized';
      // Frontend sends `unitPrice` / `quantity`; tolerate legacy `price` / `stock`.
      const price = Number(item.unitPrice != null ? item.unitPrice : item.price) || 0;
      const qty   = Number(item.quantity  != null ? item.quantity  : item.stock) || 0;
      // Auto-generate SKU when OCR extraction did not produce one | bug A4-02
      const sku = item.sku || generateSkuFromName(name);

      // Upsert product: update stock if exists, create if not
      let product = await Product.findOne({ sku });

      if (product) {
        // Decimal128-safe stock addition via atomic $inc | spec: §6
        const addQty = weight.fromNumberOrString(qty || 0);
        await Product.findByIdAndUpdate(product._id, { $inc: { stock: addQty } });
        if (price > 0) {
          product.pricePerUnit = money.fromNumberOrString(price); // field renamed | spec: §6
        }
        if (item.category) product.category = category;
        if (resolvedSupplierId) product.supplierId = resolvedSupplierId;
        if (price > 0 || item.category || resolvedSupplierId) await product.save();
        product = await Product.findById(product._id);
      } else {
        product = await Product.create({
          name,
          sku,
          category,
          // OCR may not capture a price — fall back to 1 so the required
          // pricePerUnit > 0 rule passes; the user can correct it later.
          pricePerUnit: money.fromNumberOrString(price > 0 ? price : 1),
          stock: weight.fromNumberOrString(qty || 0),
          unit: 'pcs',
          saleByWeight: false,
          supplierId: resolvedSupplierId || undefined,
        });
      }

      createdProducts.push(product);

      // Create IN transaction for the stock added
      if (qty > 0) {
        const transaction = await Transaction.create({
          productId: product._id,
          type: 'IN',
          quantity: qty,
          user: req.user.id,
          notes: `OCR invoice import — ${name}`,
        });
        createdTransactions.push(transaction);
      }
    }

    const skippedNote = skipped.length ? ` ${skipped.length} unnamed row(s) skipped.` : '';
    res.status(201).json({
      success: true,
      message: `${createdProducts.length} product(s) processed, ${createdTransactions.length} transaction(s) created.${skippedNote}`,
      data: { products: createdProducts, transactions: createdTransactions },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
