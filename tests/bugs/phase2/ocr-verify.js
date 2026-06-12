'use strict';
/**
 * OCR module end-to-end verification.
 * Uploads a real invoice image, runs extract (Gemini Vision), then save.
 * Run: API_URL=http://localhost:5000/api/v1 node tests/bugs/phase2/ocr-verify.js
 */
const fs = require('fs');
const path = require('path');
const axios = require(path.join(__dirname, '..', '..', '..', 'server', 'node_modules', 'axios'));
const mongoose = require(path.join(__dirname, '..', '..', '..', 'server', 'node_modules', 'mongoose'));
const API = process.env.API_URL || 'http://localhost:5000/api/v1';
const IMG = path.join(__dirname, 'sample-invoice.png');

let fails = 0;
const ok = (cond, name, detail = '') => {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};

(async () => {
  // auth + elevate to manager (so /ocr/save can create products)
  const email = `ocr-${Date.now()}@smartstock.test`;
  const reg = await axios.post(`${API}/auth/register`, { email, password: 'Test@123456', name: 'OCR E2E' });
  const token = reg.data?.token || reg.data?.data?.token;
  const cfg = { headers: { Authorization: `Bearer ${token}` } };
  await mongoose.connect('mongodb://127.0.0.1:27017/MERNDB');
  await mongoose.connection.db.collection('users').updateOne({ email }, { $set: { role: 'manager' } });

  // ── 1. Upload ────────────────────────────────────────────────────────────
  const fd = new FormData();
  fd.append('invoice', new Blob([fs.readFileSync(IMG)], { type: 'image/png' }), 'sample-invoice.png');
  const up = await axios.post(`${API}/ocr/upload`, fd, cfg);
  const filename = up.data?.data?.filename;
  ok(!!filename, '1. invoice image uploads', `filename=${filename}`);

  // ── 2. Extract ───────────────────────────────────────────────────────────
  const ex = await axios.post(`${API}/ocr/extract`, { filename }, cfg);
  const d = ex.data?.data || {};
  console.log('\n   extract source:', d.source);
  console.log('   vendor:', JSON.stringify(d.vendor));
  console.log('   invoiceNumber:', d.invoiceNumber, '| date:', d.date);
  console.log('   items:', JSON.stringify(d.items));
  console.log('   subtotal:', d.subtotal, '| tax:', d.tax, '| total:', d.total, '\n');

  ok(d.vendor && typeof d.vendor === 'object', '2a. response has vendor object (not vendorName string)');
  ok(Array.isArray(d.items) && d.items.length > 0, '2b. line items extracted', `${d.items?.length} items`);
  if (d.items?.length) {
    const it = d.items[0];
    ok('unitPrice' in it, '2c. items use canonical field unitPrice');
    ok(it.unitPrice > 0, '2d. item unitPrice is non-zero', `unitPrice=${it.unitPrice}`);
  }
  ok(d.total > 0, '2e. grand total is non-zero', `total=${d.total}`);

  // Content checks — only meaningful when Gemini Vision ran
  if (d.source === 'gemini') {
    ok(/balaji/i.test(d.vendor.name || ''), '2f. Gemini read the vendor name', d.vendor.name);
    ok(d.vendor.taxId === '24ABCDE1234F1Z5', '2g. Gemini read the GSTIN', d.vendor.taxId);
    ok(d.items.length === 3, '2h. Gemini read all 3 line items', `${d.items.length}`);
    ok(Math.abs(d.total - 5397) <= 5, '2i. Gemini read the grand total ₹5397', `total=${d.total}`);
  } else {
    console.log('   ⚠️  source=ocr (tesseract fallback) — Gemini key absent or call failed; skipping content asserts');
  }

  // ── 3. Save to inventory ─────────────────────────────────────────────────
  const sv = await axios.post(`${API}/ocr/save`, { items: d.items, vendor: d.vendor }, cfg);
  const products = sv.data?.data?.products || [];
  ok(sv.status === 201 && products.length > 0, '3a. save creates products', sv.data?.message);

  if (products.length) {
    const p = products[0];
    const price = Number(p.pricePerUnit?.$numberDecimal ?? p.pricePerUnit);
    const stock = Number(p.stock?.$numberDecimal ?? p.stock);
    const srcItem = d.items[0];
    ok(price > 1 && Math.abs(price - srcItem.unitPrice) < 0.01,
      '3b. saved product price matches extracted unitPrice (not ₹1 stub)', `saved=${price} expected=${srcItem.unitPrice}`);
    ok(stock === srcItem.quantity,
      '3c. saved product stock matches extracted quantity (not 0)', `saved=${stock} expected=${srcItem.quantity}`);
    ok(!!p.supplierId, '3d. product linked to a supplier resolved from vendor', `supplierId=${p.supplierId}`);
  }

  await mongoose.disconnect();
  console.log(fails ? `\n=== OCR VERIFY: ${fails} FAILURE(S) ===` : '\n=== OCR VERIFY: ALL PASS ===');
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e.response?.status, e.response?.data?.message || e.message);
  process.exit(1);
});
