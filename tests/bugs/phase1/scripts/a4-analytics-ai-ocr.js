'use strict';

/**
 * A4 QA Test Suite — Analytics, AI Insights, OCR/Scanner, Reports, Alerts
 * Runs against live API at http://localhost:5000/api/v1
 *
 * Usage:
 *   node tests/bugs/phase1/scripts/a4-analytics-ai-ocr.js
 *
 * Requires:
 *   - Servers running on localhost:5000
 *   - A registered test account (auto-registers if missing)
 */

const http = require('http');

const BASE = 'http://localhost:5000/api/v1';
let TOKEN = '';
let ADMIN_TOKEN = '';
const TEST_EMAIL = 'a4qa_' + Date.now() + '@test.com';
const TEST_PASS = 'TestPass123!';

// ── helpers ─────────────────────────────────────────────────────────────────

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail) {
  if (condition) {
    console.log('  PASS:', label);
    passed++;
  } else {
    console.log('  FAIL:', label, '|', detail || '');
    failed++;
    failures.push({ label, detail });
  }
}

// ── setup ────────────────────────────────────────────────────────────────────

async function setup() {
  console.log('\n=== SETUP ===');

  // Register fresh account
  const reg = await request('POST', '/auth/register', {
    name: 'A4 QA Tester',
    email: TEST_EMAIL,
    password: TEST_PASS,
    businessName: 'A4 QA Store',
    gstin: '27AAPFU0939F1ZV',
  });
  assert('register fresh account', reg.status === 201 || reg.status === 200, JSON.stringify(reg.body).slice(0, 120));

  // Login
  const login = await request('POST', '/auth/login', { email: TEST_EMAIL, password: TEST_PASS });
  assert('login succeeds', login.status === 200, JSON.stringify(login.body).slice(0, 120));
  TOKEN = login.body?.data?.token || login.body?.token || '';
  assert('token received', TOKEN.length > 10, 'token=' + TOKEN.slice(0, 20));
}

// ── ANALYTICS TESTS ──────────────────────────────────────────────────────────

async function testAnalytics() {
  console.log('\n=== ANALYTICS ===');

  // A4-BUG-01: Dashboard stats on empty DB
  const dash = await request('GET', '/analytics/dashboard', null, TOKEN);
  assert('[A4-BUG-01] dashboard returns 200 on empty DB', dash.status === 200, 'status=' + dash.status);
  if (dash.status === 200) {
    const d = dash.body?.data;
    assert('[A4-BUG-01] revenue is a plain number not Decimal128 object',
      typeof d?.todayRevenue === 'number' || d?.todayRevenue === null || d?.todayRevenue === 0,
      'type=' + typeof d?.todayRevenue + ' val=' + JSON.stringify(d?.todayRevenue).slice(0, 60));
    assert('[A4-BUG-01] no crash when stock/revenue is zero', d !== undefined, 'data is undefined');
  }

  // A4-BUG-02: Inventory report stockHealth double-count
  const inv = await request('GET', '/analytics/inventory', null, TOKEN);
  assert('[A4-BUG-02] inventory report returns 200', inv.status === 200, 'status=' + inv.status);
  if (inv.status === 200) {
    const sh = inv.body?.data?.stockHealth;
    if (sh) {
      const sum = (sh.healthy || 0) + (sh.low || 0) + (sh.outOfStock || 0);
      assert('[A4-BUG-02] stockHealth total == totalProducts (no double-count)',
        sh.total === undefined || Math.abs(sum - (inv.body?.data?.totalProducts || sum)) < 2,
        'healthy=' + sh.healthy + ' low=' + sh.low + ' outOfStock=' + sh.outOfStock + ' total=' + sh.total + ' totalProducts=' + inv.body?.data?.totalProducts);
    }
    // Check Decimal128 objects
    const topItems = inv.body?.data?.topByStockValue || [];
    if (topItems.length > 0) {
      const sv = topItems[0].stockValue;
      assert('[A4-BUG-03] topByStockValue.stockValue is plain number not Decimal128 object',
        typeof sv === 'number' || typeof sv === 'string',
        'type=' + typeof sv + ' val=' + JSON.stringify(sv).slice(0, 60));
    }
    const byCat = inv.body?.data?.stockByCategory || [];
    if (byCat.length > 0) {
      const tv = byCat[0].totalValue;
      assert('[A4-BUG-03] stockByCategory.totalValue is plain number not Decimal128 object',
        typeof tv === 'number' || typeof tv === 'string',
        'type=' + typeof tv + ' val=' + JSON.stringify(tv).slice(0, 60));
    }
  }
}

// ── AI INSIGHTS TESTS ────────────────────────────────────────────────────────

