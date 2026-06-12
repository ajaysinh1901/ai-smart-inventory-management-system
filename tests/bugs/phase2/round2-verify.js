'use strict';
/**
 * Round 2 verification — checks the 5 Round-2 fixes against a live backend.
 * Run: API_URL=http://localhost:5002/api/v1 node tests/bugs/phase2/round2-verify.js
 */
const path = require('path');
const { assert, setupAuth, axios } = require(path.join(__dirname, '..', '..', 'e2e', '_helpers'));
const API = process.env.API_URL || 'http://localhost:5002/api/v1';
const mongoose = require(path.join(__dirname, '..', '..', '..', 'server', 'node_modules', 'mongoose'));

(async () => {
  const { config, email } = await setupAuth();
  const tag = Date.now();

  // Test fixture: elevate the throwaway test account to 'manager' so it can
  // exercise the product/stock routes (B2 added admin/manager authorize guards).
  await mongoose.connect('mongodb://127.0.0.1:27017/MERNDB');
  await mongoose.connection.db.collection('users')
    .updateOne({ email }, { $set: { role: 'manager' } });
  await mongoose.disconnect();

  // ── NEW-01: gstRate survives the product validator ───────────────────────
  let prodId;
  try {
    const r = await axios.post(`${API}/products`, {
      name: `GST Test ${tag}`, sku: `GSTV-${tag}`, category: 'Test',
      price: 100, unit: 'pcs', stock: 50, gstRate: 18,
    }, config);
    prodId = r.data?.data?._id || r.data?.data?.product?._id || r.data?._id;
    const saved = r.data?.data?.gstRate ?? r.data?.data?.product?.gstRate;
    assert(saved === 18, 'NEW-01 product create persists gstRate=18', `got ${saved}`);
  } catch (e) {
    assert(false, 'NEW-01 product create persists gstRate=18', e.response?.data?.message || e.message);
  }
  // Re-read to be certain
  if (prodId) {
    const g = await axios.get(`${API}/products/${prodId}`, config);
    const rate = g.data?.data?.gstRate;
    assert(rate === 18, 'NEW-01 GET /products/:id returns gstRate=18', `got ${rate}`);
  }

  // ── NEW-01b: a sale of that product charges non-zero GST ─────────────────
  if (prodId) {
    try {
      const s = await axios.post(`${API}/sales`, {
        lines: [{ productId: prodId, qty: 2 }],
        payment: { mode: 'cash' },
      }, config);
      const d = s.data?.data || s.data;
      const item = (d.items || [])[0] || {};
      const tax = Number(item.cgst || 0) + Number(item.sgst || 0) + Number(item.igst || 0);
      assert(tax > 0, 'NEW-01b sale charges non-zero GST on 18% product', `tax=${tax}`);
    } catch (e) {
      assert(false, 'NEW-01b sale charges non-zero GST', e.response?.data?.message || e.message);
    }
  }

  // ── NEW-02: blank workspace state → intra (CGST/SGST), not IGST ──────────
  if (prodId) {
    try {
      const s = await axios.post(`${API}/sales`, {
        lines: [{ productId: prodId, qty: 1 }],
        customer: { name: `Cust ${tag}`, phone: `9${String(tag).slice(-9)}`, state: 'Maharashtra' },
        payment: { mode: 'cash' },
      }, config);
      const d = s.data?.data || s.data;
      const item = (d.items || [])[0] || {};
      const intra = Number(item.cgst || 0) > 0 && Number(item.sgst || 0) > 0;
      const igst = Number(item.igst || 0);
      assert(intra && igst === 0,
        'NEW-02 blank workspace state defaults to intra-state (CGST/SGST)',
        `cgst=${item.cgst} sgst=${item.sgst} igst=${igst}`);
    } catch (e) {
      assert(false, 'NEW-02 blank workspace state defaults to intra-state', e.response?.data?.message || e.message);
    }
  }

  // ── A4-02: two products with no barcode both save (no E11000) ────────────
  let okBoth = true, msg = '';
  for (let i = 1; i <= 2; i++) {
    try {
      await axios.post(`${API}/products`, {
        name: `NoBarcode ${tag}-${i}`, sku: `NB-${tag}-${i}`, category: 'Test',
        price: 10, unit: 'pcs', stock: 5,
      }, config);
    } catch (e) {
      okBoth = false; msg = e.response?.data?.message || e.message;
    }
  }
  assert(okBoth, 'A4-02 two barcode-less products save without duplicate-key error', msg);

  // ── A2-11/NEW-03: bad stock adjustment returns HTTP 400, not 500 ─────────
  if (prodId) {
    try {
      await axios.post(`${API}/stock-adjustments`, {
        productId: prodId, qtyChange: 1, reason: 'other', reasonDetail: 'ab', unit: 'pcs',
      }, config);
      assert(false, 'A2-11/NEW-03 bad adjustment rejected with 400', 'request unexpectedly succeeded');
    } catch (e) {
      const st = e.response?.status;
      assert(st === 400, 'A2-11/NEW-03 bad stock adjustment returns 400 (not 500)', `status=${st}`);
    }
  }

  // ── A4-09b: Alert model accepts type OVERSOLD ────────────────────────────
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/MERNDB');
    const Alert = require(path.join(__dirname, '..', '..', '..', 'server', 'src', 'models', 'Alert.model'));
    const a = new Alert({ type: 'OVERSOLD', message: 'verify oversold', severity: 'critical' });
    await a.validate();
    assert(true, 'A4-09b Alert model accepts type OVERSOLD');
    await mongoose.disconnect();
  } catch (e) {
    assert(false, 'A4-09b Alert model accepts type OVERSOLD', e.message);
    try { await mongoose.disconnect(); } catch (_) {}
  }

  console.log(process.exitCode ? '\n=== ROUND 2: FAILURES ABOVE ===' : '\n=== ROUND 2: ALL PASS ===');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
