'use strict';

/**
 * A2 QA Test Suite — Products, Inventory, Suppliers
 * Runs against live API at http://localhost:5000/api/v1
 */

const http = require('http');
const https = require('https');

const BASE = 'http://localhost:5000/api/v1';
let TOKEN = '';
let testUser = null;
let createdProductId = null;
let createdSupplierId = null;

const results = { passed: 0, failed: 0, bugs: [] };

// ── HTTP helper ──────────────────────────────────────────────────────────────
function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Test runner ──────────────────────────────────────────────────────────────
function pass(name) {
  results.passed++;
  console.log(`  PASS  ${name}`);
}

function fail(name, detail) {
  results.failed++;
  results.bugs.push({ name, detail });
  console.log(`  FAIL  ${name}`);
  console.log(`        ${detail}`);
}

function check(name, condition, detail) {
  if (condition) pass(name);
  else fail(name, detail);
}

// ── Setup auth ───────────────────────────────────────────────────────────────
async function setup() {
  console.log('\n=== SETUP: Register fresh admin user ===');
  const email = `qa-a2-${Date.now()}@test.com`;
  const reg = await request('POST', '/auth/register', {
    name: 'QA Tester A2',
    email,
    password: 'Test@12345',
  });
  if (reg.status === 201 && reg.body.token) {
    TOKEN = reg.body.token;
    testUser = reg.body.data;
    console.log(`  Registered as: ${email}, role: ${testUser?.role}`);
    console.log(`  Token: ${TOKEN.slice(0, 30)}...`);
  } else {
    console.log('  FATAL: Could not register user', reg.status, reg.body);
    process.exit(1);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 1: Product CRUD — happy paths
// ────────────────────────────────────────────────────────────────────────────
async function testProductHappyPath() {
  console.log('\n=== SECTION 1: Product CRUD — Happy Paths ===');

  // Create valid product
  const r = await request('POST', '/products', {
    name: 'Test Wheat Flour',
    sku: `WF-${Date.now()}`,
    category: 'Food',
    pricePerUnit: 45.50,
    unit: 'kg',
    saleByWeight: true,
    stock: 100.5,
    reorderLevel: 10,
    hsnCode: '1101',
  }, TOKEN);
  check('POST /products happy path returns 201', r.status === 201, `Got ${r.status}: ${JSON.stringify(r.body)}`);
  if (r.status === 201) {
    createdProductId = r.body.data?._id;
    check('Response has _id', !!createdProductId, 'Missing _id in response');
    check('pricePerUnit is string in response', typeof r.body.data?.pricePerUnit === 'string', `Got type ${typeof r.body.data?.pricePerUnit}, value: ${r.body.data?.pricePerUnit}`);
    check('stock is string in response', typeof r.body.data?.stock === 'string', `Got type ${typeof r.body.data?.stock}`);
    check('stockStatus virtual present', !!r.body.data?.stockStatus, `Missing stockStatus, got: ${JSON.stringify(Object.keys(r.body.data || {}))}`);
  }

  // GET single product
  if (createdProductId) {
    const g = await request('GET', `/products/${createdProductId}`, null, TOKEN);
    check('GET /products/:id returns 200', g.status === 200, `Got ${g.status}`);
    check('GET /products/:id returns correct name', g.body.data?.name === 'Test Wheat Flour', `Got name: ${g.body.data?.name}`);
  }

  // GET product list
  const list = await request('GET', '/products', null, TOKEN);
  check('GET /products returns 200', list.status === 200, `Got ${list.status}`);
  check('GET /products has meta.total', list.body.meta?.total >= 0, `meta: ${JSON.stringify(list.body.meta)}`);

  // PUT update product
  if (createdProductId) {
    const u = await request('PUT', `/products/${createdProductId}`, {
      pricePerUnit: 50.00,
      reorderLevel: 15,
    }, TOKEN);
    check('PUT /products/:id returns 200', u.status === 200, `Got ${u.status}: ${JSON.stringify(u.body)}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 2: Product edge cases
// ────────────────────────────────────────────────────────────────────────────
async function testProductEdgeCases() {
  console.log('\n=== SECTION 2: Product Edge Cases ===');

  // Negative price — should be rejected
  const negPrice = await request('POST', '/products', {
    name: 'Bad Price',
    sku: `NEG-${Date.now()}`,
    category: 'Test',
    pricePerUnit: -10,
    unit: 'pcs',
    saleByWeight: false,
    stock: 5,
  }, TOKEN);
  check('Negative pricePerUnit rejected (4xx)', negPrice.status >= 400 && negPrice.status < 500,
    `Expected 4xx, got ${negPrice.status}: ${JSON.stringify(negPrice.body)}`);

  // Zero price — should be rejected
  const zeroPrice = await request('POST', '/products', {
    name: 'Zero Price',
    sku: `ZERO-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 0,
    unit: 'pcs',
    saleByWeight: false,
    stock: 5,
  }, TOKEN);
  check('Zero pricePerUnit rejected (4xx)', zeroPrice.status >= 400 && zeroPrice.status < 500,
    `Expected 4xx, got ${zeroPrice.status}: ${JSON.stringify(zeroPrice.body)}`);

  // Negative stock on create — Spec §2.3 allows negative stock (oversold) after adjust, but initial negative should work
  const negStock = await request('POST', '/products', {
    name: 'Negative Stock Test',
    sku: `NEGSTOCK-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 10,
    unit: 'pcs',
    saleByWeight: false,
    stock: -5,
  }, TOKEN);
  // Record the actual behavior — spec says stock can be negative for saleByWeight
  console.log(`  INFO  Negative stock on pcs unit (non-weight): status=${negStock.status}, msg=${negStock.body?.message || 'N/A'}`);
  if (negStock.status === 201) {
    // Delete the created product to keep db clean
    if (negStock.body.data?._id) {
      await request('DELETE', `/products/${negStock.body.data._id}`, null, TOKEN);
    }
  }

  // Decimal qty on pcs (whole-number unit) — should be rejected
  const decQty = await request('POST', '/products', {
    name: 'Decimal Pcs Test',
    sku: `DECPCS-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 10,
    unit: 'pcs',
    saleByWeight: false,
    stock: 5.5,
  }, TOKEN);
  check('Decimal stock on pcs unit rejected (4xx)', decQty.status >= 400 && decQty.status < 500,
    `Expected 4xx for 5.5 pcs, got ${decQty.status}: ${JSON.stringify(decQty.body)}`);

  // Invalid HSN code (wrong length e.g. 5 digits)
  const badHsn = await request('POST', '/products', {
    name: 'Bad HSN',
    sku: `BADHS-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 10,
    unit: 'pcs',
    saleByWeight: false,
    stock: 5,
    hsnCode: '12345',
  }, TOKEN);
  check('Invalid HSN (5 digits) rejected (4xx)', badHsn.status >= 400 && badHsn.status < 500,
    `Expected 4xx for 5-digit HSN, got ${badHsn.status}: ${JSON.stringify(badHsn.body)}`);

  // Missing required fields — no name
  const noName = await request('POST', '/products', {
    sku: `NONAME-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 10,
    unit: 'pcs',
    saleByWeight: false,
  }, TOKEN);
  check('Missing name rejected (4xx)', noName.status >= 400 && noName.status < 500,
    `Expected 4xx for missing name, got ${noName.status}`);

  // Missing SKU
  const noSku = await request('POST', '/products', {
    name: 'No SKU Product',
    category: 'Test',
    pricePerUnit: 10,
    unit: 'pcs',
    saleByWeight: false,
  }, TOKEN);
  check('Missing SKU rejected (4xx)', noSku.status >= 400 && noSku.status < 500,
    `Expected 4xx for missing SKU, got ${noSku.status}`);

  // Very large price (testing overflow)
  const hugePrice = await request('POST', '/products', {
    name: 'Huge Price Product',
    sku: `HUGE-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 999999999999,
    unit: 'pcs',
    saleByWeight: false,
    stock: 1,
  }, TOKEN);
  console.log(`  INFO  Huge price (999999999999): status=${hugePrice.status}, pricePerUnit=${hugePrice.body?.data?.pricePerUnit}`);
  if (hugePrice.status === 201 && hugePrice.body.data?._id) {
    await request('DELETE', `/products/${hugePrice.body.data._id}`, null, TOKEN);
  }

  // Unicode/emoji name
  const emojiName = await request('POST', '/products', {
    name: 'गेहूँ आटा Premium 🌾',
    sku: `EMOJI-${Date.now()}`,
    category: 'Food',
    pricePerUnit: 45,
    unit: 'kg',
    saleByWeight: true,
    stock: 50,
  }, TOKEN);
  console.log(`  INFO  Unicode/emoji name: status=${emojiName.status}, name stored=${emojiName.body?.data?.name}`);
  if (emojiName.status === 201 && emojiName.body.data?._id) {
    await request('DELETE', `/products/${emojiName.body.data._id}`, null, TOKEN);
  }

  // XSS attempt in name
  const xssName = await request('POST', '/products', {
    name: '<script>alert("xss")</script>Evil Product',
    sku: `XSS-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 10,
    unit: 'pcs',
    saleByWeight: false,
    stock: 1,
  }, TOKEN);
  if (xssName.status === 201) {
    const storedName = xssName.body?.data?.name;
    check('XSS stripped from product name', !storedName.includes('<script>'),
      `Script tag NOT stripped: stored name = "${storedName}"`);
    if (xssName.body.data?._id) await request('DELETE', `/products/${xssName.body.data._id}`, null, TOKEN);
  } else {
    check('XSS name: request rejected (acceptable)', xssName.status >= 400, `Got ${xssName.status}`);
  }

  // 80+ char name
  const longName = 'A'.repeat(121);
  const longNameReq = await request('POST', '/products', {
    name: longName,
    sku: `LONG-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 10,
    unit: 'pcs',
    saleByWeight: false,
    stock: 1,
  }, TOKEN);
  check('Name > 120 chars rejected (4xx)', longNameReq.status >= 400 && longNameReq.status < 500,
    `Expected 4xx for 121-char name, got ${longNameReq.status}`);

  // Duplicate SKU
  if (createdProductId) {
    // First get the original product's sku
    const g = await request('GET', `/products/${createdProductId}`, null, TOKEN);
    if (g.body.data?.sku) {
      const dupSku = await request('POST', '/products', {
        name: 'Duplicate SKU Test',
        sku: g.body.data.sku,
        category: 'Test',
        pricePerUnit: 10,
        unit: 'pcs',
        saleByWeight: false,
        stock: 1,
      }, TOKEN);
      check('Duplicate SKU rejected (409)', dupSku.status === 409,
        `Expected 409, got ${dupSku.status}: ${JSON.stringify(dupSku.body)}`);
    }
  }

  // saleByWeight=true with non-decimal unit (pcs) — should fail
  const sbwInvalid = await request('POST', '/products', {
    name: 'Invalid SBW',
    sku: `SBWINV-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 10,
    unit: 'pcs',
    saleByWeight: true,
    stock: 5,
  }, TOKEN);
  check('saleByWeight=true with pcs unit rejected (4xx)', sbwInvalid.status >= 400 && sbwInvalid.status < 500,
    `Expected 4xx for pcs+saleByWeight=true, got ${sbwInvalid.status}: ${JSON.stringify(sbwInvalid.body)}`);

  // Invalid unit enum
  const badUnit = await request('POST', '/products', {
    name: 'Bad Unit Test',
    sku: `BADUNIT-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 10,
    unit: 'lbs',
    saleByWeight: false,
    stock: 5,
  }, TOKEN);
  check('Invalid unit rejected (4xx)', badUnit.status >= 400 && badUnit.status < 500,
    `Expected 4xx for unit=lbs, got ${badUnit.status}`);

  // Invalid gstRate
  const badGst = await request('POST', '/products', {
    name: 'Bad GST Rate',
    sku: `BADGST-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 10,
    unit: 'pcs',
    saleByWeight: false,
    stock: 5,
    gstRate: 10,
  }, TOKEN);
  check('Invalid gstRate (10%) rejected (4xx)', badGst.status >= 400 && badGst.status < 500,
    `Expected 4xx for gstRate=10, got ${badGst.status}: ${JSON.stringify(badGst.body)}`);

  // Negative reorderLevel
  const negReorder = await request('POST', '/products', {
    name: 'Neg Reorder Test',
    sku: `NEGRL-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 10,
    unit: 'pcs',
    saleByWeight: false,
    stock: 5,
    reorderLevel: -1,
  }, TOKEN);
  check('Negative reorderLevel rejected (4xx)', negReorder.status >= 400 && negReorder.status < 500,
    `Expected 4xx for reorderLevel=-1, got ${negReorder.status}: ${JSON.stringify(negReorder.body)}`);
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 3: Stock Adjustments
// ────────────────────────────────────────────────────────────────────────────
async function testStockAdjustments() {
  console.log('\n=== SECTION 3: Stock Adjustments ===');

  if (!createdProductId) {
    console.log('  SKIP  No product ID available');
    return;
  }

  // Get current stock first
  const g = await request('GET', `/products/${createdProductId}`, null, TOKEN);
  const currentStock = parseFloat(g.body.data?.stock || 0);
  console.log(`  INFO  Current stock for test product: ${currentStock} kg`);

  // Increase stock
  const inc = await request('PATCH', `/products/${createdProductId}/stock`, {
    type: 'increase',
    quantity: 10,
  }, TOKEN);
  check('PATCH /stock increase returns 200', inc.status === 200,
    `Got ${inc.status}: ${JSON.stringify(inc.body)}`);

  // Decrease stock within bounds
  const dec = await request('PATCH', `/products/${createdProductId}/stock`, {
    type: 'decrease',
    quantity: 5,
  }, TOKEN);
  check('PATCH /stock decrease (within bounds) returns 200', dec.status === 200,
    `Got ${dec.status}: ${JSON.stringify(dec.body)}`);

  // Invalid type
  const badType = await request('PATCH', `/products/${createdProductId}/stock`, {
    type: 'invalid',
    quantity: 1,
  }, TOKEN);
  check('PATCH /stock invalid type returns 400', badType.status === 400,
    `Expected 400, got ${badType.status}: ${JSON.stringify(badType.body)}`);

  // Zero quantity
  const zeroQty = await request('PATCH', `/products/${createdProductId}/stock`, {
    type: 'increase',
    quantity: 0,
  }, TOKEN);
  check('PATCH /stock quantity=0 rejected (4xx)', zeroQty.status >= 400 && zeroQty.status < 500,
    `Expected 4xx for quantity=0, got ${zeroQty.status}: ${JSON.stringify(zeroQty.body)}`);

  // Negative quantity
  const negQty = await request('PATCH', `/products/${createdProductId}/stock`, {
    type: 'increase',
    quantity: -5,
  }, TOKEN);
  check('PATCH /stock negative quantity rejected (4xx)', negQty.status >= 400 && negQty.status < 500,
    `Expected 4xx for quantity=-5, got ${negQty.status}: ${JSON.stringify(negQty.body)}`);

  // Test: saleByWeight=true product — decrease past zero (should allow negative stock per spec §2.3)
  // createdProductId is a kg/saleByWeight=true product
  const getAfter = await request('GET', `/products/${createdProductId}`, null, TOKEN);
  const stockAfter = parseFloat(getAfter.body.data?.stock || 0);
  console.log(`  INFO  Stock after adjustments: ${stockAfter} kg (saleByWeight=true)`);

  // Decrease more than stock on saleByWeight product — should succeed (allow negative)
  const overDec = await request('PATCH', `/products/${createdProductId}/stock`, {
    type: 'decrease',
    quantity: stockAfter + 200, // more than available
  }, TOKEN);
  console.log(`  INFO  Over-decrease on saleByWeight product: status=${overDec.status}, msg=${overDec.body?.message || 'N/A'}`);
  if (overDec.status === 200) {
    const negStockVal = parseFloat(overDec.body.data?.stock || 0);
    check('saleByWeight=true: over-decrease results in negative stock (allowed per spec)', negStockVal < 0,
      `Expected negative stock, got: ${negStockVal}`);
    // restore stock
    await request('PATCH', `/products/${createdProductId}/stock`, {
      type: 'increase',
      quantity: Math.abs(negStockVal) + 50,
    }, TOKEN);
  } else {
    fail('saleByWeight=true: over-decrease should be allowed per spec §2.3',
      `Got ${overDec.status}: ${JSON.stringify(overDec.body)}`);
  }

  // Now test pcs product: over-decrease should be blocked
  // Create a pcs product with 10 units stock
  const pcsP = await request('POST', '/products', {
    name: 'PCS Test Product',
    sku: `PCSTEST-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 20,
    unit: 'pcs',
    saleByWeight: false,
    stock: 10,
  }, TOKEN);
  if (pcsP.status === 201 && pcsP.body.data?._id) {
    const pcsId = pcsP.body.data._id;
    // Decrease by 20 (more than 10 in stock)
    const overDecPcs = await request('PATCH', `/products/${pcsId}/stock`, {
      type: 'decrease',
      quantity: 20,
    }, TOKEN);
    check('pcs unit: decrease beyond stock rejected (400)', overDecPcs.status === 400,
      `Expected 400, got ${overDecPcs.status}: ${JSON.stringify(overDecPcs.body)}`);
    await request('DELETE', `/products/${pcsId}`, null, TOKEN);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 4: Pagination, Search, Filtering
// ────────────────────────────────────────────────────────────────────────────
async function testPaginationSearch() {
  console.log('\n=== SECTION 4: Pagination, Search, Filtering ===');

  // Pagination
  const p1 = await request('GET', '/products?page=1&limit=5', null, TOKEN);
  check('Pagination page=1 limit=5 returns 200', p1.status === 200, `Got ${p1.status}`);
  check('Pagination returns correct limit', (p1.body.data?.length || 0) <= 5,
    `Got ${p1.body.data?.length} items, expected <=5`);
  check('Meta has correct structure', p1.body.meta?.page === 1 && p1.body.meta?.limit === 5,
    `meta: ${JSON.stringify(p1.body.meta)}`);

  // Search by name
  const search = await request('GET', '/products?q=Wheat', null, TOKEN);
  check('Search by name returns 200', search.status === 200, `Got ${search.status}`);

  // Stock status filter
  const lowFilter = await request('GET', '/products?stock_status=low', null, TOKEN);
  check('stock_status=low filter returns 200', lowFilter.status === 200, `Got ${lowFilter.status}`);

  const outFilter = await request('GET', '/products?stock_status=out', null, TOKEN);
  check('stock_status=out filter returns 200', outFilter.status === 200, `Got ${outFilter.status}`);

  // stock_status post-filter pagination issue: if page=1 limit=5 fetches 5, then filters them client-side,
  // the meta.total doesn't account for the filter — it uses total from DB before post-filter
  const filterMeta = await request('GET', '/products?stock_status=out&page=1&limit=5', null, TOKEN);
  console.log(`  INFO  stock_status=out with pagination: data.length=${filterMeta.body.data?.length}, meta.total=${filterMeta.body.meta?.total}`);
  // Bug check: meta.total is the unfiltered count — misleading with stock_status filter
  if (filterMeta.body.data?.length < filterMeta.body.meta?.total) {
    console.log(`  NOTE  stock_status post-filter is done in-memory after pagination fetch — meta.total reflects unfiltered DB count`);
  }

  // Category filter
  const catFilter = await request('GET', '/products?category=Electronics', null, TOKEN);
  check('Category filter returns 200', catFilter.status === 200, `Got ${catFilter.status}`);

  // /low-stock endpoint
  const lowStock = await request('GET', '/products/low-stock', null, TOKEN);
  check('GET /products/low-stock returns 200', lowStock.status === 200, `Got ${lowStock.status}`);

  // /reorder-report
  const reorder = await request('GET', '/products/reorder-report', null, TOKEN);
  check('GET /products/reorder-report returns 200', reorder.status === 200, `Got ${reorder.status}: ${JSON.stringify(reorder.body).slice(0,200)}`);

  // reorder-report with invalid status
  const reorderBad = await request('GET', '/products/reorder-report?status=badval', null, TOKEN);
  check('reorder-report with unrecognized status returns all non-healthy (200)', reorderBad.status === 200,
    `Got ${reorderBad.status}: ${JSON.stringify(reorderBad.body).slice(0,100)}`);

  // Barcode lookup on non-existent barcode
  const barcode = await request('GET', '/products/by-barcode/NOTEXIST999', null, TOKEN);
  check('GET /products/by-barcode non-existent returns 404', barcode.status === 404,
    `Expected 404, got ${barcode.status}`);

  // Invalid ObjectId
  const badId = await request('GET', '/products/notanid', null, TOKEN);
  check('GET /products/:id with invalid ID returns 400', badId.status === 400,
    `Expected 400, got ${badId.status}: ${JSON.stringify(badId.body)}`);
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 5: Supplier CRUD
// ────────────────────────────────────────────────────────────────────────────
async function testSupplierCRUD() {
  console.log('\n=== SECTION 5: Supplier CRUD ===');

  // Create valid supplier
  const cr = await request('POST', '/suppliers', {
    name: 'Test Supplier Co.',
    contactPerson: 'John Doe',
    email: 'supplier@test.com',
    phone: '+91 98765 43210',
    address: '123 Test Street, Mumbai',
    gst: '22AAAAA0000A1Z5',
  }, TOKEN);
  check('POST /suppliers returns 201', cr.status === 201,
    `Got ${cr.status}: ${JSON.stringify(cr.body)}`);
  if (cr.status === 201) {
    createdSupplierId = cr.body.data?._id;
    check('Supplier has _id', !!createdSupplierId, 'Missing _id');
  }

  // GET supplier list
  const list = await request('GET', '/suppliers', null, TOKEN);
  check('GET /suppliers returns 200', list.status === 200, `Got ${list.status}`);

  // GET single supplier
  if (createdSupplierId) {
    const g = await request('GET', `/suppliers/${createdSupplierId}`, null, TOKEN);
    check('GET /suppliers/:id returns 200', g.status === 200, `Got ${g.status}`);
    check('Supplier name matches', g.body.data?.name === 'Test Supplier Co.', `Got: ${g.body.data?.name}`);
  }

  // UPDATE supplier
  if (createdSupplierId) {
    const u = await request('PUT', `/suppliers/${createdSupplierId}`, {
      name: 'Updated Supplier Co.',
    }, TOKEN);
    check('PUT /suppliers/:id returns 200', u.status === 200, `Got ${u.status}: ${JSON.stringify(u.body)}`);
  }

  // GET supplier stats
  const stats = await request('GET', '/suppliers/stats', null, TOKEN);
  check('GET /suppliers/stats returns 200', stats.status === 200, `Got ${stats.status}`);

  // GET supplier products
  if (createdSupplierId) {
    const sp = await request('GET', `/suppliers/${createdSupplierId}/products`, null, TOKEN);
    check('GET /suppliers/:id/products returns 200', sp.status === 200, `Got ${sp.status}`);
  }

  // GET supplier transactions
  if (createdSupplierId) {
    const st = await request('GET', `/suppliers/${createdSupplierId}/transactions`, null, TOKEN);
    check('GET /suppliers/:id/transactions returns 200', st.status === 200, `Got ${st.status}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 6: Supplier Edge Cases
// ────────────────────────────────────────────────────────────────────────────
async function testSupplierEdgeCases() {
  console.log('\n=== SECTION 6: Supplier Edge Cases ===');

  // Missing name
  const noName = await request('POST', '/suppliers', {
    email: 'no-name@test.com',
  }, TOKEN);
  check('POST /suppliers without name rejected (4xx)', noName.status >= 400 && noName.status < 500,
    `Expected 4xx, got ${noName.status}: ${JSON.stringify(noName.body)}`);

  // Invalid GSTIN format (too short)
  const badGstin = await request('POST', '/suppliers', {
    name: 'Bad GSTIN Supplier',
    gst: '22AAAA',
  }, TOKEN);
  check('Invalid GSTIN (too short) rejected (4xx)', badGstin.status >= 400 && badGstin.status < 500,
    `Expected 4xx for short GSTIN, got ${badGstin.status}: ${JSON.stringify(badGstin.body)}`);

  // Invalid GSTIN — wrong chars (lowercase)
  const lowercaseGstin = await request('POST', '/suppliers', {
    name: 'Lowercase GSTIN',
    gst: '22aaaaa0000a1z5',
  }, TOKEN);
  check('Lowercase GSTIN rejected (4xx)', lowercaseGstin.status >= 400 && lowercaseGstin.status < 500,
    `Expected 4xx for lowercase GSTIN, got ${lowercaseGstin.status}: ${JSON.stringify(lowercaseGstin.body)}`);

  // Empty GSTIN (should be allowed — optional field)
  const emptyGstin = await request('POST', '/suppliers', {
    name: `Empty GSTIN Supplier ${Date.now()}`,
    gst: '',
  }, TOKEN);
  check('Empty GSTIN allowed (201)', emptyGstin.status === 201,
    `Expected 201 for empty GSTIN, got ${emptyGstin.status}: ${JSON.stringify(emptyGstin.body)}`);
  if (emptyGstin.status === 201 && emptyGstin.body.data?._id) {
    await request('DELETE', `/suppliers/${emptyGstin.body.data._id}`, null, TOKEN);
  }

  // Invalid email format
  const badEmail = await request('POST', '/suppliers', {
    name: 'Bad Email Supplier',
    email: 'notanemail',
  }, TOKEN);
  check('Invalid email rejected (4xx)', badEmail.status >= 400 && badEmail.status < 500,
    `Expected 4xx for invalid email, got ${badEmail.status}: ${JSON.stringify(badEmail.body)}`);

  // Name with XSS
  const xssSupplier = await request('POST', '/suppliers', {
    name: '<script>alert(1)</script>Supplier',
  }, TOKEN);
  if (xssSupplier.status === 201) {
    const storedName = xssSupplier.body?.data?.name;
    check('XSS stripped from supplier name', !storedName?.includes('<script>'),
      `Script NOT stripped: stored = "${storedName}"`);
    if (xssSupplier.body.data?._id) await request('DELETE', `/suppliers/${xssSupplier.body.data._id}`, null, TOKEN);
  } else {
    console.log(`  INFO  XSS in supplier name: ${xssSupplier.status}`);
  }

  // Delete supplier with linked products (should be rejected)
  if (createdSupplierId && createdProductId) {
    // Link the product to supplier
    await request('PUT', `/products/${createdProductId}`, { supplierId: createdSupplierId }, TOKEN);
    const delLinked = await request('DELETE', `/suppliers/${createdSupplierId}`, null, TOKEN);
    check('DELETE supplier with linked products returns 409', delLinked.status === 409,
      `Expected 409, got ${delLinked.status}: ${JSON.stringify(delLinked.body)}`);
    // Unlink product from supplier for cleanup
    await request('PUT', `/products/${createdProductId}`, { supplierId: '' }, TOKEN);
  }

  // Invalid ObjectId
  const badId = await request('GET', '/suppliers/notanid', null, TOKEN);
  check('GET /suppliers/:id with invalid ID returns 400', badId.status === 400,
    `Expected 400, got ${badId.status}`);

  // Update with empty body
  if (createdSupplierId) {
    const emptyUpdate = await request('PUT', `/suppliers/${createdSupplierId}`, {}, TOKEN);
    check('PUT /suppliers/:id with empty body returns 400', emptyUpdate.status >= 400 && emptyUpdate.status < 500,
      `Expected 4xx for empty update, got ${emptyUpdate.status}: ${JSON.stringify(emptyUpdate.body)}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 7: Auth boundaries
// ────────────────────────────────────────────────────────────────────────────
async function testAuthBoundaries() {
  console.log('\n=== SECTION 7: Auth Boundaries ===');

  // No token
  const noToken = await request('GET', '/products');
  check('GET /products without token returns 401', noToken.status === 401,
    `Expected 401, got ${noToken.status}`);

  // Bad token
  const badToken = await request('GET', '/products', null, 'badtoken.here.fake');
  check('GET /products with invalid token returns 401', badToken.status === 401,
    `Expected 401, got ${badToken.status}`);

  // Supplier routes — registered user defaults to 'manager' role which should be authorized
  // per supplier.routes.js: authorize('admin', 'manager')
  console.log(`  INFO  Current user role: ${testUser?.role}`);
  const suppAuth = await request('GET', '/suppliers', null, TOKEN);
  check('Supplier routes accessible to manager role', suppAuth.status === 200,
    `Expected 200, got ${suppAuth.status}: ${JSON.stringify(suppAuth.body)}`);

  // Create a staff-role user and try to access supplier routes
  const staffEmail = `staff-${Date.now()}@test.com`;
  const staffReg = await request('POST', '/auth/register', {
    name: 'Staff User',
    email: staffEmail,
    password: 'Test@12345',
  });
  // Note: register defaults to 'manager' so staff test may not be directly testable without admin role manipulation
  console.log(`  INFO  Staff user registration: status=${staffReg.status}, role=${staffReg.body.data?.role}`);
  // Since we can't easily create a staff user without admin-only role assignment, just note this
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 8: Inventory service / StockAdjustment model
// ────────────────────────────────────────────────────────────────────────────
async function testInventoryService() {
  console.log('\n=== SECTION 8: Inventory Routes / StockAdjustment service ===');

  // inventory.routes.js is only 1 line — check if it's actually empty
  const invRoute = await request('GET', '/inventory', null, TOKEN);
  console.log(`  INFO  GET /inventory: status=${invRoute.status}, body=${JSON.stringify(invRoute.body).slice(0, 100)}`);
  check('GET /inventory returns sensible response (not 500)', invRoute.status !== 500,
    `Got 500 from /inventory`);

  // Check stockAdjustmentService used by StockInVarianceModal
  // The service calls a different endpoint than /products/:id/stock
  // Let's probe to find the actual endpoint
  const adjPaths = [
    '/stock-adjustments',
    '/inventory/adjustments',
    '/inventory/stock-adjustments',
    '/products/stock-adjustments',
  ];
  for (const p of adjPaths) {
    const r = await request('GET', p, null, TOKEN);
    if (r.status !== 404) {
      console.log(`  INFO  Found inventory path: ${p} → ${r.status}`);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 9: Low-stock alerting logic
// ────────────────────────────────────────────────────────────────────────────
async function testLowStockAlerting() {
  console.log('\n=== SECTION 9: Low-stock alerting correctness ===');

  // Create a product at exactly reorder level
  const p = await request('POST', '/products', {
    name: `Alert Test ${Date.now()}`,
    sku: `ALERT-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 10,
    unit: 'pcs',
    saleByWeight: false,
    stock: 5,
    reorderLevel: 5,
  }, TOKEN);

  if (p.status === 201 && p.body.data?._id) {
    const pid = p.body.data._id;
    check('product with stock=reorderLevel has status "low"', p.body.data.stockStatus === 'low',
      `Expected "low", got "${p.body.data.stockStatus}"`);

    // Decrease by 1 to go below reorder
    await request('PATCH', `/products/${pid}/stock`, { type: 'decrease', quantity: 1 }, TOKEN);
    const after = await request('GET', `/products/${pid}`, null, TOKEN);
    check('product below reorderLevel remains "low"', after.body.data?.stockStatus === 'low',
      `Expected "low", got "${after.body.data?.stockStatus}"`);

    // Decrease to zero
    await request('PATCH', `/products/${pid}/stock`, { type: 'decrease', quantity: 4 }, TOKEN);
    const atZero = await request('GET', `/products/${pid}`, null, TOKEN);
    check('product at stock=0 has status "out"', atZero.body.data?.stockStatus === 'out',
      `Expected "out", got "${atZero.body.data?.stockStatus}"`);

    // Check low-stock endpoint includes this product
    const ls = await request('GET', '/products/low-stock', null, TOKEN);
    // Product with reorderLevel=5 and stock=0 — getLowStock uses $lte stock <= reorderLevel
    // 0 <= 5 should match
    const found = ls.body.data?.some(item => item._id === pid);
    check('/products/low-stock includes out-of-stock product (0 <= reorderLevel)', found,
      `Product with stock=0 and reorderLevel=5 not found in low-stock list`);

    await request('DELETE', `/products/${pid}`, null, TOKEN);
  }

  // Product with reorderLevel=0 should NOT appear in low-stock when stock=0
  // because getLowStock uses $lte which would include it
  const p0 = await request('POST', '/products', {
    name: `Reorder0 Test ${Date.now()}`,
    sku: `RL0-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 10,
    unit: 'pcs',
    saleByWeight: false,
    stock: 0,
    reorderLevel: 0,
  }, TOKEN);
  if (p0.status === 201 && p0.body.data?._id) {
    const pid0 = p0.body.data._id;
    const ls0 = await request('GET', '/products/low-stock', null, TOKEN);
    const found0 = ls0.body.data?.some(item => item._id === pid0);
    console.log(`  INFO  Product with stock=0 AND reorderLevel=0 in /low-stock: ${found0}`);
    // Per spec: stock=0, reorderLevel=0 → 0 <= 0 is true, so it would be included
    // This is arguably a bug — products with reorderLevel=0 should not trigger low stock alerts
    if (found0) {
      fail('Products with stock=0 AND reorderLevel=0 should NOT appear in /low-stock (reorderLevel=0 means no alert configured)',
        `Product appeared in low-stock with reorderLevel=0`);
    } else {
      pass('Products with reorderLevel=0 not in /low-stock');
    }
    await request('DELETE', `/products/${pid0}`, null, TOKEN);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 10: Concurrent stock adjustment race condition
// ────────────────────────────────────────────────────────────────────────────
async function testConcurrency() {
  console.log('\n=== SECTION 10: Concurrent Stock Adjustments ===');

  // Create a pcs product with 10 units
  const p = await request('POST', '/products', {
    name: `Concurrency Test ${Date.now()}`,
    sku: `CONC-${Date.now()}`,
    category: 'Test',
    pricePerUnit: 20,
    unit: 'pcs',
    saleByWeight: false,
    stock: 10,
  }, TOKEN);

  if (p.status === 201 && p.body.data?._id) {
    const pid = p.body.data._id;

    // Fire 10 concurrent decrease-by-1 requests
    const promises = Array.from({ length: 10 }, () =>
      request('PATCH', `/products/${pid}/stock`, { type: 'decrease', quantity: 1 }, TOKEN)
    );
    const responses = await Promise.all(promises);
    const successes = responses.filter(r => r.status === 200).length;
    const failures  = responses.filter(r => r.status === 400).length;
    console.log(`  INFO  10 concurrent decrements: ${successes} succeeded, ${failures} failed`);

    // Check final stock
    const final = await request('GET', `/products/${pid}`, null, TOKEN);
    const finalStock = parseFloat(final.body.data?.stock || 0);
    console.log(`  INFO  Final stock after 10 concurrent -1 decrements: ${finalStock}`);
    check('Concurrent decrements: final stock is 0 (atomic, no negative)', finalStock === 0,
      `Expected 0, got ${finalStock}. Total successes=${successes}, expected 10 successes with atomic conditional decrement`);

    await request('DELETE', `/products/${pid}`, null, TOKEN);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 11: stockAdjustmentService endpoint discovery
// ────────────────────────────────────────────────────────────────────────────
async function testStockAdjustmentService() {
  console.log('\n=== SECTION 11: StockAdjustmentService endpoint ===');
  // The InventoryPage uses createStockAdjustment from stockAdjustmentService
  // Let's find what endpoint this hits
  const Glob2 = require('path');
  const fs = require('fs');
  const svcPath = `${__dirname}/../../../client/src/services/stockAdjustmentService.js`;
  try {
    const content = fs.readFileSync(svcPath.replace(/\//g, Glob2.sep), 'utf8');
    console.log(`  INFO  stockAdjustmentService content:\n${content.slice(0, 500)}`);
  } catch (e) {
    console.log(`  INFO  Could not read stockAdjustmentService: ${e.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Cleanup
// ────────────────────────────────────────────────────────────────────────────
async function cleanup() {
  console.log('\n=== CLEANUP ===');
  if (createdProductId) {
    const d = await request('DELETE', `/products/${createdProductId}`, null, TOKEN);
    console.log(`  Deleted test product: ${d.status}`);
  }
  if (createdSupplierId) {
    const d = await request('DELETE', `/suppliers/${createdSupplierId}`, null, TOKEN);
    console.log(`  Deleted test supplier: ${d.status}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────
async function main() {
  try {
    await setup();
    await testProductHappyPath();
    await testProductEdgeCases();
    await testStockAdjustments();
    await testPaginationSearch();
    await testSupplierCRUD();
    await testSupplierEdgeCases();
    await testAuthBoundaries();
    await testInventoryService();
    await testLowStockAlerting();
    await testConcurrency();
    await testStockAdjustmentService();
    await cleanup();
  } catch (e) {
    console.error('FATAL:', e);
  }

  console.log('\n====================================');
  console.log(`TOTAL: ${results.passed + results.failed} tests`);
  console.log(`PASSED: ${results.passed}`);
  console.log(`FAILED: ${results.failed}`);
  console.log('====================================');
  if (results.bugs.length) {
    console.log('\nFailed tests:');
    results.bugs.forEach(b => console.log(`  - ${b.name}: ${b.detail}`));
  }
}

main();
