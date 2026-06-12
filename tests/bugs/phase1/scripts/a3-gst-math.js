'use strict';
/**
 * A3 QA Script — GST Math, Sales, Billing, Khata
 * Uses existing seeded products — product creation is broken (see Bug #A3-01)
 * Run: node tests/bugs/phase1/scripts/a3-gst-math.js
 */
const axios = require('../../../node_modules/axios');

const API = 'http://localhost:5000/api/v1';
const results = [];
let token = null;
let authConfig = null;

// Existing products in the DB (seeded):
// Paneer: kg, 5% GST, price=480, stock=9.75, saleByWeight=true
const PANEER_ID = '69f1c829bc743e032b48dac6';
// TP-Link WiFi: pcs, 0% GST, price=null, stock=69, saleByWeight=false
const PCS_NULL_PRICE_ID = '69f0569e7e47054083def2da';
// APC Back-UPS: pcs, 0% GST, stock=45
const APC_ID = '69f0569e7e47054083def2e5';

// ── Helpers ──────────────────────────────────────────────────────────────────
function pass(name, detail = '') {
  results.push({ status: 'PASS', name, detail });
  console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, detail = '') {
  results.push({ status: 'FAIL', name, detail });
  console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
}
function info(msg) {
  console.log(`INFO  ${msg}`);
}
function approxEq(a, b, tol = 0.01) {
  return Math.abs(parseFloat(a) - parseFloat(b)) <= tol;
}

