'use strict';
/**
 * RT1 Business Profile Setup test
 * Register a fresh account and set up a complete business profile
 * via settings/workspace endpoints, then verify every field persists.
 */

const http = require('http');
const BASE_HOST = 'localhost';
const BASE_PORT = 5001;
const BASE_PATH = '/api/v1';

let passed = 0;
let failed = 0;

function pass(label) { console.log('[PASS]', label); passed++; }
function fail(label, detail) { console.log('[FAIL]', label, '|', detail); failed++; }

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
  const EMAIL = 'biz-rt1-' + TS + '@smartstock.test';
  const PASS = 'BizPass99!';

  console.log('\n========== BUSINESS PROFILE SETUP TEST ==========');
  console.log('Backend: http://localhost:5001/api/v1');
  console.log('Date:', new Date().toISOString());
  console.log('Test account:', EMAIL);
  console.log('');

  // Step 1: Register fresh account
  console.log('Step 1: Register fresh account');
  const reg = await req('POST', '/auth/register', { name: 'Sharma Shop Owner', email: EMAIL, password: PASS });
  if (reg.status !== 201 || !reg.body.token) {
    fail('Register', `status=${reg.status} body=${JSON.stringify(reg.body).substring(0,120)}`);
    process.exit(1);
  }
  const TOKEN = reg.body.token;
  pass('Register: fresh account created (201)');
  console.log('  role:', reg.body.user && reg.body.user.role);

  // Step 2: GET /settings fresh (auto-created settings doc)
  console.log('\nStep 2: GET /settings after fresh registration');
  const fresh = await req('GET', '/settings', null, TOKEN);
  if (fresh.status === 200 && fresh.body.success) {
    pass('GET /settings: auto-created settings doc on first access');
  } else {
    fail('GET /settings initial', `status=${fresh.status} msg=${fresh.body.message}`);
  }

  // Step 3: Set profile (jobTitle)
  console.log('\nStep 3: Set profile (jobTitle)');
  const profR = await req('PUT', '/settings', { profile: { jobTitle: 'Store Manager' } }, TOKEN);
  if (profR.status === 200 && profR.body.success) {
    pass('PUT /settings {profile.jobTitle}: accepted');
  } else {
    fail('PUT /settings profile', `status=${profR.status} msg=${profR.body.message}`);
  }

  // Step 4: Set full business workspace via PUT /settings
  console.log('\nStep 4: Set business profile via PUT /settings workspace');
  const wsPayload = {
    workspace: {
      companyName: 'Sharma Kirana Store',
      legalName: 'Sharma Brothers Enterprises',
      gstin: '24BZEPP1234F1Z5',
      state: 'Gujarat',
      address: '42, Station Road, Surat 395001',
      pinCode: '395001',
      upiId: 'sharma.kirana@paytm',
      payeeName: 'Sharma Brothers',
      storeType: 'kirana',
      storeProfile: 'small',
      gstRegistered: true,
      defaultLang: 'en',
      eInvoiceEnabled: false,
    }
  };
  const wsR = await req('PUT', '/settings', wsPayload, TOKEN);
  if (wsR.status === 200 && wsR.body.success) {
    pass('PUT /settings workspace block accepted');
  } else {
    fail('PUT /settings workspace', `status=${wsR.status} msg=${wsR.body.message}`);
  }

  // Step 5: Set AI config
  console.log('\nStep 5: Set AI config (model=gemini-2.5-flash)');
  const aiR = await req('PUT', '/settings', { aiConfig: { model: 'gemini-2.5-flash', sensitivity: 80 } }, TOKEN);
  if (aiR.status === 200 && aiR.body.success) {
    pass('PUT /settings aiConfig accepted');
  } else {
    fail('PUT /settings aiConfig', `status=${aiR.status} msg=${aiR.body.message}`);
  }

  // Step 6: GET /settings — verify everything persisted
  console.log('\nStep 6: GET /settings — verify all fields persisted');
  const verify = await req('GET', '/settings', null, TOKEN);
  if (verify.status !== 200 || !verify.body.success) {
    fail('GET /settings final', `status=${verify.status}`);
    process.exit(1);
  }

  const data = verify.body.data;
  const ws = data && data.workspace;
  const profile = data && data.profile;
  const aiConfig = data && data.aiConfig;

  // Profile checks
  const profileChecks = [
    ['profile.jobTitle',    profile && profile.jobTitle,    'Store Manager'],
  ];

  // Workspace checks
  const workspaceChecks = [
    ['workspace.companyName',    ws && ws.companyName,    'Sharma Kirana Store'],
    ['workspace.legalName',      ws && ws.legalName,      'Sharma Brothers Enterprises'],
    ['workspace.gstin',          ws && ws.gstin,          '24BZEPP1234F1Z5'],
    ['workspace.state',          ws && ws.state,          'Gujarat'],
    ['workspace.address',        ws && ws.address,        '42, Station Road, Surat 395001'],
    ['workspace.pinCode',        ws && ws.pinCode,        '395001'],
    ['workspace.upiId',          ws && ws.upiId,          'sharma.kirana@paytm'],
    ['workspace.payeeName',      ws && ws.payeeName,      'Sharma Brothers'],
    ['workspace.storeType',      ws && ws.storeType,      'kirana'],
    ['workspace.storeProfile',   ws && ws.storeProfile,   'small'],
    ['workspace.gstRegistered',  ws && ws.gstRegistered,  true],
    ['workspace.defaultLang',    ws && ws.defaultLang,    'en'],
    ['workspace.eInvoiceEnabled',ws && ws.eInvoiceEnabled,false],
  ];

  const aiChecks = [
    ['aiConfig.model',       aiConfig && aiConfig.model,       'gemini-2.5-flash'],
    ['aiConfig.sensitivity', aiConfig && aiConfig.sensitivity, 80],
  ];

  let bpFailed = 0;
  for (const [field, actual, expected] of [...profileChecks, ...workspaceChecks, ...aiChecks]) {
    if (actual === expected) {
      pass(`VERIFY: ${field} = "${actual}"`);
    } else {
      fail(`VERIFY: ${field}`, `expected="${expected}" got="${actual}"`);
      bpFailed++;
    }
  }

  // Step 7: Cross-check via GET /workspace
  console.log('\nStep 7: GET /workspace cross-check');
  const gwk = await req('GET', '/workspace', null, TOKEN);
  if (gwk.status === 200 && gwk.body.success) {
    pass('GET /workspace: returns 200');
    const wkWs = gwk.body.data && gwk.body.data.workspace;
    const wkGstin = wkWs && wkWs.gstin;
    const wkUpi = wkWs && wkWs.upiId;
    if (wkGstin === '24BZEPP1234F1Z5') pass('GET /workspace: GSTIN matches');
    else fail('GET /workspace: GSTIN', `got ${wkGstin}`);
    if (wkUpi === 'sharma.kirana@paytm') pass('GET /workspace: upiId matches');
    else fail('GET /workspace: upiId', `got ${wkUpi}`);
  } else {
    fail('GET /workspace', `status=${gwk.status} msg=${gwk.body.message}`);
  }

  // Step 8: PATCH /workspace directly (test the workspace-specific endpoint)
  console.log('\nStep 8: PATCH /workspace — update address');
  const patchWk = await req('PATCH', '/workspace', {
    address: '99, Ring Road, Surat 395007',
    pinCode: '395007',
  }, TOKEN);
  if (patchWk.status === 200 && patchWk.body.success) {
    pass('PATCH /workspace: accepted');
    // Verify update
    const vAfter = await req('GET', '/settings', null, TOKEN);
    const wsAfter = vAfter.body.data && vAfter.body.data.workspace;
    if (wsAfter && wsAfter.address === '99, Ring Road, Surat 395007') {
      pass('PATCH /workspace: address change persisted');
    } else {
      fail('PATCH /workspace: address change', `got "${wsAfter && wsAfter.address}"`);
    }
    if (wsAfter && wsAfter.pinCode === '395007') {
      pass('PATCH /workspace: pinCode change persisted');
    } else {
      fail('PATCH /workspace: pinCode change', `got "${wsAfter && wsAfter.pinCode}"`);
    }
  } else {
    fail('PATCH /workspace', `status=${patchWk.status} msg=${patchWk.body.message}`);
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('\n========== BUSINESS PROFILE SETUP RESULT ==========');
  const totalChecks = passed + failed;
  console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${totalChecks}`);
  if (failed === 0) {
    console.log('BUSINESS PROFILE SETUP: PASS');
  } else {
    console.log('BUSINESS PROFILE SETUP: FAIL');
    console.log('\nFailed checks:');
    // (we don't have a results array in this script; failures are printed inline)
  }
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
