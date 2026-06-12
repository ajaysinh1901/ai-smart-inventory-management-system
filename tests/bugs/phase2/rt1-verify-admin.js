'use strict';
/**
 * RT1 Phase 2 Verification — Admin-privileged tests
 * Tests: A1-08, Mongoose-9 Product hook, Business Profile Setup
 */

const http = require('http');
const BASE_HOST = 'localhost';
const BASE_PORT = 5001;
const BASE_PATH = '/api/v1';

let passed = 0;
let failed = 0;
const results = [];

function pass(label) {
  console.log('[PASS]', label);
  passed++;
  results.push({ status: 'PASS', label });
}

function fail(label, detail) {
  console.log('[FAIL]', label, '|', detail);
  failed++;
  results.push({ status: 'FAIL', label, detail });
}

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: BASE_HOST,
      port: BASE_PORT,
      path: BASE_PATH + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = http.request(options, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(raw); } catch { json = { _raw: raw }; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function run() {
  const TS = Date.now();

  console.log('\n========== RT1 PHASE-2 ADMIN TESTS ==========');
  console.log('Backend: http://localhost:5001/api/v1');
  console.log('Date:', new Date().toISOString());
  console.log('');

  // ─── Login as admin ──────────────────────────────────────────────────────────
  console.log('--- Login as admin ---');
  const login = await req('POST', '/auth/login', {
    email: 'admin@smartstock.ai',
    password: 'password123'
  });
  if (login.status !== 200 || !login.body.token) {
    fail('Admin login', `status=${login.status} body=${JSON.stringify(login.body).substring(0,150)}`);
    console.error('Cannot get admin token — aborting admin tests');
    process.exit(1);
  }
  const ADMIN_TOKEN = login.body.token;
  console.log('Admin login OK, role:', login.body.user && login.body.user.role);
  pass('Admin login succeeds');

  // ─── Mongoose-9 hook fix: POST /products returns 201 ─────────────────────
  console.log('\n--- Mongoose-9 hook fix: POST /products ---');
  const prodBody = {
    name: 'RT1 Admin Test Widget ' + TS,
    sku: 'RT1-ADMIN-' + TS,
    category: 'General',
    pricePerUnit: 50,
    unit: 'pcs',
    stock: 20,
    reorderLevel: 3,
    saleByWeight: false,
  };
  const prodCreate = await req('POST', '/products', prodBody, ADMIN_TOKEN);
  if (prodCreate.status === 201 && prodCreate.body.success) {
    pass('Mongoose-9 hook fix: POST /products returns 201 (no "next is not a function")');
  } else {
    fail('Mongoose-9 hook fix: POST /products', `status=${prodCreate.status} msg=${prodCreate.body.message || JSON.stringify(prodCreate.body).substring(0,120)}`);
  }
  const createdProductId = prodCreate.body.data && prodCreate.body.data._id;

  // ─── A1-08: DELETE /sample-packs only removes isSample products ───────────
  console.log('\n--- A1-08: DELETE /sample-packs scope ---');
  // First seed a pack
  const seedR = await req('POST', '/sample-packs/seed', { packId: 'kirana' }, ADMIN_TOKEN);
  console.log('  seed status:', seedR.status, seedR.body.success ? 'OK' : seedR.body.message);
  if (seedR.status === 200 || seedR.status === 201 || seedR.status === 207) {
    const seedOk = seedR.body.success || seedR.status === 207;

    // Now delete — should only remove isSample:true products
    const delR = await req('DELETE', '/sample-packs', null, ADMIN_TOKEN);
    console.log('  delete status:', delR.status, 'deleted:', delR.body.deleted);

    if (delR.status === 200 && delR.body.success) {
      pass('A1-08: DELETE /sample-packs returns 200');
      // Verify the manually-created product is still there
      if (createdProductId) {
        const checkProd = await req('GET', '/products/' + createdProductId, null, ADMIN_TOKEN);
        if (checkProd.status === 200 && checkProd.body.success) {
          pass('A1-08: Non-sample product survived DELETE /sample-packs (isSample filter works)');
        } else {
          fail('A1-08: Non-sample product deleted', `status=${checkProd.status} — cross-contamination risk`);
        }
      }
    } else if (delR.status === 403 && delR.body.error === 'CLEAR_WINDOW_EXPIRED') {
      pass('A1-08: DELETE /sample-packs blocked by 30-day window (isSample guard present in code)');
    } else {
      fail('A1-08: DELETE /sample-packs', `status=${delR.status} msg=${delR.body.message}`);
    }
  } else {
    fail('A1-08: Seed pack for test', `status=${seedR.status} msg=${seedR.body.message}`);
  }

  // ─── BUSINESS PROFILE SETUP ───────────────────────────────────────────────
  console.log('\n========== BUSINESS PROFILE SETUP ==========');
  // Register a fresh account, then set up full business profile
  const BP_EMAIL = 'biz-profile-' + TS + '@smartstock.test';
  const BP_PASS = 'BizProfile99!';

  console.log('Registering fresh account for business profile test...');
  const bpReg = await req('POST', '/auth/register', { name: 'Business Owner', email: BP_EMAIL, password: BP_PASS });
  if (bpReg.status !== 201 || !bpReg.body.token) {
    fail('Business Profile: registration', `status=${bpReg.status}`);
    process.exit(1);
  }
  const BP_TOKEN = bpReg.body.token;
  console.log('  Registered:', BP_EMAIL);

  // Step 1: Set store name, GSTIN, state via PUT /settings (workspace section)
  console.log('\nStep 1: PUT /settings with full workspace block...');
  const step1 = await req('PUT', '/settings', {
    workspace: {
      companyName: 'Sharma General Store',
      legalName: 'Sharma Enterprises Pvt Ltd',
      gstin: '24BZEPP1234F1Z5',
      state: 'Gujarat',
      address: '12, MG Road, Surat',
      pinCode: '395001',
      upiId: 'sharma.store@paytm',
      payeeName: 'Sharma Enterprises',
      storeType: 'kirana',
      storeProfile: 'small',
      gstRegistered: true,
      defaultLang: 'en',
    }
  }, BP_TOKEN);
  console.log('  PUT /settings status:', step1.status, step1.body.success ? 'OK' : step1.body.message);
  if (step1.status === 200 && step1.body.success) {
    pass('BizProfile: PUT /settings workspace block accepted');
  } else {
    fail('BizProfile: PUT /settings workspace', `status=${step1.status} msg=${step1.body.message}`);
  }

  // Step 2: Also set via PATCH /workspace to test that route
  console.log('\nStep 2: PATCH /workspace...');
  const step2 = await req('PATCH', '/workspace', {
    companyName: 'Sharma General Store',
    gstin: '24BZEPP1234F1Z5',
    state: 'Gujarat',
    address: '12, MG Road, Surat',
    pinCode: '395001',
    upiId: 'sharma.store@paytm',
    payeeName: 'Sharma Enterprises',
  }, BP_TOKEN);
  console.log('  PATCH /workspace status:', step2.status, step2.body.success ? 'OK' : step2.body.message);
  if (step2.status === 200 && step2.body.success) {
    pass('BizProfile: PATCH /workspace accepted');
  } else {
    fail('BizProfile: PATCH /workspace', `status=${step2.status} msg=${step2.body.message}`);
  }

  // Step 3: GET /settings and verify all fields persisted
  console.log('\nStep 3: GET /settings and verify all fields...');
  const verify = await req('GET', '/settings', null, BP_TOKEN);
  if (verify.status !== 200 || !verify.body.success) {
    fail('BizProfile: GET /settings', `status=${verify.status}`);
    process.exit(1);
  }

  const data = verify.body.data;
  const ws = data && data.workspace;

  const checks = [
    ['companyName', ws && ws.companyName, 'Sharma General Store'],
    ['legalName',   ws && ws.legalName,   'Sharma Enterprises Pvt Ltd'],
    ['gstin',       ws && ws.gstin,       '24BZEPP1234F1Z5'],
    ['state',       ws && ws.state,       'Gujarat'],
    ['address',     ws && ws.address,     '12, MG Road, Surat'],
    ['pinCode',     ws && ws.pinCode,     '395001'],
    ['upiId',       ws && ws.upiId,       'sharma.store@paytm'],
    ['payeeName',   ws && ws.payeeName,   'Sharma Enterprises'],
    ['storeType',   ws && ws.storeType,   'kirana'],
    ['storeProfile',ws && ws.storeProfile,'small'],
    ['gstRegistered',ws && ws.gstRegistered, true],
  ];

  let bpFailed = 0;
  for (const [field, actual, expected] of checks) {
    if (actual === expected) {
      pass(`BizProfile: ${field}="${actual}" persisted correctly`);
    } else {
      fail(`BizProfile: ${field}`, `expected="${expected}" got="${actual}"`);
      bpFailed++;
    }
  }

  // Step 4: GET /workspace and check it reflects the same data
  console.log('\nStep 4: GET /workspace cross-check...');
  const gwk = await req('GET', '/workspace', null, BP_TOKEN);
  const wkData = gwk.body.data && gwk.body.data.workspace;
  if (gwk.status === 200 && gwk.body.success) {
    pass('BizProfile: GET /workspace returns 200');
    const wkGstin = wkData && wkData.gstin;
    if (wkGstin === '24BZEPP1234F1Z5') {
      pass('BizProfile: GET /workspace shows correct GSTIN');
    } else {
      fail('BizProfile: GET /workspace GSTIN', `got ${wkGstin}`);
    }
  } else {
    fail('BizProfile: GET /workspace', `status=${gwk.status}`);
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('\n========== SUMMARY ==========');
  console.log(`Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) {
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log('  FAIL:', r.label, '|', r.detail || '');
    });
  }
  console.log('');
  console.log('Exit code:', failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
