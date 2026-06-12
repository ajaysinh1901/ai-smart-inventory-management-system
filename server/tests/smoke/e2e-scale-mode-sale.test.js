'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const API = process.env.API_URL || 'http://localhost:5000/api/v1';
let axiosConfig = {};

async function setupAuth() {
  try {
    const loginRes = await axios.post(`${API}/auth/login`, {
      email: 'admin@smartstock.test',
      password: 'admin123',
    });
    if (loginRes.status === 200) {
      const token = loginRes.data?.data?.token;
      if (token) {
        axiosConfig = { headers: { Authorization: `Bearer ${token}` } };
        console.log('[setup] authenticated');
      }
    }
  } catch (e) {
    console.log('[setup] auth failed (tests may be skipped)');
  }
}

function assertPaise(actual, expected, label) {
  const a = parseFloat(actual).toFixed(2);
  const e = parseFloat(expected).toFixed(2);
  assert.equal(a, e, `${label}: expected ₹${e}, got ₹${a}`);
}

describe('Scale-mode sales - 10 fixture rows', () => {
  test('Row 1: Atta 250g @ 65/kg @ 5% intra', async () => {
    const res = await axios.post(`${API}/sales/preview`, {
      customer: null,
      items: [{ name: 'Atta', unit: 'kg', saleByWeight: true, qty: '0.250', rate: '65.00', gstRate: 5 }],
      gst: { isInterstate: false, cgstRate: 5, sgstRate: 5 },
    }, axiosConfig);
    assert.equal(res.status, 200);
    const line = res.data?.data?.items?.[0];
    assertPaise(line.lineSubtotal, '16.25', 'lineSubtotal');
    assertPaise(line.cgst, '0.41', 'cgst');
    assertPaise(line.sgst, '0.40', 'sgst');
    assertPaise(line.lineTotal, '17.06', 'lineTotal');
  });

  test('Row 2: Cold drink 500ml @ 40/L @ 12% intra', async () => {
    const res = await axios.post(`${API}/sales/preview`, {
      customer: null,
      items: [{ name: 'Drink', unit: 'l', saleByWeight: true, qty: '0.500', rate: '40.00', gstRate: 12 }],
      gst: { isInterstate: false, cgstRate: 12, sgstRate: 12 },
    }, axiosConfig);
    const line = res.data?.data?.items?.[0];
    assertPaise(line.lineSubtotal, '20.00', 'lineSubtotal');
    assertPaise(line.cgst, '1.20', 'cgst');
    assertPaise(line.sgst, '1.20', 'sgst');
    assertPaise(line.lineTotal, '22.40', 'lineTotal');
  });

  test('Row 3: Notebooks 2 dozen @ 120/dozen @ 18% inter', async () => {
    const res = await axios.post(`${API}/sales/preview`, {
      customer: null,
      items: [{ name: 'Notebooks', unit: 'dozen', saleByWeight: false, qty: '2', rate: '120.00', gstRate: 18 }],
      gst: { isInterstate: true, igstRate: 18 },
    }, axiosConfig);
    const line = res.data?.data?.items?.[0];
    assertPaise(line.lineSubtotal, '240.00', 'lineSubtotal');
    assertPaise(line.igst, '43.20', 'igst');
    assertPaise(line.cgst, '0.00', 'cgst');
    assertPaise(line.lineTotal, '283.20', 'lineTotal');
  });

  test('Row 4: Toothpaste 1 pcs @ 95 @ 18% intra', async () => {
    const res = await axios.post(`${API}/sales/preview`, {
      customer: null,
      items: [{ name: 'Toothpaste', unit: 'pcs', saleByWeight: false, qty: '1', rate: '95.00', gstRate: 18 }],
      gst: { isInterstate: false, cgstRate: 18, sgstRate: 18 },
    }, axiosConfig);
    const line = res.data?.data?.items?.[0];
    assertPaise(line.lineSubtotal, '95.00', 'lineSubtotal');
    assertPaise(line.cgst, '8.55', 'cgst');
    assertPaise(line.sgst, '8.55', 'sgst');
    assertPaise(line.lineTotal, '112.10', 'lineTotal');
  });

  test('Row 5: Sugar 1.337 kg @ 49.50/kg @ 5% intra', async () => {
    const res = await axios.post(`${API}/sales/preview`, {
      customer: null,
      items: [{ name: 'Sugar', unit: 'kg', saleByWeight: true, qty: '1.337', rate: '49.50', gstRate: 5 }],
      gst: { isInterstate: false, cgstRate: 5, sgstRate: 5 },
    }, axiosConfig);
    const line = res.data?.data?.items?.[0];
    assertPaise(line.lineSubtotal, '66.18', 'lineSubtotal');
    assertPaise(line.cgst, '1.66', 'cgst');
    assertPaise(line.sgst, '1.65', 'sgst');
    assertPaise(line.lineTotal, '69.49', 'lineTotal');
  });

  test('Row 6: Amount-first 500 dal @ 125/kg @ 0%', async () => {
    const res = await axios.post(`${API}/sales/preview`, {
      customer: null,
      items: [{ name: 'Dal', unit: 'kg', saleByWeight: true, amountFirst: true, enteredAmount: '500', rate: '125.00', gstRate: 0 }],
      gst: { isInterstate: false, cgstRate: 0, sgstRate: 0 },
    }, axiosConfig);
    const line = res.data?.data?.items?.[0];
    const qtyNum = parseFloat(line.qty).toFixed(3);
    assert.equal(qtyNum, '4.000', `qty: expected 4.000, got ${qtyNum}`);
    assertPaise(line.lineSubtotal, '500.00', 'lineSubtotal');
    assertPaise(line.lineTotal, '500.00', 'lineTotal');
  });

  test('Row 7: Amount-first 50 rice @ 65/kg @ 5% intra', async () => {
    const res = await axios.post(`${API}/sales/preview`, {
      customer: null,
      items: [{ name: 'Rice', unit: 'kg', saleByWeight: true, amountFirst: true, enteredAmount: '50', rate: '65.00', gstRate: 5 }],
      gst: { isInterstate: false, cgstRate: 5, sgstRate: 5 },
    }, axiosConfig);
    const line = res.data?.data?.items?.[0];
    const qtyNum = parseFloat(line.qty).toFixed(3);
    assert.equal(qtyNum, '0.770', `qty: expected 0.770, got ${qtyNum}`);
    assertPaise(line.lineSubtotal, '50.05', 'lineSubtotal');
    assertPaise(line.lineTotal, '52.55', 'lineTotal');
  });

  test('Row 8: Return -0.5 kg paneer @ 520/kg @ 5%', async () => {
    const res = await axios.post(`${API}/sales/preview`, {
      customer: null,
      items: [{ name: 'Paneer', unit: 'kg', saleByWeight: true, qty: '-0.500', rate: '520.00', gstRate: 5 }],
      gst: { isInterstate: false, cgstRate: 5, sgstRate: 5 },
    }, axiosConfig);
    const line = res.data?.data?.items?.[0];
    assertPaise(line.lineSubtotal, '-260.00', 'lineSubtotal');
    assertPaise(line.cgst, '-6.50', 'cgst');
    assertPaise(line.sgst, '-6.50', 'sgst');
    assertPaise(line.lineTotal, '-273.00', 'lineTotal');
  });

  test('Bonus: Tare case - 1.0 kg gross, 0.020 kg tare @ 520/kg', async () => {
    const res = await axios.post(`${API}/sales/preview`, {
      customer: null,
      items: [{ name: 'Paneer', unit: 'kg', saleByWeight: true, qty: '1.000', tareWeight: '0.020', rate: '520.00', gstRate: 5 }],
      gst: { isInterstate: false, cgstRate: 5, sgstRate: 5 },
    }, axiosConfig);
    const line = res.data?.data?.items?.[0];
    assertPaise(line.lineSubtotal, '509.60', 'lineSubtotal (0.980 * 520)');
    assertPaise(line.lineTotal, '535.08', 'lineTotal');
  });
});