async function testAiInsights() {
  console.log('\n=== AI INSIGHTS ===');

  // A4-BUG-04: getTrends returns -100% because $sum:'$total' is virtual
  const trends = await request('GET', '/ai/trends', null, TOKEN);
  assert('[A4-BUG-04] ai/trends returns 200', trends.status === 200, 'status=' + trends.status);
  if (trends.status === 200) {
    const weeks = trends.body?.data?.weeklyTrends || [];
    if (weeks.length >= 2) {
      const hasMinusHundred = weeks.some(w => w.growth <= -99 && w.revenue === 0 && w.count > 0);
      assert('[A4-BUG-04] no week shows 0 revenue with nonzero order count (virtual field bug)',
        !hasMinusHundred,
        'weeks with 0 revenue but >0 orders: ' + JSON.stringify(weeks.filter(w => w.revenue === 0 && w.count > 0)));
    }
  }

  // A4-BUG-05: predictDemand missing productId → should be 400, not 500
  const pd = await request('POST', '/ai/predict-demand', {}, TOKEN);
  assert('[A4-BUG-05] predict-demand without productId returns 400 not 500',
    pd.status === 400,
    'status=' + pd.status + ' body=' + JSON.stringify(pd.body).slice(0, 80));

  // A4-BUG-06: predictDemand with invalid ObjectId → should be 400/404, not 500 Mongoose leak
  const pdInvalid = await request('POST', '/ai/predict-demand', { productId: 'NOT_AN_OBJECTID' }, TOKEN);
  assert('[A4-BUG-06] predict-demand with invalid ObjectId returns 400/404 not 500',
    pdInvalid.status === 400 || pdInvalid.status === 404,
    'status=' + pdInvalid.status + ' body=' + JSON.stringify(pdInvalid.body).slice(0, 120));
  if (pdInvalid.status === 500) {
    assert('[A4-BUG-06] 500 does not leak Mongoose internals (CastError)',
      !JSON.stringify(pdInvalid.body).includes('CastError'),
      JSON.stringify(pdInvalid.body).slice(0, 200));
  }

  // A4-BUG-07: getReorderSuggestion with invalid ObjectId → should not leak Mongoose
  const rs = await request('GET', '/ai/reorder-suggestion/NOT_VALID_ID', null, TOKEN);
  assert('[A4-BUG-07] reorder-suggestion invalid ObjectId returns 400/404 not 500',
    rs.status === 400 || rs.status === 404,
    'status=' + rs.status + ' body=' + JSON.stringify(rs.body).slice(0, 120));

  // A4-BUG-08: AI chat empty message → should be 400
  const chatEmpty = await request('POST', '/ai/chat', { message: '' }, TOKEN);
  assert('[A4-BUG-08] ai/chat with empty string rejects with 400',
    chatEmpty.status === 400,
    'status=' + chatEmpty.status);

  const chatBlank = await request('POST', '/ai/chat', { message: '   ' }, TOKEN);
  assert('[A4-BUG-08] ai/chat with whitespace-only rejects with 400',
    chatBlank.status === 400,
    'status=' + chatBlank.status);

  // A4-BUG-08b: AI chat rate limit (send 21+ requests)
  console.log('  [rate-limit] sending 21 rapid chat requests...');
  let rateLimitTripped = false;
  for (let i = 0; i < 21; i++) {
    const r = await request('POST', '/ai/chat', { message: 'ping ' + i }, TOKEN);
    if (r.status === 429) { rateLimitTripped = true; break; }
  }
  assert('[A4-BUG-08b] ai/chat rate limiter trips at 20 req/min',
    rateLimitTripped,
    'sent 21 requests, none returned 429');
}

// ── OCR TESTS ────────────────────────────────────────────────────────────────

async function testOcr() {
  console.log('\n=== OCR / SCANNER ===');

  // A4-BUG-09: saveExtractedData crashes ("next is not a function")
  // Test with minimal valid payload as documented
  const savePayload = {
    vendor: 'Test Vendor',
    invoiceNumber: 'INV-TEST-001',
    items: [
      { name: 'Test Product', quantity: 5, price: 100, total: 500 }
    ]
  };
  const save = await request('POST', '/ocr/save', savePayload, TOKEN);
  assert('[A4-BUG-09] ocr/save does not crash (not 500)',
    save.status !== 500,
    'status=' + save.status + ' body=' + JSON.stringify(save.body).slice(0, 200));

  // A4-BUG-09b: lineItems field name mismatch (client sends items, server sends lineItems from extract)
  const saveWithLineItems = {
    vendor: 'Test Vendor 2',
    invoiceNumber: 'INV-TEST-002',
    lineItems: [
      { name: 'Widget A', quantity: 10, price: 50, total: 500 }
    ]
  };
  const save2 = await request('POST', '/ocr/save', saveWithLineItems, TOKEN);
  assert('[A4-BUG-09b] ocr/save with lineItems key (from OCR extract) accepted',
    save2.status !== 500,
    'status=' + save2.status + ' body=' + JSON.stringify(save2.body).slice(0, 200));

  // A4-BUG-10: OCR extract endpoint — verify response key is items or lineItems
  // Can't test file upload without multipart, but verify endpoint exists
  const extractNoFile = await request('POST', '/ocr/extract', {}, TOKEN);
  assert('[A4-BUG-10] ocr/extract without file returns 400 not 500',
    extractNoFile.status === 400,
    'status=' + extractNoFile.status + ' body=' + JSON.stringify(extractNoFile.body).slice(0, 120));
}

