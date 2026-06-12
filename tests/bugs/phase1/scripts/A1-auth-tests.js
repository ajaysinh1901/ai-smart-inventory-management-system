/**
 * A1 Auth + Users + Settings + Workspace/Onboarding Test Script
 * Run: node tests/bugs/phase1/scripts/A1-auth-tests.js
 */

const axios = require('axios');

const API = 'http://localhost:5000/api/v1';
const PASS = 'Test@12345';
const results = [];

function log(status, name, detail = '') {
  const icon = status === 'PASS' ? '[PASS]' : status === 'FAIL' ? '[FAIL]' : '[INFO]';
  console.log(`${icon} ${name}${detail ? ' | ' + detail : ''}`);
  results.push({ status, name, detail });
}

function assert(cond, name, detail) {
  log(cond ? 'PASS' : 'FAIL', name, detail);
  if (!cond) process.exitCode = 1;
}

async function req(method, path, data, headers = {}) {
  try {
    const r = await axios({ method, url: `${API}${path}`, data, headers, validateStatus: () => true });
    return r;
  } catch (e) {
    return { status: 0, data: { message: e.message } };
  }
}

async function register(name, email, password) {
  return req('POST', '/auth/register', { name, email, password });
}

async function login(email, password) {
  return req('POST', '/auth/login', { email, password });
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

// ─── Generate unique email ────────────────────────────────────────────────────
let counter = Date.now();
function uniq(prefix = 'a1') {
  return `${prefix}-${counter++}@smartstock.test`;
}

// ─── SECTION 1: REGISTER ──────────────────────────────────────────────────────
async function testRegister() {
  console.log('\n=== SECTION 1: REGISTER ===');

  // 1.1 Happy path
  const email = uniq();
  const r1 = await register('Alice Test', email, PASS);
  assert(r1.status === 201, '1.1 Register happy path returns 201', `status=${r1.status}`);
  assert(!!r1.data.token, '1.1 Register returns token', `token=${!!r1.data.token}`);
  assert(r1.data.user?.role !== undefined, '1.1 Register returns user.role', `role=${r1.data.user?.role}`);

  // 1.2 Duplicate email
  const r2 = await register('Alice2', email, PASS);
  assert(r2.status === 400, '1.2 Duplicate register returns 400', `status=${r2.status}`);

  // 1.3 Missing name
  const r3 = await register('', uniq(), PASS);
  assert(r3.status === 400, '1.3 Missing name returns 400', `status=${r3.status}`);

  // 1.4 Name too short (1 char)
  const r4 = await register('A', uniq(), PASS);
  assert(r4.status === 400, '1.4 Name < 2 chars returns 400', `status=${r4.status} msg=${r4.data?.message || JSON.stringify(r4.data?.errors)}`);

  // 1.5 Name too long (121 chars)
  const longName = 'A'.repeat(121);
  const r5 = await register(longName, uniq(), PASS);
  assert(r5.status === 400, '1.5 Name > 120 chars returns 400', `status=${r5.status}`);

  // 1.6 Password too short (5 chars — below minimum 6)
  const r6 = await register('Bob Test', uniq(), '12345');
  assert(r6.status === 400, '1.6 Password < 6 chars returns 400', `status=${r6.status}`);

  // 1.7 Invalid email format
  const r7 = await register('Bob Test', 'not-an-email', PASS);
  assert(r7.status === 400, '1.7 Invalid email format returns 400', `status=${r7.status}`);

  // 1.8 Privilege escalation — try injecting role=admin
  const r8 = await req('POST', '/auth/register', { name: 'Hacker', email: uniq(), password: PASS, role: 'admin' });
  assert(r8.status === 400, '1.8 Register with role field rejected (strict schema)', `status=${r8.status} role=${r8.data?.user?.role}`);
  if (r8.status === 201) {
    assert(r8.data.user?.role !== 'admin', '1.8b Role escalation: user NOT admin even if 201', `actual_role=${r8.data.user?.role}`);
  }

  // 1.9 New user role must be 'staff' (not 'manager' which is model default)
  const r9 = await register('RoleCheck', uniq(), PASS);
  const actualRole = r9.data.user?.role;
  assert(actualRole === 'staff', '1.9 New user role is staff (not manager)', `actual_role=${actualRole}`);

  // 1.10 XSS in name — should be stripped
  const r10 = await register('<script>alert(1)</script>', uniq(), PASS);
  if (r10.status === 201) {
    const returnedName = r10.data.user?.name;
    assert(!returnedName?.includes('<script>'), '1.10 XSS in name stripped', `name=${returnedName}`);
  } else {
    log('INFO', '1.10 XSS name rejected at validation (also acceptable)', `status=${r10.status}`);
  }

  // 1.11 Empty body
  const r11 = await req('POST', '/auth/register', {});
  assert(r11.status === 400, '1.11 Empty body returns 400', `status=${r11.status}`);

  // 1.12 Null fields
  const r12 = await req('POST', '/auth/register', { name: null, email: null, password: null });
  assert(r12.status === 400, '1.12 Null fields return 400', `status=${r12.status}`);

  // Return a valid token for downstream tests
  return { token: r1.data.token, email, userId: r1.data.user?.id };
}

// ─── SECTION 2: LOGIN ─────────────────────────────────────────────────────────
async function testLogin(registeredEmail) {
  console.log('\n=== SECTION 2: LOGIN ===');

  // 2.1 Happy path
  const l1 = await login(registeredEmail, PASS);
  assert(l1.status === 200, '2.1 Login happy path returns 200', `status=${l1.status}`);
  assert(!!l1.data.token, '2.1 Login returns token', `token=${!!l1.data.token}`);

  // 2.2 Wrong password
  const l2 = await login(registeredEmail, 'WrongPass999');
  assert(l2.status === 401, '2.2 Wrong password returns 401', `status=${l2.status}`);

  // 2.3 Non-existent user
  const l3 = await login('nobody@test.com', PASS);
  assert(l3.status === 401, '2.3 Non-existent user returns 401', `status=${l3.status}`);

  // 2.4 Missing email
  const l4 = await req('POST', '/auth/login', { password: PASS });
  assert(l4.status === 400, '2.4 Missing email returns 400', `status=${l4.status}`);

  // 2.5 Missing password
  const l5 = await req('POST', '/auth/login', { email: registeredEmail });
  assert(l5.status === 400, '2.5 Missing password returns 400', `status=${l5.status}`);

  // 2.6 Empty strings
  const l6 = await req('POST', '/auth/login', { email: '', password: '' });
  assert(l6.status === 400, '2.6 Empty strings return 400', `status=${l6.status}`);

  // 2.7 Lockout after 5 failed attempts
  const lockEmail = uniq('locktest');
  await register('LockUser', lockEmail, PASS);
  let lastStatus = 0;
  for (let i = 0; i < 5; i++) {
    const res = await login(lockEmail, 'BadPass!');
    lastStatus = res.status;
  }
  const lockRes = await login(lockEmail, 'BadPass!');
  assert(lockRes.status === 429, '2.7 Lockout fires after 5 bad attempts (6th attempt)', `status=${lockRes.status} msg=${lockRes.data?.message}`);
  if (lockRes.status === 429) {
    assert(lockRes.data.message?.includes('minute'), '2.7b Lockout message includes time remaining', `msg=${lockRes.data?.message}`);
  }

  // 2.8 Correct password blocked during lockout
  const lockResCorrect = await login(lockEmail, PASS);
  assert(lockResCorrect.status === 429, '2.8 Correct password blocked during lockout', `status=${lockResCorrect.status}`);

  return l1.data.token;
}

// ─── SECTION 3: GET ME ────────────────────────────────────────────────────────
async function testGetMe(token) {
  console.log('\n=== SECTION 3: GET ME ===');

  // 3.1 Happy path
  const m1 = await req('GET', '/auth/me', null, authHeader(token));
  assert(m1.status === 200, '3.1 /auth/me returns 200', `status=${m1.status}`);
  assert(m1.data.data?.email !== undefined, '3.1 /auth/me returns user data', `email=${m1.data.data?.email}`);

  // 3.2 No token
  const m2 = await req('GET', '/auth/me', null);
  assert(m2.status === 401, '3.2 /auth/me without token returns 401', `status=${m2.status}`);

  // 3.3 Forged token (invalid signature)
  const m3 = await req('GET', '/auth/me', null, { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImZha2UifQ.invalidsig' });
  assert(m3.status === 401, '3.3 Forged JWT returns 401', `status=${m3.status}`);

  // 3.4 Malformed bearer
  const m4 = await req('GET', '/auth/me', null, { Authorization: 'NotBearer something' });
  assert(m4.status === 401, '3.4 Malformed Authorization header returns 401', `status=${m4.status}`);

  // 3.5 Expired-format token (HS256, expired)
  const m5 = await req('GET', '/auth/me', null, { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY0ZmFrZSIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoxNjAwMDAwMDAxfQ.abc123' });
  assert(m5.status === 401, '3.5 Expired token returns 401', `status=${m5.status}`);
}

// ─── SECTION 4: UPDATE PROFILE ────────────────────────────────────────────────
async function testUpdateProfile(token) {
  console.log('\n=== SECTION 4: UPDATE PROFILE (PUT /auth/update) ===');

  // 4.1 Happy path — update name
  const u1 = await req('PUT', '/auth/update', { name: 'Alice Updated' }, authHeader(token));
  assert(u1.status === 200, '4.1 Update name returns 200', `status=${u1.status}`);

  // 4.2 Privilege escalation — try to set role via update
  const u2 = await req('PUT', '/auth/update', { name: 'Hacker', role: 'admin' }, authHeader(token));
  assert(u2.status === 400, '4.2 Update with role field rejected (strict schema)', `status=${u2.status}`);
  if (u2.status === 200) {
    assert(u2.data.data?.role !== 'admin', '4.2b Role NOT escalated even if 200', `role=${u2.data.data?.role}`);
  }

  // 4.3 Privilege escalation — try to set email via update
  const u3 = await req('PUT', '/auth/update', { name: 'Test', email: 'newemail@test.com' }, authHeader(token));
  assert(u3.status === 400, '4.3 Update with email field rejected (strict schema)', `status=${u3.status}`);

  // 4.4 Empty name string
  const u4 = await req('PUT', '/auth/update', { name: '' }, authHeader(token));
  assert(u4.status === 400, '4.4 Empty name string returns 400', `status=${u4.status}`);

  // 4.5 Empty body — should fail validation
  const u5 = await req('PUT', '/auth/update', {}, authHeader(token));
  assert(u5.status === 400, '4.5 Empty body returns 400', `status=${u5.status}`);

  // 4.6 No token
  const u6 = await req('PUT', '/auth/update', { name: 'Test' });
  assert(u6.status === 401, '4.6 Update without token returns 401', `status=${u6.status}`);

  // 4.7 Name = whitespace only
  const u7 = await req('PUT', '/auth/update', { name: '   ' }, authHeader(token));
  assert(u7.status === 400, '4.7 Whitespace-only name returns 400', `status=${u7.status} msg=${u7.data?.message}`);

  // 4.8 Name = exactly 2 chars (minimum)
  const u8 = await req('PUT', '/auth/update', { name: 'AB' }, authHeader(token));
  assert(u8.status === 200, '4.8 Name 2 chars (min) accepted', `status=${u8.status}`);

  // 4.9 Name = 120 chars (max)
  const u9 = await req('PUT', '/auth/update', { name: 'A'.repeat(120) }, authHeader(token));
  assert(u9.status === 200, '4.9 Name 120 chars (max) accepted', `status=${u9.status}`);

  // 4.10 Name = 121 chars (over max)
  const u10 = await req('PUT', '/auth/update', { name: 'A'.repeat(121) }, authHeader(token));
  assert(u10.status === 400, '4.10 Name 121 chars (over max) rejected', `status=${u10.status}`);
}

// ─── SECTION 5: LOGOUT ────────────────────────────────────────────────────────
async function testLogout(token) {
  console.log('\n=== SECTION 5: LOGOUT ===');

  // 5.1 Logout without token (should succeed — stateless)
  const lo1 = await req('POST', '/auth/logout');
  assert(lo1.status === 200, '5.1 Logout without token returns 200 (stateless)', `status=${lo1.status}`);

  // 5.2 Logout with token
  const lo2 = await req('POST', '/auth/logout', null, authHeader(token));
  assert(lo2.status === 200, '5.2 Logout with token returns 200', `status=${lo2.status}`);

  // 5.3 Token still works after logout (JWT is stateless — this is a known limitation)
  // Document the behavior, don't assert a specific outcome
  const me = await req('GET', '/auth/me', null, authHeader(token));
  log('INFO', `5.3 Token validity after logout: status=${me.status} (JWT stateless — server still accepts until expiry)`);
}

// ─── SECTION 6: USERS ENDPOINTS ───────────────────────────────────────────────
async function testUsersEndpoints(staffToken) {
  console.log('\n=== SECTION 6: USERS ENDPOINTS ===');

  // 6.1 GET /users as staff — should be 403
  const g1 = await req('GET', '/users', null, authHeader(staffToken));
  assert(g1.status === 403, '6.1 GET /users as staff returns 403', `status=${g1.status}`);

  // 6.2 GET /users without token
  const g2 = await req('GET', '/users', null);
  assert(g2.status === 401, '6.2 GET /users without token returns 401', `status=${g2.status}`);

  // 6.3 PUT /users/me — update own name
  const m1 = await req('PUT', '/users/me', { name: 'UpdatedViaMe' }, authHeader(staffToken));
  assert(m1.status === 200, '6.3 PUT /users/me update name returns 200', `status=${m1.status}`);

  // 6.4 PUT /users/me — update own email
  const newEmail = uniq('updateme');
  const m2 = await req('PUT', '/users/me', { email: newEmail }, authHeader(staffToken));
  assert(m2.status === 200, '6.4 PUT /users/me update email returns 200', `status=${m2.status}`);

  // 6.5 PUT /users/me — invalid email format
  const m3 = await req('PUT', '/users/me', { email: 'not-an-email' }, authHeader(staffToken));
  assert(m3.status === 400, '6.5 PUT /users/me invalid email returns 400', `status=${m3.status}`);

  // 6.6 PUT /users/me — try to set role (privilege escalation)
  const m4 = await req('PUT', '/users/me', { name: 'Hacker', role: 'admin' }, authHeader(staffToken));
  if (m4.status === 200) {
    assert(m4.data.data?.role !== 'admin', '6.6 PUT /users/me role NOT escalated', `role=${m4.data.data?.role}`);
  } else {
    assert(true, '6.6 PUT /users/me with role field rejected (good)', `status=${m4.status}`);
  }

  // 6.7 PUT /users/me — empty body (nothing to update)
  const m5 = await req('PUT', '/users/me', {}, authHeader(staffToken));
  assert(m5.status === 400, '6.7 PUT /users/me empty body returns 400', `status=${m5.status}`);

  // 6.8 GET /users/:id as staff (admin-only)
  const fakeId = '65f000000000000000000001';
  const g3 = await req('GET', `/users/${fakeId}`, null, authHeader(staffToken));
  assert(g3.status === 403, '6.8 GET /users/:id as staff returns 403', `status=${g3.status}`);

  // 6.9 PUT /users/:id/role as staff (admin-only)
  const g4 = await req('PUT', `/users/${fakeId}/role`, { role: 'admin' }, authHeader(staffToken));
  assert(g4.status === 403, '6.9 PUT /users/:id/role as staff returns 403', `status=${g4.status}`);

  // 6.10 DELETE /users/:id as staff (admin-only)
  const g5 = await req('DELETE', `/users/${fakeId}`, null, authHeader(staffToken));
  assert(g5.status === 403, '6.10 DELETE /users/:id as staff returns 403', `status=${g5.status}`);
}

// ─── SECTION 7: SETTINGS ──────────────────────────────────────────────────────
async function testSettings(token) {
  console.log('\n=== SECTION 7: SETTINGS ===');

  // 7.1 GET /settings — auto-create
  const s1 = await req('GET', '/settings', null, authHeader(token));
  assert(s1.status === 200, '7.1 GET /settings returns 200', `status=${s1.status}`);
  assert(s1.data.data !== undefined, '7.1 GET /settings returns data', `hasData=${!!s1.data.data}`);

  // 7.2 GET /settings without auth
  const s2 = await req('GET', '/settings', null);
  assert(s2.status === 401, '7.2 GET /settings without auth returns 401', `status=${s2.status}`);

  // 7.3 PUT /settings — update workspace
  const s3 = await req('PUT', '/settings', {
    workspace: { companyName: 'Test Corp', industry: 'Retail' }
  }, authHeader(token));
  assert(s3.status === 200, '7.3 PUT /settings workspace update returns 200', `status=${s3.status}`);

  // 7.4 PUT /settings — update preferences
  const s4 = await req('PUT', '/settings', {
    preferences: { darkMode: true, compactView: false }
  }, authHeader(token));
  assert(s4.status === 200, '7.4 PUT /settings preferences update returns 200', `status=${s4.status}`);

  // 7.5 PUT /settings — valid GSTIN
  const s5 = await req('PUT', '/settings', {
    workspace: { gstin: '27AAPFU0939F1ZV' }
  }, authHeader(token));
  assert(s5.status === 200, '7.5 PUT /settings valid GSTIN accepted', `status=${s5.status}`);

  // 7.6 PUT /settings — invalid GSTIN
  const s6 = await req('PUT', '/settings', {
    workspace: { gstin: 'INVALID123' }
  }, authHeader(token));
  assert(s6.status === 400, '7.6 PUT /settings invalid GSTIN rejected', `status=${s6.status} msg=${s6.data?.message}`);

  // 7.7 PUT /settings — valid UPI
  const s7 = await req('PUT', '/settings', {
    workspace: { upiId: 'merchant@upi' }
  }, authHeader(token));
  assert(s7.status === 200, '7.7 PUT /settings valid UPI accepted', `status=${s7.status}`);

  // 7.8 PUT /settings — invalid UPI
  const s8 = await req('PUT', '/settings', {
    workspace: { upiId: 'not-valid-upi' }
  }, authHeader(token));
  assert(s8.status === 400, '7.8 PUT /settings invalid UPI rejected', `status=${s8.status}`);

  // 7.9 PUT /settings — empty body (no section)
  const s9 = await req('PUT', '/settings', {}, authHeader(token));
  assert(s9.status === 400, '7.9 PUT /settings empty body returns 400', `status=${s9.status}`);

  // 7.10 PUT /settings/password — valid change
  const regEmail = uniq('pwtest');
  const regRes = await register('PwUser', regEmail, PASS);
  const pwToken = regRes.data.token;
  const sp1 = await req('PUT', '/settings/password', {
    currentPassword: PASS, newPassword: 'NewPass@789'
  }, authHeader(pwToken));
  assert(sp1.status === 200, '7.10 PUT /settings/password valid change returns 200', `status=${sp1.status}`);

  // 7.11 PUT /settings/password — wrong current password
  const sp2 = await req('PUT', '/settings/password', {
    currentPassword: 'WrongOld!', newPassword: 'NewPass@789'
  }, authHeader(pwToken));
  assert(sp2.status === 401, '7.11 PUT /settings/password wrong current returns 401', `status=${sp2.status}`);

  // 7.12 PUT /settings/password — new password too short
  const sp3 = await req('PUT', '/settings/password', {
    currentPassword: 'NewPass@789', newPassword: '123'
  }, authHeader(pwToken));
  assert(sp3.status === 400, '7.12 PUT /settings/password new pw too short returns 400', `status=${sp3.status}`);

  // 7.13 PUT /settings/password — missing fields
  const sp4 = await req('PUT', '/settings/password', {}, authHeader(pwToken));
  assert(sp4.status === 400, '7.13 PUT /settings/password empty body returns 400', `status=${sp4.status}`);

  // 7.14 Verify settings persist after update
  const s10 = await req('GET', '/settings', null, authHeader(token));
  const storedGstin = s10.data.data?.workspace?.gstin;
  assert(storedGstin === '27AAPFU0939F1ZV', '7.14 Settings persist after update', `gstin=${storedGstin}`);

  // 7.15 Check aiConfig model enum mismatch (validator vs model)
  // Validator allows: gemini-flash, gemini-pro, legacy
  // Model allows: gemini-2.5-flash, gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro, gemini-flash, gemini-pro, legacy
  // UI sends: gemini-2.5-flash — TEST this
  const s15 = await req('PUT', '/settings', {
    aiConfig: { model: 'gemini-2.5-flash' }
  }, authHeader(token));
  assert(s15.status === 400, '7.15 aiConfig model=gemini-2.5-flash rejected by validator (mismatch)', `status=${s15.status} msg=${s15.data?.message}`);
  log('INFO', '7.15 Detail: validator only accepts gemini-flash|gemini-pro|legacy but UI and model accept gemini-2.5-flash', `actual=${JSON.stringify(s15.data)}`);
}

// ─── SECTION 8: WORKSPACE / ONBOARDING ───────────────────────────────────────
async function testWorkspaceOnboarding(token) {
  console.log('\n=== SECTION 8: WORKSPACE + ONBOARDING ===');

  // 8.1 GET /workspace
  const w1 = await req('GET', '/workspace', null, authHeader(token));
  assert(w1.status === 200, '8.1 GET /workspace returns 200', `status=${w1.status}`);
  assert(w1.data.data?.workspace !== undefined, '8.1 GET /workspace returns workspace', `hasWorkspace=${!!w1.data.data?.workspace}`);
  assert(w1.data.data?.onboarding !== undefined, '8.1 GET /workspace returns onboarding', `hasOnboarding=${!!w1.data.data?.onboarding}`);

  // 8.2 GET /workspace without auth
  const w2 = await req('GET', '/workspace', null);
  assert(w2.status === 401, '8.2 GET /workspace without auth returns 401', `status=${w2.status}`);

  // 8.3 PATCH /workspace — valid fields
  const w3 = await req('PATCH', '/workspace', {
    companyName: 'My Store', storeType: 'kirana', storeProfile: 'small', defaultLang: 'en', state: 'Gujarat'
  }, authHeader(token));
  assert(w3.status === 200, '8.3 PATCH /workspace valid fields returns 200', `status=${w3.status}`);

  // 8.4 PATCH /workspace — unknown field (strict mode should reject)
  const w4 = await req('PATCH', '/workspace', { unknownField: 'badvalue' }, authHeader(token));
  assert(w4.status === 400, '8.4 PATCH /workspace unknown field rejected (strict)', `status=${w4.status}`);

  // 8.5 PATCH /workspace — invalid state name
  const w5 = await req('PATCH', '/workspace', { state: 'NotAnIndianState' }, authHeader(token));
  assert(w5.status === 400, '8.5 PATCH /workspace invalid state rejected', `status=${w5.status}`);

  // 8.6 PATCH /workspace — invalid GSTIN
  const w6 = await req('PATCH', '/workspace', { gstin: 'BADGSTIN' }, authHeader(token));
  assert(w6.status === 400, '8.6 PATCH /workspace invalid GSTIN rejected', `status=${w6.status}`);

  // 8.7 PATCH /workspace — invalid storeType
  const w7 = await req('PATCH', '/workspace', { storeType: 'hotel' }, authHeader(token));
  assert(w7.status === 400, '8.7 PATCH /workspace invalid storeType rejected', `status=${w7.status}`);

  // 8.8 GET /workspace/onboarding
  const o1 = await req('GET', '/workspace/onboarding', null, authHeader(token));
  assert(o1.status === 200, '8.8 GET /workspace/onboarding returns 200', `status=${o1.status}`);
  assert(o1.data.data?.currentStep !== undefined, '8.8 Returns currentStep', `step=${o1.data.data?.currentStep}`);

  // 8.9 PATCH /workspace/onboarding — valid step advance
  const o2 = await req('PATCH', '/workspace/onboarding', {
    currentStep: 1,
    stepData: { companyName: 'My Shop', storeType: 'kirana', storeProfile: 'small', defaultLang: 'en', state: 'Gujarat' }
  }, authHeader(token));
  assert(o2.status === 200, '8.9 PATCH /workspace/onboarding step 1 advance returns 200', `status=${o2.status}`);
  assert(o2.data.data?.completedSteps?.includes(1), '8.9 Step 1 marked complete', `completedSteps=${JSON.stringify(o2.data.data?.completedSteps)}`);

  // 8.10 PATCH /workspace/onboarding — step 4 with stepData includes sampleSeedUsed
  const o3 = await req('PATCH', '/workspace/onboarding', {
    currentStep: 4,
    stepData: { sampleSeedUsed: 'kirana' }
  }, authHeader(token));
  assert(o3.status === 200, '8.10 PATCH /workspace/onboarding step 4 with sampleSeedUsed returns 200', `status=${o3.status}`);
  assert(o3.data.data?.sampleSeedUsed === 'kirana', '8.10 sampleSeedUsed persisted', `sampleSeedUsed=${o3.data.data?.sampleSeedUsed}`);

  // 8.11 PATCH /workspace/onboarding — stepData invalid state
  const o4 = await req('PATCH', '/workspace/onboarding', {
    currentStep: 1,
    stepData: { state: 'Not A State' }
  }, authHeader(token));
  assert(o4.status === 400, '8.11 Invalid stepData state rejected', `status=${o4.status}`);

  // 8.12 PATCH /workspace/onboarding — dismiss
  const o5 = await req('PATCH', '/workspace/onboarding', { dismissed: true }, authHeader(token));
  assert(o5.status === 200, '8.12 Dismiss via PATCH returns 200', `status=${o5.status}`);
  assert(o5.data.data?.dismissed === true, '8.12 Dismissed persisted', `dismissed=${o5.data.data?.dismissed}`);

  // 8.13 POST /workspace/onboarding/dismiss
  const o6 = await req('POST', '/workspace/onboarding/dismiss', {}, authHeader(token));
  assert(o6.status === 200, '8.13 POST /workspace/onboarding/dismiss returns 200', `status=${o6.status}`);

  // 8.14 PATCH /workspace/onboarding — complete=true sets completedAt
  const o7 = await req('PATCH', '/workspace/onboarding', {
    currentStep: 7, complete: true
  }, authHeader(token));
  assert(o7.status === 200, '8.14 complete=true returns 200', `status=${o7.status}`);
  assert(o7.data.data?.completedAt !== null, '8.14 completedAt set when complete=true', `completedAt=${o7.data.data?.completedAt}`);

  // 8.15 Step 7 stepData with unknown keys (strict)
  const o8 = await req('PATCH', '/workspace/onboarding', {
    currentStep: 7, stepData: { unknownKey: 'val' }
  }, authHeader(token));
  assert(o8.status === 400, '8.15 Step 7 stepData with unknown key rejected (strict)', `status=${o8.status}`);
}

// ─── SECTION 9: SAMPLE PACKS ──────────────────────────────────────────────────
async function testSamplePacks(token) {
  console.log('\n=== SECTION 9: SAMPLE PACKS ===');

  // 9.1 GET /sample-packs
  const p1 = await req('GET', '/sample-packs', null, authHeader(token));
  assert(p1.status === 200, '9.1 GET /sample-packs returns 200', `status=${p1.status}`);

  // 9.2 GET /sample-packs without auth
  const p2 = await req('GET', '/sample-packs', null);
  assert(p2.status === 401, '9.2 GET /sample-packs without auth returns 401', `status=${p2.status}`);

  // 9.3 POST /sample-packs/seed with valid packId
  const p3 = await req('POST', '/sample-packs/seed', { packId: 'kirana' }, authHeader(token));
  assert([200, 201].includes(p3.status), '9.3 POST /sample-packs/seed kirana returns 200/201', `status=${p3.status}`);

  // 9.4 POST /sample-packs/seed with invalid packId
  const p4 = await req('POST', '/sample-packs/seed', { packId: 'wholesale' }, authHeader(token));
  assert(p4.status === 400, '9.4 POST /sample-packs/seed invalid packId returns 400', `status=${p4.status}`);

  // 9.5 POST /sample-packs/seed without auth
  const p5 = await req('POST', '/sample-packs/seed', { packId: 'kirana' });
  assert(p5.status === 401, '9.5 POST /sample-packs/seed without auth returns 401', `status=${p5.status}`);

  // 9.6 POST /sample-packs/seed — extra unknown field (strict)
  const p6 = await req('POST', '/sample-packs/seed', { packId: 'kirana', extra: 'val' }, authHeader(token));
  assert(p6.status === 400, '9.6 POST /sample-packs/seed extra field rejected (strict)', `status=${p6.status}`);
}

// ─── SECTION 10: EDGE CASES ───────────────────────────────────────────────────
async function testEdgeCases(token) {
  console.log('\n=== SECTION 10: EDGE CASES ===');

  // 10.1 Very long password on register (1000 chars) — should hash fine or reject
  const r1 = await register('LongPass', uniq('edge'), 'A'.repeat(1000));
  log('INFO', `10.1 Register with 1000-char password: status=${r1.status}`);

  // 10.2 SQL injection attempt in name
  const r2 = await register("Robert'); DROP TABLE users;--", uniq('sqli'), PASS);
  if (r2.status === 201) {
    log('INFO', `10.2 SQL injection in name accepted (MongoDB, so OK) but XSS needs checking: name=${r2.data.user?.name || 'N/A'}`);
  } else {
    log('INFO', `10.2 SQL injection in name rejected: status=${r2.status}`);
  }

  // 10.3 Unicode in name
  const r3 = await register('राम शर्मा', uniq('unicode'), PASS);
  assert([201, 400].includes(r3.status), '10.3 Unicode name handled (no crash)', `status=${r3.status}`);

  // 10.4 Settings — storeProfile=big should flip weightDisplay=decimal
  const sp1 = await req('PATCH', '/workspace', { storeProfile: 'big' }, authHeader(token));
  if (sp1.status === 200) {
    const getR = await req('GET', '/workspace', null, authHeader(token));
    const weightDisplay = getR.data.data?.workspace?.weightDisplay;
    assert(weightDisplay === 'decimal', '10.4 storeProfile=big flips weightDisplay to decimal', `weightDisplay=${weightDisplay}`);
  }

  // 10.5 Settings — storeProfile=small should flip weightDisplay=mixed
  const sp2 = await req('PATCH', '/workspace', { storeProfile: 'small' }, authHeader(token));
  if (sp2.status === 200) {
    const getR2 = await req('GET', '/workspace', null, authHeader(token));
    const weightDisplay = getR2.data.data?.workspace?.weightDisplay;
    assert(weightDisplay === 'mixed', '10.5 storeProfile=small flips weightDisplay to mixed', `weightDisplay=${weightDisplay}`);
  }

  // 10.6 GSTIN lowercase should be normalized to uppercase
  const sp3 = await req('PATCH', '/workspace', { gstin: '27aapfu0939f1zv' }, authHeader(token));
  if (sp3.status === 200) {
    const stored = sp3.data.data?.workspace?.gstin;
    assert(stored === '27AAPFU0939F1ZV', '10.6 Lowercase GSTIN normalized to uppercase', `stored=${stored}`);
  } else {
    assert(false, '10.6 PATCH with lowercase GSTIN failed unexpectedly', `status=${sp3.status} data=${JSON.stringify(sp3.data)}`);
  }

  // 10.7 Concurrent GET /settings calls — check no race condition on create
  const newEmail = uniq('concurrent');
  const regRes = await register('ConcurrUser', newEmail, PASS);
  const concToken = regRes.data.token;
  const [c1, c2, c3] = await Promise.all([
    req('GET', '/settings', null, authHeader(concToken)),
    req('GET', '/settings', null, authHeader(concToken)),
    req('GET', '/settings', null, authHeader(concToken)),
  ]);
  assert(c1.status === 200 && c2.status === 200 && c3.status === 200,
    '10.7 Concurrent GET /settings (3 parallel) all succeed', `statuses=${c1.status},${c2.status},${c3.status}`);

  // 10.8 updateMe — duplicate email (same as another user)
  const e1 = uniq('dup1'), e2 = uniq('dup2');
  const reg1 = await register('DupUser1', e1, PASS);
  await register('DupUser2', e2, PASS);
  const dupToken = reg1.data.token;
  const dupR = await req('PUT', '/users/me', { email: e2 }, authHeader(dupToken));
  assert(dupR.status === 409, '10.8 updateMe with duplicate email returns 409', `status=${dupR.status} msg=${dupR.data?.message}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== A1 AUTH / USERS / SETTINGS / WORKSPACE TEST RUN ===');
  console.log(`API: ${API}\n`);

  try {
    const { token: regToken, email: regEmail } = await testRegister();
    const loginToken = await testLogin(regEmail);
    await testGetMe(loginToken);
    await testUpdateProfile(loginToken);
    await testLogout(loginToken);
    await testUsersEndpoints(regToken);
    await testSettings(regToken);
    await testWorkspaceOnboarding(regToken);
    await testSamplePacks(regToken);
    await testEdgeCases(regToken);
  } catch (err) {
    console.error('\nFATAL TEST ERROR:', err.message);
    process.exitCode = 1;
  }

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const info = results.filter(r => r.status === 'INFO').length;

  console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED, ${info} INFO ===`);
  if (failed > 0) {
    console.log('\nFAILED TESTS:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  [FAIL] ${r.name} | ${r.detail}`));
  }
}

main();