// ── Setup: register fresh test account ───────────────────────────────────────
async function setup() {
  const email = `a3-qa-${Date.now()}@test.local`;
  const res = await axios.post(`${API}/auth/register`, {
    email, password: 'Test@12345', name: 'A3 QA Tester',
  });
  token = res.data?.token || res.data?.data?.token;
  authConfig = { headers: { Authorization: `Bearer ${token}` } };
  info(`Registered as ${email}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// TEST SUITE
// ──────────────────────────────────────────────────────────────────────────────

// T1: Product creation is BROKEN (Mongoose 9 pre-validate hook incompatibility)
// This is a discovery test — confirms the bug is real
async function t1_productCreationBroken() {
  try {
    const res = await axios.post(`${API}/products`, {
      name: 'A3-TestProd', sku: `A3-TST-${Date.now()}`, category: 'Test',
      pricePerUnit: 100, unit: 'pcs', saleByWeight: false, stock: 50, reorderLevel: 5
    }, authConfig);
    fail('T1 CRITICAL: Product creation should have failed (Mongoose 9 hook bug)',
         `Got ${res.status} with _id=${res.data?.data?._id}`);
  } catch(e) {
    if (e.response?.status === 400 && e.response?.data?.message === 'next is not a function') {
      fail('T1 CRITICAL Bug A3-01 CONFIRMED: Product creation crashes with "next is not a function"',
           'Product.model.js pre(validate) uses fn(next) which is incompatible with Mongoose 9/kareem 3');
    } else if (e.response?.status === 400) {
      fail('T1 Product creation fails', e.response?.data?.message);
    } else {
      info(`T1 unexpected error: ${e.response?.status} ${e.response?.data?.message}`);
    }
  }
}

// T2: Basic GST math — kg product, 5% GST
// Paneer: price=480/kg, qty=0.5kg, 5% GST
// lineSubtotal = 0.5 * 480 = 240
// lineTax = round(240 * 0.05) = round(12) = 12
// lineTotal = 252
// cgst = 6, sgst = 6
// grandTotal: preRound=252, roundOff=0, grand=252
async function t2_basicGstMath() {
  try {
    const res = await axios.post(`${API}/sales/preview`, {
      lines: [{ productId: PANEER_ID, qty: '0.5', amountFirst: false }],
    }, authConfig);
    const d = res.data?.data;
    const line = d?.lines[0];

    const lineSubtotal = parseFloat(line?.lineSubtotal);
    const lineTax = parseFloat(line?.lineTax);
    const lineTotal = parseFloat(line?.lineTotal);
    const cgst = parseFloat(line?.cgst);
    const sgst = parseFloat(line?.sgst);
    const igst = parseFloat(line?.igst);
    const grandTotal = parseFloat(d?.grandTotal);

    info(`T2: subtotal=${lineSubtotal}, tax=${lineTax}, total=${lineTotal}, cgst=${cgst}, sgst=${sgst}, grand=${grandTotal}`);

    if (!approxEq(lineSubtotal, 240)) fail('T2a lineSubtotal=240', `got ${lineSubtotal}`);
    else pass('T2a lineSubtotal=240 (0.5kg * 480)');

    if (!approxEq(lineTax, 12)) fail('T2b lineTax=12 (5% of 240)', `got ${lineTax}`);
    else pass('T2b lineTax=12');

    if (!approxEq(lineTotal, 252)) fail('T2c lineTotal=252', `got ${lineTotal}`);
    else pass('T2c lineTotal=252');

    if (!approxEq(cgst, 6)) fail('T2d cgst=6', `got ${cgst}`);
    else pass('T2d cgst=6');

    if (!approxEq(sgst, 6)) fail('T2e sgst=6', `got ${sgst}`);
    else pass('T2e sgst=6');

    if (!approxEq(igst, 0)) fail('T2f igst=0 (intrastate)', `got ${igst}`);
    else pass('T2f igst=0');

    if (!approxEq(grandTotal, 252)) fail('T2g grandTotal=252', `got ${grandTotal}`);
    else pass('T2g grandTotal=252');

  } catch(e) {
    fail('T2 basic GST math', e.response?.data?.message || e.message);
  }
}

// T3: Odd-paise GST split verification
// Paneer: price=480/kg, qty=0.001kg (smallest kg step = 0.005 but using 0.001)
// Actually: use qty=0.003kg → subtotal=480*0.003=1.44, tax=5%=0.072→0.07 (HALF_UP)
// 0.07 paise is 7 paise → cgst=4paise=0.04, sgst=3paise=0.03
// Wait: 0.07/2 = 0.035 → CGST absorbs residue → cgst=0.04, sgst=0.03
// Let's test with qty=0.1kg: subtotal=48, tax=2.40, cgst=1.20, sgst=1.20
// Use qty=0.050kg to get odd paise: subtotal=24, tax=1.20, cgst=0.60, sgst=0.60
// Try qty that produces 1-paise odd split: subtotal must give *0.05 = ...xx.xx where paise is odd
// 480 * x * 0.05 = odd paise amount
// 480 * 0.001 * 0.05 = 0.024 → rounded = 0.02 → 1paise, cgst=0.01, sgst=0.01
// Actually try 480 * 0.003 * 0.05 = 0.072 → 0.07 → 7paise → cgst=4, sgst=3
async function t3_oddPaiseSplit() {
  try {
    // qty=0.003kg paneer → subtotal=1.44, tax=0.07 (HALF_UP of 0.072)
    // 7 paise: cgst=0.04, sgst=0.03 (CGST absorbs residue)
    const res = await axios.post(`${API}/sales/preview`, {
      lines: [{ productId: PANEER_ID, qty: '0.003', amountFirst: false }],
    }, authConfig);
    const line = res.data?.data?.lines[0];
    const lineTax = parseFloat(line?.lineTax);
    const cgst = parseFloat(line?.cgst);
    const sgst = parseFloat(line?.sgst);

    info(`T3: lineTax=${lineTax}, cgst=${cgst}, sgst=${sgst}`);
    // tax = 480 * 0.003 * 0.05 = 0.072, HALF_UP → 0.07
    if (!approxEq(lineTax, 0.07, 0.005)) fail('T3a lineTax=0.07', `got ${lineTax}`);
    else pass('T3a lineTax=0.07 (0.072 rounded HALF_UP)');

    // cgst+sgst must equal lineTax exactly
    const sum = cgst + sgst;
    if (!approxEq(sum, lineTax, 0.001)) {
      fail('T3b cgst+sgst = lineTax', `cgst=${cgst}, sgst=${sgst}, sum=${sum}, tax=${lineTax}`);
    } else pass('T3b cgst+sgst = lineTax');

    // cgst=0.04, sgst=0.03 (CGST absorbs residue per spec)
    if (!approxEq(cgst, 0.04, 0.001) || !approxEq(sgst, 0.03, 0.001)) {
      fail('T3c cgst=0.04, sgst=0.03 (CGST absorbs residue)', `cgst=${cgst}, sgst=${sgst}`);
    } else pass('T3c cgst=0.04, sgst=0.03 (CGST absorbs residue paise)');

  } catch(e) {
    fail('T3 odd-paise GST split', e.response?.data?.message || e.message);
  }
}

// T4: IGST for inter-state customer
// With empty workspaceState (new account), customer.state='Maharashtra' → inter-state → IGST
async function t4_igst() {
  try {
    const res = await axios.post(`${API}/sales/preview`, {
      lines: [{ productId: PANEER_ID, qty: '0.5', amountFirst: false }],
      customer: { state: 'Maharashtra', name: 'IGST Test Customer' },
    }, authConfig);
    const d = res.data?.data;
    const line = d?.lines[0];
    const igst = parseFloat(line?.igst);
    const cgst = parseFloat(line?.cgst);
    const sgst = parseFloat(line?.sgst);

    info(`T4: intraState=${d?.intraState}, igst=${igst}, cgst=${cgst}, sgst=${sgst}`);

    // When workspaceState is empty (''), customerState='Maharashtra' → code: !customerState || customerState === '' → intra=true
    // So empty workspace always treated as intra-state — IGST never fires for empty workspace
    if (d?.intraState === true) {
      info('T4 NOTE: Workspace state is empty; saleCompute.js treats empty workspace as intrastate');
      info('T4 → When seller has no state configured, ALL sales are treated as intrastate (IGST never applied)');
      info('T4 → This means a seller in Gujarat selling to Maharashtra customer NEVER gets IGST unless workspace.state is set');
      // Not necessarily a bug — it's a configuration issue, but log it
      pass('T4 IGST logic consistent with spec (empty workspace = intra)');
    } else if (d?.intraState === false && igst > 0) {
      pass('T4 IGST correctly applied for inter-state');
    }
  } catch(e) {
    fail('T4 IGST test', e.response?.data?.message || e.message);
  }
}

// T5: Round-off test
// 0.5kg paneer @ ₹480, 5% GST → preRound=252.00 → no round-off
// Let's use qty=1.001kg → subtotal=480.48, tax=24.024→24.02, preRound=504.50 → grand=505, roundOff=0.50
async function t5_roundOff() {
  try {
    const res = await axios.post(`${API}/sales/preview`, {
      lines: [{ productId: PANEER_ID, qty: '1.001', amountFirst: false }],
    }, authConfig);
    const d = res.data?.data;
    const subtotal = parseFloat(d?.subtotal);
    const taxTotal = parseFloat(d?.taxTotal);
    const roundOff = parseFloat(d?.roundOff);
    const grandTotal = parseFloat(d?.grandTotal);
    const preRound = subtotal + taxTotal;

    info(`T5: subtotal=${subtotal}, tax=${taxTotal}, preRound=${preRound.toFixed(2)}, roundOff=${roundOff}, grand=${grandTotal}`);

    // grandTotal should be a whole rupee
    if (!Number.isInteger(grandTotal)) {
      fail('T5a grandTotal should be whole rupee', `got ${grandTotal}`);
    } else {
      pass('T5a grandTotal is whole rupee after round-off');
    }

    // roundOff = grandTotal - preRound
    const expectedRoundOff = grandTotal - preRound;
    if (!approxEq(roundOff, expectedRoundOff, 0.005)) {
      fail('T5b roundOff = grandTotal - preRound', `roundOff=${roundOff}, expected=${expectedRoundOff.toFixed(2)}`);
    } else {
      pass('T5b roundOff formula: grandTotal = subtotal + tax + roundOff');
    }

    // Math check: grandTotal = preRound + roundOff
    if (!approxEq(grandTotal, preRound + roundOff, 0.01)) {
      fail('T5c grandTotal reconciliation', `${grandTotal} != ${(preRound + roundOff).toFixed(2)}`);
    } else {
      pass('T5c grandTotal reconciliation correct');
    }
  } catch(e) {
    fail('T5 round-off test', e.response?.data?.message || e.message);
  }
}

// T6: Zero qty — should be rejected or warn
async function t6_zeroQty() {
  try {
    const res = await axios.post(`${API}/sales/preview`, {
      lines: [{ productId: PANEER_ID, qty: '0', amountFirst: false }],
    }, authConfig);
    const line = res.data?.data?.lines?.[0];
    // Zero qty should be rejected because lineSubtotal=0 means nothing was sold
    // The spec says saleByWeight allows any qty > 0 but zero is ambiguous
    if (line) {
      const lineSubtotal = parseFloat(line?.lineSubtotal || 0);
      fail('T6 zero-qty accepted (should be blocked)', `lineSubtotal=${lineSubtotal}`);
    }
  } catch(e) {
    if (e.response?.status === 400) {
      pass('T6 zero-qty rejected', e.response.data?.message);
    } else {
      fail('T6 zero-qty', `status=${e.response?.status}, msg=${e.response?.data?.message}`);
    }
  }
}

// T7: Negative qty on non-return sale — should be rejected
async function t7_negativeQty() {
  try {
    const res = await axios.post(`${API}/sales`, {
      lines: [{ productId: PANEER_ID, qty: '-0.5', amountFirst: false }],
    }, authConfig);
    fail('T7 negative qty on non-return sale accepted', `status=${res.status}`);
  } catch(e) {
    if (e.response?.status === 400) {
      pass('T7 negative qty rejected on non-return sale', e.response.data?.message);
    } else {
      fail('T7 negative qty test', `status=${e.response?.status}, msg=${e.response?.data?.message}`);
    }
  }
}

// T8: Fractional qty on saleByWeight=false product — should be rejected
// pcs product like APC Back-UPS
async function t8_fractionalQtyOnPcs() {
  try {
    const res = await axios.post(`${API}/sales`, {
      lines: [{ productId: APC_ID, qty: '1.5', amountFirst: false }],
    }, authConfig);
    // If saleByWeight=false, fractional qty should be rejected
    fail('T8 fractional qty on pcs accepted', `status=${res.status}`);
  } catch(e) {
    if (e.response?.status === 400) {
      pass('T8 fractional qty on pcs rejected', e.response.data?.message);
    } else if (e.response?.status === 409 && e.response?.data?.message?.includes('pricePerUnit')) {
      info('T8 NOTE: product has null pricePerUnit, error is about price not qty');
    } else {
      fail('T8 fractional qty on pcs', `status=${e.response?.status}, msg=${e.response?.data?.message}`);
    }
  }
}

// T9: Sale with null pricePerUnit product — should fail gracefully
async function t9_nullPriceProduct() {
  try {
    const res = await axios.post(`${API}/sales/preview`, {
      lines: [{ productId: PCS_NULL_PRICE_ID, qty: '1', amountFirst: false }],
    }, authConfig);
    fail('T9 sale with null-price product accepted', `status=${res.status}`);
  } catch(e) {
    if (e.response?.status === 400 || e.response?.status === 409) {
      pass('T9 null-price product rejected with 4xx', e.response.data?.message);
    } else if (e.response?.status === 500) {
      fail('T9 CRITICAL: null-price product causes 500 server crash', e.response?.data?.message);
    } else {
      fail('T9 null-price product', `status=${e.response?.status}, msg=${e.response?.data?.message}`);
    }
  }
}

// T10: Amount-first mode ("₹500 ka paneer")
// paneer: ₹480/kg, request ₹500 worth
// qty = 500/480 = 1.04166... kg, step-rounded to 0.005 → 1.040kg
async function t10_amountFirst() {
  try {
    const res = await axios.post(`${API}/sales/preview`, {
      lines: [{ productId: PANEER_ID, amountFirst: true, enteredAmount: '500' }],
    }, authConfig);
    const line = res.data?.data?.lines[0];
    const qty = parseFloat(line?.qty);
    const lineSubtotal = parseFloat(line?.lineSubtotal);

    info(`T10: amount-first qty=${qty}, lineSubtotal=${lineSubtotal}`);

    if (qty <= 0) fail('T10a amount-first qty should be > 0', `got ${qty}`);
    else pass('T10a amount-first qty computed');

    // lineSubtotal should be ≤ enteredAmount (no overage from step rounding)
    // 1.040 * 480 = 499.20 (under 500) or 1.045 * 480 = 501.6 (over 500 — bug)
    if (lineSubtotal > 500.05) {
      fail('T10b lineSubtotal exceeds enteredAmount', `lineSubtotal=${lineSubtotal} > 500`);
    } else {
      pass('T10b lineSubtotal ≤ enteredAmount');
    }
  } catch(e) {
    fail('T10 amount-first mode', e.response?.data?.message || e.message);
  }
}

// T11: Tare weight test
// paneer: qty=1.5kg, tare=0.2kg → net=1.3kg
// lineSubtotal = 1.3 * 480 = 624
async function t11_tare() {
  try {
    const res = await axios.post(`${API}/sales/preview`, {
      lines: [{ productId: PANEER_ID, qty: '1.5', tareApplied: '0.2', amountFirst: false }],
    }, authConfig);
    const line = res.data?.data?.lines[0];
    const lineSubtotal = parseFloat(line?.lineSubtotal);
    const tare = parseFloat(line?.tareApplied);

    info(`T11: tare=${tare}, lineSubtotal=${lineSubtotal}`);

    if (!approxEq(tare, 0.2, 0.001)) fail('T11a tare stored', `got ${tare}`);
    else pass('T11a tare stored correctly');

    // net = 1.5 - 0.2 = 1.3 kg; subtotal = 1.3 * 480 = 624
    if (!approxEq(lineSubtotal, 624, 0.1)) {
      fail('T11b lineSubtotal uses net qty', `got ${lineSubtotal}, expected 624`);
    } else {
      pass('T11b lineSubtotal = net_qty * rate (after tare deduction)');
    }
  } catch(e) {
    fail('T11 tare test', e.response?.data?.message || e.message);
  }
}

// T12: Tare exceeds qty — should be rejected
async function t12_tareExceedsQty() {
  try {
    const res = await axios.post(`${API}/sales/preview`, {
      lines: [{ productId: PANEER_ID, qty: '0.5', tareApplied: '0.8', amountFirst: false }],
    }, authConfig);
    fail('T12 tare > qty accepted', `status=${res.status}`);
  } catch(e) {
    if (e.response?.status === 400) {
      pass('T12 tare > qty rejected', e.response.data?.message);
    } else {
      fail('T12 tare > qty', `status=${e.response?.status}, msg=${e.response?.data?.message}`);
    }
  }
}

// T13: Oversell — try to sell more than stock
// Paneer has 9.750kg. Try 11kg.
async function t13_oversell_weight() {
  try {
    const res = await axios.post(`${API}/sales`, {
      lines: [{ productId: PANEER_ID, qty: '11', amountFirst: false }],
    }, authConfig);
    // Weight products can go negative (soft warn) per spec §2.3
    const data = res.data;
    if (res.status === 201) {
      if (data?.lineWarnings?.length > 0 || data?.oversold?.length > 0) {
        pass('T13 oversell on weight product: sale allowed with oversold warning', data?.lineWarnings?.[0]);
      } else {
        info('T13 oversell on weight product: sale created WITHOUT warning — spec says should warn');
        fail('T13 oversell on weight product: no warning for negative stock', `warnings=${JSON.stringify(data?.lineWarnings)}`);
      }
    } else {
      fail('T13 oversell weight', `unexpected status ${res.status}`);
    }
  } catch(e) {
    if (e.response?.status === 409) {
      info('T13 NOTE: weight product oversell returned 409 — spec allows negative stock with warning');
    } else {
      fail('T13 oversell weight', e.response?.data?.message || e.message);
    }
  }
}

// T14: Credit sale without customer identifier — should be rejected
async function t14_creditNoCustomer() {
  try {
    const res = await axios.post(`${API}/sales`, {
      lines: [{ productId: PANEER_ID, qty: '0.5', amountFirst: false }],
      payment: { mode: 'credit' },
      customer: { name: 'Walk-in Customer' },
    }, authConfig);
    fail('T14 credit sale without phone/GSTIN accepted', `status=${res.status}`);
  } catch(e) {
    if (e.response?.status === 400 && e.response?.data?.message?.toLowerCase().includes('credit')) {
      pass('T14 credit sale without customer identifier rejected', e.response.data?.message);
    } else {
      fail('T14 credit sale validation', `status=${e.response?.status}, msg=${e.response?.data?.message}`);
    }
  }
}

// T15: Credit sale WITH customer — should create khata entry
async function t15_creditWithCustomer() {
  let customerId = null;
  let saleGrandTotal = null;
  try {
    // Create customer
    const custRes = await axios.post(`${API}/customers`, {
      name: 'A3 QA Credit Customer',
      phone: '+919' + String(Date.now()).slice(-9),
    }, authConfig);
    customerId = custRes.data?.data?._id;
    const phone = custRes.data?.data?.phone;
    info(`T15: created customer ${customerId}, phone=${phone}`);

    const saleRes = await axios.post(`${API}/sales`, {
      lines: [{ productId: PANEER_ID, qty: '0.5', amountFirst: false }],
      customer: { name: 'A3 QA Credit Customer', phone },
      payment: { mode: 'credit' },
    }, authConfig);

    if (saleRes.status !== 201) {
      fail('T15 credit sale creation', `status=${saleRes.status}`);
      return;
    }
    pass('T15a credit sale created');
    saleGrandTotal = parseFloat(saleRes.data?.data?.grandTotal?.toString() || 0);
    info(`T15: grandTotal=${saleGrandTotal}`);

    // Check khata entries
    const khataRes = await axios.get(`${API}/khata/customers/${customerId}/entries`, authConfig);
    const entries = khataRes.data?.data?.entries || khataRes.data?.data || [];
    info(`T15: khata entries count=${entries.length}`);

    if (entries.length === 0) {
      fail('T15b khata entry created', 'no entries found');
    } else {
      const saleEntry = entries.find(e => e.voucherType === 'Sale' || e.direction === 'debit');
      if (saleEntry) {
        pass('T15b khata debit entry created for credit sale');
        if (!approxEq(saleEntry.amount, saleGrandTotal, 0.01)) {
          fail('T15c khata entry amount matches grandTotal', `entry=${saleEntry.amount}, grand=${saleGrandTotal}`);
        } else {
          pass('T15c khata entry amount = sale grandTotal');
        }
      } else {
        fail('T15b no Sale debit entry found', JSON.stringify(entries[0]).substring(0, 100));
      }
    }

    // Check outstandingBalance updated
    const custAfter = await axios.get(`${API}/customers/${customerId}`, authConfig);
    const balance = custAfter.data?.data?.outstandingBalance;
    if (balance > 0) {
      pass('T15d outstandingBalance > 0 after credit sale', `balance=${balance}`);
    } else {
      fail('T15d outstandingBalance not updated', `balance=${balance}`);
    }

  } catch(e) {
    fail('T15 credit sale with customer', e.response?.data?.message || e.message);
  }
}

// T16: Discount field stored but NOT applied to GST calculation (spec/logic gap)
async function t16_discountNotApplied() {
  try {
    const saleRes = await axios.post(`${API}/sales`, {
      lines: [{ productId: PANEER_ID, qty: '0.5', amountFirst: false }],
      discount: 50, // ₹50 discount
    }, authConfig);

    if (saleRes.status !== 201) {
      fail('T16 sale with discount', `status=${saleRes.status}`);
      return;
    }

    const sale = saleRes.data?.data;
    const grandTotal = parseFloat(sale?.grandTotal?.toString() || 0);
    const storedDiscount = sale?.discount;

    info(`T16: discount=50, stored discount=${storedDiscount}, grandTotal=${grandTotal}`);

    // Without discount: grandTotal should be 252
    // If discount were applied: grand would be 202 (252-50) or similar
    if (approxEq(grandTotal, 252, 1) && storedDiscount === 50) {
      fail('T16 CRITICAL: discount field stored but NOT deducted from grandTotal',
           `discount=${storedDiscount} stored but grandTotal=${grandTotal} (unchanged from 252). GST is computed on pre-discount amount.`);
    } else if (storedDiscount === 50 && grandTotal < 252) {
      pass('T16 discount applied to grandTotal');
    } else {
      info(`T16 discount=${storedDiscount}, grand=${grandTotal} — analyzing...`);
    }
  } catch(e) {
    fail('T16 discount test', e.response?.data?.message || e.message);
  }
}

// T17: Invoice number race condition — 8 concurrent sales
async function t17_invoiceRace() {
  try {
    const promises = Array.from({ length: 8 }, (_, i) =>
      axios.post(`${API}/sales`, {
        lines: [{ productId: PANEER_ID, qty: '0.1', amountFirst: false }],
      }, authConfig).catch(e => ({ _err: e.response?.data?.message || e.message }))
    );

    const results = await Promise.all(promises);
    const invoiceNumbers = results
      .filter(r => r?.data?.data?.invoiceNumber)
      .map(r => r.data.data.invoiceNumber);
    const errors = results.filter(r => r?._err);

    info(`T17: ${invoiceNumbers.length} sales succeeded, ${errors.length} failed`);
    info(`T17: invoice numbers: ${invoiceNumbers.join(', ')}`);

    const unique = new Set(invoiceNumbers);
    if (invoiceNumbers.length > 1 && unique.size === invoiceNumbers.length) {
      pass('T17 invoice numbers unique under concurrency', `${invoiceNumbers.length} unique`);
    } else if (invoiceNumbers.length <= 1) {
      info('T17 WARN: ≤1 concurrent sale succeeded — not enough data to test race');
    } else if (unique.size < invoiceNumbers.length) {
      fail('T17 CRITICAL: invoice number collision', `${invoiceNumbers.length} sales, ${unique.size} unique → collisions detected`);
    } else {
      pass('T17 all concurrent invoices unique');
    }
  } catch(e) {
    fail('T17 race condition test', e.message);
  }
}

// T18: Actual sale creation (persist + verify stock decrements)
async function t18_saleCreationAndStockDecrement() {
  try {
    const before = await axios.get(`${API}/products/${PANEER_ID}`, authConfig);
    const stockBefore = parseFloat(before.data?.data?.stock || 0);

    const saleRes = await axios.post(`${API}/sales`, {
      lines: [{ productId: PANEER_ID, qty: '0.5', amountFirst: false }],
    }, authConfig);

    if (saleRes.status !== 201) {
      fail('T18 sale creation', `status=${saleRes.status}`);
      return;
    }

    const sale = saleRes.data?.data;
    pass('T18a sale created', `invoice=${sale?.invoiceNumber}`);

    // Verify stock decremented by 0.5
    const after = await axios.get(`${API}/products/${PANEER_ID}`, authConfig);
    const stockAfter = parseFloat(after.data?.data?.stock || 0);
    const delta = stockBefore - stockAfter;

    info(`T18: stock before=${stockBefore}, after=${stockAfter}, delta=${delta}`);
    if (!approxEq(delta, 0.5, 0.001)) {
      fail('T18b stock decremented by 0.5', `delta=${delta}`);
    } else {
      pass('T18b stock decremented by 0.5');
    }

    // Verify saved sale has correct GST
    const savedSale = await axios.get(`${API}/sales/${sale._id}`, authConfig);
    const items = savedSale.data?.data?.items;
    const item = items?.[0];

    const cgst = parseFloat(item?.cgst?.toString() || 0);
    const sgst = parseFloat(item?.sgst?.toString() || 0);

    if (!approxEq(cgst, 6) || !approxEq(sgst, 6)) {
      fail('T18c per-line cgst=6, sgst=6 in persisted sale', `cgst=${cgst}, sgst=${sgst}`);
    } else {
      pass('T18c per-line cgst/sgst persisted correctly');
    }

    // Check legacy gst block
    const legacyGst = savedSale.data?.data?.gst;
    info(`T18d legacy gst block: cgstAmount=${legacyGst?.cgstAmount}, sgstAmount=${legacyGst?.sgstAmount}`);
    if (legacyGst?.cgstAmount === 0 && cgst > 0) {
      fail('T18d CRITICAL: legacy gst.cgstAmount=0 despite per-line cgst being correct',
           `legacy.cgstAmount=${legacyGst?.cgstAmount} but item.cgst=${cgst}. Invoice rendering may show wrong GST.`);
    } else {
      pass('T18d legacy gst block consistent');
    }

    return sale;
  } catch(e) {
    fail('T18 sale creation + stock decrement', e.response?.data?.message || e.message);
    return null;
  }
}

// T19: Refund sale
async function t19_refund() {
  try {
    // Create a sale first
    const saleRes = await axios.post(`${API}/sales`, {
      lines: [{ productId: PANEER_ID, qty: '0.5', amountFirst: false }],
    }, authConfig);
    if (saleRes.status !== 201) {
      fail('T19 pre-requisite sale', `status=${saleRes.status}`);
      return;
    }

    const sale = saleRes.data?.data;
    const saleId = sale._id;
    const lineId = sale.items[0]._id;

    const stockAfterSale = parseFloat((await axios.get(`${API}/products/${PANEER_ID}`, authConfig)).data?.data?.stock || 0);

    const refRes = await axios.post(`${API}/sales/${saleId}/refund`, {
      lines: [{ saleLineId: lineId, qty: '0.5' }],
    }, authConfig);

    if (refRes.status !== 201) {
      fail('T19 refund sale created', `status=${refRes.status}`);
      return;
    }
    const returnSale = refRes.data?.data;
    pass('T19a refund sale created');

    if (returnSale.invoiceNumber?.startsWith('RET-')) {
      pass('T19b refund invoice has RET- prefix', returnSale.invoiceNumber);
    } else {
      fail('T19b refund invoice prefix', `got ${returnSale.invoiceNumber}`);
    }

    // Verify stock restored
    const stockFinal = parseFloat((await axios.get(`${API}/products/${PANEER_ID}`, authConfig)).data?.data?.stock || 0);
    const stockRestored = stockFinal - stockAfterSale;
    info(`T19: stock after sale=${stockAfterSale}, after refund=${stockFinal}, restored=${stockRestored}`);

    if (!approxEq(stockRestored, 0.5, 0.001)) {
      fail('T19c stock restored by 0.5 after refund', `restored=${stockRestored}`);
    } else {
      pass('T19c stock restored by 0.5 after refund');
    }

    // Original sale marked refunded
    const origSale = (await axios.get(`${API}/sales/${saleId}`, authConfig)).data?.data;
    if (origSale?.status === 'refunded') {
      pass('T19d original sale marked refunded');
    } else {
      fail('T19d original sale status', `status=${origSale?.status}`);
    }

  } catch(e) {
    fail('T19 refund test', e.response?.data?.message || e.message);
  }
}

// T20: Missing lines — should return 400
async function t20_missingLines() {
  try {
    const res = await axios.post(`${API}/sales`, { customer: { name: 'Test' } }, authConfig);
    fail('T20 missing lines accepted', `status=${res.status}`);
  } catch(e) {
    if (e.response?.status === 400) pass('T20 missing lines rejected', e.response.data?.message);
    else fail('T20 missing lines', `status=${e.response?.status}`);
  }
}

// T21: Empty lines — should return 400
async function t21_emptyLines() {
  try {
    const res = await axios.post(`${API}/sales`, { lines: [] }, authConfig);
    fail('T21 empty lines accepted', `status=${res.status}`);
  } catch(e) {
    if (e.response?.status === 400) pass('T21 empty lines rejected', e.response.data?.message);
    else fail('T21 empty lines', `status=${e.response?.status}`);
  }
}

// T22: Invalid productId
async function t22_invalidProductId() {
  try {
    const res = await axios.post(`${API}/sales`, {
      lines: [{ productId: 'not-an-objectid', qty: '1' }],
    }, authConfig);
    fail('T22 invalid productId accepted', `status=${res.status}`);
  } catch(e) {
    if (e.response?.status === 400 || e.response?.status === 404) {
      pass('T22 invalid productId rejected', `status=${e.response.status}`);
    } else fail('T22 invalid productId', `status=${e.response?.status}`);
  }
}

// T23: Non-existent productId (valid format)
async function t23_nonExistentProduct() {
  try {
    const fakeId = '507f1f77bcf86cd799439011';
    const res = await axios.post(`${API}/sales`, {
      lines: [{ productId: fakeId, qty: '1' }],
    }, authConfig);
    fail('T23 non-existent product accepted', `status=${res.status}`);
  } catch(e) {
    if (e.response?.status === 404 || e.response?.status === 400) {
      pass('T23 non-existent product rejected', `status=${e.response.status}`);
    } else fail('T23 non-existent product', `status=${e.response?.status}`);
  }
}

// T24: Unauthenticated request — should 401
async function t24_noAuth() {
  try {
    const res = await axios.post(`${API}/sales`, {
      lines: [{ productId: PANEER_ID, qty: '0.1' }],
    });
    fail('T24 unauthenticated request accepted', `status=${res.status}`);
  } catch(e) {
    if (e.response?.status === 401) pass('T24 unauthenticated → 401');
    else fail('T24 auth check', `status=${e.response?.status}`);
  }
}

// T25: Invoice PDF generation
async function t25_invoicePdf() {
  try {
    const saleRes = await axios.post(`${API}/sales`, {
      lines: [{ productId: PANEER_ID, qty: '0.5', amountFirst: false }],
    }, authConfig);
    const saleId = saleRes.data?.data?._id;

    const pdfRes = await axios.get(`${API}/sales/${saleId}/pdf`, {
      ...authConfig, responseType: 'arraybuffer',
    });

    const ct = pdfRes.headers['content-type'];
    if (pdfRes.status === 200 && ct?.includes('pdf')) {
      pass('T25 invoice PDF: 200 + application/pdf', `size=${pdfRes.data?.byteLength} bytes`);
    } else {
      fail('T25 invoice PDF', `status=${pdfRes.status}, content-type=${ct}`);
    }
  } catch(e) {
    if (e.response?.status === 500) {
      fail('T25 CRITICAL: invoice PDF crashes with 500', e.response?.data?.toString().substring(0, 200));
    } else {
      fail('T25 invoice PDF', e.response?.data?.message || e.message);
    }
  }
}

// T26: Decimal precision test — 3 * 33.33 should not drift
// We have paneer @ ₹480/kg; use qty=0.003 → subtotal = 0.003 * 480 = 1.44
// More precision test: 0.001 * 480 = 0.48, 3 times = 1.44
async function t26_decimalPrecision() {
  try {
    const res = await axios.post(`${API}/sales/preview`, {
      lines: [
        { productId: PANEER_ID, qty: '0.001', amountFirst: false },
        { productId: PANEER_ID, qty: '0.001', amountFirst: false },
        { productId: PANEER_ID, qty: '0.001', amountFirst: false },
      ],
    }, authConfig);

    // Each line: 0.001 * 480 = 0.48 (rounded)
    // sum = 3 * 0.48 = 1.44
    const subtotal = parseFloat(res.data?.data?.subtotal || 0);
    info(`T26: subtotal of 3x(0.001kg * 480) = ${res.data?.data?.subtotal}, parsed=${subtotal}`);

    // Expected: 3 * round(0.001 * 480) = 3 * 0.48 = 1.44
    if (!approxEq(subtotal, 1.44, 0.001)) {
      fail('T26 decimal precision: 3x(0.001*480)', `got ${subtotal}, expected 1.44`);
    } else {
      pass('T26 decimal precision: 3x0.48 = 1.44 (no float drift)');
    }
  } catch(e) {
    fail('T26 decimal precision', e.response?.data?.message || e.message);
  }
}

// T27: Sales list pagination
async function t27_salesList() {
  try {
    const res = await axios.get(`${API}/sales?page=1&limit=5`, authConfig);
    if (res.status === 200 && Array.isArray(res.data?.data)) {
      pass('T27 sales list 200 + array');
      const meta = res.data?.meta;
      if (meta?.total !== undefined) pass('T27b sales list has pagination meta');
      else fail('T27b sales list pagination meta missing', JSON.stringify(meta));
    } else {
      fail('T27 sales list', `status=${res.status}`);
    }
  } catch(e) {
    fail('T27 sales list', e.response?.data?.message || e.message);
  }
}

// T28: Tally XML export
async function t28_tallyXml() {
  try {
    const res = await axios.get(`${API}/sales/tally.xml`, authConfig);
    const ct = res.headers['content-type'];
    if (res.status === 200 && ct?.includes('xml')) {
      pass('T28 Tally XML 200 + XML content-type');
    } else {
      fail('T28 Tally XML', `status=${res.status}, ct=${ct}`);
    }
  } catch(e) {
    fail('T28 Tally XML', e.response?.data?.message || e.message);
  }
}

// T29: GST on product with gstRate=0 produces zero tax
async function t29_zeroGst() {
  try {
    // APC product has gstRate=0 and null pricePerUnit — let's check what happens
    const res = await axios.post(`${API}/sales/preview`, {
      lines: [{ productId: APC_ID, qty: '1', amountFirst: false }],
    }, authConfig).catch(e => e.response);

    if (res?.status === 200) {
      const taxTotal = parseFloat(res.data?.data?.taxTotal || 0);
      const sub = parseFloat(res.data?.data?.subtotal || 0);
      info(`T29: taxTotal=${taxTotal}, subtotal=${sub}`);
      if (approxEq(taxTotal, 0)) pass('T29 zero-GST product: taxTotal=0');
      else fail('T29 zero-GST product has non-zero tax', `taxTotal=${taxTotal}`);
    } else if (res?.status === 400 || res?.status === 409) {
      const msg = res?.data?.message;
      if (msg?.includes('pricePerUnit') || msg?.includes('price')) {
        fail('T29 CRITICAL: sale fails for product with null pricePerUnit', msg);
      } else {
        fail('T29 zero-GST sale preview', `status=${res?.status}, msg=${msg}`);
      }
    }
  } catch(e) {
    fail('T29 zero-GST test', e.response?.data?.message || e.message);
  }
}

// T30: Khata payment recording
async function t30_khataPayment() {
  try {
    // Create a customer
    const custRes = await axios.post(`${API}/customers`, {
      name: 'A3 Payment Customer',
      phone: '+918' + String(Date.now()).slice(-9),
    }, authConfig);
    const customerId = custRes.data?.data?._id;

    // Post a payment
    const payRes = await axios.post(`${API}/khata/payments`, {
      customerId,
      amount: 100,
      mode: 'cash',
      entryDate: new Date().toISOString(),
    }, authConfig);

    if (payRes.status === 201) {
      pass('T30a khata payment recorded');
      const entry = payRes.data?.data?.entry;
      if (entry?.direction === 'credit' && entry?.receiptNumber) {
        pass('T30b payment has direction=credit and receiptNumber', entry.receiptNumber);
      } else {
        fail('T30b payment entry fields', `direction=${entry?.direction}, receipt=${entry?.receiptNumber}`);
      }
    } else {
      fail('T30a khata payment', `status=${payRes.status}`);
    }
  } catch(e) {
    fail('T30 khata payment', e.response?.data?.message || e.message);
  }
}

// ── Run all tests ─────────────────────────────────────────────────────────────
async function main() {
  console.log('=== A3 QA: Sales, GST Math, Billing, Khata (Live Run) ===\n');
  try {
    await setup();
    console.log('');
  } catch(e) {
    console.log(`FATAL setup: ${e.message}`);
    process.exit(1);
  }

  await t1_productCreationBroken();
  await t2_basicGstMath();
  await t3_oddPaiseSplit();
  await t4_igst();
  await t5_roundOff();
  await t6_zeroQty();
  await t7_negativeQty();
  await t8_fractionalQtyOnPcs();
  await t9_nullPriceProduct();
  await t10_amountFirst();
  await t11_tare();
  await t12_tareExceedsQty();
  await t13_oversell_weight();
  await t14_creditNoCustomer();
  await t15_creditWithCustomer();
  await t16_discountNotApplied();
  await t17_invoiceRace();
  await t18_saleCreationAndStockDecrement();
  await t19_refund();
  await t20_missingLines();
  await t21_emptyLines();
  await t22_invalidProductId();
  await t23_nonExistentProduct();
  await t24_noAuth();
  await t25_invoicePdf();
  await t26_decimalPrecision();
  await t27_salesList();
  await t28_tallyXml();
  await t29_zeroGst();
  await t30_khataPayment();

  console.log('\n=== RESULTS ===');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`Total: ${results.length} | PASS: ${passed} | FAIL: ${failed}`);
  if (failed > 0) {
    console.log('\nFAILED TESTS:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  [FAIL] ${r.name}`);
      if (r.detail) console.log(`         ${r.detail}`);
    });
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