// ── REPORTS TESTS ────────────────────────────────────────────────────────────

async function testReports() {
  console.log('\n=== REPORTS ===');

  // A4-BUG-11: Shrinkage report with invalid date → should be 400 not 500 Mongoose leak
  const shrinkBad = await request('GET', '/reports/shrinkage?startDate=not-a-date&endDate=also-bad', null, TOKEN);
  assert('[A4-BUG-11] shrinkage with invalid date returns 400 not 500',
    shrinkBad.status === 400,
    'status=' + shrinkBad.status + ' body=' + JSON.stringify(shrinkBad.body).slice(0, 200));
  if (shrinkBad.status === 500) {
    assert('[A4-BUG-11] 500 does not leak Cast error internals',
      !JSON.stringify(shrinkBad.body).includes('CastError') && !JSON.stringify(shrinkBad.body).includes('Cast to date'),
      JSON.stringify(shrinkBad.body).slice(0, 200));
  }

  // A4-BUG-11b: Shrinkage report with missing dates → graceful response
  const shrinkNoDates = await request('GET', '/reports/shrinkage', null, TOKEN);
  assert('[A4-BUG-11b] shrinkage without date params returns 200 or 400 (not 500)',
    shrinkNoDates.status !== 500,
    'status=' + shrinkNoDates.status);

  // A4-BUG-12: Sales report totalRevenue should be plain number
  const salesRep = await request('GET', '/reports/sales?period=last7days', null, TOKEN);
  assert('[A4-BUG-12] sales report returns 200', salesRep.status === 200, 'status=' + salesRep.status);
  if (salesRep.status === 200) {
    const rev = salesRep.body?.data?.totalRevenue;
    assert('[A4-BUG-12] totalRevenue is plain number not Decimal128 object',
      typeof rev === 'number' || rev === null || rev === undefined,
      'type=' + typeof rev + ' val=' + JSON.stringify(rev).slice(0, 60));

    const gst = salesRep.body?.data?.gstThisMonth ?? salesRep.body?.data?.taxAmountThisMonth;
    assert('[A4-BUG-12b] sales report includes gstThisMonth or taxAmountThisMonth field',
      gst !== undefined,
      'keys=' + Object.keys(salesRep.body?.data || {}).join(','));
  }

  // Reorder report
  const reorder = await request('GET', '/reports/reorder', null, TOKEN);
  assert('[reports] reorder report returns 200', reorder.status === 200, 'status=' + reorder.status);
}

// ── ALERTS TESTS ─────────────────────────────────────────────────────────────

async function testAlerts() {
  console.log('\n=== ALERTS ===');

  // List alerts — should work without error
  const list = await request('GET', '/alerts', null, TOKEN);
  assert('[alerts] list alerts returns 200', list.status === 200, 'status=' + list.status);

  // Alert count
  const count = await request('GET', '/alerts/count', null, TOKEN);
  assert('[alerts] alert count returns 200', count.status === 200, 'status=' + count.status);

  // A4-BUG-13: smartAlerts cron uses severity:'high'/'medium' not in enum
  // Indirect test — create a sale that would trigger low stock alert, then check if alert persists
  // We can't directly test the cron, but we can verify the Alert model accepts only enum values
  // by checking that existing alerts (if any) have valid severity
  if (list.status === 200) {
    const alerts = list.body?.data || [];
    const validSeverities = ['critical', 'warning', 'info'];
    const badAlerts = alerts.filter(a => !validSeverities.includes(a.severity));
    assert('[A4-BUG-13] all existing alerts have valid severity enum values',
      badAlerts.length === 0,
      'invalid alerts: ' + JSON.stringify(badAlerts).slice(0, 200));
  }

  // Dismiss an alert that doesn't exist — should be 404 not 500
  const dismiss = await request('PUT', '/alerts/000000000000000000000001/dismiss', null, TOKEN);
  assert('[alerts] dismiss non-existent alert returns 404 not 500',
    dismiss.status === 404 || dismiss.status === 400,
    'status=' + dismiss.status + ' body=' + JSON.stringify(dismiss.body).slice(0, 120));
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('A4 QA Test Suite — Analytics / AI / OCR / Reports / Alerts');
  console.log('Target:', BASE);
  console.log('Time:', new Date().toISOString());

  try {
    await setup();
    await testAnalytics();
    await testAiInsights();
    await testOcr();
    await testReports();
    await testAlerts();
  } catch (err) {
    console.error('\nFATAL ERROR:', err.message);
    failed++;
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('RESULTS: passed=' + passed + '  failed=' + failed);
  if (failures.length > 0) {
    console.log('\nFAILED CASES:');
    failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f.label + ' — ' + f.detail));
  }
  console.log('═══════════════════════════════════════════\n');
}

main().catch(console.error);
